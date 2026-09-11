import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { sendTokens } from "@/lib/solana/payout";
import { connection } from "@/lib/solana/verify";
import { TOKEN } from "@/lib/config";
import { handle, json } from "@/lib/api";

/** Move ops revenue out of the hot wallet. Capped at (on-chain balance − everything owed to players). */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { to, amount } = await req.json();
    const dest = new PublicKey(String(to));
    const tokens = Math.floor(Number(amount));
    if (!Number.isFinite(tokens) || tokens <= 0) throw new Error("bad amount");

    const owner = new PublicKey(TOKEN.treasury);
    const tok = await connection().getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(TOKEN.mint) });
    const balance = tok.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
    const [claimable, pot, stats] = await Promise.all([
      prisma.user.aggregate({ _sum: { claimable: true } }),
      prisma.round.aggregate({ where: { settledAt: null }, _sum: { pot: true } }),
      prisma.stats.findUnique({ where: { id: 1 } }),
    ]);
    const owed = (claimable._sum.claimable ?? 0) + (pot._sum.pot ?? 0) + (stats?.burnPending ?? 0);
    const withdrawable = Math.floor(balance - owed);
    if (tokens > withdrawable) throw new Error(`only ${withdrawable} ${TOKEN.symbol} is withdrawable (rest is owed to players)`);

    const signature = await sendTokens(dest.toBase58(), tokens);
    await prisma.ledger.create({ data: { type: "WITHDRAW", wallet: admin, amount: tokens, orderId: dest.toBase58() } });
    return json({ ok: true, signature, amount: tokens });
  });
}
