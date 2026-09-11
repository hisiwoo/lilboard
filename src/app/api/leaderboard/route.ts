import { prisma } from "@/lib/prisma";
import { ensureHydrated, topOwners } from "@/lib/canvas";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureHydrated();
  const [earners, stealers, winners, stats] = await Promise.all([
    prisma.user.findMany({ where: { earned: { gt: 0 } }, orderBy: { earned: "desc" }, take: 10, select: { wallet: true, earned: true } }),
    prisma.user.findMany({ where: { pixelsStolen: { gt: 0 } }, orderBy: { pixelsStolen: "desc" }, take: 10, select: { wallet: true, pixelsStolen: true, streak: true } }),
    prisma.round.findMany({ where: { winnerWallet: { not: null } }, orderBy: { id: "desc" }, take: 5 }),
    prisma.stats.findUnique({ where: { id: 1 } }),
  ]);
  return json({ owners: topOwners(10), earners, stealers, winners, burned: (stats?.burned ?? 0) + (stats?.burnPending ?? 0) });
}
