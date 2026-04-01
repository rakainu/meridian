import type { PositionData, PositionInfo } from "../hooks/useWebSocket";

function formatAge(minutes?: number): string {
  if (minutes == null) return "--";
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hrs < 24) return `${hrs}h ${rem}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function PositionCard({ p }: { p: PositionInfo }) {
  const inRange = p.in_range;
  const accent = inRange ? "var(--color-teal-light)" : "var(--color-orange)";
  const borderColor = inRange ? "rgba(99,220,190,0.1)" : "rgba(251,146,60,0.12)";
  const pnlColor = p.pnl_pct >= 0 ? "var(--color-green)" : "var(--color-red)";
  const pnlSign = p.pnl_pct >= 0 ? "+" : "";

  // Bin range bar
  const range = p.upper_bin - p.lower_bin;
  const rangeStart = range > 0 ? ((p.lower_bin - p.lower_bin) / (range * 1.5)) * 100 + 10 : 15;
  const rangeEnd = 100 - rangeStart;
  const activePct = range > 0
    ? Math.min(95, Math.max(5, ((p.active_bin - p.lower_bin) / range) * (rangeEnd - rangeStart) + rangeStart))
    : 50;
  const barFill = inRange ? "rgba(126,232,208,0.25)" : "rgba(251,191,110,0.2)";
  const barBorder = inRange ? "rgba(126,232,208,0.3)" : "rgba(251,191,110,0.3)";
  const barGlow = inRange ? "rgba(126,232,208,0.8)" : "rgba(251,191,110,0.8)";

  return (
    <div
      className="mb-2.5 rounded-xl p-3.5"
      style={{ background: "var(--color-card)", border: `1px solid ${borderColor}` }}
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">{p.pair}</span>
          <span
            className="rounded px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: inRange ? "rgba(99,220,190,0.08)" : "rgba(251,146,60,0.08)",
              color: accent,
            }}
          >
            {p.strategy || "bid_ask"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium" style={{ color: accent }}>
            ● {inRange ? "In Range" : `OOR ${p.pnl_pct >= 0 ? "↑" : "↓"}`}
          </span>
          <a
            href={`https://app.meteora.ag/dlmm/${p.pool}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs opacity-60 transition-opacity hover:opacity-100"
            style={{ color: "var(--color-teal-light)" }}
          >
            Pool ↗
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-2.5 flex gap-6">
        <Stat label="PnL" value={`${pnlSign}${p.pnl_pct.toFixed(2)}%`} color={pnlColor} large />
        <Stat label="Fees" value={`${(p.unclaimed_fees_sol ?? 0).toFixed(4)} SOL`} />
        <Stat label="Value" value={p.total_value_sol != null ? `${p.total_value_sol.toFixed(3)} SOL` : "--"} />
        <Stat label="Age" value={formatAge(p.age_minutes)} dim />
      </div>

      {/* Bin range bar */}
      <div className="relative h-4 overflow-hidden rounded-md" style={{ background: "#0c1220" }}>
        <div
          className="absolute inset-y-0 rounded-md"
          style={{
            left: `${rangeStart}%`,
            right: `${100 - rangeEnd}%`,
            background: barFill,
            border: `1px solid ${barBorder}`,
          }}
        />
        <div
          className="absolute inset-y-0 w-[3px] rounded-sm"
          style={{
            left: `${activePct}%`,
            background: accent,
            boxShadow: `0 0 10px ${barGlow}`,
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, color, dim, large }: {
  label: string;
  value: string;
  color?: string;
  dim?: boolean;
  large?: boolean;
}) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-dim)" }}>{label}</span>
      <div
        className={`font-semibold ${large ? "text-lg" : "text-sm"}`}
        style={{ color: color || (dim ? "var(--color-text)" : "var(--color-text-bright)") }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex h-40 items-center justify-center rounded-xl"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
    >
      <span className="text-base" style={{ color: "var(--color-text-faint)" }}>
        No open positions — waiting for next screening cycle
      </span>
    </div>
  );
}

export default function PositionList({ positions }: { positions: PositionData | null }) {
  if (!positions?.positions?.length) return <EmptyState />;
  return (
    <>
      {positions.positions.map((p) => (
        <PositionCard key={p.position} p={p} />
      ))}
    </>
  );
}
