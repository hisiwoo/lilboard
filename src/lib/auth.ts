import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "./prisma";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const COOKIE = "lb_session";
const TTL_MS = 30 * 24 * 3600 * 1000;

const nonces = new Map<string, number>(); // nonce → expiry

export function issueNonce() {
  const n = bs58.encode(randomBytes(16));
  nonces.set(n, Date.now() + 5 * 60 * 1000);
  for (const [k, exp] of nonces) if (exp < Date.now()) nonces.delete(k);
  return n;
}

export function loginMessage(nonce: string) {
  return `Sign in to lilboard\n\nnonce: ${nonce}`;
}

function sign(payload: string) {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export async function verifyLogin(wallet: string, nonce: string, signatureB58: string) {
  const exp = nonces.get(nonce);
  if (!exp || exp < Date.now()) throw new Error("nonce expired");
  nonces.delete(nonce);
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(loginMessage(nonce)),
    bs58.decode(signatureB58),
    bs58.decode(wallet),
  );
  if (!ok) throw new Error("bad signature");
  await prisma.user.upsert({ where: { wallet }, update: {}, create: { wallet } });
  const payload = `${wallet}.${Date.now() + TTL_MS}`;
  const token = `${payload}.${sign(payload)}`;
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000, secure: process.env.NODE_ENV === "production" });
  return wallet;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function currentWallet(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [wallet, exp, sig] = token.split(".");
  if (!wallet || !exp || !sig) return null;
  const expected = sign(`${wallet}.${exp}`);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  if (Number(exp) < Date.now()) return null;
  return wallet;
}

export async function requireWallet() {
  const w = await currentWallet();
  if (!w) throw new Error("not signed in");
  return w;
}
