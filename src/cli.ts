#!/usr/bin/env node
import { parseArgs, getBooleanFlag, getStringFlag } from "./core/args.js";
import { CliError } from "./core/errors.js";
import { adapterHelp, rootHelp } from "./core/help.js";
import { renderResult } from "./core/output.js";
import { Registry } from "./core/registry.js";
import type { CommandContext, CommandDefinition, OutputFormat, ParsedArgs } from "./core/types.js";
import { createAdapters } from "./adapters/index.js";
import { createRootCommands } from "./adapters/root.js";

const VERSION = "0.1.0";

async function main(argv: string[]): Promise<number> {
  const registry = buildRegistry();
  const parsed = parseArgs(argv);

  if (getBooleanFlag(parsed, "version")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (parsed.positional.length === 0 || getBooleanFlag(parsed, "help")) {
    process.stdout.write(`${rootHelp(registry)}\n`);
    return 0;
  }

  const [first, second, ...rest] = parsed.positional;

  const rootCommand = registry.getRootCommand(first);
  if (rootCommand) {
    if (second === "help") {
      process.stdout.write(commandHelp(first, rootCommand));
      return 0;
    }
    return execute(rootCommand, {
      app: undefined,
      command: first,
      args: withPositionals(parsed, [second, ...rest].filter(Boolean)),
      format: getFormat(parsed),
      traceDir: getStringFlag(parsed, "trace-dir") || undefined,
      dryRun: isDryRun(parsed, rootCommand)
    });
  }

  const adapter = registry.getAdapter(first);
  if (!adapter) {
    throw new CliError(`unknown command or adapter: ${first}\n\n${rootHelp(registry)}`);
  }

  if (!second || second === "help") {
    process.stdout.write(`${adapterHelp(adapter)}\n`);
    return 0;
  }

  const command = registry.getCommand(first, second);
  if (!command) {
    throw new CliError(`unknown command for ${first}: ${second}\n\n${adapterHelp(adapter)}`);
  }

  return execute(command, {
    app: first,
    command: second,
    args: withPositionals(parsed, rest),
    format: getFormat(parsed),
    traceDir: getStringFlag(parsed, "trace-dir") || undefined,
    dryRun: isDryRun(parsed, command)
  });
}

async function execute(command: CommandDefinition, ctx: CommandContext): Promise<number> {
  const result = await command.run(ctx);
  const warnings = [...(result.warnings ?? [])];
  if (command.dangerous && ctx.dryRun) {
    warnings.unshift("dry-run only; pass --yes to execute this desktop action");
  }
  const rendered = renderResult({ ...result, warnings }, ctx.format);
  if (result.ok) {
    process.stdout.write(rendered);
    return 0;
  }
  process.stderr.write(rendered);
  return 1;
}

function buildRegistry(): Registry {
  const registry = new Registry();
  for (const command of createRootCommands()) {
    registry.addRootCommand(command);
  }
  for (const adapter of createAdapters()) {
    registry.addAdapter(adapter);
  }
  return registry;
}

function withPositionals(parsed: ParsedArgs, positional: string[]): ParsedArgs {
  return {
    positional,
    flags: parsed.flags
  };
}

function getFormat(parsed: ParsedArgs): OutputFormat {
  if (getBooleanFlag(parsed, "json")) {
    return "json";
  }
  if (getBooleanFlag(parsed, "plain")) {
    return "plain";
  }
  if (getBooleanFlag(parsed, "md")) {
    return "md";
  }
  if (getBooleanFlag(parsed, "csv")) {
    return "csv";
  }
  if (getBooleanFlag(parsed, "table")) {
    return "table";
  }
  const format = getStringFlag(parsed, "format", "table") as OutputFormat;
  if (!["json", "table", "plain", "md", "csv"].includes(format)) {
    throw new CliError(`unsupported output format: ${format}`);
  }
  return format;
}

function isDryRun(parsed: ParsedArgs, command: CommandDefinition): boolean {
  return getBooleanFlag(parsed, "dry-run") || Boolean(command.dangerous && !getBooleanFlag(parsed, "yes"));
}

function commandHelp(name: string, command: CommandDefinition): string {
  return [
    `desktopcli ${name}${command.usage ? ` ${command.usage}` : ""}`,
    "",
    command.summary,
    "",
    `Strategy: ${Array.isArray(command.strategy) ? command.strategy.join(", ") : command.strategy}`,
    command.dangerous ? "Safety: dry-run by default; pass --yes to execute." : ""
  ].filter(Boolean).join("\n");
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write(`${(error as Error).stack || String(error)}\n`);
  process.exitCode = 1;
});
