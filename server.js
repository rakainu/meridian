// server.js — Express + WebSocket server for the web chat UI
// Provides REST API, static file serving, and real-time WebSocket communication.

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

import { config, reloadScreeningThresholds, computeDeployAmount } from "./config.js";
import {
  sessionHistory,
  getHistory,
  appendHistory,
  isBusy,
  setBusy,
  isManagementBusy,
  isScreeningBusy,
} from "./session.js";
import { emit, on } from "./notifier.js";
import { agentLoop, lightChat, screenerLoop } from "./agent.js";
import { getMyPositions } from "./tools/dlmm.js";
import { getWalletBalances } from "./tools/wallet.js";
import { getTopCandidates } from "./tools/screening.js";
import { getLpOverview } from "./tools/lp-overview.js";
import { generateBriefing } from "./briefing.js";

// Cached startup data — avoids duplicate Helius calls when WebSocket connects
let _startupCache = { wallet: null, positions: null, candidates: null, lpOverview: null, ts: 0 };

// Notification cache — persists across WebSocket reconnects so Activity feed isn't empty
const _notificationCache = [];
const MAX_CACHED_NOTIFICATIONS = 50;
function cacheNotification(event, data) {
  _notificationCache.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, event, data, ts: new Date().toISOString() });
  if (_notificationCache.length > MAX_CACHED_NOTIFICATIONS) _notificationCache.length = MAX_CACHED_NOTIFICATIONS;
}
export function setStartupCache({ wallet, positions, candidates, lpOverview }) {
  _startupCache = { wallet, positions, candidates, lpOverview, ts: Date.now() };
}
import { getPerformanceSummary, getPerformanceHistory, listLessons, evolveThresholds } from "./lessons.js";
import { getTrackedPositions } from "./state.js";
import { getMemoryContext } from "./memory.js";
import { buildKnowledgeGraph } from "./tools/knowledge-graph.js";
import { log } from "./logger.js";
import { getScreeningThresholdSummary, normalizeCandidatesPayload } from "./runtime-helpers.js";
import { getFM3Positions, getFM3ClosedTrades, getFM3SessionSummary } from "./fm3-bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "web", "dist");

// Categorize close_reason strings into buckets for analytics
function categorizeCloseReason(reason) {
  if (!reason) return "UNKNOWN";
  const r = reason.toUpperCase();
  if (r.includes("STOP_LOSS")) return "STOP_LOSS";
  if (r.includes("TRAILING_TP")) return "TRAILING_TP";
  if (r.includes("FIXED_TP")) return "FIXED_TP";
  if (r.includes("OOR_TIMEOUT") || r.includes("OUT OF RANGE")) return "OOR_TIMEOUT";
  if (r.includes("YIELD_DEAD")) return "YIELD_DEAD";
  if (r.includes("EMERGENCY")) return "EMERGENCY";
  if (r.includes("AGENT DECISION")) return "AGENT_LEGACY";
  return "MANUAL";
}

const DEFAULT_PORT = 3737;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Send JSON through a WebSocket if it's open. */
function wsSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/** Broadcast JSON to every connected WebSocket client. */
function broadcast(wss, data) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

/** Build the current status object. */
function buildStatus() {
  return {
    type: "status",
    busy: isBusy(),
    managementBusy: isManagementBusy(),
    screeningBusy: isScreeningBusy(),
  };
}

// ---------------------------------------------------------------------------
// startServer(timersFn)
// ---------------------------------------------------------------------------

/**
 * Start the Express + WebSocket server.
 *
 * @param {Function} timersFn — Returns { management: string, screening: string }
 *   with formatted countdown strings. Timer state lives in index.js; this
 *   function bridges that gap.
 * @returns {Promise<{ app, server, wss }>} Resolves when the server is listening.
 */
