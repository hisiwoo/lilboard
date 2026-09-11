import { NextResponse } from "next/server";
import { LAUNCHED } from "@/lib/config";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "not signed in" ? 401 : msg === "not launched" ? 503 : 400;
    return NextResponse.json({ error: msg }, { status });
  });
}

/** Throw until the pump.fun CA is configured — used by every route that paints, pays or claims. */
export function requireLaunched() {
  if (!LAUNCHED) throw new Error("not launched");
}
