import type { Notification } from "../hooks/useWebSocket";

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function dotColor(event: string): string {
  if (event === "deploy") return "var(--color-green)";
  if (event === "close") return "var(--color-green)";
  if (event === "out_of_range") return "var(--color-orange)";
  if (event.startsWith("cycle:")) return "var(--color-text-faint)";
  return "var(--color-teal-light)";
}

function summarize(n: Notification): string {
  const d = n.data as Record<string, unknown>;
  switch (n.event) {
    case "deploy":
      return `Deployed ${d.amountSol ?? "?"} SOL → ${d.pair ?? "?"}`;
    case "close": {
      const sign = (d.pnlPct as number) >= 0 ? "+" : "";
      return `Closed ${d.pair} ${sign}${(d.pnlPct as number)?.toFixed(1) ?? "?"}%`;
    }
    case "out_of_range":
      return `${d.pair} went OOR (${d.minutesOOR}m)`;
    case "cycle:management":
      return "Management cycle completed";
    case "cycle:screening":
      return "Screening cycle completed";
    case "briefing":
      return "Briefing generated";
    default:
      return n.event;
  }
}

export default function ActivityFeed({ notifications }: { notifications: Notification[] }) {
  const recent = notifications.slice(0, 30);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl p-3.5"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
    >
      <span className="mb-2.5 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: "var(--color-text-dim)" }}>
        Activity
      </span>
      <div className="flex-1 overflow-y-auto">
        {recent.length === 0 ? (
          <span className="text-sm" style={{ color: "var(--color-text-faint)" }}>No activity yet</span>
        ) : (
          <div className="space-y-0.5 text-sm" style={{ lineHeight: "2" }}>
            {recent.map((n) => (
              <div key={n.id} className="flex items-start gap-1.5">
                <span style={{ color: dotColor(n.event) }}>●</span>
                <span style={{ color: "var(--color-text-faint)" }}>{formatTime(n.ts)}</span>
                <span style={{ color: "var(--color-text)" }}>{summarize(n)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
