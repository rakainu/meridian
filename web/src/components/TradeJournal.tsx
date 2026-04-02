import { useState, useEffect, useMemo } from "react";

interface Trade {
  pool_name: string;
  strategy: string;
  pnl_pct: number;
  pnl_usd: number;
  peak_pnl_pct: number;
  peak_vs_exit_gap: number;
  fees_earned_usd: number;
  initial_value_usd: number;
  final_value_usd: number;
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

type SortKey = "closed_at" | "pnl_usd" | "pnl_pct" | "fees_earned_usd" | "minutes_held" | "initial_value_usd";

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

  const stats = useMemo(() => {
    if (!data) return null;
    const trades = data.trades;
    const totalDeposited = trades.reduce((s, t) => s + (t.initial_value_usd || 0), 0);
    const totalReturned = trades.reduce((s, t) => s + (t.final_value_usd || 0), 0);
    const totalPnl = trades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const totalFees = trades.reduce((s, t) => s + (t.fees_earned_usd || 0), 0);
    const pnlPct = totalDeposited > 0 ? (totalPnl / totalDeposited) * 100 : 0;
    const avgHoldMin = trades.length > 0
      ? trades.reduce((s, t) => s + (t.minutes_held || 0), 0) / trades.length
      : 0;
    return { totalDeposited, totalReturned, totalPnl, totalFees, pnlPct, avgHoldMin };
  }, [data]);

  if (!data) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>Loading trade history...</span>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
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

  const fmtHold = (min: number) => {
    if (min >= 1440) return `${(min / 1440).toFixed(1)}d`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${Math.round(min)}m`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Stats Row ── */}
      {stats && (
        <div className="grid grid-cols-6 gap-3">
          <StatCard label="Deposited" value={`$${stats.totalDeposited.toFixed(2)}`} />
          <StatCard label="Returned" value={`$${stats.totalReturned.toFixed(2)}`} />
          <StatCard
            label="Net PnL"
            value={`${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl.toFixed(2)}`}
            sub={`${stats.pnlPct >= 0 ? "+" : ""}${stats.pnlPct.toFixed(1)}%`}
            color={stats.totalPnl >= 0 ? "var(--color-green)" : "var(--color-red)"}
          />
          <StatCard
            label="Win Rate"
            value={`${data.summary.win_rate_pct}%`}
            color={data.summary.win_rate_pct >= 50 ? "var(--color-green)" : "var(--color-red)"}
          />
          <StatCard label="Trades" value={String(data.summary.total)} />
          <StatCard label="Avg Hold" value={fmtHold(stats.avgHoldMin)} />
        </div>
      )}

      {/* ── Cumulative PnL Chart ── */}
      <CumulativePnlChart trades={data.trades} />

      {/* ── Trade History Table ── */}
      <div className="rounded-xl p-4" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <div className="mb-3">
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-dim)" }}>
            Trade History
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ color: "var(--color-text)" }}>
            <thead>
              <tr className="text-[13px]" style={{ color: "var(--color-text-dim)", borderBottom: "2px solid var(--color-border-accent)" }}>
                <Th>Pair</Th>
                <Th>Strategy</Th>
                <Th sort onClick={() => handleSort("closed_at")}>Exit Time{arrow("closed_at")}</Th>
                <Th sort right onClick={() => handleSort("initial_value_usd")}>Deposit{arrow("initial_value_usd")}</Th>
                <Th sort right onClick={() => handleSort("fees_earned_usd")}>Fees{arrow("fees_earned_usd")}</Th>
                <Th sort right onClick={() => handleSort("pnl_usd")}>PnL ($){arrow("pnl_usd")}</Th>
                <Th sort right onClick={() => handleSort("pnl_pct")}>PnL (%){arrow("pnl_pct")}</Th>
                <Th sort right onClick={() => handleSort("minutes_held")}>Hold{arrow("minutes_held")}</Th>
                <Th>Exit Reason</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t, i) => {
                const pnlColor = (t.pnl_usd ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)";
                const holdStr = t.minutes_held != null
                  ? t.minutes_held >= 60 ? `${(t.minutes_held / 60).toFixed(1)}h` : `${t.minutes_held}m`
                  : "--";
                const exitTime = t.closed_at
                  ? new Date(t.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "--";
                const deposit = t.initial_value_usd ? `$${t.initial_value_usd.toFixed(2)}` : "--";
                const fees = t.fees_earned_usd ? `$${t.fees_earned_usd.toFixed(2)}` : "$0";
                const pnlUsd = t.pnl_usd != null ? `${t.pnl_usd >= 0 ? "+" : ""}$${t.pnl_usd.toFixed(2)}` : "--";
                const pnlPct = t.pnl_pct != null ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%` : "--";

                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 text-[13px] font-semibold" style={{ color: "var(--color-text-bright)" }}>
                      {t.pool_name || "?"}
                    </td>
                    <td className="py-2.5 text-[13px]">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase"
                        style={{ color: "var(--color-teal)", border: "1px solid rgba(99,220,190,0.3)" }}
                      >
                        {t.strategy || "?"}
                      </span>
                    </td>
                    <td className="py-2.5 text-[13px]" style={{ color: "var(--color-text-dim)" }}>{exitTime}</td>
                    <td className="py-2.5 text-right text-[13px]" style={{ color: "var(--color-text)" }}>{deposit}</td>
                    <td className="py-2.5 text-right text-[13px]" style={{ color: "var(--color-teal)" }}>{fees}</td>
                    <td className="py-2.5 text-right text-[14px] font-bold" style={{ color: pnlColor }}>{pnlUsd}</td>
                    <td className="py-2.5 text-right text-[14px] font-bold" style={{ color: pnlColor }}>{pnlPct}</td>
                    <td className="py-2.5 text-right text-[13px]">{holdStr}</td>
                    <td className="py-2.5">
                      <ReasonBadge category={t.exit_category} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="py-8 text-center text-[14px]" style={{ color: "var(--color-text-dim)" }}>
            No closed trades yet
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stats Card ── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-dim)" }}>
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold" style={{ color: color || "var(--color-text-bright)" }}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-sm font-semibold" style={{ color, opacity: 0.8 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── Cumulative PnL Chart (SVG) ── */
function CumulativePnlChart({ trades }: { trades: Trade[] }) {
  const chartData = useMemo(() => {
    // Sort trades chronologically
    const chronological = [...trades]
      .filter(t => t.closed_at)
      .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());

    if (chronological.length === 0) return null;

    let cumulative = 0;
    const points = chronological.map(t => {
      cumulative += t.pnl_usd || 0;
      return { date: new Date(t.closed_at), pnl: cumulative, tradePnl: t.pnl_usd || 0, pool: t.pool_name };
    });

    return points;
  }, [trades]);

  if (!chartData || chartData.length < 2) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <div className="mb-3">
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-dim)" }}>
            Cumulative PnL
          </span>
        </div>
        <div className="py-6 text-center text-sm" style={{ color: "var(--color-text-dim)" }}>
          Need at least 2 trades to show chart
        </div>
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pnlValues = chartData.map(p => p.pnl);
  const minPnl = Math.min(0, ...pnlValues);
  const maxPnl = Math.max(0, ...pnlValues);
  const range = maxPnl - minPnl || 1;

  const timeMin = chartData[0].date.getTime();
  const timeMax = chartData[chartData.length - 1].date.getTime();
  const timeRange = timeMax - timeMin || 1;

  const scaleX = (d: Date) => PAD.left + ((d.getTime() - timeMin) / timeRange) * innerW;
  const scaleY = (v: number) => PAD.top + innerH - ((v - minPnl) / range) * innerH;

  const zeroY = scaleY(0);
  const pathPoints = chartData.map(p => `${scaleX(p.date)},${scaleY(p.pnl)}`);
  const linePath = `M${pathPoints.join("L")}`;

  // Fill area: line + close at bottom right and bottom left
  const lastPt = chartData[chartData.length - 1];
  const firstPt = chartData[0];
  const fillPath = `${linePath}L${scaleX(lastPt.date)},${zeroY}L${scaleX(firstPt.date)},${zeroY}Z`;

  const finalPnl = chartData[chartData.length - 1].pnl;
  const lineColor = finalPnl >= 0 ? "var(--color-green)" : "var(--color-red)";

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minPnl + (range * i) / 4);

