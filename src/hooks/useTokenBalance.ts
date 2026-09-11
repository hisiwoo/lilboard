"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN } from "@/lib/config";
import { tokenAccounts } from "@/lib/solana/pay";

/** Connected wallet's balance of the pixel token, in whole tokens. null = unknown / not connected. */
export function useTokenBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey || !TOKEN.mint) { setBalance(null); return; }
    try {
      const accounts = await tokenAccounts(connection, publicKey);
      setBalance(accounts.reduce((s, a) => s + a.ui, 0));
    } catch (e) {
      console.warn("balance lookup failed", e);
      setBalance(null); // unknown — don't show a misleading 0
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  return { balance, refresh };
}
