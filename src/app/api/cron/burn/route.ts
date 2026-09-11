import { PublicKey } from "@solana/web3.js";
import { burn, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { prisma } from "@/lib/prisma";
import { FREE_MODE, LAUNCHED, TOKEN, toBaseUnits } from "@/lib/config";
import { connection } from "@/lib/solana/verify";
import { treasuryKeypair } from "@/lib/solana/payout";
import { tokenProgramId } from "@/lib/solana/program";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Vercel cron: burn the accumulated share from the treasury hot wallet. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: "unauthorized" }, { status: 401 });
  const stats = await prisma.stats.findUnique({ where: { id: 1 } });
  const amount = stats?.burnPending ?? 0;
  if (amount <= 0) return json({ burned: 0 });
  if (FREE_MODE || !LAUNCHED) return json({ burned: 0, skipped: FREE_MODE ? "free mode" : "not launched" });
  const kp = treasuryKeypair();
  if (!kp) return json({ error: "TREASURY_SECRET_KEY not set" }, { status: 500 });
  const mint = new PublicKey(TOKEN.mint);
  const program = await tokenProgramId(connection());
  const ata = getAssociatedTokenAddressSync(mint, kp.publicKey, false, program);
  const signature = await burn(connection(), kp, ata, mint, kp, toBaseUnits(amount), [], undefined, program);
  await prisma.stats.update({ where: { id: 1 }, data: { burnPending: { decrement: amount }, burned: { increment: amount } } });
  return json({ burned: amount, signature });
}