  // X-axis labels (show a few dates)
  const xTickCount = Math.min(chartData.length, 6);
  const xStep = Math.max(1, Math.floor(chartData.length / xTickCount));
  const xTicks = chartData.filter((_, i) => i % xStep === 0 || i === chartData.length - 1);

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
      <div className="mb-3">
        <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-dim)" }}>
          Cumulative PnL
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <line key={i} x1={PAD.left} x2={W - PAD.right} y1={scaleY(v)} y2={scaleY(v)}
            stroke="var(--color-border)" strokeWidth="0.5" />
        ))}

        {/* Zero line */}
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY}
          stroke="var(--color-text-faint)" strokeWidth="1" strokeDasharray="4,3" />

        {/* Fill area */}
        <path d={fillPath} fill="url(#pnlFill)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />

        {/* Data points */}
        {chartData.map((p, i) => (
          <circle key={i} cx={scaleX(p.date)} cy={scaleY(p.pnl)} r="3"
            fill={p.tradePnl >= 0 ? "var(--color-green)" : "var(--color-red)"}
            stroke="var(--color-card)" strokeWidth="1.5" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((v, i) => (
          <text key={i} x={PAD.left - 8} y={scaleY(v) + 4} textAnchor="end"
            fill="var(--color-text-dim)" fontSize="10">
            ${v.toFixed(0)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((p, i) => (
          <text key={i} x={scaleX(p.date)} y={H - 6} textAnchor="middle"
            fill="var(--color-text-dim)" fontSize="10">
            {p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── Table Header ── */
function Th({ children, sort, right, onClick }: { children: React.ReactNode; sort?: boolean; right?: boolean; onClick?: () => void }) {
  return (
    <th
      className={`pb-3 text-[13px] font-semibold ${right ? "text-right" : "text-left"} ${sort ? "cursor-pointer hover:text-white" : ""}`}
      onClick={onClick}
      style={{ whiteSpace: "nowrap", paddingRight: "12px" }}
    >
      {children}
    </th>
  );
}

const REASON_COLORS: Record<string, string> = {
  FIXED_TP: "var(--color-green)", TRAILING_TP: "var(--color-teal)", STOP_LOSS: "var(--color-red)",
  OOR_TIMEOUT: "var(--color-orange)", YIELD_DEAD: "var(--color-text-dim)", EMERGENCY: "var(--color-red)",
  AGENT_LEGACY: "var(--color-text-faint)", MANUAL: "var(--color-text)", UNKNOWN: "var(--color-text-faint)",
};
const REASON_LABELS: Record<string, string> = {
  FIXED_TP: "Take Profit", TRAILING_TP: "Trailing TP", STOP_LOSS: "Stop Loss",
  OOR_TIMEOUT: "OOR Timeout", YIELD_DEAD: "Yield Dead", EMERGENCY: "Emergency",
  AGENT_LEGACY: "Agent", MANUAL: "Manual", UNKNOWN: "Unknown",
};

function ReasonBadge({ category }: { category: string }) {
  const color = REASON_COLORS[category] || "var(--color-text-dim)";
  const label = REASON_LABELS[category] || category;
  return (
    <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}>
      {label}
    </span>
  );
}
