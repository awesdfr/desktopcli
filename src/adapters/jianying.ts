import { getStringFlag, getStringFlags } from "../core/args.js";
import type { AdapterDefinition, CommandDefinition } from "../core/types.js";
import { readWorkflowFile, runWorkflow, type WorkflowStep } from "../core/workflow.js";
import { desktopBridge } from "../drivers/desktopBridge.js";
import type { WindowSummary } from "../drivers/desktopBridge.js";

interface VideoEditorConfig {
  name: "capcut" | "jianying";
  displayName: string;
  description: string;
  windowQueries: string[];
  defaultLaunchCommand: string;
}

const capcutLabels = {
  newProject: ["New project", "Start creating", "Create project", "新建项目", "开始创作"],
  import: ["Import", "Media", "导入", "媒体"],
  export: ["Export", "导出"],
  text: ["Text", "文本"],
  addText: ["Add text", "Default text", "添加文本", "默认文本"],
  captions: ["Auto captions", "Captions", "智能字幕", "识别字幕", "字幕"],
  audio: ["Audio", "音频"],
  stickers: ["Stickers", "贴纸"],
  effects: ["Effects", "特效"],
  transitions: ["Transitions", "转场"],
  filters: ["Filters", "滤镜"],
  adjustment: ["Adjustment", "Adjust", "调节"],
  templates: ["Templates", "模板"],
  speed: ["Speed", "变速"],
  animation: ["Animation", "动画"],
  mask: ["Mask", "蒙版"],
  chromaKey: ["Chroma key", "抠像", "色度抠图"]
};

export function createCapcutAdapter(): AdapterDefinition {
  return createVideoEditorAdapter({
    name: "capcut",
    displayName: "CapCut",
    description: "CapCut desktop CLI for project, media, timeline, text, audio, effects, and export workflows.",
    windowQueries: ["CapCut", "剪映"],
    defaultLaunchCommand: "CapCut.exe"
  });
}

export function createJianyingAdapter(): AdapterDefinition {
  return createVideoEditorAdapter({
    name: "jianying",
    displayName: "Jianying",
    description: "Jianying/剪映 desktop CLI sharing the CapCut workflow surface.",
    windowQueries: ["剪映", "CapCut"],
    defaultLaunchCommand: "JianyingPro.exe"
  });
}

function createVideoEditorAdapter(config: VideoEditorConfig): AdapterDefinition {
  return {
    name: config.name,
    displayName: config.displayName,
    description: config.description,
    commands: createVideoEditorCommands(config)
  };
}

