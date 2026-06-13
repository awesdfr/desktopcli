import type { AdapterDefinition } from "../core/types.js";
import { createCapcutAdapter } from "./capcut.js";
import { createJianyingAdapter } from "./jianying.js";
import { createNotepadAdapter } from "./notepad.js";
import { createQqAdapter } from "./qq.js";
import { createWechatAdapter } from "./wechat.js";

export function createAdapters(): AdapterDefinition[] {
  return [
    createCapcutAdapter(),
    createWechatAdapter(),
    createQqAdapter(),
    createJianyingAdapter(),
    createNotepadAdapter()
  ];
}
