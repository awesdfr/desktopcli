import { getBooleanFlag, getStringFlag, getStringFlags } from "../core/args.js";
import type { AdapterDefinition, CommandDefinition, CommandResult } from "../core/types.js";
import { readWorkflowFile, runWorkflow, type WorkflowStep } from "../core/workflow.js";
import { desktopBridge } from "../drivers/desktopBridge.js";
import type { WindowSummary } from "../drivers/desktopBridge.js";
import { runIntent } from "../runtime/intentRunner.js";
import { selector } from "../runtime/selectors.js";
import type { IntentPlan } from "../runtime/types.js";
import { wechatProfile } from "./wechatProfile.js";
import { buildWechatMomentsIntent, buildWechatSendIntent, openMomentsSteps as intentOpenMomentsSteps } from "./wechatPlans.js";

const windowQueries = [
  selector(wechatProfile, "mainWindow"),
  selector(wechatProfile, "momentsWindow")
];
const defaultWindowQuery = selector(wechatProfile, "mainWindow");
const momentsWindowQuery = selector(wechatProfile, "momentsWindow");

const wechatUiProfile = {
  mainWindow: defaultWindowQuery,
  momentsWindow: momentsWindowQuery,
  filePickerWindow: selector(wechatProfile, "filePickerWindow"),
  searchBox: point("searchBox"),
  messageInput: point("messageInput"),
  sidebarMoments: point("sidebarMoments"),
  momentsCamera: point("momentsCamera"),
  momentsComposerText: point("momentsComposerText"),
  momentsPublish: point("momentsPublish")
};

export function createWechatAdapter(): AdapterDefinition {
  return {
    name: "wechat",
    displayName: "WeChat",
    description: "WeChat desktop CLI for chat search, messaging, file sending, and deterministic input workflows.",
    commands: createWechatCommands()
  };
}

