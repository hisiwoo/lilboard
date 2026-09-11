import { prisma } from "@/lib/prisma";
import { sync } from "@/lib/canvas";
import { roundInfo } from "@/lib/round";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Polling endpoint (serverless-friendly): everything that changed since `since` (ISO time). */
export async function GET(req: Request) {
  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 5000);
  const now = new Date();
  const [pixels, events] = await Promise.all([
    prisma.pixel.findMany({ where: { updatedAt: { gte: since } }, select: { x: true, y: true, color: true, ownerWallet: true }, take: 5000 }),
    prisma.event.findMany({ where: { createdAt: { gte: since } }, orderBy: { id: "desc" }, take: 20 }),
  ]);
  await sync(1000);
  const round = await roundInfo();
  return json({
    now: now.toISOString(),
    pixels: pixels.map((p) => ({ x: p.x, y: p.y, color: p.color, owner: p.ownerWallet })),
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    round,
  });
}
