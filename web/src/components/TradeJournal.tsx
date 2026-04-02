import { useState, useEffect } from "react";

interface Trade {
  pool_name: string;
  strategy: string;
  pnl_pct: number;
  pnl_usd: number;
  peak_pnl_pct: number;
  peak_vs_exit_gap: number;
  fees_earned_usd: number;
  range_efficiency: number | null;
  hold_time_hours: number | null;
  minutes_held: number;
  close_reason: string;
  exit_category: string;
  closed_at: string;
  deployed_at: string;
}

interface JournalData {
  trades: Trade[];
  summary: {
    total: number;
    wins: number;
    win_rate_pct: number;
    avg_peak_vs_exit_gap: number;
    exit_reasons: Record<string, number>;
  };
  thresholds: Record<string, number>;
}

type SortKey = "closed_at" | "pnl_pct" | "peak_pnl_pct" | "peak_vs_exit_gap" | "minutes_held";

export default function TradeJournal() {
  const [data, setData] = useState<JournalData | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("closed_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchJournal() {
      try {
        const res = await fetch("/api/journal?days=30");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* ignore */ }
    }
    fetchJournal();
    const interval = setInterval(fetchJournal, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data) {
    return (
      <div className="rounded-xl p-4" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <span style={{ color: "var(--color-text-dim)" }}>Loading trade journal...</span>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = [...data.trades].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "closed_at") {
      av = new Date(a.closed_at || 0).getTime();
      bv = new Date(b.closed_at || 0).getTime();
    } else {
      av = (a[sortKey] as number) ?? 0;
      bv = (b[sortKey] as number) ?? 0;
    }
    return sortAsc ? av - bv : bv - av;
  });

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ▲" : " ▼") : "";

  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
      <div className="mb-3">
        <span className="text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
          Trade Journal ({data.summary.total} trades)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-dim)", borderBottom: "1px solid var(--color-border)" }}>
              <th className="pb-2 text-left font-medium">Pair</th>
              <th className="cursor-pointer pb-2 text-right font-medium" onClick={() => handleSort("closed_at")}>
                Exit{arrow("closed_at")}
              </th>
              <th className="cursor-pointer pb-2 text-right font-medium" onClick={() => handleSort("minutes_held")}>
                Hold{arrow("minutes_held")}
              </th>
              <th className="pb-2 text-left font-medium pl-2">Exit Reason</th>
              <th className="cursor-pointer pb-2 text-right font-medium" onClick={() => handleSort("pnl_pct")}>
                PnL%{arrow("pnl_pct")}
              </th>
              <th className="cursor-pointer pb-2 text-right font-medium" onClick={() => handleSort("peak_pnl_pct")}>
                Peak%{arrow("peak_pnl_pct")}
              </th>
              <th className="cursor-pointer pb-2 text-right font-medium" onClick={() => handleSort("peak_vs_exit_gap")}>
                Gap%{arrow("peak_vs_exit_gap")}
              </th>
              <th className="pb-2 text-right font-medium">Eff%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const pnlColor = (t.pnl_pct ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)";
              const gapColor = t.peak_vs_exit_gap > 2 ? "var(--color-orange)" : "var(--color-text-dim)";
              const holdStr = t.minutes_held != null
                ? t.minutes_held >= 60 ? `${(t.minutes_held / 60).toFixed(1)}h` : `${t.minutes_held}m`
                : "--";
              const exitTime = t.closed_at ? new Date(t.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";

              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 font-medium" style={{ color: "var(--color-text-bright)" }}>{t.pool_name || "?"}</td>
                  <td className="py-1.5 text-right" style={{ color: "var(--color-text-dim)" }}>{exitTime}</td>
                  <td className="py-1.5 text-right">{holdStr}</td>
                  <td className="py-1.5 pl-2">
                    <ReasonBadge category={t.exit_category} />
                  </td>
                  <td className="py-1.5 text-right font-bold" style={{ color: pnlColor }}>
                    {(t.pnl_pct ?? 0) >= 0 ? "+" : ""}{(t.pnl_pct ?? 0).toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right" style={{ color: "var(--color-teal)" }}>
                    +{(t.peak_pnl_pct ?? 0).toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right" style={{ color: gapColor }}>
                    {t.peak_vs_exit_gap.toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right" style={{ color: "var(--color-text-dim)" }}>
                    {t.range_efficiency != null ? `${t.range_efficiency}%` : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-6 text-center text-[13px]" style={{ color: "var(--color-text-dim)" }}>
          No closed trades yet
        </div>
      )}
    </div>
  );
}

const REASON_COLORS: Record<string, string> = {
  FIXED_TP: "var(--color-green)",
  TRAILING_TP: "var(--color-teal)",
  STOP_LOSS: "var(--color-red)",
  OOR_TIMEOUT: "var(--color-orange)",
  YIELD_DEAD: "var(--color-text-dim)",
  EMERGENCY: "var(--color-red)",
  AGENT_LEGACY: "var(--color-text-faint)",
  MANUAL: "var(--color-text)",
  UNKNOWN: "var(--color-text-faint)",
};

const REASON_LABELS: Record<string, string> = {
  FIXED_TP: "TP",
  TRAILING_TP: "Trail",
  STOP_LOSS: "SL",
  OOR_TIMEOUT: "OOR",
  YIELD_DEAD: "Dead",
  EMERGENCY: "Emrg",
  AGENT_LEGACY: "Legacy",
  MANUAL: "Manual",
  UNKNOWN: "?",
};

function ReasonBadge({ category }: { category: string }) {
  const color = REASON_COLORS[category] || "var(--color-text-dim)";
  const label = REASON_LABELS[category] || category;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
      style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}
    >
      {label}
    </span>
  );
}
