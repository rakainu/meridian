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

type RightTab = "overview" | "journal";

export default function App() {
  const {
    connected, notifications, status, timers,
    positions, wallet,
    sendMessage,
  } = useWebSocket();

  useToastNotifications(notifications);
  const [rightTab, setRightTab] = useState<RightTab>("overview");

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--color-page)" }}>
      <TopBar
        connected={connected}
        status={status}
        timers={timers}
        wallet={wallet}
        onCommand={sendMessage}
      />

      <div className="flex flex-1 gap-4 overflow-hidden px-4 pb-4">
        {/* Left: Positions */}
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

        {/* Right: Tabbed panel */}
        <div className="flex flex-col gap-3" style={{ flex: "3 1 0%", minHeight: 0 }}>
          {/* Tab bar */}
          <div className="flex items-center gap-0 overflow-hidden rounded-md" style={{ border: "1px solid var(--color-border-accent)" }}>
            <TabButton label="Overview" active={rightTab === "overview"} onClick={() => setRightTab("overview")} />
            <TabButton label="Journal" active={rightTab === "journal"} onClick={() => setRightTab("journal")} />
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {rightTab === "overview" ? (
              <div className="flex flex-col gap-3">
                <PerformancePanel />
                <ActivityFeed notifications={notifications} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <ExitAnalytics />
                <TradeJournal />
              </div>
            )}
          </div>
        </div>
      </div>

      <ToastProvider />
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-3 py-1 text-[11px] font-bold uppercase tracking-[1px] transition-colors"
      style={{
        background: active ? "var(--color-teal)" : "transparent",
        color: active ? "var(--color-card)" : "var(--color-text-dim)",
      }}
    >
      {label}
    </button>
  );
}
