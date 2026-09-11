import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api";
import { pixelPrice, stealPrice } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const x = Number(u.searchParams.get("x")), y = Number(u.searchParams.get("y"));
  const p = await prisma.pixel.findUnique({ where: { x_y: { x, y } }, select: { ownerWallet: true, overwrites: true, paidPrice: true, updatedAt: true } });
  return json({ pixel: p ? { ...p, price: stealPrice(p.overwrites) } : null, basePrice: pixelPrice(0) });
}
