import type { Dict } from "../../types";

/** 本命名空间的中文翻译。 */
export const voice: Dict = {
  // ---- 语音模式（VoiceMode）
  "voice.mode.dialogLabel": "语音模式",
  "voice.mode.badgeProcessing": "正在处理",
  "voice.mode.badgeReading": "正在朗读",
  "voice.mode.badgeOnline": "在线",
  "voice.mode.stateIdle": "已停止",
  "voice.mode.stateListening": "正在聆听…",
  "voice.mode.stateThinking": "正在思考…",
  "voice.mode.stateSpeaking": "正在说话…",
  "voice.mode.stateError": "错误",
  "voice.mode.hintIdle": "点击麦克风继续对话。",
  "voice.mode.hintListening": "请自然说话，FlowGpt 听完后会立即回答。",
  "voice.mode.hintThinking": "FlowGpt 正在处理你的问题。",
  "voice.mode.hintSpeaking": "可以插话打断，继续追问。",
  "voice.mode.hintError": "请检查麦克风，或前往“设置 → 语音”检查配置。",
  "voice.mode.mutedState": "麦克风已关闭",
  "voice.mode.mutedHint": "点击麦克风或按空格键继续说话。",
  "voice.mode.mute": "关闭麦克风",
  "voice.mode.unmute": "打开麦克风",
  "voice.mode.muteTitle": "关闭麦克风（空格）",
  "voice.mode.unmuteTitle": "打开麦克风（空格）",
  "voice.mode.stopReading": "停止朗读",
  "voice.mode.stopReadingTitle": "停止朗读回答",
  "voice.mode.waiting": "正在等待回答…",
  "voice.mode.exit": "退出",
  "voice.mode.exitTitle": "退出语音模式（Esc）",
  "voice.mode.suggestionRole": "提示",
  "voice.mode.suggestionText": "试着说：“你好，你能帮我做什么？”",
  "voice.mode.roleUser": "你",
  "voice.mode.roleAssistant": "FlowGpt",

  // ---- 引擎信息行
  "voice.engine.label": "识别：{kind} · 朗读：{voice}",
  "voice.engine.browser": "浏览器",
  "voice.engine.providerFallback": "服务商",
  "voice.engine.defaultVoice": "默认",
  "voice.engine.browserDefaultVoice": "浏览器默认语音",

  // ---- 浏览器提示
  "voice.browser.unsupportedTitle": "此浏览器不支持语音识别。",
  "voice.browser.unsupportedBody": "请使用 Microsoft Edge 或 Google Chrome，或前往“设置 → 语音”选择免费的 STT 服务商（Gemini、Groq）——这样在任何现代浏览器上都能使用语音。",
  "voice.browser.settingsLink": "设置 → 语音",

  // ---- 麦克风 / 权限错误
  "voice.error.micDenied": "你需要在浏览器中允许使用麦克风。",
  "voice.error.micNotFound": "未找到麦克风。",
  "voice.error.micOpenFailed": "无法打开麦克风。请检查浏览器的麦克风访问权限。",
  "voice.error.micNetwork": "无法连接浏览器的识别服务（可能在中国被屏蔽）。请前往“设置 → 语音”选择 STT 服务商。",
  "voice.error.recognitionFailed": "语音识别出错，请重试。",
  "voice.error.recordUnsupported": "此浏览器无法录制音频并上传到服务器。",
  "voice.error.transcribeFailed": "无法识别语音，请再试一次。",

  // ---- 朗读 / 播放错误
  "voice.error.chatBusy": "对话正忙，请在回答完成后重试。",
  "voice.error.audioFailed": "无法朗读回答。",
  "voice.error.ttsUnsupported": "此浏览器无法朗读文本。请前往“设置 → 语音”选择 TTS 服务商。",
  "voice.error.providerSpeakFailed": "无法使用 TTS 服务商朗读回答",
};
