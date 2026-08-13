#!/usr/bin/env node
/**
 * RuffOps development boot wrapper.
 * Animated Command Core HUD → hands off to the real Next.js `next dev`.
 *
 * Skip with: RUFFOPS_BOOT=0 npm run dev
 * Auto-skips on CI / non-TTY / TERM=dumb.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ESC = "\x1b[";
const HIDE = `${ESC}?25l`;
const SHOW = `${ESC}?25h`;
const CLEAR = `${ESC}2J${ESC}H`;
const HOME = `${ESC}H`;

/** Truecolor palette: BLUE → COBALT → VIOLET → PURPLE → PINK → CYAN → ICE BLUE */
const PALETTE = [
  [37, 99, 235],
  [29, 78, 216],
  [124, 58, 237],
  [147, 51, 234],
  [236, 72, 153],
  [34, 211, 238],
  [186, 230, 253]
];

const WORDMARK = [
  "██████╗ ██╗   ██╗███████╗███████╗ ██████╗ ██████╗ ███████╗",
  "██╔══██╗██║   ██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██████╔╝██║   ██║█████╗  █████╗  ██║   ██║██████╔╝███████╗",
  "██╔══██╗██║   ██║██╔══╝  ██╔══╝  ██║   ██║██╔═══╝ ╚════██║",
  "██║  ██║╚██████╔╝██║     ██║     ╚██████╔╝██║     ███████║",
  "╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝      ╚═════╝ ╚═╝     ╚══════╝"
];

const BOOT_ITEMS = [
  "Runtime",
  "Application Shell",
  "Route Tracing",
  "Error Capture",
  "Audit Pipeline",
  "Sentry Instrumentation",
  "Cursor Debug Bridge",
  "Next.js Handoff"
];

const NODE_LABELS = [
  "CORE",
  "DATABASE",
  "GINGR",
  "SAMSARA",
  "TWILIO",
  "ROUTE ENGINE",
  "OBSERVABILITY",
  "SENTRY",
  "CURSOR DEBUG BRIDGE",
  "SYSTEM HEALTH"
];

function shouldSkipBoot() {
  if (process.env.RUFFOPS_BOOT === "0" || process.env.RUFFOPS_BOOT === "false") return true;
  if (process.env.CI === "true" || process.env.CI === "1") return true;
  if (process.env.VERCEL === "1") return true;
  if (!process.stdout.isTTY) return true;
  if ((process.env.TERM || "").toLowerCase() === "dumb") return true;
  return false;
}

function rgb(r, g, b) {
  return `${ESC}38;2;${r};${g};${b}m`;
}

function dim(text) {
  return `${ESC}2m${text}${ESC}0m`;
}

function bold(text) {
  return `${ESC}1m${text}${ESC}0m`;
}

function reset() {
  return `${ESC}0m`;
}

