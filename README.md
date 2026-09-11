# lilboard — onchain pixel war

r/place-style shared canvas where every pixel is bought with a pump.fun token.
No teams — it's every wallet for itself. Pixels are assets: steal one and the previous owner gets paid.

## Run locally
```bash
cp .env.example .env.local && cp .env.local .env   # Prisma CLI reads .env, Next reads .env.local
npm install
npm run db:push
npm run dev
```
With no `NEXT_PUBLIC_PIXEL_TOKEN_MINT` / `NEXT_PUBLIC_TREASURY_WALLET` set the app runs in **FREE MODE** (no payments).

## Devnet test token
```bash
npm run dev:mint -- <your-phantom-devnet-address>
```
Prints env values; paste them into `.env.local` + `.env`, switch Phantom to devnet, restart.

## Launch on pump.fun
Set `NEXT_PUBLIC_PIXEL_TOKEN_MINT` to the launched mint, `NEXT_PUBLIC_TREASURY_WALLET` to the fee wallet (+ `TREASURY_SECRET_KEY` for payouts/burns — keep only a working float in it),
`NEXT_PUBLIC_SOLANA_RPC_URL` to a mainnet RPC, `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, and a strong `SESSION_SECRET`.

## How payment works
1. Client picks pixels → `POST /api/orders` returns order id + amount.
2. Client sends an SPL transfer to the treasury ATA.
3. `POST /api/orders/:id/confirm` — server fetches the tx and checks: payer signed it, treasury balance delta ≥ amount, tx is newer than the order, signature not used by another order. Then paints.

## Retention mechanics
Free pixel every 30s (configurable) (blank/own land only) · price doubling on steals · live territory bar · leaderboards · daily streak · live ticker.
