import { prisma } from "./prisma";
import { ROUND_HOURS } from "./config";
import { ensureHydrated, topOwners, type RoundInfo } from "./canvas";

let lock: Promise<unknown> | null = null;

/** Get the live round, settling any finished one first (lazy — no cron needed). Serialized so parallel first requests can't create two rounds. */
export async function currentRound() {
  while (lock) await lock.catch(() => {});
  const p = currentRoundUnlocked();
  lock = p;
  try { return await p; } finally { lock = null; }
}

async function currentRoundUnlocked() {
  await ensureHydrated();
  let round = await prisma.round.findFirst({ where: { settledAt: null }, orderBy: { id: "desc" } });
  const now = new Date();
  if (round && round.endsAt <= now) {
    await settle(round.id);
    round = null;
  }
  if (!round) {
    round = await prisma.round.create({ data: { startsAt: now, endsAt: new Date(now.getTime() + ROUND_HOURS * 3600 * 1000) } });
  }
  return round;
}

async function settle(id: number) {
  const [leader] = topOwners(1);
  await prisma.$transaction(async (tx) => {
    const r = await tx.round.findUnique({ where: { id } });
    if (!r || r.settledAt) return;
    await tx.round.update({ where: { id }, data: { settledAt: new Date(), winnerWallet: leader?.wallet ?? null, winnerPixels: leader?.pixels ?? null } });
    if (leader && r.pot > 0) {
      await tx.user.update({ where: { wallet: leader.wallet }, data: { claimable: { increment: r.pot }, earned: { increment: r.pot } } });
      await tx.ledger.create({ data: { type: "JACKPOT_WIN", wallet: leader.wallet, amount: r.pot, roundId: id } });
      await tx.event.create({ data: { type: "JACKPOT", wallet: leader.wallet, amount: r.pot, count: leader.pixels } });
    }
  });
}

export async function roundInfo(): Promise<RoundInfo> {
  const r = await currentRound();
  const [leader, second] = topOwners(2);
  return { id: r.id, endsAt: r.endsAt.toISOString(), pot: r.pot, leader: leader ?? null, second: second?.pixels ?? 0 };
}
