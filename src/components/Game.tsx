"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Board } from "./Board";
import { BottomBar, Leaderboard, PixelInfo, Rules, Ticker, Toast, TopBar } from "./Hud";
import { useSession } from "@/hooks/useSession";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { buildPaymentTx, waitForConfirmation } from "@/lib/solana/pay";
import type { FeedEvent, Meta, Pending, RoundInfo } from "@/lib/types";
import { fmt } from "@/lib/types";

const post = async (url: string, body?: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "failed");
  return j;
};

export function Game() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [colors, setColors] = useState<Uint8Array | null>(null);
  const [mine, setMine] = useState<Uint8Array | null>(null);
  const [version, setVersion] = useState(0);
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [activeColor, setActiveColor] = useState(5);
  const [showMine, setShowMine] = useState(false);
  const [quote, setQuote] = useState<{ total: number; steals: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [board, setBoard] = useState(false);
  const [rules, setRules] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [info, setInfo] = useState<{ x: number; y: number; owner: string | null; price: number; paid: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { me, refresh, signIn, signOut, signing, wallet } = useSession();
  const { balance, refresh: refreshBalance } = useTokenBalance();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const say = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    setToast({ text, kind });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3000);
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      const [m, buf, feed] = await Promise.all([
        fetch("/api/meta", { cache: "no-store" }).then((r) => r.json() as Promise<Meta>),
        fetch("/api/state", { cache: "no-store" }).then((r) => r.arrayBuffer()),
        fetch("/api/feed", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setMeta(m); setColors(new Uint8Array(buf)); setMine(new Uint8Array(m.w * m.h)); setRound(m.round); setEvents(feed.events);
      setVersion((v) => v + 1);
      try { if (!localStorage.getItem("lb_rules_seen") && !location.search.includes("rules=0")) setRules(true); } catch {}
    })();
  }, []);

  // My land overlay: fetch on sign-in, then keep in sync from the stream.
  useEffect(() => {
    if (!me || !mine) return;
    fetch("/api/mine", { cache: "no-store" }).then((r) => r.json()).then(({ pixels }) => {
      mine.fill(0);
      for (const i of pixels as number[]) mine[i] = 1;
      setVersion((v) => v + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.wallet, mine]);

  // Live updates: poll /api/updates (serverless-friendly, no websockets).
  useEffect(() => {
    if (!meta || !colors || !mine) return;
    let since = new Date().toISOString();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const msg = await fetch(`/api/updates?since=${encodeURIComponent(since)}`, { cache: "no-store" }).then((r) => r.json());
        since = msg.now;
        handle(msg);
      } catch {}
      if (!stopped) setTimeout(tick, document.hidden ? 8000 : 2000);
    };
    const handle = (msg: { pixels: { x: number; y: number; color: number; owner: string | null }[]; events: FeedEvent[]; round: RoundInfo }) => {
      if (msg.pixels.length) {
        let lost = 0;
        for (const p of msg.pixels) {
          const i = p.y * meta.w + p.x;
          colors[i] = p.color;
          const wasMine = mine[i] === 1;
          mine[i] = me && p.owner === me.wallet ? 1 : 0;
          if (wasMine && !mine[i]) lost++;
        }
        setVersion((v) => v + 1);
        if (lost > 0) refresh();
      }
      if (msg.round) setRound(msg.round);
      if (msg.events.length) {
        setEvents((es) => { const ids = new Set(es.map((e) => e.id)); return [...msg.events.filter((e) => !ids.has(e.id)), ...es].slice(0, 30); });
        for (const ev of msg.events) {
          if (me && ev.wallet === me.wallet) continue; // my own actions already toasted
          if (me && ev.victimWallet === me.wallet && ev.type === "STEAL") {
            say(ev.amount > 0 ? `⚔️ ${ev.count} of your pixels were taken · +${fmt(ev.amount)} ${meta.token.symbol} for you` : `⚔️ ${ev.count} of your pixels were taken!`, "err");
          }
        }
        for (const ev of msg.events) if (me && ev.type === "JACKPOT" && ev.wallet === me.wallet) { say(`🏆 YOU WON THE JACKPOT · ${fmt(ev.amount)} ${meta.token.symbol}`); refresh(); }
      }
    };
    const t = setTimeout(tick, 2000);
    return () => { stopped = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, colors, mine, me?.wallet]);

  // Quote pending pixels (debounced).
  useEffect(() => {
    if (!me || pending.length === 0) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await post("/api/orders?quote=1", { items: pending });
        setQuote({ total: r.total, steals: r.items.filter((i: { ownerWallet: string | null }) => i.ownerWallet && i.ownerWallet !== me.wallet).length });
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [pending, me]);

  const onTap = useCallback((x: number, y: number) => {
    if (!me) { if (!wallet) setVisible(true); else signIn(); return; }
    setPending((p) => {
      const i = p.findIndex((q) => q.x === x && q.y === y);
      if (i >= 0) { if (p[i].color === activeColor) return p.filter((_, j) => j !== i); const c = [...p]; c[i] = { x, y, color: activeColor }; return c; }
      if (meta && p.length >= meta.maxPerOrder) { say(`Max ${meta.maxPerOrder} pixels per paint`, "err"); return p; }
      return [...p, { x, y, color: activeColor }];
    });
  }, [me, wallet, activeColor, meta, say, setVisible, signIn]);

  const onHover = useCallback((x: number, y: number) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/pixel?x=${x}&y=${y}`).then((r) => r.json());
      setInfo({ x, y, owner: r.pixel?.ownerWallet ?? null, price: r.pixel?.ownerWallet ? r.pixel.price : r.basePrice, paid: r.pixel?.paidPrice ?? 0 });
    }, 120);
  }, []);

  const paint = async () => {
    if (!meta || pending.length === 0) return;
    setBusy(true);
    try {
      const order = await post("/api/orders", { items: pending });
      let result = order;
      if (!order.paid) {
        if (!publicKey) throw new Error("connect wallet");
        const { tx, lastValidBlockHeight } = await buildPaymentTx(connection, publicKey, BigInt(order.amount));
        const signature = await sendTransaction(tx, connection);
        say("Confirming on-chain…");
        await waitForConfirmation(connection, signature, lastValidBlockHeight);
        result = await post(`/api/orders/${order.id}/confirm`, { signature });
      }
      setPending([]);
      await Promise.all([refresh(), refreshBalance()]);
      const sym = meta.token.symbol;
      if (result.refund > 0) say(`Someone beat you to ${pending.length - result.painted} px · ${fmt(result.refund)} ${sym} refunded`, "err");
      else if (result.stolen > 0) say(`⚔️ Took ${result.stolen} px! You now own ${fmt((me?.owned ?? 0) + result.painted)} px`);
      else say(`✅ Painted ${result.painted} px${result.streak > 1 ? ` · 🔥 ${result.streak} day streak` : ""}`);
    } catch (e) {
      const m = (e as Error).message || "failed";
      say(/reject|cancel/i.test(m) ? "Cancelled" : m, "err");
    } finally { setBusy(false); }
  };

  const paintFree = async () => {
    if (pending.length !== 1 || !meta) return;
    setBusy(true);
    try {
      await post("/api/free", pending[0]);
      setPending([]);
      await refresh();
      say(`🎁 Free pixel placed! Next one in ${meta.freeCooldown >= 60 ? `${Math.round(meta.freeCooldown / 60)} min` : `${meta.freeCooldown}s`}.`);
    } catch (e) { say((e as Error).message, "err"); } finally { setBusy(false); }
  };

  const claim = async () => {
    if (!meta) return;
    setClaiming(true);
    try {
      const r = await post("/api/claim");
      await Promise.all([refresh(), refreshBalance()]);
      say(r.simulated ? `💰 ${fmt(r.amount)} ${meta.token.symbol} claimed (free mode — no real transfer)` : `💰 ${fmt(r.amount)} ${meta.token.symbol} sent to your wallet`);
    } catch (e) { say((e as Error).message, "err"); } finally { setClaiming(false); }
  };

  const closeRules = () => { setRules(false); try { localStorage.setItem("lb_rules_seen", "1"); } catch {} };

  if (!meta || !colors || !mine || !round) {
    return <div className="flex h-dvh items-center justify-center text-white/50">Loading canvas…</div>;
  }

  const hint = !me ? (wallet ? "Sign the message to start painting" : "Connect a wallet to start") : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Board w={meta.w} h={meta.h} palette={meta.palette} colors={colors} mine={mine} version={version} pending={pending}
        activeColor={activeColor} showMine={showMine} onTap={onTap} onHover={onHover} />
      <TopBar meta={meta} round={round} me={me} wallet={wallet} signing={signing} onSignIn={signIn} onSignOut={signOut}
        showMine={showMine} onToggleMine={() => setShowMine((s) => !s)} onOpenBoard={() => setBoard(true)} onOpenRules={() => setRules(true)} onClaim={claim} claiming={claiming} balance={balance} />
      <PixelInfo info={info} me={me} symbol={meta.token.symbol} />
      <Ticker events={events} me={me} symbol={meta.token.symbol} />
      <BottomBar meta={meta} me={me} activeColor={activeColor} onColor={setActiveColor} pendingCount={pending.length} quote={quote} busy={busy}
        onPaint={paint} onClear={() => setPending([])} onFree={paintFree} hint={hint} balance={balance} />
      {rules && <Rules meta={meta} onClose={closeRules} />}
      <Leaderboard open={board} onClose={() => setBoard(false)} me={me} symbol={meta.token.symbol} />
      <Toast msg={toast} />
    </div>
  );
}
