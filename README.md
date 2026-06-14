# DesktopCLI

DesktopCLI is an adapter-first command line layer for Windows desktop applications.
It borrows the OpenCLI shape, but swaps browser/CDP actions for desktop actions:
window discovery, Microsoft UI Automation, keyboard input, clipboard paste, and
future OCR/image fallbacks.

The newer direction is an intent runtime, not raw click scripting:

```text
intent
  -> app profile
  -> preconditions
  -> observable steps
  -> assertions
  -> trace
```

```text
desktopcli <app> <command> [options]
desktopcli window list
desktopcli inspect --query "微信" --json
desktopcli wechat send --to "文件传输助手" --text "hello" --dry-run
desktopcli wechat send-file --to "文件传输助手" --file "C:\demo.txt" --dry-run
desktopcli capcut import --file "C:\Videos\raw.mp4" --dry-run
desktopcli capcut split --dry-run
desktopcli jianying export --out "C:\Videos\demo.mp4" --dry-run
```

## Current Status

This is a working MVP, not a universal desktop agent. The stable core is:

- Node/TypeScript CLI shell
- adapter registry inspired by OpenCLI
- output formats: `json`, `table`, `plain`, `md`, `csv`
- Python Windows bridge
- no-dependency baseline for top-level window listing and activation
- optional `pywinauto` support for UIA tree dumps and control clicks
- first adapters: `capcut`, `wechat`, `qq`, `jianying`, `notepad`
- workflow runner for adapter-specific JSON action sequences
- file-drop clipboard support for WeChat files/images and CapCut media import

Dangerous commands are dry-run by default. Pass `--yes` only when you are ready
to let the CLI type, click, launch, or send keys in the current desktop session.

## Install

```powershell
npm install
npm run build
npm link
```

Optional, but recommended for rich UIA inspection:

```powershell
python -m pip install pywinauto
```

## Commands

```powershell
desktopcli doctor --json
desktopcli app list
desktopcli window list
desktopcli window find --query 微信
desktopcli inspect --query 微信 --depth 3 --json
desktopcli type "hello" --dry-run
desktopcli type "hello" --yes
desktopcli hotkey ctrl+v --yes
```

App adapters:

```powershell
desktopcli wechat status
desktopcli wechat dump --json
desktopcli wechat search --query "文件传输助手" --dry-run
desktopcli wechat open-chat --to "文件传输助手" --dry-run
desktopcli wechat draft --to "文件传输助手" --text "hello" --dry-run
desktopcli wechat send --to "文件传输助手" --text "hello" --dry-run
desktopcli wechat send --to "文件传输助手" --text "hello" --yes --force
desktopcli wechat paste-file --to "文件传输助手" --file "C:\demo.txt" --dry-run
desktopcli wechat send-file --to "文件传输助手" --file "C:\demo.txt" --dry-run
desktopcli wechat send-image --to "文件传输助手" --file "C:\demo.png" --dry-run
desktopcli wechat moments-open --dry-run
desktopcli wechat moments-compose --text "晚安" --dry-run
desktopcli wechat moments-post --text "晚安" --dry-run
desktopcli wechat moments-post --text "晚安" --yes --force
desktopcli wechat copy-selected --dry-run

desktopcli qq status
desktopcli qq send --to "我的电脑" --text "hello" --dry-run

desktopcli capcut status
desktopcli capcut launch --dry-run
desktopcli capcut new-project --dry-run
desktopcli capcut import --file "C:\素材\a.mp4" --file "C:\素材\b.wav" --dry-run
desktopcli capcut paste-media --file "C:\素材\a.mp4" --dry-run
desktopcli capcut split --dry-run
desktopcli capcut add-text --text "片头字幕" --dry-run
desktopcli capcut captions --dry-run
desktopcli capcut audio --dry-run
desktopcli capcut filters --dry-run
desktopcli capcut transitions --dry-run
desktopcli capcut export --out "C:\输出\demo.mp4" --dry-run

desktopcli jianying status
desktopcli jianying import --dir "C:\素材" --dry-run
desktopcli jianying export --out "C:\输出\demo.mp4" --dry-run

desktopcli notepad open --dry-run
desktopcli notepad write "hello" --dry-run
```

## Architecture

```text
CLI entry
  -> registry
    -> root command or app adapter
      -> intent runtime
        -> app profile
        -> preconditions / assertions
        -> workflow executor
        -> desktop bridge
          -> Win32 window APIs
          -> pywinauto UIA tree and control actions
          -> clipboard, keyboard, hotkeys
          -> file-drop clipboard
          -> future OCR/image backends
```

Adapters expose deterministic commands, rather than asking a general agent to
freestyle a desktop session. This keeps workflows inspectable, testable, and
recoverable.

For opaque applications like WeChat PC, direct high-risk actions are blocked
unless you pass `--force` together with `--yes`. This is intentional: the current
Windows Qt profile can verify window identity and state transitions, but cannot
business-verify the target chat, message bubble, or remote delivery without OCR
or an official API. Prefer `wechat draft` and `wechat moments-compose` when you
want a safe assisted flow.

## Workflow Files

Every serious adapter also has a `run` command. A workflow file is a JSON array:

```json
[
  { "action": "activate", "window": "微信" },
  { "action": "hotkey", "window": "微信", "keys": "ctrl+f" },
  { "action": "type", "window": "微信", "text": "文件传输助手" },
  { "action": "hotkey", "window": "微信", "keys": "enter" }
]
```

Run it with:

```powershell
desktopcli wechat run --file workflow.json --dry-run
desktopcli capcut run --file workflow.json --yes
```

Supported workflow actions currently include `launch`, `activate`,
`wait-window`, `wait-window-gone`, `click`, `mouse-click`, `type`, `hotkey`,
`wait`, `files-to-clipboard`, `paste-files`, and `sleep`.

Window matching supports exact prefixes such as `title:微信`,
`title:朋友圈`, and `class:Qt51514QWindowIcon`, and compound selectors such as
`title:微信,class:Qt51514QWindowIcon`. Adapter workflows should prefer these
exact selectors over fuzzy text like `微信`, because browser tabs and other
windows can contain the same words.

## Roadmap

- plugin directory similar to `~/.opencli/clis`
- adapter manifest schema and command DSL
- OCR backend for applications that hide their UIA tree
- screenshot and UIA trace bundles on failure
- stronger WeChat/QQ contact search flows and selectable message readers
- Jianying draft-file integration for less brittle edit/export automation
