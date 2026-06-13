#!/usr/bin/env python3
"""Small Windows desktop automation bridge for DesktopCLI.

The bridge intentionally has a no-dependency baseline: window listing and
clipboard/hotkey input work through ctypes. Rich UIA inspection and clicking use
pywinauto when it is available.
"""

from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import time
from ctypes import wintypes
from typing import Any, Callable

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


try:
    from pywinauto import Desktop
    from pywinauto.keyboard import send_keys
except Exception:  # pragma: no cover - depends on local machine packages
    Desktop = None
    send_keys = None


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)


EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user32.EnumWindows.argtypes = [EnumWindowsProc, wintypes.LPARAM]
user32.EnumWindows.restype = wintypes.BOOL
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]

SW_RESTORE = 9

VK_CONTROL = 0x11
VK_MENU = 0x12
VK_SHIFT = 0x10
VK_LWIN = 0x5B
VK_RETURN = 0x0D
VK_TAB = 0x09
VK_ESCAPE = 0x1B
VK_SPACE = 0x20
VK_BACK = 0x08
VK_DELETE = 0x2E
VK_LEFT = 0x25
VK_UP = 0x26
VK_RIGHT = 0x27
VK_DOWN = 0x28

VK_CODES = {
    "ctrl": VK_CONTROL,
    "control": VK_CONTROL,
    "alt": VK_MENU,
    "shift": VK_SHIFT,
    "win": VK_LWIN,
    "cmd": VK_LWIN,
    "enter": VK_RETURN,
    "return": VK_RETURN,
    "tab": VK_TAB,
    "esc": VK_ESCAPE,
    "escape": VK_ESCAPE,
    "space": VK_SPACE,
    "backspace": VK_BACK,
    "delete": VK_DELETE,
    "left": VK_LEFT,
    "up": VK_UP,
    "right": VK_RIGHT,
    "down": VK_DOWN,
}


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        return emit(False, message=f"invalid JSON payload: {exc}")

    actions: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
        "dependencies": dependencies,
        "window.list": window_list,
        "window.find": window_find,
        "window.activate": window_activate,
        "inspect": inspect,
        "click": click,
        "type": type_text,
        "hotkey": hotkey,
        "wait.text": wait_text,
        "app.launch": app_launch,
    }

    handler = actions.get(action)
    if handler is None:
        return emit(False, message=f"unknown bridge action: {action}")

    try:
        result = handler(payload)
        return emit(True, data=result.get("data"), message=result.get("message"), warnings=result.get("warnings"))
    except Exception as exc:  # pragma: no cover - defensive CLI boundary
        return emit(False, message=str(exc))


def emit(ok: bool, data: Any = None, message: str | None = None, warnings: list[str] | None = None) -> int:
    print(json.dumps({"ok": ok, "data": data, "message": message, "warnings": warnings}, ensure_ascii=False))
    return 0 if ok else 1


def dependencies(_: dict[str, Any]) -> dict[str, Any]:
    return {
        "data": {
            "platform": sys.platform,
            "python": sys.version.split()[0],
            "pywinauto": Desktop is not None,
            "uia": Desktop is not None,
            "baseline": ["window.list", "window.activate", "type", "hotkey", "app.launch"],
        }
    }


