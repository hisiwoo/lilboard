import { currentWallet } from "@/lib/auth";
import { ensureHydrated, pixelsOf } from "@/lib/canvas";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Indexes (y*w+x) of the caller's pixels, for the "my land" overlay. */
export async function GET() {
  const wallet = await currentWallet();
  if (!wallet) return json({ pixels: [] });
  await ensureHydrated();
  return json({ pixels: pixelsOf(wallet) });
}
