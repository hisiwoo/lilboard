import { requireWallet } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commitPaint, priceItems, validateItems } from "@/lib/paint";
import { FREE_COOLDOWN_S } from "@/lib/config";
import { handle, json, requireLaunched } from "@/lib/api";

/** One free pixel per cooldown. Free pixels can only go on blank pixels or your own — you have to pay to fight. */
export async function POST(req: Request) {
  return handle(async () => {
    requireLaunched();
    const wallet = await requireWallet();
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) throw new Error("not signed in");
    if (user.freeAvailableAt.getTime() > Date.now()) throw new Error("free pixel not ready");
    const [item] = validateItems([await req.json()]);
    const [priced] = await priceItems([item], wallet);
    if (priced.ownerWallet && priced.ownerWallet !== wallet) throw new Error("free pixels can't take someone's land");

    const next = new Date(Date.now() + FREE_COOLDOWN_S * 1000);
    const claimed = await prisma.user.updateMany({ where: { wallet, freeAvailableAt: { lte: new Date() } }, data: { freeAvailableAt: next } });
    if (claimed.count === 0) throw new Error("free pixel not ready");
    const result = await commitPaint(wallet, [{ ...priced, price: 0 }], { free: true });
    return json({ ok: true, freeAvailableAt: next.toISOString(), ...result });
  });
}
