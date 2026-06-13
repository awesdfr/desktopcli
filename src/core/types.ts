export type OutputFormat = "json" | "table" | "plain" | "md" | "csv";

export type CommandStrategy = "UIA" | "WIN32" | "INPUT" | "VISION" | "LOCAL";

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

export interface CommandContext {
  app?: string;
  command: string;
  args: ParsedArgs;
  format: OutputFormat;
  traceDir?: string;
  dryRun: boolean;
}

export interface CommandResult {
  ok: boolean;
  data?: unknown;
  message?: string;
  warnings?: string[];
}

export interface CommandDefinition {
  name: string;
  summary: string;
  usage?: string;
  strategy: CommandStrategy | CommandStrategy[];
  dangerous?: boolean;
  run(ctx: CommandContext): Promise<CommandResult>;
}

export interface AdapterDefinition {
  name: string;
  displayName: string;
  description: string;
  commands: CommandDefinition[];
}
