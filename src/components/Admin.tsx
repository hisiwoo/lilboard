"use client";
import { useCallback, useEffect, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "@/hooks/useSession";
import { fmt, short } from "@/lib/types";

type Summary = {
  config: { freeMode: boolean; basePrice: number; freeCooldown: number; roundHours: number; split: { steal: Record<string, number>; blank: Record<string, number> }; mint: string; symbol: string; treasury: string; cluster: string; payoutsConfigured: boolean };
  chain: { sol: number | null; wtc: number | null; ata?: string; error: string | null };
  liabilities: { claimable: number; burnPending: number; pot: number }; owed: number; withdrawable: number | null;
  revenue: { ops: number; burned: number; volume: number; paybackPaid: number; jackpotPaid: number };
  activity: { users: number; ordersPaid: number; pixelsClaimed: number; topOwners: { wallet: string; pixels: number }[] };
  payouts: { id: string; wallet: string; amount: number; status: string; signature: string | null; createdAt: string }[];
  orders: { id: string; wallet: string; total: number; signature: string | null; paidAt: string | null }[];
  withdrawals: { id: number; wallet: string | null; amount: number; orderId: string | null; createdAt: string }[];
};

const explorer = (sig: string, cluster: string) => `https://solscan.io/tx/${sig}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;

export function Admin() {
  const { me, signIn, signing, wallet } = useSession();
  const { setVisible } = useWalletModal();
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/summary", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); setData(null); return; }
    setErr(null); setData(j);
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  const act = async (url: string, body?: unknown) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(JSON.stringify(j));
      await load();
    } catch (e) { setMsg(`❌ ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="panel p-5"><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">{title}</h2>{children}</section>
  );
  const Row = ({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) => (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm"><span className="text-white/60">{k}</span><span className={`font-mono font-semibold ${warn ? "text-red-400" : ""}`}>{v}</span></div>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">lil<span style={{ color: "var(--accent)" }}>board</span> <span className="text-white/40">admin</span></h1>
        <div className="flex items-center gap-2">
          <a href="/" className="btn">← game</a>
          {me ? <span className="panel px-3 py-2 font-mono text-sm">{short(me.wallet)}</span>
            : wallet ? <button className="btn btn-primary" onClick={signIn} disabled={signing}>Sign in</button>
            : <button className="btn btn-primary" onClick={() => setVisible(true)}>Connect wallet</button>}
          {data && <button className="btn" onClick={load}>↻</button>}
        </div>
      </div>

      {!me && <p className="text-white/60">Sign in with an admin wallet.</p>}
      {err && <p className="text-red-400">{err}{err === "not an admin" && " — add this wallet to ADMIN_WALLETS."}</p>}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title={`Hot wallet · ${short(data.config.treasury)}`}>
            <Row k="SOL (tx fees)" v={data.chain.sol == null ? "?" : data.chain.sol.toFixed(4)} warn={data.chain.sol != null && data.chain.sol < 0.01} />
            <Row k={`${data.config.symbol} on-chain`} v={data.chain.wtc == null ? "?" : fmt(Math.floor(data.chain.wtc))} />
            <Row k="− owed: player claimable" v={fmt(data.liabilities.claimable)} />
            <Row k="− owed: jackpot pot" v={fmt(data.liabilities.pot)} />
            <Row k="− owed: pending burn" v={fmt(data.liabilities.burnPending)} />
            <div className="my-2 border-t border-white/10" />
            <Row k="= withdrawable (yours)" v={<span style={{ color: "var(--accent)" }}>{data.withdrawable == null ? "?" : fmt(data.withdrawable)}</span>} warn={data.withdrawable != null && data.withdrawable < 0} />
            {data.chain.error && <p className="mt-2 text-xs text-red-400">RPC: {data.chain.error}</p>}
            {!data.config.payoutsConfigured && <p className="mt-2 text-xs text-red-400">TREASURY_SECRET_KEY not set — claims, burns and withdrawals will fail.</p>}
            {data.chain.sol != null && data.chain.sol < 0.01 && <p className="mt-2 text-xs text-red-400">Send some SOL to the hot wallet or payouts will fail.</p>}
          </Card>

          <Card title="Revenue (all time)">
            <Row k="Total volume" v={`${fmt(data.revenue.volume)} ${data.config.symbol}`} />
            <Row k="Ops share earned" v={<span style={{ color: "var(--accent)" }}>{fmt(data.revenue.ops)}</span>} />
            <Row k="Paid back to players" v={fmt(data.revenue.paybackPaid)} />
            <Row k="Jackpots paid" v={fmt(data.revenue.jackpotPaid)} />
            <Row k="Burned" v={fmt(data.revenue.burned)} />
            <div className="my-2 border-t border-white/10" />
            <Row k="Users" v={fmt(data.activity.users)} />
            <Row k="Paid orders" v={fmt(data.activity.ordersPaid)} />
            <Row k="Pixels claimed" v={`${fmt(data.activity.pixelsClaimed)} / 250,000`} />
          </Card>

          <Card title="Withdraw ops revenue">
            <input className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm" placeholder="destination wallet" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm" placeholder={`amount (max ${data.withdrawable ?? "?"})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn btn-primary" disabled={busy || !to || !amount} onClick={() => act("/api/admin/withdraw", { to, amount })}>Send</button>
            </div>
            <p className="mt-2 text-xs text-white/40">Capped at withdrawable — money owed to players can&apos;t leave.</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-white/60">Pending burn: <b>{fmt(data.liabilities.burnPending)}</b> (auto daily 03:00 UTC)</span>
              <button className="btn" disabled={busy || data.liabilities.burnPending <= 0} onClick={() => act("/api/admin/burn")}>🔥 Burn now</button>
            </div>
            {msg && <p className="mt-3 break-all font-mono text-xs text-white/70">{msg}</p>}
          </Card>

          <Card title="Config">
            <Row k="Mode" v={data.config.freeMode ? "FREE" : "PAID"} warn={data.config.freeMode} />
            <Row k="Cluster" v={data.config.cluster} />
            <Row k="Mint" v={short(data.config.mint)} />
            <Row k="Base price" v={`${fmt(data.config.basePrice)} ${data.config.symbol}`} />
            <Row k="Free pixel every" v={`${data.config.freeCooldown}s`} />
            <Row k="Round" v={`${data.config.roundHours}h`} />
            <Row k="Steal split (owner/burn/pot/ops)" v={`${data.config.split.steal.owner}/${data.config.split.steal.burn}/${data.config.split.steal.jackpot}/${data.config.split.steal.ops}`} />
            <Row k="Blank split (pot/burn/ops)" v={`${data.config.split.blank.jackpot}/${data.config.split.blank.burn}/${data.config.split.blank.ops}`} />
          </Card>

          <Card title="Recent payouts">
            {data.payouts.length === 0 ? <p className="text-sm text-white/40">none yet</p> : (
              <ul className="space-y-1 text-xs">{data.payouts.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 font-mono"><span>{short(p.wallet)}</span><span>{fmt(p.amount)}</span><span className={p.status === "FAILED" ? "text-red-400" : "text-white/60"}>{p.status}</span>{p.signature ? <a className="underline" target="_blank" rel="noreferrer" href={explorer(p.signature, data.config.cluster)}>tx</a> : <span />}</li>
              ))}</ul>
            )}
          </Card>

          <Card title="Recent paid orders">
            {data.orders.length === 0 ? <p className="text-sm text-white/40">none yet</p> : (
              <ul className="space-y-1 text-xs">{data.orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 font-mono"><span>{short(o.wallet)}</span><span>{fmt(o.total)}</span><span className="text-white/60">{o.paidAt?.slice(5, 16).replace("T", " ")}</span>{o.signature ? <a className="underline" target="_blank" rel="noreferrer" href={explorer(o.signature, data.config.cluster)}>tx</a> : <span className="text-white/40">free</span>}</li>
              ))}</ul>
            )}
          </Card>

          <Card title="Top landowners">
            <ul className="space-y-1 text-sm">{data.activity.topOwners.map((o, i) => <li key={o.wallet} className="flex justify-between font-mono"><span>{i + 1}. {short(o.wallet)}</span><span>{fmt(o.pixels)} px</span></li>)}</ul>
          </Card>

          <Card title="Withdrawals">
            {data.withdrawals.length === 0 ? <p className="text-sm text-white/40">none yet</p> : (
              <ul className="space-y-1 text-xs">{data.withdrawals.map((w) => <li key={w.id} className="flex justify-between font-mono"><span>→ {short(w.orderId ?? "")}</span><span>{fmt(w.amount)}</span><span className="text-white/60">{w.createdAt.slice(5, 16).replace("T", " ")}</span></li>)}</ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
