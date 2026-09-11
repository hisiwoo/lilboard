import { NextResponse } from "next/server";

/**
 * JSON-RPC proxy: public Solana RPCs reject browser-origin requests, and this also keeps a paid RPC key server-side.
 * Set SOLANA_RPC_URL (server-only) to a Helius/QuickNode endpoint; falls back to the public one.
 */
const UPSTREAM = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const ALLOWED = new Set([
  "getLatestBlockhash", "getBlockHeight", "getSlot", "getBalance", "getAccountInfo", "getMultipleAccounts",
  "getTokenAccountBalance", "getTokenAccountsByOwner", "getSignatureStatuses", "getTransaction", "getParsedTransaction",
  "sendTransaction", "simulateTransaction", "getFeeForMessage", "getMinimumBalanceForRentExemption", "getRecentPrioritizationFees", "getVersion", "getHealth",
]);

export async function POST(req: Request) {
  const body = await req.json();
  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) if (!ALLOWED.has(c?.method)) return NextResponse.json({ jsonrpc: "2.0", id: c?.id ?? null, error: { code: -32601, message: `method not allowed: ${c?.method}` } }, { status: 400 });
  const r = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return new NextResponse(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
