import { useState, useEffect, useCallback } from "react";
import type { StatusInfo, TimerInfo, WalletData } from "../hooks/useWebSocket";

interface InstanceStatus {
  name: string;
  label: string;
  enabled: boolean;
  status: string;
  stale: boolean;
  active_positions: number;
}

interface FM3Status {
  fm3: InstanceStatus;
  "fm3-meme": InstanceStatus;
}

interface TopBarProps {
  connected: boolean;
  status: StatusInfo;
  timers: TimerInfo;
  wallet: WalletData | null;
  onCommand: (cmd: string) => void;
  page?: "dashboard" | "journal";
  onPageChange?: (page: "dashboard" | "journal") => void;
}

export default function TopBar({ connected, status, timers, wallet, page = "dashboard", onPageChange }: TopBarProps) {
  const [fm3, setFm3] = useState<FM3Status | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const fetchFM3 = useCallback(async () => {
    try {
      const res = await fetch("/api/fm3/status");
      if (res.ok) setFm3(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchFM3();
    const iv = setInterval(fetchFM3, 15_000);
    return () => clearInterval(iv);
  }, [fetchFM3]);

  const toggle = async (instance: string) => {
    if (!fm3 || loading) return;
    const inst = fm3[instance as keyof FM3Status];
    if (!inst) return;
    setLoading(instance);
    try {
      const endpoint = inst.enabled ? "/api/fm3/stop" : "/api/fm3/start";
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance }),
      });
      await fetchFM3();
    } catch { /* ignore */ }
    setLoading(null);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-bold tracking-wide" style={{ color: "var(--color-teal)" }}>MERIDIAN</span>
        <span
          className="rounded px-2 py-0.5 text-xs font-semibold"
          style={{
            background: connected ? "rgba(99,220,190,0.1)" : "rgba(239,68,68,0.1)",
            color: connected ? "var(--color-teal)" : "var(--color-red)",
          }}
        >
          {connected ? (status.screeningBusy ? "SCREENING" : status.managementBusy ? "MANAGING" : "LIVE") : "OFFLINE"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {wallet && (
          <div className="text-right">
            <span className="text-base font-semibold text-white">{wallet.sol.toFixed(2)} SOL</span>
            <span className="ml-1 text-sm" style={{ color: "var(--color-text-dim)" }}>
              (${wallet.sol_usd.toFixed(0)})
            </span>
          </div>
        )}

        <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
          Screen: {timers.screening}
        </span>

        {/* FM3 toggles */}
        {fm3 && (
          <>
            <StrategyToggle
              inst={fm3.fm3}
              loading={loading === "fm3"}
              onClick={() => toggle("fm3")}
            />
            <StrategyToggle
              inst={fm3["fm3-meme"]}
              loading={loading === "fm3-meme"}
              onClick={() => toggle("fm3-meme")}
            />
          </>
        )}

        <button
          onClick={() => onPageChange?.(page === "dashboard" ? "journal" : "dashboard")}
          className="rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/5"
          style={{
            borderColor: page === "journal" ? "var(--color-teal)" : "var(--color-border-accent)",
            color: page === "journal" ? "var(--color-card)" : "var(--color-teal)",
            background: page === "journal" ? "var(--color-teal)" : "transparent",
          }}
        >
          {page === "journal" ? "Back to Dashboard" : "Trade Journal"}
        </button>
      </div>
    </div>
  );
}

function StrategyToggle({ inst, loading, onClick }: { inst: InstanceStatus; loading: boolean; onClick: () => void }) {
  const color = inst.enabled
    ? inst.stale ? "var(--color-orange)" : "var(--color-green)"
    : "var(--color-text-faint)";

  const label = inst.enabled
    ? inst.stale ? `${inst.label} STALE` : `${inst.label} ON (${inst.active_positions})`
    : `${inst.label} OFF`;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-md border px-2.5 py-1 text-xs font-bold transition-colors hover:bg-white/5"
      style={{ borderColor: color, color, opacity: loading ? 0.5 : 1 }}
      title={inst.enabled ? `Click to stop ${inst.label}` : `Click to start ${inst.label}`}
    >
      {loading ? "..." : label}
    </button>
  );
}
