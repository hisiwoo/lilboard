import { requireWallet } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commitPaint, type PricedItem } from "@/lib/paint";
import { verifyPayment } from "@/lib/solana/verify";
import { toBaseUnits } from "@/lib/config";
import { handle, json } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const wallet = await requireWallet();
    const { id } = await params;
    const { signature } = await req.json();
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.wallet !== wallet) throw new Error("order not found");
    if (order.status === "PAID") return json({ id, paid: true });
    if (Date.now() - order.createdAt.getTime() > 10 * 60 * 1000) throw new Error("order expired");

    const sig = String(signature);
    const used = await prisma.order.findUnique({ where: { signature: sig } });
    if (used && used.id !== id) throw new Error("this payment was already used");
    await verifyPayment(sig, wallet, toBaseUnits(order.total), order.createdAt);

    // Claim the signature atomically so a replayed tx can't pay twice.
    const claimed = await prisma.order.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID", signature: String(signature), paidAt: new Date() } });
    if (claimed.count === 0) return json({ id, paid: true });

    const items = JSON.parse(order.items) as PricedItem[];
    const result = await commitPaint(wallet, items, { orderId: id });
    return json({ id, paid: true, total: order.total, ...result });
  });
}
