import type { CommandResult } from "../core/types.js";
import { writeTrace } from "../core/trace.js";
import { runWorkflowStep } from "../core/workflow.js";
import { desktopBridge } from "../drivers/desktopBridge.js";
import type { IntentPlan, IntentRunOptions, RuntimeAssertion, RuntimeStep } from "./types.js";

export async function runIntent(ctx: import("../core/types.js").CommandContext, plan: IntentPlan, options: IntentRunOptions = {}): Promise<CommandResult> {
  if (ctx.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        intent: summarizePlan(plan)
      },
      warnings: dryRunWarnings(plan)
    };
  }

  const trace: unknown[] = [];
  const warnings = [...(plan.limitations ?? [])];

  for (const assertion of plan.preconditions ?? []) {
    const result = await evaluateAssertion(assertion);
    trace.push({ phase: "precondition", assertion, result });
    if (!result.ok) {
      await maybeWriteTrace(ctx.traceDir, options.traceName ?? plan.intent, plan, trace);
      return fail(`precondition failed: ${assertion.label ?? assertion.type}`, result, trace, warnings);
    }
  }

  for (const step of plan.steps) {
    const result = await runRuntimeStep(step);
    trace.push({ phase: "step", step, result });
    if (!result.ok) {
      await maybeWriteTrace(ctx.traceDir, options.traceName ?? plan.intent, plan, trace);
      return fail(`step failed: ${describeStep(step)}`, result, trace, warnings);
    }
  }

  for (const assertion of plan.postconditions ?? []) {
    const result = await evaluateAssertion(assertion);
    trace.push({ phase: "postcondition", assertion, result });
    if (!result.ok) {
      await maybeWriteTrace(ctx.traceDir, options.traceName ?? plan.intent, plan, trace);
      return fail(`postcondition failed: ${assertion.label ?? assertion.type}`, result, trace, warnings);
    }
  }

  const traceFile = await maybeWriteTrace(ctx.traceDir, options.traceName ?? plan.intent, plan, trace);
  return {
    ok: true,
    data: {
      intent: summarizePlan(plan),
      trace,
      traceFile
    },
    warnings
  };
}

async function runRuntimeStep(step: RuntimeStep): Promise<CommandResult> {
  if (step.action === "assert") {
    return evaluateAssertion(step.assertion);
  }
  if (step.action === "observe") {
    return desktopBridge("window.find", { query: step.selector });
  }
  return runWorkflowStep(step);
}

async function evaluateAssertion(assertion: RuntimeAssertion): Promise<CommandResult> {
  if (assertion.type === "window-present") {
    return desktopBridge("window.wait", {
      query: assertion.selector,
      timeout: assertion.timeout,
      present: true,
      requireUnique: assertion.requireUnique ?? true
    });
  }

  if (assertion.type === "window-gone") {
    return desktopBridge("window.wait", {
      query: assertion.selector,
      timeout: assertion.timeout,
      present: false,
      requireUnique: false
    });
  }

  if (assertion.type === "window-rect") {
    const result = await desktopBridge<{ rect: { width: number; height: number; left: number; top: number } }>("window.rect", {
      query: assertion.selector
    });
    if (!result.ok) {
      return result;
    }
    const rect = result.data?.rect;
    if (!rect) {
      return { ok: false, message: "window.rect returned no rectangle" };
    }
    if (rect.left <= -30000 || rect.top <= -30000) {
      return { ok: false, message: `window is minimized or off-screen: ${JSON.stringify(rect)}`, data: result.data };
    }
    if (assertion.minWidth && rect.width < assertion.minWidth) {
      return { ok: false, message: `window width ${rect.width} is below ${assertion.minWidth}`, data: result.data };
    }
    if (assertion.minHeight && rect.height < assertion.minHeight) {
      return { ok: false, message: `window height ${rect.height} is below ${assertion.minHeight}`, data: result.data };
    }
    return result;
  }

  return { ok: false, message: `unknown assertion type: ${(assertion as { type: string }).type}` };
}

function fail(message: string, result: CommandResult, trace: unknown[], warnings: string[]): CommandResult {
  return {
    ok: false,
    message: result.message ? `${message}: ${result.message}` : message,
    data: {
      failed: result,
      trace
    },
    warnings: [...warnings, ...(result.warnings ?? [])]
  };
}

function summarizePlan(plan: IntentPlan): Record<string, unknown> {
  return {
    app: plan.app,
    intent: plan.intent,
    description: plan.description,
    risk: plan.risk,
    profile: {
      id: plan.profile.id,
      version: plan.profile.version,
      capabilities: plan.profile.capabilities
    },
    preconditions: plan.preconditions ?? [],
    steps: plan.steps,
    postconditions: plan.postconditions ?? [],
    limitations: plan.limitations ?? []
  };
}

function dryRunWarnings(plan: IntentPlan): string[] {
  return [
    `dry-run only; pass --yes to execute ${plan.app}.${plan.intent}`,
    ...(plan.limitations ?? [])
  ];
}

function describeStep(step: RuntimeStep): string {
  if (step.action === "assert") {
    return `assert ${step.assertion.label ?? step.assertion.type}`;
  }
  if (step.action === "observe") {
    return `observe ${step.selector}`;
  }
  return step.action;
}

async function maybeWriteTrace(traceDir: string | undefined, name: string, plan: IntentPlan, trace: unknown[]): Promise<string | undefined> {
  return writeTrace(traceDir, name, {
    intent: summarizePlan(plan),
    trace
  });
}
