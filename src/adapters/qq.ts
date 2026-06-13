import { getStringFlag } from "../core/args.js";
import type { AdapterDefinition } from "../core/types.js";
import { desktopBridge } from "../drivers/desktopBridge.js";

const windowQuery = "QQ";

export function createQqAdapter(): AdapterDefinition {
  return {
    name: "qq",
    displayName: "QQ",
    description: "QQ desktop adapter using window search, UIA dumps, and keyboard workflows.",
    commands: [
      {
        name: "status",
        summary: "Find visible QQ windows.",
        strategy: "WIN32",
        async run() {
          return desktopBridge("window.list", { query: windowQuery });
        }
      },
      {
        name: "dump",
        summary: "Dump QQ UIA/window structure.",
        usage: "[--depth 3] [--limit 250]",
        strategy: "UIA",
        async run(ctx) {
          return desktopBridge("inspect", {
            query: windowQuery,
            depth: Number(getStringFlag(ctx.args, "depth", "3")),
            limit: Number(getStringFlag(ctx.args, "limit", "250"))
          });
        }
      },
      {
        name: "send",
        summary: "Send a message to the current QQ chat, with optional search-first step.",
        usage: "--text <message> [--to <contact>] [--yes]",
        strategy: ["UIA", "INPUT"],
        dangerous: true,
        async run(ctx) {
          const to = getStringFlag(ctx.args, "to");
          const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
          if (!text) {
            return { ok: false, message: "qq send requires --text or positional text" };
          }
          if (ctx.dryRun) {
            return {
              ok: true,
              data: {
                dryRun: true,
                steps: plannedSendSteps(windowQuery, to, text)
              }
            };
          }
          if (to) {
            await desktopBridge("window.activate", { query: windowQuery });
            await desktopBridge("hotkey", { keys: "ctrl+f" });
            await desktopBridge("type", { text: to });
            await desktopBridge("hotkey", { keys: "enter" });
          }
          await desktopBridge("type", { window: windowQuery, text });
          return desktopBridge("hotkey", { keys: "enter", window: windowQuery });
        }
      }
    ]
  };
}

function plannedSendSteps(window: string, to: string, text: string): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [{ action: "activate", window }];
  if (to) {
    steps.push({ action: "hotkey", keys: "ctrl+f" });
    steps.push({ action: "type", text: to });
    steps.push({ action: "hotkey", keys: "enter" });
  }
  steps.push({ action: "type", text });
  steps.push({ action: "hotkey", keys: "enter" });
  return steps;
}
