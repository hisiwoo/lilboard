import { colorsSnapshot, ensureHydrated } from "@/lib/canvas";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureHydrated();
  return new Response(new Uint8Array(colorsSnapshot()).buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } });
}
