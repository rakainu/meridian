import { useWebSocket } from "./hooks/useWebSocket";
import { useToastNotifications } from "./hooks/useToastNotifications";
import TopBar from "./components/TopBar";
import PositionList from "./components/PositionList";
import PerformancePanel from "./components/PerformancePanel";
import ActivityFeed from "./components/ActivityFeed";
import ToastProvider from "./components/ToastProvider";

export default function App() {
  const {
    connected, notifications, status, timers,
    positions, wallet, lpOverview,
    sendMessage,
  } = useWebSocket();

  useToastNotifications(notifications);

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--color-page)" }}>
      <TopBar
        connected={connected}
        status={status}
        timers={timers}
        wallet={wallet}
        onCommand={sendMessage}
      />

      <div className="flex flex-1 gap-3.5 overflow-hidden px-4 pb-4">
        {/* Left: Positions */}
        <div className="flex flex-col" style={{ flex: "5 1 0%", minHeight: 0 }}>
          <div className="mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
              Open Positions ({positions?.total_positions ?? 0})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <PositionList positions={positions} />
          </div>
        </div>

        {/* Right: Stats + Activity */}
        <div className="flex flex-col gap-2.5" style={{ flex: "3 1 0%", minHeight: 0 }}>
          <PerformancePanel lpOverview={lpOverview} />
          <div className="flex-1 overflow-hidden">
            <ActivityFeed notifications={notifications} />
          </div>
        </div>
      </div>

      <ToastProvider />
    </div>
  );
}
