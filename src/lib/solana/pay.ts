"use client";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { TOKEN } from "../config";
import { tokenProgramId } from "./program";

/** All of `owner`'s token accounts for the pixel token, largest first. */
export async function tokenAccounts(connection: Connection, owner: PublicKey) {
  const r = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(TOKEN.mint) }, "confirmed");
  return r.value
    .map((a) => ({ address: a.pubkey, amount: BigInt(a.account.data.parsed.info.tokenAmount.amount as string), ui: Number(a.account.data.parsed.info.tokenAmount.uiAmount ?? 0) }))
    .sort((a, b) => (a.amount < b.amount ? 1 : -1));
}

/**
 * Build the "pay for order" tx: transfer `amount` base units to the treasury ATA.
 * The order is bound to the tx server-side by (unique signature, payer, amount, time) — no memo program needed.
 */
export async function buildPaymentTx(connection: Connection, payer: PublicKey, amount: bigint) {
  const mint = new PublicKey(TOKEN.mint);
  const treasury = new PublicKey(TOKEN.treasury);
  if (payer.equals(treasury)) throw new Error("This is the fee wallet — it can't pay itself. Use another wallet.");
  const [src] = await tokenAccounts(connection, payer);
  if (!src || src.amount < amount) throw new Error(`Not enough ${TOKEN.symbol} in this wallet`);
  const program = await tokenProgramId(connection);
  const to = getAssociatedTokenAddressSync(mint, treasury, true, program);

  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, to, treasury, mint, program));
  tx.add(createTransferInstruction(src.address, to, payer, amount, [], program));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return { tx, blockhash, lastValidBlockHeight };
}

/** Poll for confirmation over plain HTTP (our RPC proxy has no websocket). */
export async function waitForConfirmation(connection: Connection, signature: string, lastValidBlockHeight: number) {
  for (;;) {
    const { value: [st] } = await connection.getSignatureStatuses([signature]);
    if (st?.err) throw new Error("transaction failed on-chain");
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    if ((await connection.getBlockHeight()) > lastValidBlockHeight) throw new Error("transaction expired — try again");
    await new Promise((r) => setTimeout(r, 1500));
  }
}
