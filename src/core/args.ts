import type { ParsedArgs } from "./types.js";

const booleanFlags = new Set([
  "dry-run",
  "yes",
  "help",
  "version",
  "json",
  "table",
  "plain",
  "md",
  "csv"
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }

    const normalized = token.startsWith("--") ? token.slice(2) : token.slice(1);
    const equalsIndex = normalized.indexOf("=");
    const key = equalsIndex >= 0 ? normalized.slice(0, equalsIndex) : normalized;

    if (!key) {
      continue;
    }

    let value: string | boolean;
    if (equalsIndex >= 0) {
      value = normalized.slice(equalsIndex + 1);
    } else if (booleanFlags.has(key)) {
      value = true;
    } else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        value = true;
      } else {
        value = next;
        index += 1;
      }
    }

    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      flags[key] = [String(existing), String(value)];
    }
  }

  return { positional, flags };
}

export function getStringFlag(args: ParsedArgs, key: string, fallback = ""): string {
  const value = args.flags[key];
  if (Array.isArray(value)) {
    return value[value.length - 1] ?? fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

export function getBooleanFlag(args: ParsedArgs, key: string): boolean {
  return args.flags[key] === true || args.flags[key] === "true";
}
