import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN } from "../config";

/**
 * Which token program owns the pixel mint — legacy SPL Token or Token-2022 (pump.fun mints are Token-2022).
 * Detected from the mint account's owner and cached; every ATA derivation / transfer / burn must use this id.
 */
let cached: Promise<PublicKey> | null = null;
export function tokenProgramId(connection: Connection): Promise<PublicKey> {
  if (!cached) {
    cached = connection.getAccountInfo(new PublicKey(TOKEN.mint)).then((info) => {
      if (!info) throw new Error("pixel mint not found on-chain");
      if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
      if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
      throw new Error(`pixel mint owned by unknown program ${info.owner.toBase58()}`);
    });
    cached.catch(() => { cached = null; }); // retry on transient RPC failure
  }
  return cached;
}
