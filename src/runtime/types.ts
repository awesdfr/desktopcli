import type { CommandContext, CommandResult } from "../core/types.js";
import type { WorkflowStep } from "../core/workflow.js";

export interface AppSelector {
  name: string;
  query: string;
  description?: string;
}

export interface AppPoint {
  name: string;
  x: number;
  y: number;
  window: string;
  description?: string;
}

export interface AppProfile {
  id: string;
  displayName: string;
  version?: string;
  selectors: Record<string, AppSelector>;
  points: Record<string, AppPoint>;
  capabilities: Record<string, boolean | string>;
  notes?: string[];
}

export type RuntimeAssertion =
  | {
      type: "window-present";
      selector: string;
      timeout?: number;
      requireUnique?: boolean;
      label?: string;
    }
  | {
      type: "window-gone";
      selector: string;
      timeout?: number;
      label?: string;
    }
  | {
      type: "window-rect";
      selector: string;
      minWidth?: number;
      minHeight?: number;
      label?: string;
    };

export type RuntimeStep =
  | WorkflowStep
  | {
      action: "assert";
      assertion: RuntimeAssertion;
    }
  | {
      action: "observe";
      selector: string;
    };

export interface IntentPlan {
  app: string;
  intent: string;
  description: string;
  risk: "low" | "medium" | "high";
  profile: AppProfile;
  preconditions?: RuntimeAssertion[];
  steps: RuntimeStep[];
  postconditions?: RuntimeAssertion[];
  limitations?: string[];
}

export interface IntentRunOptions {
  traceName?: string;
}

export type IntentRunner = (ctx: CommandContext, plan: IntentPlan, options?: IntentRunOptions) => Promise<CommandResult>;