export function startServer(timersFn) {
  const port = config.web?.port ?? DEFAULT_PORT;

  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  // ═══════════════════════════════════════════
  //  HTTP ROUTES
  // ═══════════════════════════════════════════

  app.get("/api/status", (_req, res) => {
    res.json({
      busy: isBusy(),
      managementBusy: isManagementBusy(),
      screeningBusy: isScreeningBusy(),
    });
  });

  app.get("/api/history", (_req, res) => {
    res.json(getHistory());
  });

  app.get("/api/performance", async (_req, res) => {
    try {
      const period = _req.query.period || "daily";
      const hours = period === "weekly" ? 168 : 24;
      const history = getPerformanceHistory({ hours, limit: 200 });
      let solPrice = _startupCache.wallet?.sol_price || 0;
      if (!solPrice) {
        try { const w = await getWalletBalances(); solPrice = w?.sol_price || 0; } catch {}
      }
      const marvPositions = history.positions || [];

      // Merge FM3 closed trades (filter by time window)
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const fm3Trades = getFM3ClosedTrades(solPrice).filter(t => t.closed_at && t.closed_at >= cutoff);
      const positions = [...marvPositions, ...fm3Trades];

      const totalPnlUsd = positions.reduce((s, r) => s + (r.pnl_usd ?? 0), 0);
      const totalFeesUsd = positions.reduce((s, r) => s + (r.fees_earned_usd ?? 0), 0);
      const wins = positions.filter((r) => (r.pnl_usd ?? 0) > 0).length;
      res.json({
        period,
        trades: positions.length,
        pnl_usd: Math.round(totalPnlUsd * 100) / 100,
        pnl_sol: solPrice > 0 ? Math.round((totalPnlUsd / solPrice) * 10000) / 10000 : 0,
        fees_usd: Math.round(totalFeesUsd * 100) / 100,
        fees_sol: solPrice > 0 ? Math.round((totalFeesUsd / solPrice) * 10000) / 10000 : 0,
        win_rate_pct: positions.length > 0 ? Math.round((wins / positions.length) * 100) : 0,
        positions,
      });
    } catch (err) {
      log("server_error", `GET /api/performance failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Trade Journal — closed position analytics for threshold tuning ───
  app.get("/api/journal", async (_req, res) => {
    try {
      const days = parseInt(_req.query.days) || 30;
      const history = getPerformanceHistory({ hours: days * 24, limit: 500 });
      const positions = history.positions || [];

      // Build lookup of tracked positions for peak PnL data
      const allTracked = getTrackedPositions();
      const trackedMap = {};
      for (const t of allTracked) {
        if (t.position) trackedMap[t.position] = t;
      }

      // Enrich each Marv closed position with peak PnL and analytics
      const marvTrades = positions.map(p => {
        const tracked = trackedMap[p.position] || {};
        // Recompute pnl_pct from USD values when it was recorded as 0 (pre-existing bug)
        let exitPnlPct = p.pnl_pct ?? 0;
        if (exitPnlPct === 0 && p.pnl_usd && p.initial_value_usd && p.initial_value_usd > 0) {
          exitPnlPct = Math.round((p.pnl_usd / p.initial_value_usd) * 10000) / 100;
        }
        const peakPnlPct = tracked.peak_pnl_pct ?? exitPnlPct;
        return {
          ...p,
          pnl_pct: exitPnlPct,
          peak_pnl_pct: Math.round(peakPnlPct * 100) / 100,
          peak_vs_exit_gap: Math.round((peakPnlPct - exitPnlPct) * 100) / 100,
          hold_time_hours: p.minutes_held ? Math.round(p.minutes_held / 6) / 10 : null,
          range_efficiency: p.range_efficiency != null ? Math.round(p.range_efficiency * 10) / 10 : null,
          exit_category: categorizeCloseReason(p.close_reason),
        };
      });

      // Merge FM3 closed trades (already have exit_category set by bridge)
      let solPrice = _startupCache.wallet?.sol_price || 0;
      if (!solPrice) {
        try { const w = await getWalletBalances(); solPrice = w?.sol_price || 0; } catch {}
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const fm3Trades = getFM3ClosedTrades(solPrice).filter(t => t.closed_at && t.closed_at >= cutoff);
      const trades = [...marvTrades, ...fm3Trades];

      // Exit reason breakdown
      const reasonCounts = {};
      for (const t of trades) {
        reasonCounts[t.exit_category] = (reasonCounts[t.exit_category] || 0) + 1;
      }

      // Aggregate stats
      const avgPeakGap = trades.length > 0
        ? Math.round(trades.reduce((s, t) => s + t.peak_vs_exit_gap, 0) / trades.length * 100) / 100
        : 0;

      const wins = trades.filter(t => (t.pnl_usd ?? t.pnl_pct ?? 0) > 0).length;

      res.json({
        trades,
        summary: {
          total: trades.length,
          wins,
          win_rate_pct: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
          avg_peak_vs_exit_gap: avgPeakGap,
          exit_reasons: reasonCounts,
        },
        thresholds: {
          stopLossPct: config.management.stopLossPct,
          takeProfitFeePct: config.management.takeProfitFeePct,
          trailingTriggerPct: config.management.trailingTriggerPct,
          trailingDropPct: config.management.trailingDropPct,
          outOfRangeWaitMinutes: config.management.outOfRangeWaitMinutes,
          emergencyPriceDropPct: config.management.emergencyPriceDropPct,
          minFeeActiveTvlRatio: config.screening.minFeeActiveTvlRatio,
          minVolume: config.screening.minVolume,
        },
      });
    } catch (err) {
      log("server_error", `GET /api/journal failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/candidates", async (_req, res) => {
    try {
      const result = await getTopCandidates({ limit: 5 });
      res.json(normalizeCandidatesPayload(result));
    } catch (err) {
      log("server_error", `GET /api/candidates failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Static files — only if the dist directory exists (production build)
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        // HTML always revalidates, hashed assets cache for 1 year
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));

    // SPA fallback — serve index.html for any non-API route
    app.get("/{*splat}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Merge FM3 active positions into Marv's position data for dashboard
  function mergeFM3Positions(marvData) {
    if (!marvData) return marvData;
    const fm3 = getFM3Positions();
    if (fm3.length === 0) return marvData;
    return {
      ...marvData,
      total_positions: (marvData.total_positions || 0) + fm3.length,
      positions: [...(marvData.positions || []), ...fm3],
    };
  }

  // ═══════════════════════════════════════════
  //  NOTIFIER → WebSocket BRIDGE
  // ═══════════════════════════════════════════

  const FORWARDED_EVENTS = [
    "deploy",
    "close",
    "out_of_range",
    "briefing",
  ];

  for (const eventName of FORWARDED_EVENTS) {
    on(eventName, (data) => {
      cacheNotification(eventName, data);
      broadcast(wss, { type: "notification", event: eventName, data });
    });
  }

  // Post-cycle data broadcasts — send notification + fresh structured data
  on("cycle:management", async (data) => {
    cacheNotification("cycle:management", data);
    broadcast(wss, { type: "notification", event: "cycle:management", data });
    const [pos, wal] = await Promise.allSettled([getMyPositions(), getWalletBalances()]);
    if (pos.status === "fulfilled") broadcast(wss, { type: "positions", data: mergeFM3Positions(pos.value) });
    if (wal.status === "fulfilled") broadcast(wss, { type: "wallet", data: wal.value });
  });

  on("cycle:screening", async (data) => {
    cacheNotification("cycle:screening", data);
    broadcast(wss, { type: "notification", event: "cycle:screening", data });
    const cands = await getTopCandidates({ limit: 5 }).catch(() => null);
    if (cands) broadcast(wss, { type: "candidates", data: normalizeCandidatesPayload(cands) });
  });

  // Also broadcast fresh data after deploy/close events
  on("deploy", async () => {
    const [pos, wal] = await Promise.allSettled([getMyPositions(), getWalletBalances()]);
    if (pos.status === "fulfilled") broadcast(wss, { type: "positions", data: mergeFM3Positions(pos.value) });
    if (wal.status === "fulfilled") broadcast(wss, { type: "wallet", data: wal.value });
  });

  on("close", async () => {
    const [pos, wal] = await Promise.allSettled([getMyPositions(), getWalletBalances()]);
    if (pos.status === "fulfilled") broadcast(wss, { type: "positions", data: mergeFM3Positions(pos.value) });
    if (wal.status === "fulfilled") broadcast(wss, { type: "wallet", data: wal.value });
  });

  // Broadcast enriched close data for trade journal real-time updates
  on("pnl_watcher_close", (data) => {
    broadcast(wss, { type: "trade_closed", data: {
      pair: data.pair,
      pnl_pct: data.pnlPct,
      peak_pnl_pct: data.peakPnlPct,
      peak_vs_exit_gap: (data.peakPnlPct || 0) - (data.pnlPct || 0),
      hold_minutes: data.holdMinutes,
      exit_reason: data.reason,
      exit_category: categorizeCloseReason(data.reason),
    }});
  });

  on("chat:response", (data) => {
    broadcast(wss, { type: "chat:response", ...data });
  });

  on("status", () => {
    broadcast(wss, buildStatus());
  });

  // ═══════════════════════════════════════════
  //  TIMER BROADCAST (every 10 s)
  // ═══════════════════════════════════════════

  const timerInterval = setInterval(() => {
    if (wss.clients.size === 0) return;
    const info = typeof timersFn === "function" ? timersFn() : {};
    broadcast(wss, {
      type: "timer",
      management: info.management ?? "---",
      screening: info.screening ?? "---",
    });
  }, 10_000);

  // Clean up interval if server closes
  server.on("close", () => clearInterval(timerInterval));

  // ═══════════════════════════════════════════
  //  WEBSOCKET CONNECTION HANDLING
  // ═══════════════════════════════════════════

  wss.on("connection", async (ws) => {
    log("server", "WebSocket client connected");

    // Send init payload with status, history, timers, and data
    const timerInfo = typeof timersFn === "function" ? timersFn() : {};

    // Use cached startup data if fresh (< 30s), otherwise fetch live
    const useCached = _startupCache.ts && (Date.now() - _startupCache.ts < 30000);
    const [wallet, positions, candidateResult, lpOverviewResult] = useCached
      ? [
          { status: "fulfilled", value: _startupCache.wallet },
          { status: "fulfilled", value: _startupCache.positions },
          { status: "fulfilled", value: _startupCache.candidates },
          { status: "fulfilled", value: _startupCache.lpOverview },
        ]
      : await Promise.allSettled([
          getWalletBalances(),
          getMyPositions(),
          getTopCandidates({ limit: 5 }),
          getLpOverview(),
        ]);

    wsSend(ws, {
      type: "init",
      status: {
        busy: isBusy(),
        managementBusy: isManagementBusy(),
        screeningBusy: isScreeningBusy(),
      },
      history: getHistory(),
      timers: {
        management: timerInfo.management ?? "---",
        screening: timerInfo.screening ?? "---",
      },
      positions: positions.status === "fulfilled" ? mergeFM3Positions(positions.value) : null,
      wallet: wallet.status === "fulfilled" ? wallet.value : null,
      candidates: candidateResult.status === "fulfilled" ? normalizeCandidatesPayload(candidateResult.value) : null,
      lpOverview: lpOverviewResult.status === "fulfilled" ? lpOverviewResult.value : null,
      notifications: _notificationCache,
    });

    // ── Incoming messages ──
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        wsSend(ws, { type: "error", text: "Invalid JSON" });
        return;
      }

      if (msg.type === "quick-action") {
        await handleQuickAction(ws, msg.action);
      } else if (msg.type === "chat") {
        await handleChat(ws, wss, msg.text);
      } else if (msg.type === "command") {
        await handleCommand(ws, msg.command);
      } else {
        wsSend(ws, { type: "error", text: `Unknown message type: ${msg.type}` });
      }
    });

    ws.on("close", () => {
      log("server", "WebSocket client disconnected");
    });
  });

  // ═══════════════════════════════════════════
  //  CHAT HANDLER (with message queue)
  // ═══════════════════════════════════════════

  const chatQueue = [];
  let processingChat = false;

  async function processNextChat() {
    if (processingChat || chatQueue.length === 0) return;

    // Wait until agent is free
    if (isBusy() || isManagementBusy() || isScreeningBusy()) {
      setTimeout(processNextChat, 2000); // retry in 2s
      return;
    }

    processingChat = true;
    const { ws, text } = chatQueue.shift();

    setBusy(true);
    try {
      log("server", `Chat from web: ${text}`);
      const { content } = await lightChat(
        text,
        sessionHistory,
        config.llm.generalModel,
      );

      appendHistory(text, content);

      const response = {
        type: "chat:response",
        text: content,
        ts: new Date().toISOString(),
      };

      emit("chat:response", response);
    } catch (err) {
      log("server_error", `Chat handler failed: ${err.message}`);
      wsSend(ws, { type: "error", text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
      processingChat = false;
      processNextChat(); // process next queued message
    }
  }

  function handleChat(ws, _wss, text) {
    if (!text || typeof text !== "string" || !text.trim()) {
      wsSend(ws, { type: "error", text: "Empty message" });
      return;
    }

    chatQueue.push({ ws, text: text.trim() });

    if (chatQueue.length > 1) {
      wsSend(ws, { type: "chat:response", text: `Message queued (${chatQueue.length - 1} ahead). Will process when agent is free.`, ts: new Date().toISOString() });
    }

    processNextChat();
  }

  // ═══════════════════════════════════════════
  //  COMMAND HANDLER
  // ═══════════════════════════════════════════

  async function handleCommand(ws, command) {
    if (!command || typeof command !== "string") {
      wsSend(ws, { type: "error", text: "Invalid command" });
      return;
    }

    try {
      switch (command) {
        case "/briefing": {
          const briefing = await generateBriefing();
          wsSend(ws, {
            type: "chat:response",
            text: briefing,
            ts: new Date().toISOString(),
          });
          break;
        }

        case "/status": {
          const [wallet, positions] = await Promise.all([
            getWalletBalances(),
            getMyPositions(),
          ]);
          const unit = config.management.pnlUnit || "sol";
          const lines = [
            `Wallet: ${wallet.sol} SOL ($${wallet.sol_usd}) | SOL price: $${wallet.sol_price}`,
            `Positions: ${positions.total_positions} open`,
          ];
          for (const p of positions.positions || []) {
            const status = p.in_range ? "in-range" : "OUT OF RANGE";
            const fees = unit === "sol" ? `${p.unclaimed_fees_sol ?? "?"} SOL` : `$${p.unclaimed_fees_usd}`;
            const pnl = unit === "sol" ? `${p.pnl_sol ?? "?"} SOL` : `$${p.pnl_usd}`;
            lines.push(`  ${p.pair} — ${status} | fees: ${fees} | pnl: ${pnl} (${p.pnl_pct}%)`);
          }
          wsSend(ws, {
            type: "chat:response",
            text: lines.join("\n"),
            ts: new Date().toISOString(),
          });
          break;
        }

        case "/candidates": {
          const result = await getTopCandidates({ limit: 5 });
          const { candidates, total_eligible, total_screened } = result;
          const lines = [
            `Top pools (${total_eligible} eligible from ${total_screened} screened):`,
          ];
          for (const [i, c] of candidates.entries()) {
            const name = c.name || "unknown";
            const ratio = c.fee_active_tvl_ratio ?? c.fee_tvl_ratio ?? "?";
            lines.push(
              `  [${i + 1}] ${name} — fee/aTVL: ${ratio}% | vol: $${((c.volume || 0) / 1000).toFixed(1)}k | organic: ${c.organic_score}`,
            );
          }
          wsSend(ws, {
            type: "chat:response",
            text: lines.join("\n"),
            ts: new Date().toISOString(),
          });
          break;
        }

        case "/thresholds": {
          const lines = ["Current screening thresholds:"];
          for (const [label, value] of getScreeningThresholdSummary(config.screening)) {
            lines.push(`  ${label}: ${value ?? "n/a"}`);
          }
          const perf = getPerformanceSummary();
          if (perf) {
            lines.push("", `  Based on ${perf.total_positions_closed} closed positions`);
            lines.push(`  Win rate: ${perf.win_rate_pct}%  |  Avg PnL: ${perf.avg_pnl_pct}%`);
          } else {
            lines.push("", "  No closed positions yet — thresholds are preset defaults.");
          }
          wsSend(ws, {
            type: "chat:response",
            text: lines.join("\n"),
            ts: new Date().toISOString(),
          });
          break;
        }

        case "/learn": {
          setBusy(true);
          try {
            const { candidates } = await getTopCandidates({ limit: 5 });
            if (!candidates.length) {
              wsSend(ws, { type: "chat:response", text: "No eligible pools found to study.", ts: new Date().toISOString() });
              break;
            }
            const poolList = candidates.map((c, i) => `${i + 1}. ${c.name} (${c.pool})`).join("\n");
            const { content } = await agentLoop(
              `Study top LPers across these ${candidates.length} pools by calling study_top_lpers for each:\n\n${poolList}\n\nFor each pool, call study_top_lpers then move to the next. After studying all pools:\n1. Identify patterns across multiple pools.\n2. Derive 4-8 concrete lessons using add_lesson.\n3. Summarize what you learned.`,
              config.llm.maxSteps, [], "GENERAL", config.llm.generalModel,
            );
            emit("chat:response", { text: content, ts: new Date().toISOString() });
          } finally {
            setBusy(false);
          }
          break;
        }

        case "/evolve": {
          const perf = getPerformanceSummary();
          if (!perf || perf.total_positions_closed < 5) {
            const needed = 5 - (perf?.total_positions_closed || 0);
            wsSend(ws, { type: "chat:response", text: `Need at least 5 closed positions to evolve. ${needed} more needed.`, ts: new Date().toISOString() });
            break;
          }
          const lessonsData = JSON.parse(fs.readFileSync(path.join(__dirname, "lessons.json"), "utf8"));
          const result = evolveThresholds(lessonsData.performance, config);
          if (!result || Object.keys(result.changes).length === 0) {
            wsSend(ws, { type: "chat:response", text: "No threshold changes needed — current settings already match performance data.", ts: new Date().toISOString() });
          } else {
            reloadScreeningThresholds();
            const lines = ["Thresholds evolved:"];
            for (const [key, val] of Object.entries(result.changes)) {
              lines.push(`  ${key}: ${result.rationale[key]}`);
            }
            lines.push("", "Saved to user-config.json. Applied immediately.");
            wsSend(ws, { type: "chat:response", text: lines.join("\n"), ts: new Date().toISOString() });
          }
          break;
        }

        case "/auto": {
          if (isBusy() || isManagementBusy() || isScreeningBusy()) {
            wsSend(ws, { type: "error", text: "Agent is busy right now — try again in a moment." });
            break;
          }
          setBusy(true);
          try {
            const currentBalance = await getWalletBalances().catch(() => null);
            const deployAmount = currentBalance ? computeDeployAmount(currentBalance.sol) : config.management.deployAmountSol;
            const { content } = await screenerLoop(
              `get_top_candidates, pick the best one, get_active_bin, deploy_position with ${deployAmount} SOL. Execute now, don't ask.`,
              config.llm.maxSteps, [],
            );
            appendHistory("auto", content);
            emit("chat:response", { text: content, ts: new Date().toISOString() });
          } finally {
            setBusy(false);
          }
          break;
        }

        default: {
          // Handle number picks: "1", "2", "3" etc. — deploy into that candidate
          const pick = parseInt(command.replace("/", ""), 10);
          if (!isNaN(pick) && pick >= 1) {
            if (isBusy() || isManagementBusy() || isScreeningBusy()) {
              wsSend(ws, { type: "error", text: "Agent is busy right now." });
              break;
            }
            setBusy(true);
            try {
              const { candidates } = await getTopCandidates({ limit: 10 });
              if (pick > candidates.length) {
                wsSend(ws, { type: "error", text: `Only ${candidates.length} candidates available.` });
                break;
              }
              const pool = candidates[pick - 1];
              const currentBalance = await getWalletBalances().catch(() => null);
              const deployAmount = currentBalance ? computeDeployAmount(currentBalance.sol) : config.management.deployAmountSol;
              const { content } = await screenerLoop(
                `Deploy ${deployAmount} SOL into pool ${pool.pool} (${pool.name}). Call get_active_bin first then deploy_position. Report result.`,
                config.llm.maxSteps, [],
              );
              appendHistory(`deploy #${pick} ${pool.name}`, content);
              emit("chat:response", { text: content, ts: new Date().toISOString() });
            } finally {
              setBusy(false);
            }
            break;
          }
          wsSend(ws, {
            type: "error",
            text: `Unknown command: ${command}`,
          });
        }
      }
    } catch (err) {
      log("server_error", `Command "${command}" failed: ${err.message}`);
      wsSend(ws, { type: "error", text: `Error: ${err.message}` });
    }
  }

  // ═══════════════════════════════════════════
  //  QUICK-ACTION HANDLER
  // ═══════════════════════════════════════════

  async function handleQuickAction(ws, action) {
    if (!action || typeof action !== "string") {
      wsSend(ws, { type: "quick-action:error", action: action ?? "unknown", error: "Invalid action" });
      return;
    }

    try {
      let data;
      switch (action) {
        case "top-pools": {
          const result = await getTopCandidates({ limit: 10 });
          data = result.candidates ?? result;
          break;
        }
        case "recent-closes": {
          const result = getPerformanceHistory({ hours: 24, limit: 10 });
          data = result;
          break;
        }
        case "lessons": {
          data = listLessons({ limit: 20 });
          break;
        }
        case "memory": {
          data = getMemoryContext();
          break;
        }
        case "settings": {
          const raw = fs.readFileSync(path.join(__dirname, "user-config.json"), "utf8");
          data = JSON.parse(raw);
          break;
        }
        case "briefing": {
          data = await generateBriefing();
          break;
        }
        case "performance": {
          data = getPerformanceSummary();
          break;
        }
        case "knowledge-graph": {
          data = await buildKnowledgeGraph();
          break;
        }
        default:
          wsSend(ws, { type: "quick-action:error", action, error: `Unknown action: ${action}` });
          return;
      }
      wsSend(ws, { type: "quick-action:result", action, data });
    } catch (err) {
      log("server_error", `Quick-action "${action}" failed: ${err.message}`);
      wsSend(ws, { type: "quick-action:error", action, error: err.message });
    }
  }

  // ═══════════════════════════════════════════
  //  START LISTENING
  // ═══════════════════════════════════════════

  return new Promise((resolve) => {
    server.listen(port, () => {
      log("server", `Web server listening on http://localhost:${port}`);
      resolve({ app, server, wss });
    });
  });
}
