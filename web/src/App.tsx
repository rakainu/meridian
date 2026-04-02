import { useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useToastNotifications } from "./hooks/useToastNotifications";
import TopBar from "./components/TopBar";
import PositionList from "./components/PositionList";
import PerformancePanel from "./components/PerformancePanel";
import ActivityFeed from "./components/ActivityFeed";
import TradeJournal from "./components/TradeJournal";
import ExitAnalytics from "./components/ExitAnalytics";
import ToastProvider from "./components/ToastProvider";

type Page = "dashboard" | "journal";

export default function App() {
  const {
    connected, notifications, status, timers,
    positions, wallet,
    sendMessage,
  } = useWebSocket();

  useToastNotifications(notifications);
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--color-page)" }}>
      <TopBar
        connected={connected}
        status={status}
        timers={timers}
        wallet={wallet}
        onCommand={sendMessage}
        page={page}
        onPageChange={setPage}
      />

      {page === "dashboard" ? (
        /* ── Dashboard view (original layout) ── */
        <div className="flex flex-1 gap-4 overflow-hidden px-4 pb-4">
          <div className="flex flex-col" style={{ flex: "5 1 0%", minHeight: 0 }}>
            <div className="mb-3">
              <span className="text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
                Open Positions ({positions?.total_positions ?? 0})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <PositionList positions={positions} />
            </div>
          </div>

          <div className="flex flex-col gap-3" style={{ flex: "3 1 0%", minHeight: 0 }}>
            <div className="mb-3">
              <span className="text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
                &nbsp;
              </span>
            </div>
            <PerformancePanel />
            <div className="flex-1 overflow-hidden">
              <ActivityFeed notifications={notifications} />
            </div>
          </div>
        </div>
      ) : (
        /* ── Journal view (full page) ── */
        <div className="flex flex-1 gap-4 overflow-hidden px-4 pb-4">
          {/* Left: Trade table (wide) */}
          <div className="flex flex-col" style={{ flex: "5 1 0%", minHeight: 0 }}>
            <div className="mb-3">
              <span className="text-sm font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
                Closed Trades
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <TradeJournal />
            </div>
          </div>

          {/* Right: Analytics */}
          <div className="flex flex-col gap-3" style={{ flex: "3 1 0%", minHeight: 0 }}>
            <div className="mb-3">
              <span className="text-sm font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
                Exit Analytics
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ExitAnalytics />
            </div>
          </div>
        </div>
      )}

      <ToastProvider />
    </div>
  );
}
