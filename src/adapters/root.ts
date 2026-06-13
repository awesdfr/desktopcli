import { getBooleanFlag, getStringFlag } from "../core/args.js";
import type { CommandDefinition } from "../core/types.js";
import { writeTrace } from "../core/trace.js";
import { desktopBridge } from "../drivers/desktopBridge.js";
import type { InspectNode, WindowSummary } from "../drivers/desktopBridge.js";

export function createRootCommands(): CommandDefinition[] {
  return [
    {
      name: "app",
      summary: "List adapters or inspect local bridge dependencies.",
      usage: "list | deps",
      strategy: "LOCAL",
      async run(ctx) {
        const subcommand = ctx.args.positional[0] || "list";
        if (subcommand === "deps" || subcommand === "dependencies") {
          return desktopBridge("dependencies");
        }
        if (subcommand !== "list") {
          return { ok: false, message: `unknown app command: ${subcommand}` };
        }
        return {
          ok: true,
          data: [
            { name: "wechat", status: "adapter", description: "WeChat desktop workflows." },
            { name: "qq", status: "adapter", description: "QQ desktop workflows." },
            { name: "jianying", status: "adapter", description: "Jianying/CapCut desktop workflows." },
            { name: "notepad", status: "adapter", description: "Reference adapter for basic Windows automation." }
          ]
        };
      }
    },
    {
      name: "window",
      summary: "List, find, or activate top-level windows.",
      usage: "list|find|activate [--query <text>] [--handle <hwnd>]",
      strategy: "WIN32",
      async run(ctx) {
        const subcommand = ctx.args.positional[0] || "list";
        const query = getStringFlag(ctx.args, "query", ctx.args.positional[1] || "");
        const handle = getStringFlag(ctx.args, "handle");

        if (subcommand === "list") {
          return desktopBridge<WindowSummary[]>("window.list", { query });
        }
        if (subcommand === "find") {
          return desktopBridge<WindowSummary>("window.find", { query });
        }
        if (subcommand === "activate") {
          return desktopBridge("window.activate", { query, handle: handle ? Number(handle) : undefined });
        }

        return { ok: false, message: `unknown window command: ${subcommand}` };
      }
    },
    {
      name: "inspect",
      summary: "Dump a window's UIA tree, or visible window metadata without pywinauto.",
      usage: "[--query <window>] [--depth 3] [--limit 250] [--trace-dir trace]",
      strategy: "UIA",
      async run(ctx) {
        const response = await desktopBridge<InspectNode>("inspect", {
          query: getStringFlag(ctx.args, "query", ctx.args.positional[0] || ""),
          depth: Number(getStringFlag(ctx.args, "depth", "3")),
          limit: Number(getStringFlag(ctx.args, "limit", "250"))
        });
        const traceFile = await writeTrace(ctx.traceDir, "inspect", response);
        return {
          ...response,
          data: traceFile ? { traceFile, result: response.data } : response.data
        };
      }
    },
    {
      name: "click",
      summary: "Click a UIA control by name or automation id.",
      usage: "--window <title> --text <control> [--yes]",
      strategy: "UIA",
      dangerous: true,
      async run(ctx) {
        const window = getStringFlag(ctx.args, "window", getStringFlag(ctx.args, "query"));
        const text = getStringFlag(ctx.args, "text", getStringFlag(ctx.args, "name", ctx.args.positional[0] || ""));
        if (ctx.dryRun) {
          return { ok: true, data: { dryRun: true, action: "click", window, text } };
        }
        return desktopBridge("click", { window, text });
      }
    },
    {
      name: "type",
      summary: "Type text into the active or targeted window using paste-by-default.",
      usage: "<text> [--window <title>] [--mode paste|keys] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        const window = getStringFlag(ctx.args, "window");
        const mode = getStringFlag(ctx.args, "mode", "paste");
        if (ctx.dryRun) {
          return { ok: true, data: { dryRun: true, action: "type", window, mode, chars: text.length, text } };
        }
        return desktopBridge("type", { window, mode, text });
      }
    },
    {
      name: "hotkey",
      summary: "Send a keyboard shortcut to the active or targeted window.",
      usage: "ctrl+v [--window <title>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const keys = getStringFlag(ctx.args, "keys", ctx.args.positional[0] || "");
        const window = getStringFlag(ctx.args, "window");
        if (ctx.dryRun) {
          return { ok: true, data: { dryRun: true, action: "hotkey", window, keys } };
        }
        return desktopBridge("hotkey", { window, keys });
      }
    },
    {
      name: "wait",
      summary: "Wait for visible window/UIA text.",
      usage: "--text <text> [--window <title>] [--timeout 10]",
      strategy: ["UIA", "WIN32"],
      async run(ctx) {
        const text = getStringFlag(ctx.args, "text", ctx.args.positional[0] || "");
        const window = getStringFlag(ctx.args, "window", getStringFlag(ctx.args, "query"));
        const timeout = Number(getStringFlag(ctx.args, "timeout", "10"));
        return desktopBridge("wait.text", { text, window, timeout });
      }
    },
    {
      name: "launch",
      summary: "Launch a local application command.",
      usage: "<command>",
      strategy: "LOCAL",
      dangerous: true,
      async run(ctx) {
        const command = getStringFlag(ctx.args, "command", ctx.args.positional.join(" "));
        if (!command) {
          return { ok: false, message: "launch requires a command" };
        }
        if (ctx.dryRun) {
          return { ok: true, data: { dryRun: true, action: "launch", command } };
        }
        return desktopBridge("app.launch", { command });
      }
    },
    {
      name: "doctor",
      summary: "Show DesktopCLI environment and bridge capability status.",
      strategy: "LOCAL",
      async run(ctx) {
        const response = await desktopBridge("dependencies");
        return {
          ok: response.ok,
          message: response.message,
          warnings: [
            ...(response.warnings ?? []),
            ...(getBooleanFlag(ctx.args, "verbose") ? [] : ["Use --verbose to pair this with inspect/window dumps when debugging adapters."])
          ],
          data: response.data
        };
      }
    }
  ];
}
