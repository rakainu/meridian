import { useState, useEffect } from "react";

interface PerfData {
  period: string;
  trades: number;
  pnl_usd: number;
  pnl_sol: number;
  fees_usd: number;
  fees_sol: number;
  win_rate_pct: number;
}

export default function PerformancePanel() {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [data, setData] = useState<PerfData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPerf() {
      try {
        const res = await fetch(`/api/performance?period=${period}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* ignore */ }
    }
    fetchPerf();
    const interval = setInterval(fetchPerf, 30_000); // refresh every 30s
    return () => { cancelled = true; clearInterval(interval); };
  }, [period]);

  const pnl = data?.pnl_sol ?? 0;
  const fees = data?.fees_sol ?? 0;
  const winRate = data?.win_rate_pct ?? 0;
  const trades = data?.trades ?? 0;
  const pnlSign = pnl >= 0 ? "+" : "";

  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
      {/* Header with toggle */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
          Performance
        </span>
        <div className="flex overflow-hidden rounded-md" style={{ border: "1px solid var(--color-border-accent)" }}>
          <button
            onClick={() => setPeriod("daily")}
            className="px-2.5 py-0.5 text-[11px] font-bold transition-colors"
            style={{
              background: period === "daily" ? "var(--color-teal)" : "transparent",
              color: period === "daily" ? "var(--color-card)" : "var(--color-text-dim)",
            }}
          >
            Daily
          </button>
          <button
            onClick={() => setPeriod("weekly")}
            className="px-2.5 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              background: period === "weekly" ? "var(--color-teal)" : "transparent",
              color: period === "weekly" ? "var(--color-card)" : "var(--color-text-dim)",
            }}
          >
            Weekly
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="PnL" value={`${pnlSign}${pnl.toFixed(4)} SOL`} positive={pnl >= 0} />
        <StatCell label="Fees" value={`${fees.toFixed(4)} SOL`} />
        <StatCell label="Win Rate" value={trades > 0 ? `${winRate}%` : "--"} positive={winRate >= 50} />
        <StatCell label="Trades" value={String(trades)} />
      </div>
    </div>
  );
}

function StatCell({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--color-deep)" }}>
      <span className="text-[11px] uppercase" style={{ color: "var(--color-text-dim)" }}>{label}</span>
      <div
        className="mt-0.5 text-lg font-bold"
        style={{ color: positive != null ? (positive ? "var(--color-green)" : "var(--color-red)") : "white" }}
      >
        {value}
      </div>
    </div>
  );
}
