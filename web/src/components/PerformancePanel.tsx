import { useState } from "react";
import type { LpOverviewData } from "../hooks/useWebSocket";

export default function PerformancePanel({ lpOverview }: { lpOverview: LpOverviewData | null }) {
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");

  const o = lpOverview;
  const pnl = o ? (o.pnl_unit === "sol" ? o.total_pnl_sol : o.total_pnl_usd) : 0;
  const fees = o ? (o.pnl_unit === "sol" ? o.total_fees_sol : o.total_fees_usd) : 0;
  const winRate = o ? (o.pnl_unit === "sol" ? o.win_rate_sol_pct : o.win_rate_usd_pct) : 0;
  const unit = o?.pnl_unit === "sol" ? "SOL" : "USD";
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
        <StatCell label="PnL" value={`${pnlSign}${pnl.toFixed(3)} ${unit}`} positive={pnl >= 0} />
        <StatCell label="Fees" value={`${fees.toFixed(3)} ${unit}`} />
        <StatCell label="Win Rate" value={`${winRate.toFixed(0)}%`} positive={winRate >= 50} />
        <StatCell label="Trades" value={String(o?.closed_positions ?? 0)} />
      </div>

      {/* Lifetime summary */}
      <div className="mt-2.5 pt-2 text-[11px]" style={{ borderTop: "1px solid rgba(99,220,190,0.06)", color: "var(--color-text-faint)" }}>
        Lifetime: {o?.closed_positions ?? 0} closed · {(o?.total_fees_sol ?? 0).toFixed(1)} SOL fees · {(o?.win_rate_sol_pct ?? 0).toFixed(0)}% win · avg {(o?.avg_hold_hours ?? 0).toFixed(1)}h hold
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