function lerpColor(t) {
  const n = PALETTE.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.floor(x);
  const f = x - i;
  const a = PALETTE[i];
  const b = PALETTE[Math.min(i + 1, n)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f)
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pulseGlyph(frame, offset = 0) {
  const glyphs = ["○", "◌", "●", "◉"];
  return glyphs[(frame + offset) % glyphs.length];
}

function toeGlyph(frame, offset = 0) {
  const glyphs = ["●", "◉", "◆", "◇"];
  return glyphs[(Math.floor(frame / 2) + offset) % glyphs.length];
}

function padPulse(frame) {
  const styles = ["▄██▄", "████", "▀██▀", "████"];
  return styles[frame % styles.length];
}

function pipeWithPacket(width, position, arrow = "▶") {
  const pos = Math.max(0, Math.min(width - 1, position));
  let out = "";
  for (let i = 0; i < width; i += 1) {
    out += i === pos ? "◆" : "─";
  }
  return `${out}${arrow}`;
}

function progressBar(pct, width = 42) {
  const filled = Math.round((pct / 100) * width);
  const bar = "━".repeat(filled) + "─".repeat(Math.max(0, width - filled));
  return `${bar} ${String(Math.min(100, Math.round(pct))).padStart(3, " ")}%`;
}

function bootStatusLine(label, stage, frame) {
  const name = label.padEnd(24, " ");
  if (stage === "wait") return `${dim("○")} ${name} ${dim("WAIT")}`;
  if (stage === "check") return `${pulseGlyph(frame, 1)} ${name} CHECK`;
  return `${bold("●")} ${name} ${bold("READY")}`;
}

function nodeLine(label, frame, index) {
  const g = pulseGlyph(frame, index);
  const state = frame > 8 + index ? "AVAILABLE" : frame > 3 + index ? "LOADING" : "INITIALIZING";
  return `  ${g}  ${label.padEnd(22, " ")}  ${dim(state)}`;
}

function renderFrame(frame, totalFrames) {
  const t = frame / Math.max(1, totalFrames - 1);
  const [cr, cg, cb] = lerpColor(t);
  const color = rgb(cr, cg, cb);
  const pct = Math.min(100, Math.round(t * 100));

  const lines = [];
  lines.push("");
  lines.push(`  ${dim("◆ RUFFOPS COMMAND CORE")}`);
  lines.push(`  ${dim("mission-control · observability · routing")}`);
  lines.push("");

  for (const row of WORDMARK) {
    lines.push(`  ${color}${row}${reset()}`);
  }
  lines.push("");
  lines.push(`  ${bold("SMARTER OPERATIONS.")}`);
  lines.push(`  ${bold("HAPPIER DOGS.")}`);
  lines.push("");

  // Animated paw core
  const t0 = toeGlyph(frame, 0);
  const t1 = toeGlyph(frame, 1);
  const t2 = toeGlyph(frame, 2);
  const t3 = toeGlyph(frame, 3);
  const core = padPulse(frame);
  lines.push(`                 ${color}${t0}${reset()}       ${color}${t1}${reset()}`);
  lines.push(`            ${color}${t2}${reset()}                 ${color}${t3}${reset()}`);
  lines.push("");
  lines.push("                 ╭─────╮");
  lines.push("               ╭─╯     ╰─╮");
  lines.push(`               │  ${color}${core}${reset()}   │`);
  lines.push(`               │ ${color}██████${reset()}  │`);
  lines.push(`               │  ${color}${core}${reset()}   │`);
  lines.push("               ╰─────────╯");
  lines.push(`              ${dim("RUFFOPS CORE")}`);
  lines.push("");

  // Data fabric with moving packets (independent speeds)
  const w = 18;
  const pGingr = Math.floor((frame * 1.7) % w);
  const pRoute = Math.floor((frame * 1.1 + 4) % w);
  const pSam = Math.floor((frame * 1.4 + 2) % w);
  const pTw = Math.floor((frame * 0.9 + 7) % w);
  const pHealth = Math.floor((frame * 1.3 + 5) % w);
  const pCursor = Math.floor((frame * 1.0 + 9) % w);

  lines.push(`  ${dim("DATA FABRIC")}`);
  lines.push(`  GINGR  ${pulseGlyph(frame, 2)} ${pipeWithPacket(w, pGingr)} ROUTE ENGINE`);
  lines.push(`           │`);
  lines.push(`           ├${pipeWithPacket(16, pSam)} SAMSARA`);
  lines.push(`           ├${pipeWithPacket(16, pTw)} TWILIO`);
  lines.push(`           ├${pipeWithPacket(16, pHealth)} SYSTEM HEALTH`);
  lines.push(`           └${pipeWithPacket(16, pCursor)} CURSOR DEBUG BRIDGE`);
  lines.push(`  ROUTE    ${pulseGlyph(frame, 4)} ${pipeWithPacket(w, pRoute)} CORE`);
  lines.push("");

  lines.push(`  ${dim("SYSTEM NODES")}`);
  for (let i = 0; i < NODE_LABELS.length; i += 1) {
    lines.push(nodeLine(NODE_LABELS[i], frame, i));
  }
  lines.push("");

  lines.push(`  ${dim("BOOT STATUS")}`);
  for (let i = 0; i < BOOT_ITEMS.length; i += 1) {
    const unlock = Math.floor(t * (BOOT_ITEMS.length + 1));
    let stage = "wait";
    if (unlock > i + 1) stage = "ready";
    else if (unlock > i) stage = "check";
    lines.push(`  ${bootStatusLine(BOOT_ITEMS[i], stage, frame)}`);
  }
  lines.push("");
  lines.push(`  ${dim("BOOT")}`);
  lines.push(`  ${color}${progressBar(pct)}${reset()}`);
  lines.push("");

  return lines.join("\n");
}

function renderFinale() {
  const [r, g, b] = PALETTE[2];
  const color = rgb(r, g, b);
  return [
    "",
    `  ${bold("◆ RUFFOPS COMMAND CORE")}`,
    "",
    `  ${bold("● DEVELOPMENT ENVIRONMENT INITIALIZED")}`,
    "",
    `  OBSERVABILITY       ${dim("ARMED")}`,
    `  ROUTE TRACE         ${dim("ARMED")}`,
    `  AUDIT ENGINE        ${dim("ARMED")}`,
    `  SENTRY              ${dim("INSTRUMENTED")}`,
    `  CURSOR BRIDGE       ${dim("AVAILABLE")}`,
    "",
    "  ────────────────────────────────────────────────────────",
    "",
    `              ${bold("ALL DEVELOPMENT SYSTEMS READY")}`,
    "",
    `                   ${color}RUFFOPS${reset()}`,
    "",
    "        SMARTER OPERATIONS. HAPPIER DOGS.",
    "",
    "  ────────────────────────────────────────────────────────",
    "",
    `  ${dim("HANDING CONTROL TO NEXT.JS...")}`,
    ""
  ].join("\n");
}

async function playBootAnimation() {
  const totalFrames = 36; // ~3.2s at 90ms
  const frameMs = 90;
  process.stdout.write(HIDE + CLEAR);

  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      process.stdout.write(HOME + renderFrame(frame, totalFrames) + "\n");
      await sleep(frameMs);
    }
    process.stdout.write(CLEAR + renderFinale() + "\n");
    await sleep(280);
  } finally {
    process.stdout.write(SHOW);
  }
}

function resolveNextBin() {
  const candidates = [
    path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
    path.join(ROOT, "node_modules", ".bin", "next")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Unable to locate local Next.js binary under node_modules/next.");
}

function startNextDev() {
  const nextBin = resolveNextBin();
  const args = ["dev", ...process.argv.slice(2)];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit"
  });

  const forward = (signal) => {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // ignore
      }
    }
  };

  const onSigInt = () => forward("SIGINT");
  const onSigTerm = () => forward("SIGTERM");
  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);

  child.on("error", (error) => {
    process.stderr.write(`\nRuffOps: failed to start Next.js — ${error.message}\n`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
    process.stdout.write(SHOW);
    if (signal) {
      process.exit(signal === "SIGINT" ? 130 : 1);
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  try {
    if (!shouldSkipBoot()) {
      await playBootAnimation();
    }
  } catch (error) {
    process.stdout.write(SHOW);
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\nRuffOps boot animation failed (${message}). Starting Next.js…\n`);
  }

  startNextDev();
}

main();
