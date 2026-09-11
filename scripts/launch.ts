/**
 * Go live: `npm run launch -- <pump.fun CA> [--symbol LILBOARD] [--no-deploy]`
 *
 * 1. Validates the CA is a real Solana address.
 * 2. Writes NEXT_PUBLIC_PIXEL_MINT (+ symbol) into .env and .env.local.
 * 3. Sets the same vars on Vercel production and redeploys (`vercel --prod`).
 *    NEXT_PUBLIC_* vars are baked in at build time, so the redeploy is what unlocks the board.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

const args = process.argv.slice(2);
const ca = args.find((a) => !a.startsWith("--"));
const symbol = args.includes("--symbol") ? args[args.indexOf("--symbol") + 1] : "LILBOARD";
const deploy = !args.includes("--no-deploy");
if (!ca) { console.error("usage: npm run launch -- <CA> [--symbol LILBOARD] [--no-deploy]"); process.exit(1); }
try { new PublicKey(ca); } catch { console.error(`"${ca}" is not a valid Solana address`); process.exit(1); }

const vars: Record<string, string> = { NEXT_PUBLIC_PIXEL_MINT: ca, NEXT_PUBLIC_PIXEL_SYMBOL: symbol, NEXT_PUBLIC_FREE_MODE: "" };

// Local env files
for (const f of [".env", ".env.local"]) {
  if (!existsSync(f)) continue;
  let s = readFileSync(f, "utf8");
  for (const [k, v] of Object.entries(vars)) {
    const line = `${k}="${v}"`;
    s = new RegExp(`^${k}=.*$`, "m").test(s) ? s.replace(new RegExp(`^${k}=.*$`, "m"), line) : s.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(f, s);
  console.log(`✓ ${f}`);
}

// Vercel production env
const vercel = (a: string[], input?: string) => spawnSync("vercel", a, { input, stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"] });
for (const [k, v] of Object.entries(vars)) {
  vercel(["env", "rm", k, "production", "-y"]); // ignore "not found"
  if (v) {
    const r = vercel(["env", "add", k, "production"], v + "\n");
    if (r.status !== 0) { console.error(`failed to set ${k} on Vercel`); process.exit(1); }
  }
  console.log(`✓ vercel ${k}${v ? "" : " (cleared)"}`);
}

const treasury = vercel(["env", "ls", "production"]);
if (treasury.status !== 0) console.warn("! could not list Vercel env — make sure NEXT_PUBLIC_TREASURY_WALLET and TREASURY_SECRET_KEY are set there");

if (deploy) {
  console.log("\n🚀 deploying to production…");
  execFileSync("vercel", ["--prod"], { stdio: "inherit" });
  console.log(`\n✅ live. mint ${ca} · $${symbol}`);
} else {
  console.log(`\nenv set. run \`vercel --prod\` to go live.`);
}
