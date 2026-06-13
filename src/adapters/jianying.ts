import { getStringFlag } from "../core/args.js";
import type { AdapterDefinition } from "../core/types.js";
import { desktopBridge } from "../drivers/desktopBridge.js";

const windowQuery = "剪映";

export function createJianyingAdapter(): AdapterDefinition {
  return {
    name: "jianying",
    displayName: "Jianying",
    description: "Jianying/CapCut desktop adapter focused on observable import/export workflows.",
    commands: [
      {
        name: "status",
        summary: "Find visible Jianying windows.",
        strategy: "WIN32",
        async run() {
          return desktopBridge("window.list", { query: windowQuery });
        }
      },
      {
        name: "dump",
        summary: "Dump Jianying UIA/window structure.",
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
        name: "import",
        summary: "Plan or run a UI-driven media import.",
        usage: "--dir <folder> [--yes]",
        strategy: ["UIA", "INPUT"],
        dangerous: true,
        async run(ctx) {
          const dir = getStringFlag(ctx.args, "dir", getStringFlag(ctx.args, "folder", ctx.args.positional[0] || ""));
          if (!dir) {
            return { ok: false, message: "jianying import requires --dir" };
          }
          if (ctx.dryRun) {
            return {
              ok: true,
              data: {
                dryRun: true,
                steps: [
                  { action: "activate", window: windowQuery },
                  { action: "click", text: "导入" },
                  { action: "paste-path", value: dir },
                  { action: "hotkey", keys: "enter" }
                ]
              }
            };
          }
          await desktopBridge("window.activate", { query: windowQuery });
          const clickImport = await desktopBridge("click", { window: windowQuery, text: "导入" });
          if (!clickImport.ok) {
            return clickImport;
          }
          await desktopBridge("type", { text: dir });
          return desktopBridge("hotkey", { keys: "enter" });
        }
      },
      {
        name: "export",
        summary: "Plan or run a conservative UI-driven export flow.",
        usage: "--out <file-or-folder> [--yes]",
        strategy: ["UIA", "INPUT"],
        dangerous: true,
        async run(ctx) {
          const out = getStringFlag(ctx.args, "out", ctx.args.positional[0] || "");
          if (!out) {
            return { ok: false, message: "jianying export requires --out" };
          }
          if (ctx.dryRun) {
            return {
              ok: true,
              data: {
                dryRun: true,
                steps: [
                  { action: "activate", window: windowQuery },
                  { action: "click", text: "导出" },
                  { action: "paste-path", value: out },
                  { action: "click", text: "导出" },
                  { action: "wait", text: "导出完成" }
                ]
              }
            };
          }
          await desktopBridge("window.activate", { query: windowQuery });
          const clickExport = await desktopBridge("click", { window: windowQuery, text: "导出" });
          if (!clickExport.ok) {
            return clickExport;
          }
          await desktopBridge("type", { text: out });
          await desktopBridge("click", { window: windowQuery, text: "导出" });
          return desktopBridge("wait.text", { window: windowQuery, text: "导出完成", timeout: 3600 });
        }
      }
    ]
  };
}
