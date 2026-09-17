import type { Dict } from "../../types";

/** Nguồn sự thật (tiếng Việt). Thêm khoá mới ở đây trước, rồi dịch sang en/zh. */
export const voice: Dict = {
  // ---- Chế độ giọng nói (VoiceMode)
  "voice.mode.dialogLabel": "Chế độ giọng nói",
  "voice.mode.badgeProcessing": "Đang xử lý",
  "voice.mode.badgeReading": "Đang đọc",
  "voice.mode.badgeOnline": "Trực tuyến",
  "voice.mode.stateIdle": "Đã dừng",
  "voice.mode.stateListening": "Đang nghe…",
  "voice.mode.stateThinking": "Đang suy nghĩ…",
  "voice.mode.stateSpeaking": "Đang nói…",
  "voice.mode.stateError": "Lỗi",
  "voice.mode.hintIdle": "Bấm micro để tiếp tục trò chuyện.",
  "voice.mode.hintListening": "Anh/chị nói tự nhiên, fBuddy sẽ trả lời ngay khi nghe xong.",
  "voice.mode.hintThinking": "fBuddy đang xử lý câu hỏi của anh/chị.",
  "voice.mode.hintSpeaking": "Nói xen vào để ngắt lời và hỏi tiếp.",
  "voice.mode.hintError": "Kiểm tra micro hoặc cấu hình trong Cài đặt → Giọng nói.",
  "voice.mode.mutedState": "Đã tắt micro",
  "voice.mode.mutedHint": "Bấm micro hoặc phím Space để nói tiếp.",
  "voice.mode.mute": "Tắt micro",
  "voice.mode.unmute": "Bật micro",
  "voice.mode.muteTitle": "Tắt micro (Space)",
  "voice.mode.unmuteTitle": "Bật micro (Space)",
  "voice.mode.stopReading": "Dừng đọc",
  "voice.mode.stopReadingTitle": "Dừng đọc câu trả lời",
  "voice.mode.waiting": "Đang chờ câu trả lời…",
  "voice.mode.exit": "Thoát",
  "voice.mode.exitTitle": "Thoát chế độ giọng nói (Esc)",
  "voice.mode.suggestionRole": "Gợi ý",
  "voice.mode.suggestionText": "Hãy nói: “Xin chào, bạn giúp được gì cho tôi?”",
  "voice.mode.roleUser": "Bạn",
  "voice.mode.roleAssistant": "fBuddy",

  // ---- Dòng engine
  "voice.engine.label": "Nhận dạng: {kind} · Giọng đọc: {voice}",
  "voice.engine.browser": "trình duyệt",
  "voice.engine.providerFallback": "nhà cung cấp",
  "voice.engine.defaultVoice": "mặc định",
  "voice.engine.browserDefaultVoice": "giọng mặc định của trình duyệt",

  // ---- Cảnh báo trình duyệt
  "voice.browser.unsupportedTitle": "Trình duyệt này không hỗ trợ nhận dạng giọng nói.",
  "voice.browser.unsupportedBody": "Anh/chị hãy dùng Microsoft Edge hoặc Google Chrome, hoặc vào Cài đặt → Giọng nói để chọn nhà cung cấp STT miễn phí (Gemini, Groq) — khi đó giọng nói vẫn dùng được trên mọi trình duyệt hiện đại.",
  "voice.browser.settingsLink": "Cài đặt → Giọng nói",

  // ---- Lỗi micro / quyền truy cập
  "voice.error.micDenied": "Anh/chị cần cho phép dùng micro trong trình duyệt.",
  "voice.error.micNotFound": "Không tìm thấy micro.",
  "voice.error.micOpenFailed": "Không mở được micro. Anh/chị kiểm tra quyền truy cập micro của trình duyệt.",
  "voice.error.micNetwork": "Không kết nối được dịch vụ nhận dạng của trình duyệt (có thể bị chặn ở Trung Quốc). Vào Cài đặt → Giọng nói để chọn nhà cung cấp STT.",
  "voice.error.recognitionFailed": "Nhận dạng giọng nói gặp lỗi, vui lòng thử lại.",
  "voice.error.recordUnsupported": "Trình duyệt không ghi được âm thanh để gửi lên máy chủ.",
  "voice.error.transcribeFailed": "Không nhận dạng được giọng nói, anh/chị thử lại nhé.",

  // ---- Lỗi đọc / phát giọng nói
  "voice.error.chatBusy": "Hội thoại đang bận, anh/chị thử lại sau khi câu trả lời hoàn tất.",
  "voice.error.audioFailed": "Không đọc được câu trả lời bằng giọng nói.",
  "voice.error.ttsUnsupported": "Trình duyệt này không đọc được văn bản. Vào Cài đặt → Giọng nói để chọn nhà cung cấp TTS.",
  "voice.error.providerSpeakFailed": "Không đọc được câu trả lời bằng nhà cung cấp TTS",
};
