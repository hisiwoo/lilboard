import { prisma } from "./prisma";
import { BLANK, CANVAS_H, CANVAS_W } from "./config";

/**
 * Per-instance cache of the canvas, synced incrementally from the DB (source of truth) by `updatedAt` watermark.
 * Works on serverless: every instance converges on the same state after `sync()`.
 */
export type PixelUpdate = { x: number; y: number; color: number; owner: string | null };
export type FeedEvent = {
  id: number; type: string; wallet: string; victimWallet: string | null; count: number; amount: number;
  x: number | null; y: number | null; createdAt: string;
};
export type RoundInfo = { id: number; endsAt: string; pot: number; leader: { wallet: string; pixels: number } | null; second: number };

type Store = {
  colors: Uint8Array;
  owners: Uint32Array;           // wallet slot per pixel (0 = none)
  wallets: string[];             // slot → wallet
  counts: Map<string, number>;   // wallet → pixels owned
  watermark: Date | null;        // newest updatedAt we've applied
  syncing: Promise<void> | null;
  lastSync: number;
};

const g = globalThis as unknown as { __lilboard?: Store };

function store(): Store {
  if (!g.__lilboard) {
    g.__lilboard = {
      colors: new Uint8Array(CANVAS_W * CANVAS_H).fill(BLANK),
      owners: new Uint32Array(CANVAS_W * CANVAS_H),
      wallets: [""], counts: new Map(), watermark: null, syncing: null, lastSync: 0,
    };
  }
  return g.__lilboard;
}

function slot(wallet: string | null): number {
  if (!wallet) return 0;
  const s = store();
  let i = s.wallets.indexOf(wallet);
  if (i === -1) { s.wallets.push(wallet); i = s.wallets.length - 1; }
  return i;
}

export function applyUpdates(updates: PixelUpdate[]) {
  const s = store();
  for (const u of updates) {
    const i = u.y * CANVAS_W + u.x;
    const prev = s.wallets[s.owners[i]];
    if (prev) s.counts.set(prev, (s.counts.get(prev) || 1) - 1);
    s.colors[i] = u.color;
    s.owners[i] = slot(u.owner);
    if (u.owner) s.counts.set(u.owner, (s.counts.get(u.owner) || 0) + 1);
  }
}

/** Pull pixels changed since the watermark. `maxAgeMs` lets hot paths skip a DB roundtrip if we synced very recently. */
export async function sync(maxAgeMs = 0) {
  const s = store();
  if (s.syncing) return s.syncing;
  if (maxAgeMs && Date.now() - s.lastSync < maxAgeMs) return;
  s.syncing = (async () => {
    // gte + idempotent apply: same-millisecond writes are never missed.
    const rows = await prisma.pixel.findMany({
      where: s.watermark ? { updatedAt: { gte: s.watermark } } : undefined,
      select: { x: true, y: true, color: true, ownerWallet: true, updatedAt: true },
    });
    applyUpdates(rows.map((p) => ({ x: p.x, y: p.y, color: p.color, owner: p.ownerWallet })));
    for (const p of rows) if (!s.watermark || p.updatedAt > s.watermark) s.watermark = p.updatedAt;
    s.lastSync = Date.now();
  })().finally(() => { s.syncing = null; });
  return s.syncing;
}

/** Backwards-compatible name used by the API routes. */
export const ensureHydrated = () => sync(1000);

export function ownedBy(wallet: string): number { return store().counts.get(wallet) || 0; }

export function topOwners(n: number): { wallet: string; pixels: number }[] {
  return [...store().counts.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([wallet, pixels]) => ({ wallet, pixels }));
}

export function pixelsOf(wallet: string): number[] {
  const s = store();
  const k = s.wallets.indexOf(wallet);
  if (k <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < s.owners.length; i++) if (s.owners[i] === k) out.push(i);
  return out;
}

export function colorsSnapshot() { return store().colors; }
export function claimedCount() { let n = 0; for (const c of store().counts.values()) n += c; return n; }
