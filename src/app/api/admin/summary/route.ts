import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { ensureHydrated, claimedCount, topOwners } from "@/lib/canvas";
import { connection } from "@/lib/solana/verify";
import { treasuryKeypair } from "@/lib/solana/payout";
import { tokenProgramId } from "@/lib/solana/program";
import { BASE_PRICE, FREE_COOLDOWN_S, FREE_MODE, LAUNCHED, ROUND_HOURS, SPLIT, TOKEN } from "@/lib/config";
import { handle, json } from "@/lib/api";

export const dynamic = "force-dynamic";

async function onchain() {
  if (!TOKEN.treasury || !TOKEN.mint) return { sol: null, wtc: null, error: "not configured" };
  try {
    const conn = connection();
    const owner = new PublicKey(TOKEN.treasury);
    const [lamports, tok, program] = await Promise.all([
      conn.getBalance(owner),
      conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(TOKEN.mint) }),
      tokenProgramId(conn),
    ]);
    const wtc = tok.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
    return { sol: lamports / 1e9, wtc, ata: getAssociatedTokenAddressSync(new PublicKey(TOKEN.mint), owner, true, program).toBase58(), error: null };
  } catch (e) { return { sol: null, wtc: null, error: (e as Error).message }; }
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    await ensureHydrated();
    const [chain, stats, claimable, pot, volume, payback, jackpotPaid, users, ordersPaid, payouts, orders, ledger] = await Promise.all([
      onchain(),
      prisma.stats.findUnique({ where: { id: 1 } }),
      prisma.user.aggregate({ _sum: { claimable: true } }),
      prisma.round.aggregate({ where: { settledAt: null }, _sum: { pot: true } }),
      prisma.order.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
      prisma.ledger.aggregate({ where: { type: "PAYBACK" }, _sum: { amount: true } }),
      prisma.ledger.aggregate({ where: { type: "JACKPOT_WIN" }, _sum: { amount: true } }),
      prisma.user.count(),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.payout.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.order.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 20, select: { id: true, wallet: true, total: true, signature: true, paidAt: true } }),
      prisma.ledger.findMany({ where: { type: "WITHDRAW" }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const liabilities = { claimable: claimable._sum.claimable ?? 0, burnPending: stats?.burnPending ?? 0, pot: pot._sum.pot ?? 0 };
    const owed = liabilities.claimable + liabilities.burnPending + liabilities.pot;
    const withdrawable = chain.wtc == null ? null : Math.max(0, Math.floor(chain.wtc - owed));
    return json({
      config: { launched: LAUNCHED, freeMode: FREE_MODE, basePrice: BASE_PRICE, freeCooldown: FREE_COOLDOWN_S, roundHours: ROUND_HOURS, split: SPLIT, mint: TOKEN.mint, symbol: TOKEN.symbol, treasury: TOKEN.treasury, cluster: TOKEN.cluster, payoutsConfigured: !!treasuryKeypair() },
      chain, liabilities, owed, withdrawable,
      revenue: { ops: stats?.ops ?? 0, burned: stats?.burned ?? 0, volume: volume._sum.total ?? 0, paybackPaid: payback._sum.amount ?? 0, jackpotPaid: jackpotPaid._sum.amount ?? 0 },
      activity: { users, ordersPaid, pixelsClaimed: claimedCount(), topOwners: topOwners(5) },
      payouts: payouts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      orders: orders.map((o) => ({ ...o, paidAt: o.paidAt?.toISOString() ?? null })),
      withdrawals: ledger.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    });
  });
}
