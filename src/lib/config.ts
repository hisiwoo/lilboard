export const CANVAS_W = 500;
export const CANVAS_H = 500;
export const MAX_PIXELS_PER_ORDER = 50;
export const MAX_OVERWRITE_MULT = 16;

// r/place style 16-color palette. Index 255 = blank.
export const PALETTE: string[] = [
  "#FFFFFF", "#E4E4E4", "#888888", "#222222",
  "#FFA7D1", "#E50000", "#E59500", "#A06A42",
  "#E5D900", "#94E044", "#02BE01", "#00D3DD",
  "#0083C7", "#0000EA", "#CF6EE4", "#820080",
];
export const BLANK = 255;

export const TOKEN = {
  mint: process.env.NEXT_PUBLIC_PIXEL_MINT || "",
  symbol: process.env.NEXT_PUBLIC_PIXEL_SYMBOL || "LILBOARD",
  decimals: Number(process.env.NEXT_PUBLIC_PIXEL_DECIMALS || 6),
  treasury: process.env.NEXT_PUBLIC_TREASURY_WALLET || "",
  rpc: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet",
};

export const BASE_PRICE = Number(process.env.NEXT_PUBLIC_BASE_PIXEL_PRICE || 100); // whole tokens
export const FREE_COOLDOWN_S = Number(process.env.FREE_PIXEL_COOLDOWN || 30);
export const ROUND_HOURS = Number(process.env.ROUND_HOURS || 24);

/** Free mode = explicit dev opt-in (NEXT_PUBLIC_FREE_MODE=1) → painting costs nothing. Never turns on by accident. */
export const FREE_MODE = process.env.NEXT_PUBLIC_FREE_MODE === "1";
/**
 * Launched = the pump.fun CA (NEXT_PUBLIC_PIXEL_MINT) and treasury wallet are set, or free mode is on.
 * Until then the game is locked: the canvas shows a "launching soon" screen and every write API returns 503.
 * `npm run launch -- <CA>` sets the mint on Vercel and redeploys.
 */
export const LAUNCHED = FREE_MODE || (!!TOKEN.mint && !!TOKEN.treasury);

/**
 * Where each token goes, in percent.
 * Stealing a pixel someone paid for: most of it goes back to them (they profit +20% per steal).
 * Buying blank land / stealing a free pixel: nobody to pay back, so it feeds the jackpot.
 */
export const SPLIT = {
  steal: { owner: 60, burn: 15, jackpot: 15, ops: 10 },
  blank: { jackpot: 40, burn: 30, ops: 30 },
};

export function pixelPrice(overwrites: number): number {
  return BASE_PRICE * Math.min(2 ** overwrites, MAX_OVERWRITE_MULT);
}
/** Price to take a pixel that has been stolen `overwrites` times already. */
export function stealPrice(overwrites: number): number {
  return pixelPrice(overwrites + 1);
}

export function toBaseUnits(tokens: number): bigint {
  return BigInt(Math.round(tokens * 10 ** TOKEN.decimals));
}
