import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { requireWallet } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commitPaint, priceItems, validateItems } from "@/lib/paint";
import { FREE_MODE, TOKEN, toBaseUnits } from "@/lib/config";
import { handle, json, requireLaunched } from "@/lib/api";

/** Quote only: POST /api/orders?quote=1 */
export async function POST(req: Request) {
  return handle(async () => {
    requireLaunched();
    const wallet = await requireWallet();
    const items = validateItems((await req.json()).items);
    const priced = await priceItems(items, wallet);
    const total = priced.reduce((s, p) => s + p.price, 0);
    if (new URL(req.url).searchParams.get("quote")) return json({ items: priced, total });

    const id = bs58.encode(randomBytes(12));
    await prisma.order.create({ data: { id, wallet, items: JSON.stringify(priced), total, status: FREE_MODE ? "PAID" : "PENDING", paidAt: FREE_MODE ? new Date() : null } });

    if (FREE_MODE || total === 0) {
      if (total === 0 && !FREE_MODE) await prisma.order.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
      const result = await commitPaint(wallet, priced, { orderId: id });
      return json({ id, paid: true, total, ...result });
    }
    return json({ id, paid: false, amount: toBaseUnits(total).toString(), total, treasury: TOKEN.treasury, mint: TOKEN.mint });
  });
}
