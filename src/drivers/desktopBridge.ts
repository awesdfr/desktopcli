import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  warnings?: string[];
}

export interface WindowSummary {
  handle: number;
  title: string;
  className: string;
  processId: number;
  visible: boolean;
}

export interface InspectNode {
  name: string;
  controlType: string;
  automationId?: string;
  className?: string;
  rectangle?: string;
  children?: InspectNode[];
}

export async function desktopBridge<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<BridgeResponse<T>> {
  const scriptPath = getBridgeScriptPath();
  const python = process.env.DESKTOPCLI_PYTHON || "python";
  const child = spawn(python, [scriptPath, action], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
  const stderrText = Buffer.concat(stderr).toString("utf8").trim();

  if (!stdoutText) {
    return {
      ok: false,
      message: stderrText || `desktop bridge exited with code ${exitCode ?? "unknown"}`
    };
  }

  try {
    const response = JSON.parse(stdoutText) as BridgeResponse<T>;
    if (!response.ok && stderrText) {
      response.warnings = [...(response.warnings ?? []), stderrText];
    }
    return response;
  } catch (error) {
    return {
      ok: false,
      message: `desktop bridge returned invalid JSON: ${(error as Error).message}`,
      data: { stdout: stdoutText, stderr: stderrText, exitCode } as T
    };
  }
}

function getBridgeScriptPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../python/desktop_bridge.py");
}
