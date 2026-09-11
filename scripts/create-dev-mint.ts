/**
 * Devnet helper: creates a test token mint, mints 1,000,000 to a fresh dev wallet, prints env values.
 * Usage: npm run dev:mint  (needs devnet airdrop; retry if faucet is rate-limited)
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const file = "dev-wallet.json";
  const payer = existsSync(file) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")))) : Keypair.generate();
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(Array.from(payer.secretKey)));
  console.log("dev wallet:", payer.publicKey.toBase58());
  if ((await conn.getBalance(payer.publicKey)) < 0.5 * LAMPORTS_PER_SOL) {
    console.log("requesting airdrop…");
    const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  await mintTo(conn, payer, mint, ata.address, payer, 1_000_000n * 1_000_000n);
  const to = process.argv[2] ? new PublicKey(process.argv[2]) : null;
  if (to) {
    const toAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, to);
    await mintTo(conn, payer, mint, toAta.address, payer, 1_000_000n * 1_000_000n);
    console.log("minted 1,000,000 to", to.toBase58());
  }
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_PIXEL_TOKEN_MINT="${mint.toBase58()}"`);
  console.log(`NEXT_PUBLIC_TREASURY_WALLET="${payer.publicKey.toBase58()}"`);
  console.log(`NEXT_PUBLIC_PIXEL_TOKEN_DECIMALS="6"`);
}
main().catch((e) => { console.error(e); process.exit(1); });
