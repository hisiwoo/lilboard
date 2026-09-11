import { prisma } from "./prisma";
import { BLANK, CANVAS_H, CANVAS_W } from "./config";

export type PixelUpdate = { x: number; y: number; color: number; owner: string | null };
export type FeedEvent = {
  id: number; type: string; wallet: string; victimWallet: string | null; count: number; amount: number;
  x: number | null; y: number | null; createdAt: string;
};
export type RoundInfo = { id: number; endsAt: string; pot: number; leader: { wallet: string; pixels: number } | null; second: number };
type Listener = (msg: { pixels?: PixelUpdate[]; event?: FeedEvent; round?: RoundInfo }) => void;

type Store = {
  colors: Uint8Array;
  owners: Uint32Array;           // wallet slot per pixel (0 = none)
  wallets: string[];             // slot → wallet
  counts: Map<string, number>;   // wallet → pixels owned
  hydrated: Promise<void> | null;
  listeners: Set<Listener>;
};

const g = globalThis as unknown as { __lilboard?: Store };

function store(): Store {
  if (!g.__lilboard) {
    g.__lilboard = {
      colors: new Uint8Array(CANVAS_W * CANVAS_H).fill(BLANK),
      owners: new Uint32Array(CANVAS_W * CANVAS_H),
      wallets: [""],
      counts: new Map(),
      hydrated: null,
      listeners: new Set(),
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

export async function ensureHydrated() {
  const s = store();
  if (!s.hydrated) {
    s.hydrated = (async () => {
      const rows = await prisma.pixel.findMany({ select: { x: true, y: true, color: true, ownerWallet: true } });
      for (const p of rows) {
        const i = p.y * CANVAS_W + p.x;
        s.colors[i] = p.color;
        s.owners[i] = slot(p.ownerWallet);
        if (p.ownerWallet) s.counts.set(p.ownerWallet, (s.counts.get(p.ownerWallet) || 0) + 1);
      }
    })();
  }
  await s.hydrated;
  return s;
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

export function ownedBy(wallet: string): number {
  return store().counts.get(wallet) || 0;
}

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

export function subscribe(fn: Listener) {
  const s = store();
  s.listeners.add(fn);
  return () => { s.listeners.delete(fn); };
}

export function broadcast(msg: Parameters<Listener>[0]) {
  for (const fn of store().listeners) {
    try { fn(msg); } catch { /* dead listener */ }
  }
}
