import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { requireWallet } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FREE_MODE } from "@/lib/config";
import { sendTokens } from "@/lib/solana/payout";
import { handle, json, requireLaunched } from "@/lib/api";

/** Pay out the caller's claimable balance from the treasury hot wallet. */
export async function POST() {
  return handle(async () => {
    requireLaunched();
    const wallet = await requireWallet();
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user || user.claimable <= 0) throw new Error("nothing to claim");
    const amount = user.claimable;
    const id = bs58.encode(randomBytes(12));

    // Zero the balance first so a double-click can't claim twice.
    const z = await prisma.user.updateMany({ where: { wallet, claimable: amount }, data: { claimable: 0 } });
    if (z.count === 0) throw new Error("balance changed, try again");
    await prisma.payout.create({ data: { id, wallet, amount, status: FREE_MODE ? "SIMULATED" : "PENDING" } });

    if (!FREE_MODE) {
      try {
        const signature = await sendTokens(wallet, amount);
        await prisma.payout.update({ where: { id }, data: { status: "SENT", signature } });
      } catch (e) {
        await prisma.payout.update({ where: { id }, data: { status: "FAILED" } });
        await prisma.user.update({ where: { wallet }, data: { claimable: { increment: amount } } });
        throw new Error(`payout failed: ${(e as Error).message}`);
      }
    }
    await prisma.event.create({ data: { type: "CLAIM", wallet, amount } });
    return json({ ok: true, amount, simulated: FREE_MODE });
  });
}