def window_list(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query") or "").lower()
    windows = enum_windows()
    if query:
        windows = [
            window
            for window in windows
            if query in window["title"].lower() or query in window["className"].lower()
        ]
    return {"data": windows}


def window_find(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query") or "").lower()
    if not query:
        raise ValueError("window.find requires query")

    for window in enum_windows():
        if query in window["title"].lower() or query in window["className"].lower():
            return {"data": window}

    raise ValueError(f"no window matched: {query}")


def window_activate(payload: dict[str, Any]) -> dict[str, Any]:
    handle = payload.get("handle")
    query = payload.get("query")

    if handle is None:
        if not query:
            raise ValueError("window.activate requires handle or query")
        handle = window_find({"query": query})["data"]["handle"]

    hwnd = wintypes.HWND(int(handle))
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    time.sleep(float(payload.get("delay") or 0.2))
    return {"data": {"handle": int(handle), "activated": True}}


def inspect(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query") or "")
    depth = int(payload.get("depth") or 3)
    limit = int(payload.get("limit") or 250)

    if Desktop is None:
        windows = window_list({"query": query})["data"]
        return {
            "data": {
                "dependency": "pywinauto is not installed",
                "windows": windows[:limit],
            },
            "warnings": ["Install pywinauto for UIA control-tree inspection: pip install pywinauto"],
        }

    window = find_uia_window(query)
    node = serialize_element(window.element_info, depth=depth, limit=limit)
    return {"data": node}


def click(payload: dict[str, Any]) -> dict[str, Any]:
    if Desktop is None:
        raise ValueError("click by name requires pywinauto: pip install pywinauto")

    query = str(payload.get("window") or payload.get("query") or "")
    text = str(payload.get("text") or payload.get("name") or "")
    if not text:
        raise ValueError("click requires --text or --name")

    window = find_uia_window(query)
    candidates = window.descendants()
    text_lower = text.lower()
    for candidate in candidates:
        info = candidate.element_info
        name = (info.name or "").lower()
        auto_id = (info.automation_id or "").lower()
        if text_lower in name or text_lower in auto_id:
            candidate.click_input()
            return {"data": {"clicked": info.name or info.automation_id, "controlType": info.control_type}}

    raise ValueError(f"no control matched: {text}")


def type_text(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "")
    mode = str(payload.get("mode") or "paste")
    target = payload.get("window")

    if target:
        window_activate({"query": target})

    if mode == "keys" and send_keys is not None:
        send_keys(text, with_spaces=True, pause=0.01)
        return {"data": {"typed": len(text), "mode": "keys"}}

    set_clipboard_text(text)
    send_hotkey(["ctrl", "v"])
    return {"data": {"typed": len(text), "mode": "clipboard-paste"}}


def hotkey(payload: dict[str, Any]) -> dict[str, Any]:
    keys = payload.get("keys")
    target = payload.get("window")
    if isinstance(keys, str):
        parts = [part.strip() for part in keys.replace("+", ",").split(",") if part.strip()]
    elif isinstance(keys, list):
        parts = [str(part) for part in keys]
    else:
        raise ValueError("hotkey requires keys")

    if target:
        window_activate({"query": target})

    if send_keys is not None:
        chord = "+".join(to_pywinauto_key(part) for part in parts)
        send_keys(chord)
    else:
        send_hotkey(parts)

    return {"data": {"keys": parts}}


def wait_text(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "").lower()
    query = str(payload.get("window") or payload.get("query") or "")
    timeout = float(payload.get("timeout") or 10)
    interval = float(payload.get("interval") or 0.5)
    deadline = time.time() + timeout

    while time.time() < deadline:
        if Desktop is not None:
            try:
                window = find_uia_window(query)
                dump = json.dumps(serialize_element(window.element_info, depth=4, limit=500), ensure_ascii=False).lower()
                if text in dump:
                    return {"data": {"matched": True, "text": text}}
            except Exception:
                pass
        else:
            matches = window_list({"query": text})["data"]
            if matches:
                return {"data": {"matched": True, "text": text, "windows": matches}}
        time.sleep(interval)

    raise ValueError(f"timed out waiting for text: {text}")


def app_launch(payload: dict[str, Any]) -> dict[str, Any]:
    command = payload.get("command")
    if not command:
        raise ValueError("app.launch requires command")
    if isinstance(command, list):
        process = subprocess.Popen([str(part) for part in command], close_fds=True)
    else:
        process = subprocess.Popen(str(command), shell=True, close_fds=True)
    return {"data": {"pid": process.pid}}


def enum_windows() -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []

    def callback(hwnd: int, _: int) -> bool:
        title_length = user32.GetWindowTextLengthW(hwnd)
        title_buffer = ctypes.create_unicode_buffer(title_length + 1)
        user32.GetWindowTextW(hwnd, title_buffer, title_length + 1)
        class_buffer = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buffer, 256)
        process_id = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(process_id))
        visible = bool(user32.IsWindowVisible(hwnd))
        title = title_buffer.value
        if visible and title:
            windows.append(
                {
                    "handle": int(hwnd),
                    "title": title,
                    "className": class_buffer.value,
                    "processId": int(process_id.value),
                    "visible": visible,
                }
            )
        return True

    user32.EnumWindows(EnumWindowsProc(callback), 0)
    return windows


def find_uia_window(query: str):
    if Desktop is None:
        raise ValueError("pywinauto is not installed")

    desktop = Desktop(backend="uia")
    if query:
        query_lower = query.lower()
        for window in desktop.windows():
            title = (window.window_text() or "").lower()
            class_name = (window.element_info.class_name or "").lower()
            if query_lower in title or query_lower in class_name:
                return window
        raise ValueError(f"no UIA window matched: {query}")

    active = desktop.get_active()
    if active is None:
        raise ValueError("no active UIA window found")
    return active


def serialize_element(element: Any, depth: int, limit: int, count: list[int] | None = None) -> dict[str, Any]:
    if count is None:
        count = [0]
    count[0] += 1

    node = {
        "name": element.name or "",
        "controlType": element.control_type or "",
        "automationId": element.automation_id or "",
        "className": element.class_name or "",
        "rectangle": str(element.rectangle or ""),
    }

    if depth > 0 and count[0] < limit:
        children = []
        for child in element.children():
            if count[0] >= limit:
                break
            children.append(serialize_element(child, depth - 1, limit, count))
        if children:
            node["children"] = children

    return node


def set_clipboard_text(text: str) -> None:
    # PowerShell Set-Clipboard handles Unicode and avoids fragile Win32 memory code.
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
        input=text,
        text=True,
        capture_output=True,
        encoding="utf-8",
        check=False,
    )
    if completed.returncode != 0:
        raise ValueError(completed.stderr.strip() or "failed to set clipboard")


