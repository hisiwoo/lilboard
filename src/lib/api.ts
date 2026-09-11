import { NextResponse } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "not signed in" ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  });
}
