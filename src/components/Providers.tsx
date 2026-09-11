"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  // Empty adapter list: Phantom/Solflare/Backpack register themselves via Wallet Standard.
  const wallets = useMemo(() => [], []);
  // All RPC traffic goes through our proxy — public RPCs block browser origins, and paid keys stay server-side.
  const endpoint = typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}/api/rpc`;
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
