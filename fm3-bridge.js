// fm3-bridge.js — Reads FM3 state/dashboard files and transforms data
// into Meridian's API formats so both strategies appear on the same dashboard.

import fs from "fs";
import path from "path";
import { log } from "./logger.js";

// FM3 writes its files here on the VPS
const FM3_DATA_DIR = process.env.FM3_DATA_DIR || "/root/LP-Project/DATA";
const FM3_DASHBOARD_FILE = path.join(FM3_DATA_DIR, "fm3-dashboard.json");
const FM3_STATE_FILE = path.join(FM3_DATA_DIR, "fm3-state.json");

// Cache to avoid re-reading every request; FM3 writes every ~60s
let _dashboardCache = { data: null, mtime: 0 };
let _stateCache = { data: null, mtime: 0 };

function readJsonCached(filePath, cache) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;
    if (cache.data && cache.mtime === mtime) return cache.data;
    const raw = fs.readFileSync(filePath, "utf-8");
    cache.data = JSON.parse(raw);
    cache.mtime = mtime;
    return cache.data;
  } catch (err) {
    log("fm3_bridge", `Error reading ${filePath}: ${err.message}`);
    return cache.data; // return stale data if available
  }
}

/** Read the FM3 dashboard JSON (written every loop by FM3). */
export function getFM3Dashboard() {
  return readJsonCached(FM3_DASHBOARD_FILE, _dashboardCache);
}

/** Read the FM3 state JSON (full state machine). */
export function getFM3State() {
  return readJsonCached(FM3_STATE_FILE, _stateCache);
}

/**
 * Convert FM3 active positions into Meridian's PositionInfo format
 * so they appear alongside Marv's positions on the dashboard.
 */
export function getFM3Positions() {
  const dash = getFM3Dashboard();
  if (!dash || !dash.active_positions) return [];

  return dash.active_positions.map((p) => ({
    position: p.id,
    pair: p.pool_name || "?",
    pool: p.pool,
    strategy: "FM3",
    in_range: true, // FM3 rebalances to stay in range
    active_bin: 0,
    lower_bin: 0,
    upper_bin: 0,
    pnl_pct: p.pnl_pct ?? 0,
    pnl_sol: p.pnl_sol ?? 0,
    pnl_usd: p.pnl_usd ?? 0,
    total_value_sol: p.amount_sol + (p.pnl_sol ?? 0),
    total_value_usd: null,
    unclaimed_fees_sol: p.fee_estimate_sol ?? 0,
    unclaimed_fees_usd: null,
    age_minutes: p.hold_hours != null ? Math.round(p.hold_hours * 60) : null,
    // FM3-specific extras (UI can use or ignore)
    _fm3: {
      bin_step: p.bin_step,
      bins: p.bins,
      rebalance_count: p.rebalance_count,
      fees_claimed_sol: p.fees_claimed_sol,
      time_remaining_min: p.time_remaining_min,
    },
  }));
}

/**
 * Convert FM3 recent trades into Meridian's performance/journal format.
 * FM3 tracks in SOL, so we need solPrice to convert to USD.
 */
export function getFM3ClosedTrades(solPrice = 0) {
  const dash = getFM3Dashboard();
  if (!dash || !dash.recent_trades) return [];

  return dash.recent_trades.map((t) => {
    const pnlSol = (t.sol_returned || 0) + (t.fee_sol || 0) - (t.entry_sol || 0);
    const initialUsd = (t.entry_sol || 0) * solPrice;
    const pnlUsd = pnlSol * solPrice;
    const feesUsd = (t.fee_sol || 0) * solPrice;
    const finalUsd = initialUsd + pnlUsd;

    return {
      position: `fm3-${t.pool_name}-${t.time}`,
      pool_name: t.pool_name || "?",
      pool: null,
      strategy: "FM3",
      pnl_usd: Math.round(pnlUsd * 100) / 100,
      pnl_pct: t.pnl_pct ?? 0,
      fees_earned_usd: Math.round(feesUsd * 100) / 100,
      initial_value_usd: Math.round(initialUsd * 100) / 100,
      final_value_usd: Math.round(finalUsd * 100) / 100,
      range_efficiency: null,
      minutes_held: t.hold_hours != null ? Math.round(t.hold_hours * 60) : null,
      close_reason: t.exit_reason || "unknown",
      deployed_at: null,
      closed_at: t.time || null,
      // Extra fields for journal enrichment
      peak_pnl_pct: t.pnl_pct ?? 0,
      peak_vs_exit_gap: 0,
      hold_time_hours: t.hold_hours ?? null,
      exit_category: categorizeFM3ExitReason(t.exit_reason),
    };
  });
}

/**
 * Get FM3 session summary for performance endpoint.
 */
export function getFM3SessionSummary() {
  const dash = getFM3Dashboard();
  if (!dash || !dash.session) return null;
  return {
    strategy: "FM3",
    status: dash.status,
    ...dash.session,
  };
}

/** Map FM3 exit reasons to Meridian's exit categories. */
function categorizeFM3ExitReason(reason) {
  if (!reason) return "UNKNOWN";
  const r = reason.toLowerCase();
  if (r.includes("stop_loss")) return "STOP_LOSS";
  if (r.includes("extreme_drift")) return "STOP_LOSS"; // drift exit ~= stop loss
  if (r.includes("max_hold")) return "OOR_TIMEOUT";
  if (r.includes("volume_death")) return "YIELD_DEAD";
  if (r.includes("fee_stagnation")) return "YIELD_DEAD";
  if (r.includes("reconciled")) return "MANUAL";
  return "MANUAL";
}
