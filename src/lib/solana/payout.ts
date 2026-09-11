import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";
import { TOKEN, toBaseUnits } from "../config";
import { connection } from "./verify";

/** Treasury hot wallet — only needed for claims/burns. Keep small balances here; sweep the rest cold. */
export function treasuryKeypair(): Keypair | null {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) return null;
  const arr = raw.trim().startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : Uint8Array.from(Buffer.from(raw, "base64"));
  return Keypair.fromSecretKey(arr);
}

export async function sendTokens(to: string, tokens: number): Promise<string> {
  const kp = treasuryKeypair();
  if (!kp) throw new Error("payouts not configured");
  const conn: Connection = connection();
  const mint = new PublicKey(TOKEN.mint);
  const from = await getOrCreateAssociatedTokenAccount(conn, kp, mint, kp.publicKey);
  const dest = await getOrCreateAssociatedTokenAccount(conn, kp, mint, new PublicKey(to));
  return transfer(conn, kp, from.address, dest.address, kp, toBaseUnits(tokens));
}
