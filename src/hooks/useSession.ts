"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { Me } from "@/lib/types";

/** Wallet-adapter → signed message → HttpOnly session cookie. */
export function useSession() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [me, setMe] = useState<Me>(null);
  const [signing, setSigning] = useState(false);
  const attempted = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
    setMe(r.user);
    return r.user as Me;
  }, []);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setSigning(true);
    try {
      const { nonce, message } = await fetch("/api/auth/nonce", { method: "POST" }).then((r) => r.json());
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: publicKey.toBase58(), nonce, signature: bs58.encode(sig) }) });
      if (!r.ok) throw new Error((await r.json()).error);
      await refresh();
    } finally { setSigning(false); }
  }, [publicKey, signMessage, refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    attempted.current = null;
    await disconnect().catch(() => {});
  }, [disconnect]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto sign-in once after wallet connects if the cookie doesn't already match this wallet.
  useEffect(() => {
    if (!connected || !publicKey) return;
    const w = publicKey.toBase58();
    if (me?.wallet === w || attempted.current === w) return;
    attempted.current = w;
    signIn().catch(() => {});
  }, [connected, publicKey, me, signIn]);

  return { me, refresh, signIn, signOut, signing, wallet: publicKey?.toBase58() ?? null, connected };
}
