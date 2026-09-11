import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { TOKEN } from "../config";
import { tokenProgramId } from "./program";

let conn: Connection | null = null;
export function connection() {
  if (!conn) conn = new Connection(process.env.SOLANA_RPC_URL || TOKEN.rpc, "confirmed");
  return conn;
}

/**
 * Verify that `signature` is a confirmed tx, signed by `payer`, that credited the treasury ATA with >= `amount`
 * base units of the pixel token, and that it happened after the order was created (so old payments can't be reused).
 * Signature uniqueness across orders is enforced by the DB.
 */
export async function verifyPayment(signature: string, payer: string, amount: bigint, notBefore: Date) {
  const tx = await connection().getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) throw new Error("transaction not found yet — wait a moment and retry");
  if (tx.meta?.err) throw new Error("transaction failed on-chain");
  if (tx.blockTime && tx.blockTime * 1000 < notBefore.getTime() - 120_000) throw new Error("transaction predates order");

  const keys = tx.transaction.message.accountKeys;
  const signer = keys.find((k) => k.signer && k.pubkey.toBase58() === payer);
  if (!signer) throw new Error("payer did not sign this transaction");

  const treasuryAta = getAssociatedTokenAddressSync(new PublicKey(TOKEN.mint), new PublicKey(TOKEN.treasury), true, await tokenProgramId(connection())).toBase58();
  const ataIndex = keys.findIndex((k) => k.pubkey.toBase58() === treasuryAta);
  if (ataIndex === -1) throw new Error("treasury not credited");
  const bal = (list: NonNullable<typeof tx.meta>["preTokenBalances"]) => BigInt(list?.find((b) => b.accountIndex === ataIndex && b.mint === TOKEN.mint)?.uiTokenAmount.amount ?? "0");
  const received = bal(tx.meta?.postTokenBalances) - bal(tx.meta?.preTokenBalances);
  if (received < amount) throw new Error(`underpaid: got ${received}, need ${amount}`);
  return true;
}
