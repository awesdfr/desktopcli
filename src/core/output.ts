import type { CommandResult, OutputFormat } from "./types.js";

export function renderResult(result: CommandResult, format: OutputFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const payload = result.data ?? result.message ?? result;

  if (format === "plain") {
    return `${toPlain(payload)}\n`;
  }

  if (format === "md") {
    return `${toMarkdown(payload)}\n`;
  }

  if (format === "csv") {
    return `${toCsv(payload)}\n`;
  }

  return `${toTable(payload)}\n`;
}

function toPlain(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function toMarkdown(value: unknown): string {
  if (!Array.isArray(value)) {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  }

  const rows = normalizeRows(value);
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});
  const headerLine = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${headers.map((header) => escapeMarkdown(String(row[header] ?? ""))).join(" | ")} |`);
  return [headerLine, divider, ...body].join("\n");
}

function toCsv(value: unknown): string {
  const rows = normalizeRows(Array.isArray(value) ? value : [value]);
  if (rows.length === 0) {
    return "";
  }
  const headers = Object.keys(rows[0] ?? {});
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.map(csvCell).join(","), ...body].join("\n");
}

function toTable(value: unknown): string {
  const rows = normalizeRows(Array.isArray(value) ? value : [value]);
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});
  const widths = headers.map((header) => Math.max(header.length, ...rows.map((row) => String(row[header] ?? "").length)));
  const line = headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => headers.map((header, index) => String(row[header] ?? "").padEnd(widths[index] ?? header.length)).join("  "));
  return [line, divider, ...body].join("\n");
}

function normalizeRows(value: unknown[]): Record<string, unknown>[] {
  return value.map((row) => {
    if (row !== null && typeof row === "object" && !Array.isArray(row)) {
      return row as Record<string, unknown>;
    }
    return { value: row };
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|");
}
