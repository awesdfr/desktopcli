# DesktopCLI

DesktopCLI is an adapter-first command line layer for Windows desktop applications.
It borrows the OpenCLI shape, but swaps browser/CDP actions for desktop actions:
window discovery, Microsoft UI Automation, keyboard input, clipboard paste, and
future OCR/image fallbacks.

```text
desktopcli <app> <command> [options]
desktopcli window list
desktopcli inspect --query "微信" --json
desktopcli wechat send --to "文件传输助手" --text "hello" --dry-run
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
- first adapters: `wechat`, `qq`, `jianying`, `notepad`

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
desktopcli wechat send --to "文件传输助手" --text "hello" --dry-run

desktopcli qq status
desktopcli qq send --to "我的电脑" --text "hello" --dry-run

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
      -> desktop bridge
        -> Win32 window APIs
        -> pywinauto UIA tree and control actions
        -> clipboard, keyboard, hotkeys
        -> future OCR/image backends
```

Adapters expose deterministic commands, rather than asking a general agent to
freestyle a desktop session. This keeps workflows inspectable, testable, and
recoverable.

## Roadmap

- plugin directory similar to `~/.opencli/clis`
- adapter manifest schema and command DSL
- OCR backend for applications that hide their UIA tree
- screenshot and UIA trace bundles on failure
- stronger WeChat/QQ contact search flows
- Jianying draft-file integration for less brittle edit/export automation