def send_hotkey(keys: list[str]) -> None:
    # Use a tiny PowerShell/.NET SendKeys fallback when pywinauto is unavailable.
    expression = "".join(to_sendkeys_key(key) for key in keys)
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])",
            expression,
        ],
        check=True,
    )


def to_sendkeys_key(key: str) -> str:
    normalized = key.lower()
    if normalized in ("ctrl", "control"):
        return "^"
    if normalized == "alt":
        return "%"
    if normalized == "shift":
        return "+"
    special = {
        "enter": "{ENTER}",
        "return": "{ENTER}",
        "tab": "{TAB}",
        "esc": "{ESC}",
        "escape": "{ESC}",
        "space": " ",
        "backspace": "{BACKSPACE}",
        "delete": "{DELETE}",
        "left": "{LEFT}",
        "up": "{UP}",
        "right": "{RIGHT}",
        "down": "{DOWN}",
    }
    if normalized in special:
        return special[normalized]
    return key


def to_pywinauto_key(key: str) -> str:
    normalized = key.lower()
    special = {
        "ctrl": "^",
        "control": "^",
        "alt": "%",
        "shift": "+",
        "enter": "{ENTER}",
        "return": "{ENTER}",
        "tab": "{TAB}",
        "esc": "{ESC}",
        "escape": "{ESC}",
        "space": "{SPACE}",
        "backspace": "{BACKSPACE}",
        "delete": "{DELETE}",
        "left": "{LEFT}",
        "up": "{UP}",
        "right": "{RIGHT}",
        "down": "{DOWN}",
    }
    return special.get(normalized, key)


if __name__ == "__main__":
    if os.name != "nt":
        emit(False, message="DesktopCLI bridge currently supports Windows only")
        sys.exit(1)
    sys.exit(main())
