import type { AdapterDefinition } from "../core/types.js";
import { createJianyingAdapter } from "./jianying.js";
import { createNotepadAdapter } from "./notepad.js";
import { createQqAdapter } from "./qq.js";
import { createWechatAdapter } from "./wechat.js";

export function createAdapters(): AdapterDefinition[] {
  return [
    createWechatAdapter(),
    createQqAdapter(),
    createJianyingAdapter(),
    createNotepadAdapter()
  ];
}
