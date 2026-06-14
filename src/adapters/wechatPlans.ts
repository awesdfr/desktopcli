import type { IntentPlan, RuntimeStep } from "../runtime/types.js";
import { pointStep, selector, windowGone, windowPresent, windowRect } from "../runtime/selectors.js";
import { wechatProfile } from "./wechatProfile.js";

const limitations = [
  "WeChat PC does not expose reliable UIA text for chat title, message bubbles, or Moments composer content.",
  "This plan verifies window identity and workflow state, but not remote delivery or final social-post visibility."
];

export function buildWechatSendIntent(params: { to?: string; text: string; sendKeys?: string; publish: boolean }): IntentPlan {
  const steps: RuntimeStep[] = [];

  if (params.to) {
    steps.push(...searchAndOpenChatSteps(params.to));
  } else {
    steps.push({ action: "activate", window: selector(wechatProfile, "mainWindow") });
  }

  steps.push({ action: "sleep", ms: 400 });
  steps.push(pointStep(wechatProfile, "messageInput"));
  steps.push({ action: "type", window: selector(wechatProfile, "mainWindow"), text: params.text });
  if (params.publish) {
    steps.push({ action: "hotkey", window: selector(wechatProfile, "mainWindow"), keys: params.sendKeys ?? "enter" });
    steps.push({ action: "sleep", ms: 300 });
  }

  return {
    app: "wechat",
    intent: params.publish ? "sendMessage" : "draftMessage",
    description: params.publish ? "Send a message to a WeChat chat." : "Prepare a WeChat message draft.",
    risk: params.publish ? "high" : "medium",
    profile: wechatProfile,
    preconditions: [
      windowPresent(wechatProfile, "mainWindow", 5),
      windowRect(wechatProfile, "mainWindow", 480, 360)
    ],
    steps,
    postconditions: [
      windowPresent(wechatProfile, "mainWindow", 5),
      windowRect(wechatProfile, "mainWindow", 480, 360)
    ],
    limitations
  };
}

export function buildWechatMomentsIntent(params: { text?: string; files: string[]; publish: boolean }): IntentPlan {
  const steps: RuntimeStep[] = [
    ...openMomentsSteps(),
    pointStep(wechatProfile, "momentsCamera"),
    { action: "sleep", ms: 500 }
  ];

  if (params.files.length > 0) {
    steps.push({ action: "files-to-clipboard", files: params.files });
    steps.push({ action: "hotkey", keys: "ctrl+v" });
    steps.push({ action: "hotkey", keys: "enter" });
    steps.push({ action: "sleep", ms: 500 });
  } else {
    steps.push({ action: "hotkey", keys: "esc" });
    steps.push({ action: "assert", assertion: windowGone(wechatProfile, "filePickerWindow", 2) });
    steps.push({ action: "sleep", ms: 250 });
  }

  if (params.text) {
    steps.push(pointStep(wechatProfile, "momentsComposerText"));
    steps.push({ action: "type", text: params.text });
  }

  if (params.publish) {
    steps.push(pointStep(wechatProfile, "momentsPublish"));
    steps.push({ action: "sleep", ms: 500 });
  }

  return {
    app: "wechat",
    intent: params.publish ? "postMoment" : "draftMoment",
    description: params.publish ? "Publish a WeChat Moments post." : "Prepare a WeChat Moments draft.",
    risk: params.publish ? "high" : "medium",
    profile: wechatProfile,
    preconditions: [
      windowPresent(wechatProfile, "mainWindow", 5),
      windowRect(wechatProfile, "mainWindow", 480, 360)
    ],
    steps,
    postconditions: [
      params.publish ? windowPresent(wechatProfile, "momentsWindow", 5) : windowPresent(wechatProfile, "momentsWindow", 5)
    ],
    limitations
  };
}

export function openMomentsSteps(): RuntimeStep[] {
  return [
    { action: "activate", window: selector(wechatProfile, "mainWindow") },
    pointStep(wechatProfile, "sidebarMoments"),
    { action: "assert", assertion: windowPresent(wechatProfile, "momentsWindow", 5) },
    { action: "activate", window: selector(wechatProfile, "momentsWindow") },
    { action: "assert", assertion: windowRect(wechatProfile, "momentsWindow", 320, 320) }
  ];
}

export function searchAndOpenChatSteps(query: string): RuntimeStep[] {
  return [
    { action: "activate", window: selector(wechatProfile, "mainWindow") },
    pointStep(wechatProfile, "searchBox"),
    { action: "hotkey", window: selector(wechatProfile, "mainWindow"), keys: "ctrl+a" },
    { action: "type", window: selector(wechatProfile, "mainWindow"), text: query },
    { action: "sleep", ms: 600 },
    { action: "hotkey", window: selector(wechatProfile, "mainWindow"), keys: "enter" },
    { action: "sleep", ms: 500 }
  ];
}
