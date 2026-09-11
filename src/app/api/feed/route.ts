import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await prisma.event.findMany({ orderBy: { id: "desc" }, take: 30 });
  return json({ events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) });
}
