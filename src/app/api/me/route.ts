import { currentWallet } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureHydrated, ownedBy } from "@/lib/canvas";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await currentWallet();
  if (!wallet) return json({ user: null });
  await ensureHydrated();
  const user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) return json({ user: null });
  return json({ user: { ...user, owned: ownedBy(wallet), freeAvailableAt: user.freeAvailableAt.toISOString() } });
}
