import { useState, useEffect } from "react";

interface JournalSummary {
  total: number;
  wins: number;
  win_rate_pct: number;
  avg_peak_vs_exit_gap: number;
  exit_reasons: Record<string, number>;
}

interface Thresholds {
  stopLossPct: number;
  takeProfitFeePct: number;
  trailingTriggerPct: number;
  trailingDropPct: number;
  outOfRangeWaitMinutes: number;
  emergencyPriceDropPct: number;
  minFeeActiveTvlRatio: number;
  minVolume: number;
}

interface JournalData {
  summary: JournalSummary;
  thresholds: Thresholds;
}

const REASON_COLORS: Record<string, string> = {
  FIXED_TP: "#56d364",
  TRAILING_TP: "#63dcbe",
  STOP_LOSS: "#f87171",
  OOR_TIMEOUT: "#fbbf6e",
  YIELD_DEAD: "#8b949e",
  EMERGENCY: "#f87171",
  AGENT_LEGACY: "#6b7280",
  MANUAL: "#c9d1d9",
  UNKNOWN: "#6b7280",
};

const REASON_LABELS: Record<string, string> = {
  FIXED_TP: "Fixed TP",
  TRAILING_TP: "Trailing TP",
  STOP_LOSS: "Stop Loss",
  OOR_TIMEOUT: "OOR Timeout",
  YIELD_DEAD: "Yield Dead",
  EMERGENCY: "Emergency",
  AGENT_LEGACY: "Agent (Legacy)",
  MANUAL: "Manual",
  UNKNOWN: "Unknown",
};

export default function ExitAnalytics() {
  const [data, setData] = useState<JournalData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchJournal() {
      try {
        const res = await fetch("/api/journal?days=30");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData({ summary: json.summary, thresholds: json.thresholds });
      } catch { /* ignore */ }
    }
    fetchJournal();
    const interval = setInterval(fetchJournal, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data) return null;

  const { summary, thresholds } = data;
  const reasons = summary.exit_reasons || {};
  const maxCount = Math.max(...Object.values(reasons), 1);
  const sortedReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]);

  const gapColor = summary.avg_peak_vs_exit_gap > 2
    ? "var(--color-orange)"
    : summary.avg_peak_vs_exit_gap > 1
      ? "var(--color-teal)"
      : "var(--color-green)";

  const gapHint = summary.avg_peak_vs_exit_gap > 3
    ? "TP may be too tight — positions peak well above exit"
    : summary.avg_peak_vs_exit_gap > 1.5
      ? "Moderate gap — trailing TP capturing most upside"
      : "Exits close to peak — thresholds well-tuned";

  return (
    <div className="flex flex-col gap-4">
      {/* Peak vs Exit Analysis */}
      <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <div className="mb-4">
          <span className="text-sm font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
            Peak vs Exit Gap
          </span>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold" style={{ color: gapColor }}>
            {summary.avg_peak_vs_exit_gap.toFixed(1)}%
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            avg gap (peak minus exit)
          </span>
        </div>
        <div className="mt-2 text-sm" style={{ color: "var(--color-text-faint)" }}>
          {gapHint}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Total Trades" value={String(summary.total)} />
          <MiniStat label="Win Rate" value={`${summary.win_rate_pct}%`} positive={summary.win_rate_pct >= 50} />
        </div>
      </div>

      {/* Exit Reason Distribution */}
      <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <div className="mb-4">
          <span className="text-sm font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
            Exit Reasons
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {sortedReasons.map(([reason, count]) => {
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            const barWidth = Math.max((count / maxCount) * 100, 4);
            const color = REASON_COLORS[reason] || "#6b7280";

            return (
              <div key={reason} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-medium" style={{ color }}>
                  {REASON_LABELS[reason] || reason}
                </span>
                <div className="flex-1 rounded-full" style={{ background: "var(--color-deep)", height: 10 }}>
                  <div
                    className="rounded-full transition-all"
                    style={{ width: `${barWidth}%`, height: 10, background: color, opacity: 0.8 }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-sm font-semibold" style={{ color: "var(--color-text-dim)" }}>
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>

        {sortedReasons.length === 0 && (
          <div className="py-4 text-center text-sm" style={{ color: "var(--color-text-dim)" }}>
            No exit data yet
          </div>
        )}
      </div>

      {/* Current Thresholds */}
      <div className="rounded-xl p-5" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <div className="mb-4">
          <span className="text-sm font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
            Current Exit Thresholds
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          <ThresholdRow label="Take Profit" value={`+${thresholds.takeProfitFeePct}%`} color="var(--color-green)" />
          <ThresholdRow label="Trail Trigger" value={`+${thresholds.trailingTriggerPct}%`} color="var(--color-teal)" />
          <ThresholdRow label="Trail Drop" value={`${thresholds.trailingDropPct}%`} color="var(--color-teal)" />
          <ThresholdRow label="Stop Loss" value={`${thresholds.stopLossPct}%`} color="var(--color-red)" />
          <ThresholdRow label="OOR Timeout" value={`${thresholds.outOfRangeWaitMinutes}m`} color="var(--color-orange)" />
          <ThresholdRow label="Emergency" value={`${thresholds.emergencyPriceDropPct}%`} color="var(--color-red)" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--color-deep)" }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-dim)" }}>{label}</span>
      <div
        className="mt-1 text-xl font-bold"
        style={{ color: positive != null ? (positive ? "var(--color-green)" : "var(--color-red)") : "white" }}
      >
        {value}
      </div>
    </div>
  );
}

function ThresholdRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <>
      <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>{label}</span>
      <span className="text-base font-bold text-right" style={{ color }}>{value}</span>
    </>
  );
}
