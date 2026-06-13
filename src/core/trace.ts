import fs from "node:fs/promises";
import path from "node:path";

export async function writeTrace(traceDir: string | undefined, name: string, payload: unknown): Promise<string | undefined> {
  if (!traceDir) {
    return undefined;
  }

  await fs.mkdir(traceDir, { recursive: true });
  const safeName = name.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "");
  const filePath = path.resolve(traceDir, `${Date.now()}-${safeName || "trace"}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}
