import type { StatusInfo, TimerInfo, WalletData } from "../hooks/useWebSocket";

interface TopBarProps {
  connected: boolean;
  status: StatusInfo;
  timers: TimerInfo;
  wallet: WalletData | null;
  onCommand: (cmd: string) => void;
}

export default function TopBar({ connected, status, timers, wallet, onCommand }: TopBarProps) {
  const mode = typeof window !== "undefined"
    ? (document.title.includes("DRY") ? "DRY RUN" : "LIVE")
    : "LIVE";

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2.5">
        <span className="text-[15px] font-bold tracking-wide" style={{ color: "var(--color-teal)" }}>MERIDIAN</span>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold"
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
            <span className="text-sm font-semibold text-white">{wallet.sol.toFixed(2)} SOL</span>
            <span className="ml-1 text-[11px]" style={{ color: "var(--color-text-dim)" }}>
              (${wallet.sol_usd.toFixed(0)})
            </span>
          </div>
        )}

        <span className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>
          Screen: {timers.screening}
        </span>

        <button
          onClick={() => onCommand("/pause")}
          className="rounded-md border px-3 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--color-border-accent)", color: "var(--color-teal)" }}
        >
          ⏸ Pause
        </button>
      </div>
    </div>
  );
}