function createVideoEditorCommands(config: VideoEditorConfig): CommandDefinition[] {
  return [
    {
      name: "status",
      summary: "Find visible CapCut/Jianying windows.",
      strategy: "WIN32",
      async run() {
        const windows = await listWindows(config.windowQueries);
        return { ok: true, data: windows };
      }
    },
    {
      name: "launch",
      summary: "Launch CapCut/Jianying.",
      usage: "[--command <exe-or-command>] [--yes]",
      strategy: "LOCAL",
      dangerous: true,
      async run(ctx) {
        const command = getStringFlag(ctx.args, "command", config.defaultLaunchCommand);
        return runWorkflow(ctx, [{ action: "launch", command }]);
      }
    },
    {
      name: "focus",
      summary: "Bring the editor window to the foreground.",
      usage: "[--window <title>]",
      strategy: "WIN32",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [{ action: "activate", window: windowQuery(ctx, config) }]);
      }
    },
    {
      name: "dump",
      summary: "Dump the editor UIA/window structure.",
      usage: "[--window <title>] [--depth 3] [--limit 250]",
      strategy: "UIA",
      async run(ctx) {
        return desktopBridge("inspect", {
          query: windowQuery(ctx, config),
          depth: Number(getStringFlag(ctx.args, "depth", "3")),
          limit: Number(getStringFlag(ctx.args, "limit", "250"))
        });
      }
    },
    {
      name: "run",
      summary: "Run a JSON workflow file or inline JSON workflow.",
      usage: "--file workflow.json | --steps '[...]' [--yes]",
      strategy: ["UIA", "INPUT", "LOCAL"],
      dangerous: true,
      async run(ctx) {
        const file = getStringFlag(ctx.args, "file");
        const rawSteps = getStringFlag(ctx.args, "steps");
        if (!file && !rawSteps) {
          return { ok: false, message: `${config.name} run requires --file or --steps` };
        }
        const steps = file ? await readWorkflowFile(file) : JSON.parse(rawSteps) as WorkflowStep[];
        return runWorkflow(ctx, steps);
      }
    },
    primitiveClickCommand(config),
    primitiveHotkeyCommand(config),
    primitiveTypeCommand(config),
    {
      name: "new-project",
      summary: "Open the new-project/start-creating entry.",
      strategy: "UIA",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.newProject }
        ]);
      }
    },
    {
      name: "open-project",
      summary: "Open a project file/folder through the OS shell.",
      usage: "--path <project-path> [--yes]",
      strategy: "LOCAL",
      dangerous: true,
      async run(ctx) {
        const projectPath = getStringFlag(ctx.args, "path", ctx.args.positional[0] || "");
        if (!projectPath) {
          return { ok: false, message: `${config.name} open-project requires --path` };
        }
        return runWorkflow(ctx, [{ action: "launch", command: projectPath }]);
      }
    },
    {
      name: "import",
      summary: "Import one or more media files through the import button and file dialog.",
      usage: "--file <path> [--file <path>...] | --dir <folder> [--yes]",
      strategy: ["UIA", "INPUT"],
      dangerous: true,
      async run(ctx) {
        const files = mediaPaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: `${config.name} import requires --file, repeated --file, or --dir` };
        }
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.import },
          { action: "sleep", ms: 500 },
          { action: "files-to-clipboard", files },
          { action: "hotkey", keys: "ctrl+v" },
          { action: "hotkey", keys: "enter" }
        ]);
      }
    },
    {
      name: "paste-media",
      summary: "Paste media files directly into the editor window.",
      usage: "--file <path> [--file <path>...] [--yes]",
      strategy: "INPUT",
      dangerous: true,
      async run(ctx) {
        const files = mediaPaths(ctx);
        if (files.length === 0) {
          return { ok: false, message: `${config.name} paste-media requires --file` };
        }
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "paste-files", window: windowQuery(ctx, config), files }
        ]);
      }
    },
    {
      name: "export",
      summary: "Open export, optionally type an output path/name, then wait for completion text.",
      usage: "[--out <file-or-folder>] [--timeout 3600] [--yes]",
      strategy: ["UIA", "INPUT"],
      dangerous: true,
      async run(ctx) {
        const out = getStringFlag(ctx.args, "out", ctx.args.positional[0] || "");
        const timeout = Number(getStringFlag(ctx.args, "timeout", "3600"));
        const steps: WorkflowStep[] = [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.export }
        ];
        if (out) {
          steps.push({ action: "type", text: out });
        }
        steps.push({ action: "click", window: windowQuery(ctx, config), texts: capcutLabels.export });
        steps.push({ action: "wait", window: windowQuery(ctx, config), text: "导出完成", timeout });
        return runWorkflow(ctx, steps);
      }
    },
    hotkeyWorkflowCommand(config, "split", "Split the selected clip at the playhead.", "ctrl+b"),
    hotkeyWorkflowCommand(config, "delete", "Delete the selected clip or item.", "delete"),
    hotkeyWorkflowCommand(config, "play", "Toggle playback.", "space"),
    hotkeyWorkflowCommand(config, "pause", "Toggle playback.", "space"),
    hotkeyWorkflowCommand(config, "undo", "Undo the last edit.", "ctrl+z"),
    hotkeyWorkflowCommand(config, "redo", "Redo the last edit.", "ctrl+y"),
    hotkeyWorkflowCommand(config, "save", "Save the current project.", "ctrl+s"),
    hotkeyWorkflowCommand(config, "copy", "Copy selected timeline item.", "ctrl+c"),
    hotkeyWorkflowCommand(config, "paste", "Paste clipboard content into the timeline/editor.", "ctrl+v"),
    hotkeyWorkflowCommand(config, "zoom-in", "Zoom timeline in.", "ctrl+="),
    hotkeyWorkflowCommand(config, "zoom-out", "Zoom timeline out.", "ctrl+-"),
    tabCommand(config, "media", "Open the media panel.", capcutLabels.import),
    tabCommand(config, "audio", "Open the audio panel.", capcutLabels.audio),
    tabCommand(config, "text", "Open the text panel.", capcutLabels.text),
    tabCommand(config, "stickers", "Open the stickers panel.", capcutLabels.stickers),
    tabCommand(config, "effects", "Open the effects panel.", capcutLabels.effects),
    tabCommand(config, "transitions", "Open the transitions panel.", capcutLabels.transitions),
    tabCommand(config, "filters", "Open the filters panel.", capcutLabels.filters),
    tabCommand(config, "adjustment", "Open the adjustment panel.", capcutLabels.adjustment),
    tabCommand(config, "templates", "Open the templates panel.", capcutLabels.templates),
    tabCommand(config, "speed", "Open the speed controls.", capcutLabels.speed),
    tabCommand(config, "animation", "Open animation controls.", capcutLabels.animation),
    tabCommand(config, "mask", "Open mask controls.", capcutLabels.mask),
    tabCommand(config, "chroma-key", "Open chroma-key controls.", capcutLabels.chromaKey),
    {
      name: "add-text",
      summary: "Create a text layer and type text.",
      usage: "--text <text> [--yes]",
      strategy: ["UIA", "INPUT"],
      dangerous: true,
      async run(ctx) {
        const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
        if (!text) {
          return { ok: false, message: `${config.name} add-text requires --text` };
        }
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.text },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.addText },
          { action: "type", window: windowQuery(ctx, config), text }
        ]);
      }
    },
    {
      name: "captions",
      summary: "Open auto-caption/subtitle controls.",
      strategy: "UIA",
      dangerous: true,
      async run(ctx) {
        return runWorkflow(ctx, [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.text },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.captions }
        ]);
      }
    },
    {
      name: "add-audio",
      summary: "Open audio panel and optionally import audio files.",
      usage: "[--file <audio-path>] [--yes]",
      strategy: ["UIA", "INPUT"],
      dangerous: true,
      async run(ctx) {
        const files = mediaPaths(ctx);
        const steps: WorkflowStep[] = [
          { action: "activate", window: windowQuery(ctx, config) },
          { action: "click", window: windowQuery(ctx, config), texts: capcutLabels.audio }
        ];
        if (files.length > 0) {
          steps.push({ action: "click", window: windowQuery(ctx, config), texts: capcutLabels.import });
          steps.push({ action: "sleep", ms: 500 });
          steps.push({ action: "files-to-clipboard", files });
          steps.push({ action: "hotkey", keys: "ctrl+v" });
          steps.push({ action: "hotkey", keys: "enter" });
        }
        return runWorkflow(ctx, steps);
      }
    }
  ];
}

