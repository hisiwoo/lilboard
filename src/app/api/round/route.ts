import { roundInfo } from "@/lib/round";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const [round, past] = await Promise.all([
    roundInfo(),
    prisma.round.findMany({ where: { settledAt: { not: null } }, orderBy: { id: "desc" }, take: 5 }),
  ]);
  return json({ round, past });
}
