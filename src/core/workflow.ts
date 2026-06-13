import fs from "node:fs/promises";
import type { CommandContext, CommandResult } from "./types.js";
import { desktopBridge } from "../drivers/desktopBridge.js";

export type WorkflowStep =
  | { action: "launch"; command: string }
  | { action: "activate"; window: string }
  | { action: "click"; window?: string; text?: string; texts?: string[] }
  | { action: "type"; window?: string; text: string; mode?: string }
  | { action: "hotkey"; window?: string; keys: string }
  | { action: "wait"; window?: string; text: string; timeout?: number }
  | { action: "files-to-clipboard"; files: string[] }
  | { action: "paste-files"; window?: string; files: string[]; send?: boolean }
  | { action: "sleep"; ms: number };

export async function runWorkflow(ctx: CommandContext, steps: WorkflowStep[]): Promise<CommandResult> {
  if (ctx.dryRun) {
    return { ok: true, data: { dryRun: true, steps } };
  }

  const executed: unknown[] = [];
  for (const step of steps) {
    const response = await runStep(step);
    executed.push({ step, response });
    if (!response.ok) {
      return {
        ok: false,
        message: response.message ?? `workflow step failed: ${step.action}`,
        data: { failedStep: step, executed },
        warnings: response.warnings
      };
    }
  }

  return { ok: true, data: { executed } };
}

export async function readWorkflowFile(filePath: string): Promise<WorkflowStep[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("workflow file must contain a JSON array of steps");
  }
  return parsed as WorkflowStep[];
}

async function runStep(step: WorkflowStep): Promise<CommandResult> {
  if (step.action === "sleep") {
    await new Promise((resolve) => setTimeout(resolve, step.ms));
    return { ok: true, data: { slept: step.ms } };
  }

  if (step.action === "launch") {
    return desktopBridge("app.launch", { command: step.command });
  }

  if (step.action === "activate") {
    return desktopBridge("window.activate", { query: step.window });
  }

  if (step.action === "click") {
    const labels = step.texts?.length ? step.texts : step.text ? [step.text] : [];
    if (labels.length === 0) {
      return { ok: false, message: "click step requires text or texts" };
    }
    const attempts: unknown[] = [];
    for (const label of labels) {
      const response = await desktopBridge("click", { window: step.window, text: label });
      attempts.push({ label, response });
      if (response.ok) {
        return { ok: true, data: { clicked: label, attempts } };
      }
    }
    return { ok: false, message: `no click target matched: ${labels.join(", ")}`, data: { attempts } };
  }

  if (step.action === "type") {
    return desktopBridge("type", { window: step.window, text: step.text, mode: step.mode });
  }

  if (step.action === "hotkey") {
    return desktopBridge("hotkey", { window: step.window, keys: step.keys });
  }

  if (step.action === "wait") {
    return desktopBridge("wait.text", { window: step.window, text: step.text, timeout: step.timeout });
  }

  if (step.action === "files-to-clipboard") {
    return desktopBridge("clipboard.files", { files: step.files });
  }

  if (step.action === "paste-files") {
    const setFiles = await desktopBridge("clipboard.files", { files: step.files });
    if (!setFiles.ok) {
      return setFiles;
    }
    const paste = await desktopBridge("hotkey", { window: step.window, keys: "ctrl+v" });
    if (!paste.ok) {
      return paste;
    }
    if (step.send) {
      return desktopBridge("hotkey", { window: step.window, keys: "enter" });
    }
    return { ok: true, data: { files: step.files, pasted: true } };
  }

  return { ok: false, message: `unknown workflow step: ${(step as { action: string }).action}` };
}
