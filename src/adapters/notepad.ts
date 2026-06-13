import { getStringFlag } from "../core/args.js";
import type { AdapterDefinition } from "../core/types.js";
import { desktopBridge } from "../drivers/desktopBridge.js";

export function createNotepadAdapter(): AdapterDefinition {
  return {
    name: "notepad",
    displayName: "Notepad",
    description: "Reference adapter for validating basic Windows automation.",
    commands: [
      {
        name: "status",
        summary: "Find Notepad windows.",
        strategy: "WIN32",
        async run() {
          return desktopBridge("window.list", { query: "notepad" });
        }
      },
      {
        name: "open",
        summary: "Launch Notepad.",
        strategy: "LOCAL",
        dangerous: true,
        async run(ctx) {
          if (ctx.dryRun) {
            return { ok: true, data: { dryRun: true, action: "launch", command: "notepad.exe" } };
          }
          return desktopBridge("app.launch", { command: "notepad.exe" });
        }
      },
      {
        name: "write",
        summary: "Paste text into Notepad.",
        usage: "<text> [--yes]",
        strategy: "INPUT",
        dangerous: true,
        async run(ctx) {
          const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
          if (ctx.dryRun) {
            return { ok: true, data: { dryRun: true, action: "type", window: "notepad", text } };
          }
          return desktopBridge("type", { window: "notepad", text });
        }
      }
    ]
  };
}
