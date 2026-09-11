"use client";
import { useEffect, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { FeedEvent, Me, Meta, RoundInfo } from "@/lib/types";
import { fmt, short } from "@/lib/types";

export const buyUrl = (mint: string) => `https://pump.fun/coin/${mint}`;
const fmtCooldown = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`);
function useNow() { const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); return now; }
function countdown(iso: string, now: number) {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ---------- Top bar: logo · jackpot round · wallet ---------- */
export function TopBar({ meta, round, me, wallet, signing, onSignIn, onSignOut, showMine, onToggleMine, onOpenBoard, onOpenRules, onClaim, claiming, balance }: {
  meta: Meta; round: RoundInfo; me: Me; wallet: string | null; signing: boolean;
  onSignIn: () => void; onSignOut: () => void; showMine: boolean; onToggleMine: () => void; onOpenBoard: () => void; onOpenRules: () => void; onClaim: () => void; claiming: boolean; balance: number | null;
}) {
  const { setVisible } = useWalletModal();
  const now = useNow();
  const sym = meta.token.symbol;
  const isLeader = !!me && round.leader?.wallet === me.wallet;
  const gap = me && round.leader ? (isLeader ? me.owned - round.second : round.leader.pixels - me.owned + 1) : null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="pointer-events-auto flex items-center gap-2">
        <div className="panel flex items-center gap-3 px-4 py-2">
          <span className="text-lg font-black tracking-tight">lil<span style={{ color: "var(--accent)" }}>board</span></span>
          {meta.freeMode && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">free mode</span>}
        </div>
        <button className="panel px-3 py-2 text-sm font-semibold hover:bg-white/10" onClick={onOpenRules} title="How it works">❓</button>
        <button className="panel px-3 py-2 text-sm font-semibold hover:bg-white/10" onClick={onOpenBoard} title="Leaderboard">🏆</button>
        {me && <button className={`panel px-3 py-2 text-sm font-semibold hover:bg-white/10 ${showMine ? "ring-2 ring-[var(--accent)]" : ""}`} onClick={onToggleMine} title="Highlight my land">📍</button>}
      </div>

      <div className="pointer-events-auto panel w-full px-4 py-2.5 sm:w-[440px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">🏆 Jackpot · ends in {countdown(round.endsAt, now)}</div>
            <div className="text-2xl font-black leading-tight" style={{ color: "var(--accent)" }}>{fmt(round.pot)} <span className="text-base text-white/70">{sym}</span></div>
          </div>
          <div className="text-right text-xs">
            <div className="text-white/50">biggest landowner wins</div>
            {round.leader ? (
              <div className="font-semibold">{isLeader ? "👑 YOU" : `👑 ${short(round.leader.wallet)}`} · {fmt(round.leader.pixels)} px</div>
            ) : <div className="font-semibold text-white/70">nobody yet — be first</div>}
            {me && gap != null && round.leader && (
              <div className={isLeader ? "text-[var(--accent)]" : "text-white/70"}>{isLeader ? `${fmt(gap)} px ahead` : `${fmt(gap)} px to take the lead`}</div>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2 self-end sm:self-start">
        {me ? (
          <div className="panel flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-mono">{short(me.wallet)}</span>
            {!meta.freeMode && (
              <a href={buyUrl(meta.token.mint)} target="_blank" rel="noreferrer" title="Your balance · click to buy more"
                className="rounded-full bg-white/10 px-2.5 py-0.5 font-bold hover:bg-white/20" style={{ color: balance != null && balance < meta.basePrice ? "#ff6b6b" : "var(--accent)" }}>
                {balance == null ? "…" : fmt(Math.floor(balance))} {sym}
              </a>
            )}
            <span title="my land">📍{fmt(me.owned)}</span>
            {me.streak > 1 && <span title="daily streak">🔥{me.streak}</span>}
            {me.claimable > 0 && (
              <button className="btn btn-primary !px-3 !py-1 text-xs" onClick={onClaim} disabled={claiming}>{claiming ? "…" : `Claim ${fmt(me.claimable)} ${sym}`}</button>
            )}
            <button className="text-white/40 hover:text-white" onClick={onSignOut} title="Sign out">✕</button>
          </div>
        ) : wallet ? (
          <button className="btn btn-primary" onClick={onSignIn} disabled={signing}>{signing ? "Signing…" : "Sign in"}</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setVisible(true)}>Connect wallet</button>
        )}
      </div>
    </div>
  );
}

/* ---------- Bottom bar: palette · paint button · free pixel ---------- */
export function BottomBar({ meta, me, activeColor, onColor, pendingCount, quote, busy, onPaint, onClear, onFree, hint, balance }: {
  meta: Meta; me: Me; activeColor: number; onColor: (c: number) => void; pendingCount: number;
  quote: { total: number; steals: number } | null; busy: boolean; onPaint: () => void; onClear: () => void; onFree: () => void; hint: string | null; balance: number | null;
}) {
  const now = useNow();
  const freeAt = me ? new Date(me.freeAvailableAt).getTime() : Infinity;
  const freeReady = !!me && freeAt <= now;
  const secs = Math.max(0, Math.ceil((freeAt - now) / 1000));
  const sym = meta.token.symbol;
  const short_ = !meta.freeMode && balance != null && quote != null && quote.total > balance;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-3">
      {hint && <div className="pointer-events-auto panel slide-in px-4 py-2 text-sm font-semibold">{hint}</div>}
      <div className="pointer-events-auto panel flex max-w-full flex-wrap items-center justify-center gap-1.5 px-3 py-2">
        {meta.palette.map((hex, i) => (
          <button key={hex} className={`swatch ${i === activeColor ? "active" : ""}`} style={{ background: hex }} onClick={() => onColor(i)} aria-label={`color ${i}`} />
        ))}
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        {pendingCount > 0 && <button className="btn" onClick={onClear} disabled={busy}>✕</button>}
        {me && (
          <button className={`btn ${freeReady && pendingCount === 1 ? "btn-primary pulse" : ""}`} onClick={onFree} disabled={!freeReady || pendingCount !== 1 || busy}
            title={`One free pixel every ${fmtCooldown(meta.freeCooldown)} — blank or your own land only`}>
            🎁 {freeReady ? "FREE" : `${secs}s`}
          </button>
        )}
        {short_ ? (
          <a className="btn btn-primary min-w-[200px] text-base" href={buyUrl(meta.token.mint)} target="_blank" rel="noreferrer">
            Need {fmt(quote!.total - Math.floor(balance!))} more {sym} · Buy ↗
          </a>
        ) : (
          <button className={`btn btn-primary min-w-[200px] text-base ${pendingCount ? "pop" : ""}`} onClick={onPaint} disabled={!pendingCount || busy}>
            {busy ? "Painting…" : pendingCount === 0 ? "Tap the canvas" : `PAINT ${pendingCount} px · ${fmt(quote?.total ?? 0)} ${sym}`}
          </button>
        )}
      </div>
      <div className="pointer-events-auto text-[11px] font-semibold text-white/50">
        {quote && quote.steals > 0 ? <span className="text-white/80">⚔️ {quote.steals} of these are someone&apos;s land — stealing costs 2× and pays them back</span>
          : <>1 px = {fmt(meta.basePrice)} {sym} · steal = 2× (max ×{meta.maxMult}) · free px every {fmtCooldown(meta.freeCooldown)}</>}
      </div>
    </div>
  );
}

/* ---------- Pixel info tooltip ---------- */
export function PixelInfo({ info, me, symbol }: { info: { x: number; y: number; owner: string | null; price: number; paid: number } | null; me: Me; symbol: string }) {
  if (!info) return null;
  const mine = !!me && info.owner === me.wallet;
  return (
    <div className="pointer-events-none absolute left-3 top-[150px] z-10 hidden text-xs sm:block">
      <div className="panel px-3 py-2">
        <div className="font-mono text-white/50">({info.x}, {info.y})</div>
        {info.owner ? <div>{mine ? "📍 your land" : <>owner <span className="font-mono">{short(info.owner)}</span></>}</div> : <div className="text-white/60">unclaimed</div>}
        <div className="font-bold">{mine ? "repaint free" : `${fmt(info.price)} ${symbol}${info.owner ? " to take" : ""}`}</div>
        {info.owner && !mine && info.paid > 0 && <div className="text-white/50">they get {fmt(Math.floor(info.price * 0.6))} back</div>}
      </div>
    </div>
  );
}

/* ---------- Locked: shown until the pump.fun CA is configured ---------- */
export function Locked({ meta }: { meta: Meta }) {
  const sym = meta.token.symbol;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="text-5xl font-black tracking-tight sm:text-7xl">lil<span style={{ color: "var(--accent)" }}>board</span></div>
      <div className="text-lg font-semibold text-white/80 sm:text-2xl">Grab land. Draw. Defend.</div>
      <div className="panel px-5 py-4 text-sm text-white/70">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">launching on pump.fun</div>
        <div className="mt-1 text-xl font-black" style={{ color: "var(--accent)" }}>${sym}</div>
        <div className="mt-2">One giant canvas. Every pixel bought with ${sym}.<br />Steal anyone&apos;s pixel for 2× · get stolen, get paid back +20% · every steal burns supply.</div>
      </div>
      <div className="text-xs text-white/40">CA drops soon — the board unlocks the moment it does.</div>
    </div>
  );
}

/* ---------- Rules / how it works ---------- */
export function Rules({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const sym = meta.token.symbol, s = meta.split;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel pop w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-black">How lilboard works</h2>
        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3"><span className="text-xl">🎨</span><div><b>Tap pixels, hit PAINT.</b><br /><span className="text-white/60">Blank land costs {fmt(meta.basePrice)} {sym} per pixel. Repainting your own land is free.</span></div></li>
          <li className="flex gap-3"><span className="text-xl">⚔️</span><div><b>Steal anyone&apos;s pixel for 2× its price.</b><br /><span className="text-white/60">Blank {fmt(meta.basePrice)} → steal {fmt(meta.basePrice * 2)} → {fmt(meta.basePrice * 4)} → {fmt(meta.basePrice * 8)} … up to {fmt(meta.basePrice * meta.maxMult)}. Every steal makes that pixel pricier.</span></div></li>
          <li className="flex gap-3"><span className="text-xl">💰</span><div><b>Get stolen from? You get paid.</b><br /><span className="text-white/60">{s.steal.owner}% of the steal price goes straight to you — that&apos;s +20% on what you paid. Claim it anytime.</span></div></li>
          <li className="flex gap-3"><span className="text-xl">🏆</span><div><b>Every {meta.roundHours}h the biggest landowner wins the jackpot.</b><br /><span className="text-white/60">{s.blank.jackpot}% of blank-land sales and {s.steal.jackpot}% of steals fill the pot.</span></div></li>
          <li className="flex gap-3"><span className="text-xl">🔥</span><div><b>{s.blank.burn}% of land sales and {s.steal.burn}% of steals are burned.</b><br /><span className="text-white/60">Burned so far: {fmt(meta.burned)} {sym}.</span></div></li>
          <li className="flex gap-3"><span className="text-xl">🎁</span><div><b>One free pixel every {fmtCooldown(meta.freeCooldown)}.</b><br /><span className="text-white/60">Blank or your own land only. Free pixels don&apos;t earn payback when stolen.</span></div></li>
        </ol>
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Got it — let me paint</button>
      </div>
    </div>
  );
}

/* ---------- Leaderboard drawer ---------- */
type Board = {
  owners: { wallet: string; pixels: number }[]; earners: { wallet: string; earned: number }[];
  stealers: { wallet: string; pixelsStolen: number; streak: number }[];
  winners: { id: number; winnerWallet: string | null; winnerPixels: number | null; pot: number; endsAt: string }[]; burned: number;
};
export function Leaderboard({ open, onClose, me, symbol }: { open: boolean; onClose: () => void; me: Me; symbol: string }) {
  const [data, setData] = useState<Board | null>(null);
  useEffect(() => {
    if (!open) return;
    const load = () => fetch("/api/leaderboard", { cache: "no-store" }).then((r) => r.json()).then(setData);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [open]);
  if (!open) return null;
  const Row = ({ i, wallet, right, extra }: { i: number; wallet: string; right: string; extra?: string }) => (
    <li className={`flex items-center gap-2 text-sm ${wallet === me?.wallet ? "text-[var(--accent)]" : ""}`}>
      <span className="w-5 text-white/40">{i + 1}</span><span className="font-mono">{short(wallet)}</span>{extra && <span className="text-xs">{extra}</span>}<span className="ml-auto font-mono">{right}</span>
    </li>
  );
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-white/50">{children}</h3>;
  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onClick={onClose}>
      <div className="panel slide-in m-3 w-full max-w-sm overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-black">🏆 Leaderboard</h2><button onClick={onClose} className="text-white/50 hover:text-white">✕</button></div>
        {!data ? <p className="mt-4 text-sm text-white/50">Loading…</p> : (
          <>
            <H>📍 Land owners (jackpot race)</H>
            <ul className="mt-2 space-y-1.5">{data.owners.map((o, i) => <Row key={o.wallet} i={i} wallet={o.wallet} right={`${fmt(o.pixels)} px`} extra={i === 0 ? "👑" : undefined} />)}
              {data.owners.length === 0 && <li className="text-sm text-white/40">Nobody yet. Be first.</li>}</ul>
            <H>💰 Top earners</H>
            <ul className="mt-2 space-y-1.5">{data.earners.map((o, i) => <Row key={o.wallet} i={i} wallet={o.wallet} right={`+${fmt(o.earned)} ${symbol}`} />)}
              {data.earners.length === 0 && <li className="text-sm text-white/40">Nobody has been stolen from yet.</li>}</ul>
            <H>⚔️ Top raiders</H>
            <ul className="mt-2 space-y-1.5">{data.stealers.map((o, i) => <Row key={o.wallet} i={i} wallet={o.wallet} right={`${fmt(o.pixelsStolen)} taken`} extra={o.streak > 1 ? `🔥${o.streak}` : undefined} />)}
              {data.stealers.length === 0 && <li className="text-sm text-white/40">No raids yet.</li>}</ul>
            <H>🏆 Past jackpots</H>
            <ul className="mt-2 space-y-1.5">{data.winners.map((w, i) => <Row key={w.id} i={i} wallet={w.winnerWallet!} right={`${fmt(w.pot)} ${symbol}`} extra={`${fmt(w.winnerPixels ?? 0)} px`} />)}
              {data.winners.length === 0 && <li className="text-sm text-white/40">First round still running.</li>}</ul>
            <p className="mt-5 text-[11px] text-white/40">🔥 Burned so far: {fmt(data.burned)} {symbol}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Live ticker ---------- */
export function Ticker({ events, me, symbol }: { events: FeedEvent[]; me: Me; symbol: string }) {
  if (events.length === 0) return null;
  const name = (w: string) => (me && w === me.wallet ? "you" : short(w));
  const fmtEv = (e: FeedEvent) => {
    if (e.type === "STEAL") return `⚔️ ${name(e.wallet)} took ${e.count} px from ${e.victimWallet ? name(e.victimWallet) : "someone"}${e.amount > 0 ? ` · +${fmt(e.amount)} ${symbol} to them` : ""}`;
    if (e.type === "JACKPOT") return `🏆 ${name(e.wallet)} won the ${fmt(e.amount)} ${symbol} jackpot with ${fmt(e.count)} px`;
    if (e.type === "CLAIM") return `💰 ${name(e.wallet)} claimed ${fmt(e.amount)} ${symbol}`;
    return `🎨 ${name(e.wallet)} painted ${e.count} px`;
  };
  return (
    <div className="pointer-events-none absolute right-3 top-[150px] z-10 hidden w-72 flex-col gap-1 sm:flex">
      {events.slice(0, 6).map((e, i) => (
        <div key={e.id} className={`panel px-3 py-1.5 text-xs ${i === 0 ? "slide-in" : ""} ${e.victimWallet === me?.wallet ? "ring-1 ring-red-500" : ""}`} style={{ opacity: 1 - i * 0.14 }}>{fmtEv(e)}</div>
      ))}
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toast({ msg }: { msg: { text: string; kind: "ok" | "err" } | null }) {
  if (!msg) return null;
  return (
    <div className={`pointer-events-none absolute left-1/2 top-[130px] z-40 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold shadow-xl pop sm:top-[100px] ${msg.kind === "ok" ? "bg-[var(--accent)] text-black" : "bg-red-500 text-white"}`}>
      {msg.text}
    </div>
  );
}