function createWechatCommands(): CommandDefinition[] {
  return [
    {
      name: "status",
      summary: "Find visible WeChat windows.",
      strategy: "WIN32",
      async run() {
        const windows = await listWindows(windowQueries);
        return { ok: true, data: windows };
      }
    },
    {
      name: "launch",
      summary: "Launch WeChat.",
      usage: "[--command WeChat.exe] [--yes]",
      strategy: "LOCAL",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [
          { action: "launch", command: getStringFlag(ctx.args, "command", "WeChat.exe") }
        ]);
      }
    },
    {
      name: "profile",
      summary: "Print the current built-in WeChat UI coordinate profile.",
      strategy: "LOCAL",
      async run() {
        return { ok: true, data: wechatUiProfile };
      }
    },
    {
      name: "focus",
      summary: "Bring WeChat to the foreground.",
      usage: "[--window <title>] [--yes]",
      strategy: "WIN32",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx) }
        ]);
      }
    },
    {
      name: "dump",
      summary: "Dump WeChat UIA/window structure.",
      usage: "[--depth 3] [--limit 250]",
      strategy: "UIA",
      async run(ctx) {
        return desktopBridge("inspect", {
          query: windowQuery(ctx),
          depth: Number(getStringFlag(ctx.args, "depth", "3")),
          limit: Number(getStringFlag(ctx.args, "limit", "250"))
        });
      }
    },
    {
      name: "run",
      summary: "Run a JSON workflow file or inline JSON workflow against WeChat.",
      usage: "--file workflow.json | --steps '[...]' [--yes]",
      strategy: ["UIA", "INPUT", "LOCAL"],
      dangerous: true,
      async run(ctx) {
        const file = getStringFlag(ctx.args, "file");
        const rawSteps = getStringFlag(ctx.args, "steps");
        if (!file && !rawSteps) {
          return { ok: false, message: "wechat run requires --file or --steps" };
        }
        const steps = file ? await readWorkflowFile(file) : JSON.parse(rawSteps) as WorkflowStep[];
        return runWorkflow(ctx, steps);
      }
    },
    primitiveClickCommand(),
    primitiveHotkeyCommand(),
    primitiveTypeCommand(),
    {
      name: "search",
      summary: "Search WeChat for a contact, group, or chat.",
      usage: "--query <text> [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const query = getStringFlag(ctx.args, "query", getStringFlag(ctx.args, "to", ctx.args.positional.join(" ")));
        if (!query) {
          return { ok: false, message: "wechat search requires --query" };
        }
        return runWorkflow(ctx, searchSteps(ctx, query, false));
      }
    },
    {
      name: "open-chat",
      summary: "Search and open a chat.",
      usage: "--to <contact-or-group> [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const to = getStringFlag(ctx.args, "to", getStringFlag(ctx.args, "query", ctx.args.positional.join(" ")));
        if (!to) {
          return { ok: false, message: "wechat open-chat requires --to" };
        }
        return runWorkflow(ctx, searchSteps(ctx, to, true));
      }
    },
    {
      name: "draft",
      summary: "Prepare a text draft in a WeChat chat without pressing Enter.",
      usage: "--text <message> [--to <contact>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const to = getStringFlag(ctx.args, "to");
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        if (!text) {
          return { ok: false, message: "wechat draft requires --text or positional text" };
        }
        return runIntent(ctx, buildWechatSendIntent({ to, text, publish: false }), { traceName: "wechat-draft" });
      }
    },
    {
      name: "send",
      summary: "Send a text message to the current chat, or search first with --to.",
      usage: "--text <message> [--to <contact>] [--yes --force]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const to = getStringFlag(ctx.args, "to");
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        if (!text) {
          return { ok: false, message: "wechat send requires --text or positional text" };
        }
        if (!ctx.dryRun && !getBooleanFlag(ctx.args, "force")) {
          return unverifiedHighRiskRefusal("wechat send", buildWechatSendIntent({ to, text, sendKeys: getStringFlag(ctx.args, "send-keys", "enter"), publish: true }));
        }
        return runIntent(ctx, buildWechatSendIntent({ to, text, sendKeys: getStringFlag(ctx.args, "send-keys", "enter"), publish: true }), { traceName: "wechat-send" });
      }
    },
    {
      name: "moments-open",
      summary: "Open the Moments window from the left sidebar.",
      usage: "[--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        return runIntent(ctx, {
          app: "wechat",
          intent: "openMoments",
          description: "Open the WeChat Moments window.",
          risk: "medium",
          profile: wechatProfile,
          steps: intentOpenMomentsSteps(),
          limitations: wechatProfile.notes
        }, { traceName: "wechat-moments-open" });
      }
    },
    {
      name: "moments-camera",
      summary: "Click the Moments camera button and optionally close the file picker for text-only posts.",
      usage: "[--text-only] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const textOnly = getBooleanFlag(ctx.args, "text-only") || !getStringFlags(ctx.args, "file").length;
        return runWorkflow(ctx, [
          ...openMomentsSteps(ctx),
          { action: "mouse-click", window: momentsWindowQuery, ...wechatUiProfile.momentsCamera },
          ...(textOnly ? [
            { action: "hotkey", keys: "esc" } satisfies WorkflowStep,
            { action: "wait-window-gone", window: wechatUiProfile.filePickerWindow, timeout: 2 } satisfies WorkflowStep
          ] : [])
        ]);
      }
    },
    {
      name: "moments-compose",
      summary: "Create a Moments draft with text and optional files, without pressing publish.",
      usage: "--text <content> [--file <image-or-video>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        const files = filePaths(ctx);
        if (!text && files.length === 0) {
          return { ok: false, message: "wechat moments-compose requires --text or --file" };
        }
        return runIntent(ctx, buildWechatMomentsIntent({ text, files, publish: false }), { traceName: "wechat-moments-compose" });
      }
    },
    {
      name: "moments-post",
      summary: "Create and publish a Moments post with text and optional files.",
      usage: "--text <content> [--file <image-or-video>] [--yes --force]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        const files = filePaths(ctx);
        if (!text && files.length === 0) {
          return { ok: false, message: "wechat moments-post requires --text or --file" };
        }
        if (!ctx.dryRun && !getBooleanFlag(ctx.args, "force")) {
          return unverifiedHighRiskRefusal("wechat moments-post", buildWechatMomentsIntent({ text, files, publish: true }));
        }
        return runIntent(ctx, buildWechatMomentsIntent({ text, files, publish: true }), { traceName: "wechat-moments-post" });
      }
    },
    {
      name: "moments-publish-current",
      summary: "Click the publish button in the current Moments composer.",
      usage: "[--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [
          { action: "activate", window: momentsWindowQuery },
          { action: "mouse-click", window: momentsWindowQuery, ...wechatUiProfile.momentsPublish }
        ]);
      }
    },
    {
      name: "paste-file",
      summary: "Paste one or more files/images into the current or targeted chat without pressing Enter.",
      usage: "--file <path> [--file <path>...] [--to <contact>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const files = filePaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: "wechat paste-file requires --file" };
        }
        return runWorkflow(ctx, [
          ...maybeOpenChatSteps(ctx),
          { action: "paste-files", window: windowQuery(ctx), files, send: false }
        ]);
      }
    },
    {
      name: "send-file",
      summary: "Send one or more files to a chat by putting files on the clipboard, pasting, then pressing Enter.",
      usage: "--file <path> [--file <path>...] [--to <contact>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const files = filePaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: "wechat send-file requires --file" };
        }
        return runWorkflow(ctx, [
          ...maybeOpenChatSteps(ctx),
          { action: "paste-files", window: windowQuery(ctx), files, send: true }
        ]);
      }
    },
    {
      name: "send-image",
      summary: "Alias for send-file, intended for image paths.",
      usage: "--file <image-path> [--to <contact>] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const files = filePaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: "wechat send-image requires --file" };
        }
        return runWorkflow(ctx, [
          ...maybeOpenChatSteps(ctx),
          { action: "paste-files", window: windowQuery(ctx), files, send: true }
        ]);
      }
    },
    {
      name: "copy-selected",
      summary: "Copy the current selection and return clipboard text.",
      usage: "[--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        if (ctx.dryRun) {
          return {
            ok: true,
            data: {
              dryRun: true,
              steps: [
                { action: "activate", window: windowQuery(ctx) },
                { action: "hotkey", window: windowQuery(ctx), keys: "ctrl+c" },
                { action: "clipboard.text.get" }
              ]
            }
          };
        }
        const copy = await desktopBridge("hotkey", { window: windowQuery(ctx), keys: "ctrl+c" });
        if (!copy.ok) {
          return copy;
        }
        return desktopBridge("clipboard.text.get") as Promise<CommandResult>;
      }
    },
    {
      name: "set-files",
      summary: "Put files on the Windows clipboard for manual paste into WeChat.",
      usage: "--file <path> [--file <path>...] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const files = filePaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: "wechat set-files requires --file" };
        }
        return runWorkflow(ctx, [
          { action: "files-to-clipboard", files }
        ]);
      }
    }
  ];
}

