// fm3-bridge.js — Reads FM3 + FM3-meme state/dashboard files and transforms
// data into Meridian's API formats so all strategies appear on the same dashboard.

import fs from "fs";
import path from "path";
import { log } from "./logger.js";

const FM3_DATA_DIR = process.env.FM3_DATA_DIR || "/root/LP-Project/DATA";

// ─── Instance definitions ───

const INSTANCES = {
  fm3: {
    label: "FM3",
    dashboardFile: path.join(FM3_DATA_DIR, "fm3-dashboard.json"),
    stateFile: path.join(FM3_DATA_DIR, "fm3-state.json"),
    configFile: path.join(FM3_DATA_DIR, "fee-machine-v3-config.json"),
  },
  "fm3-meme": {
    label: "FM3-Meme",
    dashboardFile: path.join(FM3_DATA_DIR, "fm3-meme-dashboard.json"),
    stateFile: path.join(FM3_DATA_DIR, "fm3-meme-state.json"),
    configFile: path.join(FM3_DATA_DIR, "fm3-meme-config.json"),
  },
};

// ─── Caching ───

const _caches = {};

function readJsonCached(filePath) {
  if (!_caches[filePath]) _caches[filePath] = { data: null, mtime: 0 };
  const cache = _caches[filePath];
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (cache.data && cache.mtime === stat.mtimeMs) return cache.data;
    cache.data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    cache.mtime = stat.mtimeMs;
    return cache.data;
  } catch (err) {
    log("fm3_bridge", `Error reading ${filePath}: ${err.message}`);
    return cache.data;
  }
}

function getDashboard(instanceKey) {
  return readJsonCached(INSTANCES[instanceKey].dashboardFile);
}

// ─── Positions (for dashboard page) ───

function getInstancePositions(instanceKey) {
  const inst = INSTANCES[instanceKey];
  const dash = getDashboard(instanceKey);
  if (!dash || !dash.active_positions) return [];

  return dash.active_positions.map((p) => ({
    position: p.id,
    pair: p.pool_name || "?",
    pool: p.pool,
    strategy: inst.label,
    in_range: true,
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
    _fm3: {
      bin_step: p.bin_step,
      bins: p.bins,
      rebalance_count: p.rebalance_count,
      fees_claimed_sol: p.fees_claimed_sol,
      time_remaining_min: p.time_remaining_min,
    },
  }));
}

/** All FM3 + FM3-meme active positions merged. */
export function getFM3Positions() {
  return [
    ...getInstancePositions("fm3"),
    ...getInstancePositions("fm3-meme"),
  ];
}

// ─── Closed trades (for journal + performance) ───

function getInstanceClosedTrades(instanceKey, solPrice) {
  const inst = INSTANCES[instanceKey];
  const dash = getDashboard(instanceKey);
  if (!dash || !dash.recent_trades) return [];

  return dash.recent_trades.map((t) => {
    const pnlSol = (t.sol_returned || 0) + (t.fee_sol || 0) - (t.entry_sol || 0);
    const initialUsd = (t.entry_sol || 0) * solPrice;
    const pnlUsd = pnlSol * solPrice;
    const feesUsd = (t.fee_sol || 0) * solPrice;
    const finalUsd = initialUsd + pnlUsd;

    return {
      position: `${instanceKey}-${t.pool_name}-${t.time}`,
      pool_name: t.pool_name || "?",
      pool: null,
      strategy: inst.label,
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
      peak_pnl_pct: t.pnl_pct ?? 0,
      peak_vs_exit_gap: 0,
      hold_time_hours: t.hold_hours ?? null,
      exit_category: categorizeFM3ExitReason(t.exit_reason),
    };
  });
}

/** All FM3 + FM3-meme closed trades merged. */
export function getFM3ClosedTrades(solPrice = 0) {
  return [
    ...getInstanceClosedTrades("fm3", solPrice),
    ...getInstanceClosedTrades("fm3-meme", solPrice),
  ];
}

// ─── Session summary ───

export function getFM3SessionSummary() {
  const results = [];
  for (const [key, inst] of Object.entries(INSTANCES)) {
    const dash = getDashboard(key);
    if (dash?.session) {
      results.push({ strategy: inst.label, status: dash.status, ...dash.session });
    }
  }
  return results;
}

// ─── Start / Stop / Status controls ───

function getInstanceStatus(instanceKey) {
  const inst = INSTANCES[instanceKey];
  const dash = getDashboard(instanceKey);
  try {
    const cfg = fs.existsSync(inst.configFile)
      ? JSON.parse(fs.readFileSync(inst.configFile, "utf-8"))
      : null;
    const enabled = cfg?.enabled ?? false;
    const updatedAt = dash?.updated_at || null;
    const stale = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) > 120000 : true;
    return {
      name: instanceKey,
      label: inst.label,
      enabled,
      status: dash?.status || (enabled ? "STARTING" : "STOPPED"),
      stale,
      updated_at: updatedAt,
      session: dash?.session || null,
      active_positions: dash?.active_positions?.length ?? 0,
    };
  } catch (err) {
    return { name: instanceKey, label: inst.label, enabled: false, status: "ERROR", error: err.message };
  }
}

function setInstanceEnabled(instanceKey, enabled) {
  const inst = INSTANCES[instanceKey];
  if (!inst) return { ok: false, error: `Unknown instance: ${instanceKey}` };
  try {
    if (!fs.existsSync(inst.configFile)) {
      return { ok: false, error: `Config not found: ${inst.configFile}` };
    }
    const cfg = JSON.parse(fs.readFileSync(inst.configFile, "utf-8"));
    cfg.enabled = !!enabled;
    const tmp = inst.configFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, inst.configFile);
    log("fm3_bridge", `${inst.label} ${enabled ? "enabled" : "disabled"} via config`);
    return { ok: true, enabled: cfg.enabled };
  } catch (err) {
    log("fm3_bridge", `Failed to toggle ${inst.label}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Combined status for all instances. */
export function getFM3Status() {
  return {
    fm3: getInstanceStatus("fm3"),
    "fm3-meme": getInstanceStatus("fm3-meme"),
  };
}

/** Enable/disable a specific instance. */
export function setFM3Enabled(enabled, instance = "fm3") {
  return setInstanceEnabled(instance, enabled);
}

// ─── Exit reason mapping ───

function categorizeFM3ExitReason(reason) {
  if (!reason) return "UNKNOWN";
  const r = reason.toLowerCase();
  if (r.includes("stop_loss")) return "STOP_LOSS";
  if (r.includes("extreme_drift")) return "STOP_LOSS";
  if (r.includes("max_hold")) return "OOR_TIMEOUT";
  if (r.includes("volume_death")) return "YIELD_DEAD";
  if (r.includes("fee_stagnation")) return "YIELD_DEAD";
  if (r.includes("reconciled")) return "MANUAL";
  return "MANUAL";
}
