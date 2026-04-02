import { useState, useEffect, useCallback } from "react";
import type { StatusInfo, TimerInfo, WalletData } from "../hooks/useWebSocket";

interface FM3Status {
  enabled: boolean;
  status: string;
  stale: boolean;
  active_positions: number;
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

export default function TopBar({ connected, status, timers, wallet, onCommand, page = "dashboard", onPageChange }: TopBarProps) {
  const [fm3, setFm3] = useState<FM3Status | null>(null);
  const [fm3Loading, setFm3Loading] = useState(false);

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

  const toggleFM3 = async () => {
    if (!fm3 || fm3Loading) return;
    setFm3Loading(true);
    try {
      const endpoint = fm3.enabled ? "/api/fm3/stop" : "/api/fm3/start";
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        await fetchFM3();
      }
    } catch { /* ignore */ }
    setFm3Loading(false);
  };

  const fm3Color = fm3?.enabled
    ? fm3.stale ? "var(--color-orange)" : "var(--color-green)"
    : "var(--color-text-faint)";
  const fm3Label = fm3
    ? fm3.enabled
      ? fm3.stale ? "FM3 STALE" : `FM3 ON (${fm3.active_positions})`
      : "FM3 OFF"
    : "FM3 ...";

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

      <div className="flex items-center gap-3.5">
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

        {/* FM3 toggle */}
        <button
          onClick={toggleFM3}
          disabled={fm3Loading}
          className="rounded-md border px-2.5 py-1 text-xs font-bold transition-colors hover:bg-white/5"
          style={{
            borderColor: fm3Color,
            color: fm3Color,
            opacity: fm3Loading ? 0.5 : 1,
          }}
          title={fm3?.enabled ? "Click to stop FM3" : "Click to start FM3"}
        >
          {fm3Loading ? "..." : fm3Label}
        </button>

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

        <button
          onClick={() => onCommand("/pause")}
          className="rounded-md border px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--color-border-accent)", color: "var(--color-teal)" }}
        >
          Pause
        </button>
      </div>
    </div>
  );
}
