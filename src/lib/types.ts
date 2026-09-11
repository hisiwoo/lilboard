export type RoundInfo = { id: number; endsAt: string; pot: number; leader: { wallet: string; pixels: number } | null; second: number };
export type Meta = {
  w: number; h: number; palette: string[]; basePrice: number; maxMult: number; maxPerOrder: number;
  freeMode: boolean; freeCooldown: number; roundHours: number;
  split: { steal: { owner: number; burn: number; jackpot: number; ops: number }; blank: { jackpot: number; burn: number; ops: number } };
  claimed: number; burned: number; round: RoundInfo;
  token: { symbol: string; mint: string; decimals: number; treasury: string; cluster: string };
};
export type Me = {
  wallet: string; owned: number; pixelsPainted: number; pixelsStolen: number; pixelsLost: number;
  spent: number; earned: number; claimable: number; streak: number; freeAvailableAt: string;
} | null;
export type Pending = { x: number; y: number; color: number };
export type FeedEvent = {
  id: number; type: string; wallet: string; victimWallet: string | null; count: number; amount: number;
  x: number | null; y: number | null; createdAt: string;
};
export const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-3)}`;
export const fmt = (n: number) => n.toLocaleString();