function primitiveClickCommand(config: VideoEditorConfig): CommandDefinition {
  return {
    name: "click",
    summary: "Click a visible control by text/name.",
    usage: "--text <label> [--window <title>] [--yes]",
    strategy: "UIA",
    dangerous: true,
    async run(ctx) {
      const text = getStringFlag(ctx.args, "text", ctx.args.positional[0] || "");
      if (!text) {
        return { ok: false, message: `${config.name} click requires --text` };
      }
      return runWorkflow(ctx, [
        { action: "click", window: windowQuery(ctx, config), text }
      ]);
    }
  };
}

function primitiveHotkeyCommand(config: VideoEditorConfig): CommandDefinition {
  return {
    name: "hotkey",
    summary: "Send a hotkey to the editor window.",
    usage: "ctrl+s [--yes]",
    strategy: "INPUT",
    dangerous: true,
    async run(ctx) {
      const keys = getStringFlag(ctx.args, "keys", ctx.args.positional[0] || "");
      if (!keys) {
        return { ok: false, message: `${config.name} hotkey requires keys` };
      }
      return runWorkflow(ctx, [
        { action: "hotkey", window: windowQuery(ctx, config), keys }
      ]);
    }
  };
}

function primitiveTypeCommand(config: VideoEditorConfig): CommandDefinition {
  return {
    name: "type",
    summary: "Paste/type text into the editor window.",
    usage: "<text> [--yes]",
    strategy: "INPUT",
    dangerous: true,
    async run(ctx) {
      const text = getStringFlag(ctx.args, "text", ctx.args.positional.join(" "));
      if (!text) {
        return { ok: false, message: `${config.name} type requires text` };
      }
      return runWorkflow(ctx, [
        { action: "type", window: windowQuery(ctx, config), text }
      ]);
    }
  };
}

function hotkeyWorkflowCommand(config: VideoEditorConfig, name: string, summary: string, defaultKeys: string): CommandDefinition {
  return {
    name,
    summary,
    usage: `[--keys ${defaultKeys}] [--yes]`,
    strategy: "INPUT",
    dangerous: true,
    async run(ctx) {
      return runWorkflow(ctx, [
        { action: "hotkey", window: windowQuery(ctx, config), keys: getStringFlag(ctx.args, "keys", defaultKeys) }
      ]);
    }
  };
}

function tabCommand(config: VideoEditorConfig, name: string, summary: string, labels: string[]): CommandDefinition {
  return {
    name,
    summary,
    strategy: "UIA",
    dangerous: true,
    async run(ctx) {
      return runWorkflow(ctx, [
        { action: "activate", window: windowQuery(ctx, config) },
        { action: "click", window: windowQuery(ctx, config), texts: labels }
      ]);
    }
  };
}

function mediaPaths(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }): string[] {
  const files = getStringFlags(ctx.args, "file");
  const fileList = getStringFlag(ctx.args, "files");
  const dir = getStringFlag(ctx.args, "dir", getStringFlag(ctx.args, "folder"));
  const positional = ctx.args.positional;
  return [
    ...files,
    ...splitPathList(fileList),
    ...(dir ? [dir] : []),
    ...positional
  ].filter(Boolean);
}

function splitPathList(value: string): string[] {
  if (!value) {
    return [];
  }
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

function windowQuery(ctx: { args: { positional: string[]; flags: Record<string, string | boolean | string[]> } }, config: VideoEditorConfig): string {
  return getStringFlag(ctx.args, "window", config.windowQueries[0] ?? config.displayName);
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
