import { claimedCount, ensureHydrated } from "@/lib/canvas";
import { prisma } from "@/lib/prisma";
import { roundInfo } from "@/lib/round";
import { BASE_PRICE, CANVAS_H, CANVAS_W, FREE_COOLDOWN_S, FREE_MODE, LAUNCHED, MAX_OVERWRITE_MULT, MAX_PIXELS_PER_ORDER, PALETTE, ROUND_HOURS, SPLIT, TOKEN } from "@/lib/config";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureHydrated();
  const [round, stats] = await Promise.all([roundInfo(), prisma.stats.findUnique({ where: { id: 1 } })]);
  return json({
    w: CANVAS_W, h: CANVAS_H, palette: PALETTE, basePrice: BASE_PRICE, maxMult: MAX_OVERWRITE_MULT, maxPerOrder: MAX_PIXELS_PER_ORDER,
    launched: LAUNCHED, freeMode: FREE_MODE, freeCooldown: FREE_COOLDOWN_S, roundHours: ROUND_HOURS, split: SPLIT,
    claimed: claimedCount(), burned: (stats?.burned ?? 0) + (stats?.burnPending ?? 0), round,
    token: { symbol: TOKEN.symbol, mint: TOKEN.mint, decimals: TOKEN.decimals, treasury: TOKEN.treasury, cluster: TOKEN.cluster },
  });
}
