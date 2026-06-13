import type { AdapterDefinition, CommandDefinition } from "./types.js";
import { Registry } from "./registry.js";

export function rootHelp(registry: Registry): string {
  const rootCommands = registry.listRootCommands();
  const adapters = registry.listAdapters();

  return [
    "DesktopCLI",
    "",
    "Usage:",
    "  desktopcli <command> [options]",
    "  desktopcli <app> <command> [options]",
    "",
    "Root commands:",
    ...rootCommands.map((command) => `  ${command.name.padEnd(12)} ${command.summary}`),
    "",
    "Adapters:",
    ...adapters.map((adapter) => `  ${adapter.name.padEnd(12)} ${adapter.description}`),
    "",
    "Global options:",
    "  --format <json|table|plain|md|csv>",
    "  --json, --table, --plain, --md, --csv",
    "  --trace-dir <path>",
    "  --dry-run",
    "  --yes"
  ].join("\n");
}

export function adapterHelp(adapter: AdapterDefinition): string {
  return [
    `${adapter.displayName} (${adapter.name})`,
    "",
    adapter.description,
    "",
    "Commands:",
    ...adapter.commands.map(formatCommand)
  ].join("\n");
}

function formatCommand(command: CommandDefinition): string {
  const usage = command.usage ? ` ${command.usage}` : "";
  return `  ${command.name.padEnd(12)} ${command.summary}${usage}`;
}