function primitiveClickCommand(): CommandDefinition {
  return {
    name: "click",
    summary: "Click a visible WeChat control by text/name when UIA exposes it.",
    usage: "--text <label> [--yes]",
    strategy: "UIA",
    dangerous: true,
    async run(ctx) {
      const text = getStringFlag(ctx.args, "text", ctx.args.positional[0] || "");
      if (!text) {
        return { ok: false, message: "wechat click requires --text" };
      }
      return runWorkflow(ctx, [
        { action: "click", window: windowQuery(ctx), text }
      ]);
    }
  };
}

function primitiveHotkeyCommand(): CommandDefinition {
  return {
    name: "hotkey",
    summary: "Send a hotkey to WeChat.",
    usage: "ctrl+f [--yes]",
    strategy: "INPUT",
    dangerous: true,
    async run(ctx) {
      const keys = getStringFlag(ctx.args, "keys", ctx.args.positional[0] || "");
      if (!keys) {
        return { ok: false, message: "wechat hotkey requires keys" };
      }
      return runWorkflow(ctx, [
        { action: "hotkey", window: windowQuery(ctx), keys }
      ]);
    }
  };
}

function primitiveTypeCommand(): CommandDefinition {
  return {
    name: "type",
    summary: "Paste/type text into WeChat.",
    usage: "<text> [--yes]",
    strategy: "INPUT",
    dangerous: true,
    async run(ctx) {
      const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
      if (!text) {
        return { ok: false, message: "wechat type requires text" };
      }
      return runWorkflow(ctx, [
        { action: "type", window: windowQuery(ctx), text }
      ]);
    }
  };
}

