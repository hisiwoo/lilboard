import { prisma } from "./prisma";
import { applyUpdates, ensureHydrated } from "./canvas";
import { CANVAS_H, CANVAS_W, MAX_PIXELS_PER_ORDER, PALETTE, SPLIT, pixelPrice } from "./config";
import { currentRound } from "./round";

export type PaintItem = { x: number; y: number; color: number };
export type PricedItem = PaintItem & { price: number; overwrites: number; ownerWallet: string | null; ownerPaid: number };

export function validateItems(items: unknown): PaintItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_PIXELS_PER_ORDER) throw new Error("bad item count");
  const seen = new Set<string>();
  return items.map((it) => {
    const x = Number(it?.x), y = Number(it?.y), color = Number(it?.color);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(color)) throw new Error("bad item");
    if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H || color < 0 || color >= PALETTE.length) throw new Error("out of range");
    const k = `${x},${y}`;
    if (seen.has(k)) throw new Error("duplicate pixel");
    seen.add(k);
    return { x, y, color };
  });
}

/** Look up current owners and compute the price of each pixel for `wallet`. */
export async function priceItems(items: PaintItem[], wallet: string): Promise<PricedItem[]> {
  const existing = await prisma.pixel.findMany({
    where: { OR: items.map(({ x, y }) => ({ x, y })) },
    select: { x: true, y: true, overwrites: true, ownerWallet: true, paidPrice: true },
  });
  const byKey = new Map(existing.map((p) => [`${p.x},${p.y}`, p]));
  return items.map((it) => {
    const cur = byKey.get(`${it.x},${it.y}`);
    // Repainting your own pixel is free of escalation; taking someone else's escalates.
    const taking = !!cur?.ownerWallet && cur.ownerWallet !== wallet;
    const overwrites = cur?.overwrites ?? 0;
    // Blank land: base price. Someone's land: double the current price (escalates per steal). Own land: free repaint.
    const price = taking ? pixelPrice(overwrites + 1) : cur?.ownerWallet ? 0 : pixelPrice(0);
    return { ...it, price, overwrites, ownerWallet: cur?.ownerWallet ?? null, ownerPaid: cur?.paidPrice ?? 0 };
  });
}

const pct = (n: number, p: number) => Math.floor((n * p) / 100);
function todayKey() { return new Date().toISOString().slice(0, 10); }
function yesterdayKey() { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

/**
 * Write pixels, split the money, update stats, emit events. Assumes payment already verified.
 * Pixels whose price rose since the quote (someone else took them first) are skipped and refunded to claimable.
 */
export async function commitPaint(wallet: string, quoted: PricedItem[], opts: { free?: boolean; orderId?: string } = {}) {
  await ensureHydrated();
  const user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) throw new Error("user not found");
  const round = await currentRound();

  // Re-read current state so payouts go to the *actual* previous owner.
  const live = await priceItems(quoted, wallet);
  const today = todayKey();
  const streak = user.lastPaintDay === today ? user.streak : user.lastPaintDay === yesterdayKey() ? user.streak + 1 : 1;

  let stolen = 0, refund = 0, paidBack = 0, painted = 0, burn = 0, jackpot = 0, ops = 0;
  const victims: Record<string, { count: number; amount: number }> = {};
  const updates: { x: number; y: number; color: number; owner: string | null }[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < quoted.length; i++) {
      const q = quoted[i], cur = live[i];
      if (cur.ownerWallet !== q.ownerWallet || cur.overwrites !== q.overwrites) { refund += q.price; continue; } // someone got there first — refund
      const taking = !!cur.ownerWallet && cur.ownerWallet !== wallet;
      const paid = opts.free ? 0 : q.price;

      if (taking) {
        stolen++;
        const prevPaid = cur.ownerPaid;
        if (prevPaid > 0) {
          const back = pct(paid, SPLIT.steal.owner);
          paidBack += back;
          burn += pct(paid, SPLIT.steal.burn); jackpot += pct(paid, SPLIT.steal.jackpot); ops += paid - back - pct(paid, SPLIT.steal.burn) - pct(paid, SPLIT.steal.jackpot);
          const v = victims[cur.ownerWallet!] ??= { count: 0, amount: 0 };
          v.count++; v.amount += back;
        } else {
          // Free pixel taken: nothing to pay back, feed the pot.
          jackpot += pct(paid, SPLIT.blank.jackpot); burn += pct(paid, SPLIT.blank.burn); ops += paid - pct(paid, SPLIT.blank.jackpot) - pct(paid, SPLIT.blank.burn);
          const v = victims[cur.ownerWallet!] ??= { count: 0, amount: 0 };
          v.count++;
        }
      } else if (paid > 0) {
        jackpot += pct(paid, SPLIT.blank.jackpot); burn += pct(paid, SPLIT.blank.burn); ops += paid - pct(paid, SPLIT.blank.jackpot) - pct(paid, SPLIT.blank.burn);
      }

      await tx.pixel.upsert({
        where: { x_y: { x: q.x, y: q.y } },
        create: { x: q.x, y: q.y, color: q.color, ownerWallet: wallet, paidPrice: paid, overwrites: 0 },
        update: { color: q.color, ownerWallet: wallet, updatedAt: new Date(), ...(taking ? { overwrites: { increment: 1 }, paidPrice: paid } : cur.ownerWallet === wallet ? {} : { paidPrice: paid }) },
      });
      painted++;
      updates.push({ x: q.x, y: q.y, color: q.color, owner: wallet });
    }

    for (const [victim, v] of Object.entries(victims)) {
      await tx.user.update({ where: { wallet: victim }, data: { pixelsLost: { increment: v.count }, claimable: { increment: v.amount }, earned: { increment: v.amount } } });
      if (v.amount > 0) await tx.ledger.create({ data: { type: "PAYBACK", wallet: victim, amount: v.amount, orderId: opts.orderId } });
    }
    if (refund > 0) await tx.ledger.create({ data: { type: "REFUND", wallet, amount: refund, orderId: opts.orderId } });
    if (burn > 0) { await tx.ledger.create({ data: { type: "BURN", amount: burn, orderId: opts.orderId } }); }
    if (jackpot > 0) { await tx.round.update({ where: { id: round.id }, data: { pot: { increment: jackpot } } }); await tx.ledger.create({ data: { type: "JACKPOT", amount: jackpot, orderId: opts.orderId, roundId: round.id } }); }
    if (ops > 0) await tx.ledger.create({ data: { type: "OPS", amount: ops, orderId: opts.orderId } });
    await tx.stats.upsert({ where: { id: 1 }, create: { id: 1, burnPending: burn, ops }, update: { burnPending: { increment: burn }, ops: { increment: ops } } });

    const spent = opts.free ? 0 : quoted.reduce((s, q) => s + q.price, 0) - refund;
    await tx.user.update({
      where: { wallet },
      data: { pixelsPainted: { increment: painted }, pixelsStolen: { increment: stolen }, spent: { increment: spent }, claimable: { increment: refund }, streak, lastPaintDay: today },
    });
  });

  applyUpdates(updates);
  const [topVictim] = Object.entries(victims).sort((a, b) => b[1].count - a[1].count);
  const sample = updates[0] ?? quoted[0];
  await prisma.event.create({
    data: { type: stolen ? "STEAL" : "PAINT", wallet, victimWallet: topVictim?.[0] ?? null, count: painted, amount: paidBack, x: sample.x, y: sample.y },
  });
  return { painted, streak, stolen, refund, paidBack, free: !!opts.free };
}
