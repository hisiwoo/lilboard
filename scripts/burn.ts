/** Burns the accumulated burnPending from the treasury hot wallet. Run on a schedule (e.g. daily). */
import { PublicKey } from "@solana/web3.js";
import { burn, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { prisma } from "../src/lib/prisma";
import { TOKEN, toBaseUnits } from "../src/lib/config";
import { connection } from "../src/lib/solana/verify";
import { treasuryKeypair } from "../src/lib/solana/payout";

async function main() {
  const stats = await prisma.stats.findUnique({ where: { id: 1 } });
  const amount = stats?.burnPending ?? 0;
  if (amount <= 0) { console.log("nothing to burn"); return; }
  const kp = treasuryKeypair();
  if (!kp) throw new Error("TREASURY_SECRET_KEY not set");
  const mint = new PublicKey(TOKEN.mint);
  const ata = getAssociatedTokenAddressSync(mint, kp.publicKey);
  const sig = await burn(connection(), kp, ata, mint, kp, toBaseUnits(amount));
  await prisma.stats.update({ where: { id: 1 }, data: { burnPending: 0, burned: { increment: amount } } });
  console.log(`burned ${amount} ${TOKEN.symbol}: ${sig}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