function searchSteps(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }, query: string, open: boolean): WorkflowStep[] {
  return [
    { action: "activate", window: windowQuery(ctx) },
    { action: "mouse-click", window: windowQuery(ctx), ...wechatUiProfile.searchBox },
    { action: "hotkey", window: windowQuery(ctx), keys: "ctrl+a" },
    { action: "type", window: windowQuery(ctx), text: query },
    { action: "sleep", ms: 600 },
    ...(open ? [{ action: "hotkey", window: windowQuery(ctx), keys: "enter" } satisfies WorkflowStep, { action: "sleep", ms: 500 } satisfies WorkflowStep] : [])
  ];
}

function maybeOpenChatSteps(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): WorkflowStep[] {
  const to = getStringFlag(ctx.args, "to", getStringFlag(ctx.args, "query"));
  if (!to) {
    return [{ action: "activate", window: windowQuery(ctx) }];
  }
  return searchSteps(ctx, to, true);
}

function openMomentsSteps(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): WorkflowStep[] {
  return [
    { action: "activate", window: mainWindowQuery(ctx) },
    { action: "mouse-click", window: mainWindowQuery(ctx), ...wechatUiProfile.sidebarMoments },
    { action: "wait-window", window: momentsWindowQuery, timeout: 5 },
    { action: "activate", window: momentsWindowQuery }
  ];
}

function composeMomentsSteps(
  ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } },
  text: string,
  files: string[],
  publish: boolean
): WorkflowStep[] {
  const steps: WorkflowStep[] = [
    ...openMomentsSteps(ctx),
    { action: "mouse-click", window: momentsWindowQuery, ...wechatUiProfile.momentsCamera },
    { action: "sleep", ms: 500 }
  ];

  if (files.length > 0) {
    steps.push({ action: "files-to-clipboard", files });
    steps.push({ action: "hotkey", keys: "ctrl+v" });
    steps.push({ action: "hotkey", keys: "enter" });
    steps.push({ action: "sleep", ms: 500 });
  } else {
    steps.push({ action: "hotkey", keys: "esc" });
    steps.push({ action: "wait-window-gone", window: wechatUiProfile.filePickerWindow, timeout: 2 });
    steps.push({ action: "sleep", ms: 250 });
  }

  if (text) {
    steps.push({ action: "mouse-click", window: momentsWindowQuery, ...wechatUiProfile.momentsComposerText });
    steps.push({ action: "type", text });
  }

  if (publish) {
    steps.push({ action: "mouse-click", window: momentsWindowQuery, ...wechatUiProfile.momentsPublish });
  }

  return steps;
}

function filePaths(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): string[] {
  const files = getStringFlags(ctx.args, "file");
  const fileList = getStringFlag(ctx.args, "files");
  return [
    ...files,
    ...splitPathList(fileList),
    ...ctx.args.positional
  ].filter(Boolean);
}

function splitPathList(value: string): string[] {
  if (!value) {
    return [];
  }
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

function windowQuery(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): string {
  return getStringFlag(ctx.args, "window", defaultWindowQuery);
}

function mainWindowQuery(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): string {
  return getStringFlag(ctx.args, "main-window", getStringFlag(ctx.args, "window", wechatUiProfile.mainWindow));
}

async function listWindows(queries: string[]): Promise<WindowSummary[]> {
  const byHandle = new Map<number, WindowSummary>();
  for (const query of queries) {
    const response = await desktopBridge<WindowSummary[]>("window.list", { query });
    if (response.ok && Array.isArray(response.data)) {
      for (const window of response.data) {
        byHandle.set(window.handle, window);
      }
    }
  }
  return [...byHandle.values()];
}

function point(name: keyof typeof wechatProfile.points): { x: number; y: number } {
  const resolved = wechatProfile.points[name];
  return { x: resolved.x, y: resolved.y };
}

function unverifiedHighRiskRefusal(command: string, plan: IntentPlan): CommandResult {
  return {
    ok: false,
    message: `${command} is a high-risk personal WeChat action and this profile cannot business-verify the target/content. Use the draft command, or pass --yes --force if you accept that limitation.`,
    data: {
      suggestedSafeCommand: command.includes("moments") ? "wechat moments-compose" : "wechat draft",
      intent: {
        app: plan.app,
        intent: plan.intent,
        description: plan.description,
        risk: plan.risk,
        limitations: plan.limitations,
        preconditions: plan.preconditions,
        steps: plan.steps,
        postconditions: plan.postconditions
      }
    },
    warnings: plan.limitations
  };
}
