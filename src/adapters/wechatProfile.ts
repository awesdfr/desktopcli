import type { AppProfile } from "../runtime/types.js";

export const wechatProfile: AppProfile = {
  id: "wechat.windows.qt",
  displayName: "WeChat Windows",
  version: "windows-4.x-qt-profile",
  selectors: {
    mainWindow: {
      name: "mainWindow",
      query: "title:微信,class:Qt51514QWindowIcon",
      description: "The real WeChat Qt main window, not browser pages with the same title."
    },
    momentsWindow: {
      name: "momentsWindow",
      query: "title:朋友圈,class:Qt51514QWindowIcon",
      description: "The separate WeChat Moments window."
    },
    filePickerWindow: {
      name: "filePickerWindow",
      query: "title:选择文件",
      description: "Windows file picker opened from the Moments camera button."
    }
  },
  points: {
    searchBox: {
      name: "searchBox",
      window: "mainWindow",
      x: 122,
      y: 56,
      description: "Search box in the left chat list pane."
    },
    messageInput: {
      name: "messageInput",
      window: "mainWindow",
      x: 360,
      y: 588,
      description: "Message input area in the current chat."
    },
    sidebarMoments: {
      name: "sidebarMoments",
      window: "mainWindow",
      x: 38,
      y: 256,
      description: "Moments icon in the left sidebar."
    },
    momentsCamera: {
      name: "momentsCamera",
      window: "momentsWindow",
      x: 74,
      y: 23,
      description: "Camera button at the top-left of the Moments window."
    },
    momentsComposerText: {
      name: "momentsComposerText",
      window: "momentsWindow",
      x: 156,
      y: 116,
      description: "Text entry region in the Moments composer."
    },
    momentsPublish: {
      name: "momentsPublish",
      window: "momentsWindow",
      x: 424,
      y: 425,
      description: "Publish button in the Moments composer."
    }
  },
  capabilities: {
    windowIdentity: true,
    clickByCoordinate: true,
    clipboardTextInput: true,
    fileClipboard: true,
    uiaChatTitleRead: false,
    uiaMessageRead: false,
    ocrVerification: false,
    businessDeliveryVerification: false
  },
  notes: [
    "WeChat PC uses a mostly opaque Qt UI tree. This profile can verify window identity and state transitions, but cannot prove message delivery without OCR or an external API.",
    "High-risk direct sends should be treated as unverified unless an observation backend confirms the target chat or composer contents."
  ]
};
