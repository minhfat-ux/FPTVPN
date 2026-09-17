import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { AudioLines, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../state/store";
import { fileIconLabel } from "../components/ui";
import { useSpeechRecognition } from "../voice";
import { useVoice } from "../voice/VoiceProvider";
import { SkillSelect } from "./SkillSelect";
import "../voice/voice.css";
import type { FileRef, ModelOption, SkillDescriptor } from "../types";

export interface ComposerHandle {
  focus: () => void;
}

export interface ComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  attachments: FileRef[];
  onRemoveAttachment: (id: string) => void;
  uploading: number;
  onFiles: (files: File[]) => void;
  skills: SkillDescriptor[];
  /** Skill ids are plain strings (the catalogue is user-managed). */
  skill: string;
  onSkill: (skill: string) => void;
  /** Opens the "Thêm kỹ năng" picker / skill marketplace. */
  onOpenSkillPicker: () => void;
  models: ModelOption[];
  modelValue: string;
  onModelValue: (value: string) => void;
  sending: boolean;
  maxUploadMb: number;
  onSend: () => void;
  onStop: () => void;
}

const AUTO_SKILL: SkillDescriptor = {
  id: "chat",
  label: "Tự động",
  icon: "✨",
  description: "Để FlowGpt tự chọn kỹ năng phù hợp",
  starterPrompts: [],
};

/** Chips shown while `/api/skills` has not answered yet. */
export const FALLBACK_SKILLS: SkillDescriptor[] = [
  AUTO_SKILL,
  { id: "image", label: "Ảnh", icon: "🎨", description: "Tạo và sửa ảnh bằng AI", starterPrompts: [] },
  { id: "ppt", label: "PowerPoint", icon: "📊", description: "Tạo slide từ yêu cầu", starterPrompts: [] },
  { id: "excel", label: "Excel", icon: "📈", description: "Tạo bảng tính", starterPrompts: [] },
  { id: "data", label: "Dữ liệu", icon: "🧮", description: "Phân tích dữ liệu và vẽ biểu đồ", starterPrompts: [] },
];

const FALLBACK_BY_ID: SkillDescriptor[] = FALLBACK_SKILLS;

/** The "Tự động" chip is only added when the server list has no chat entry. */
function buildChips(skills: SkillDescriptor[]): SkillDescriptor[] {
  return skills.some((item) => item.id === "chat") ? skills : [AUTO_SKILL, ...skills];
}

/** Skills list with a sane fallback so the chips never render empty. */
export function usableSkills(skills: SkillDescriptor[]): SkillDescriptor[] {
  return skills.length ? buildChips(skills) : FALLBACK_BY_ID;
}

/** Input bar: textarea, attachments, skill chips, model picker, send/stop. */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(props, ref) {
  const {
    draft,
    onDraft,
    attachments,
    onRemoveAttachment,
    uploading,
    onFiles,
    skills,
    skill,
    onSkill,
    onOpenSkillPicker,
    models,
    modelValue,
    onModelValue,
    sending,
    maxUploadMb,
    onSend,
    onStop,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { open: openVoiceMode, config, speaking, stopSpeaking } = useVoice();

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Live refs so the recognition callbacks never capture a stale draft.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;

  // Dictation: finished utterances are appended to the draft so the user can
  // edit them before sending. Dictation pauses while the assistant is speaking.
  const dictation = useSpeechRecognition({
    language: config.language,
    continuous: true,
    interimResults: true,
    onFinal: (text) => {
      const clean = text.trim();
      if (!clean) return;
      onDraftRef.current(`${draftRef.current.trim() ? `${draftRef.current.trim()} ` : ""}${clean}`);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    },
  });

  // Auto-grow up to ~200px, then scroll inside the textarea.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [draft]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    // Ảnh dán từ clipboard được tải lên như tệp đính kèm, không chèn vào văn bản.
    event.preventDefault();
    onFiles(files);
  };

  const activeSkill = skills.find((item) => item.id === skill);
  const chips = usableSkills(skills);
  const canSend = !sending && (draft.trim().length > 0 || attachments.length > 0);

  const listening = dictation.listening;
  const toggleDictation = () => {
    if (listening) {
      dictation.stop();
      return;
    }
    dictation.reset();
    dictation.start();
  };

  // Never transcribe the assistant's own voice: dictation parks while the
  // assistant speaks and picks up again afterwards (echo cancellation alone is
  // not enough when the answer is replayed through speakers).
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const wasSpeaking = useRef(false);
  const parkDictation = useRef(false);
  useEffect(() => {
    const previous = wasSpeaking.current;
    wasSpeaking.current = speaking;
    if (speaking && !previous && dictationRef.current.listening) {
      dictationRef.current.stop();
      parkDictation.current = true;
      return;
    }
    if (!speaking && previous && parkDictation.current) {
      parkDictation.current = false;
      dictationRef.current.start();
    }
  }, [speaking]);

  const interimText = dictation.interim.trim();

  return (
    <div className="composer-wrap">
      <div className="composer">
        {attachments.length > 0 && (
          <div className="chip-row composer-attachments">
            {attachments.map((file) => (
              <span className="attachment-pill" key={file.id}>
                {file.kind === "image" || file.mime?.startsWith("image/") ? (
                  <img className="attachment-thumb" src={api.fileUrl(file.id, true)} alt={file.name} />
                ) : (
                  <span className="artifact-icon artifact-icon-sm">{fileIconLabel(file.kind)}</span>
                )}
                <span className="truncate w-140" title={file.name}>
                  {file.name}
                </span>
                <span className="tiny faint nowrap">{formatBytes(file.size ?? 0)}</span>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => onRemoveAttachment(file.id)}
                  aria-label={`Bỏ tệp ${file.name}`}
                  title="Bỏ tệp"
                  type="button"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          aria-label="Nội dung tin nhắn"
          placeholder="Nhập câu hỏi, yêu cầu tạo ảnh, PPT, Excel hoặc phân tích dữ liệu…"
        />

        <div className="composer-bar">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              onFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => fileRef.current?.click()}
            title={`Đính kèm tệp (tối đa ${maxUploadMb}MB)`}
            aria-label="Đính kèm tệp"
            type="button"
          >
            <Paperclip size={17} />
          </button>

          <button
            className={`btn btn-icon${listening ? " btn-mic-active" : " btn-ghost"}`}
            onClick={toggleDictation}
            disabled={!dictation.supported}
            title={
              !dictation.supported
                ? "Trình duyệt không hỗ trợ nhập bằng giọng nói (hãy dùng Chrome hoặc Edge)"
                : listening
                  ? "Dừng nhập bằng giọng nói"
                  : "Nhập bằng giọng nói"
            }
            aria-label="Nhập bằng giọng nói"
            aria-pressed={listening}
            type="button"
          >
            <Mic size={17} />
          </button>

          <div className="grow">
            <SkillSelect
              skills={skills.length ? skills : FALLBACK_SKILLS.filter((item) => item.id !== "chat")}
              value={skill}
              onChange={onSkill}
              onOpenPicker={onOpenSkillPicker}
              disabled={sending}
            />
          </div>

          <select
            className="select composer-model"
            value={modelValue}
            onChange={(event) => onModelValue(event.target.value)}
            aria-label="Chọn mô hình"
            title="Chọn mô hình"
          >
            <option value="">Mặc định</option>
            {models.map((option) => (
              <option key={`${option.providerId}::${option.model}`} value={`${option.providerId}::${option.model}`}>
                {option.providerName} · {option.model}
                {option.isDefault ? " (mặc định)" : ""}
              </option>
            ))}
          </select>

          <button
            className="btn btn-ghost nowrap"
            onClick={() => {
              if (listening) dictation.stop();
              stopSpeaking();
              openVoiceMode();
            }}
            title="Trò chuyện bằng giọng nói như ChatGPT voice mode"
            type="button"
          >
            <AudioLines size={16} /> Nói chuyện
          </button>

          {sending ? (
            <button className="btn btn-danger nowrap" onClick={onStop} type="button" title="Dừng trả lời">
              <Square size={14} /> Dừng
            </button>
          ) : (
            <button
              className="btn btn-primary btn-icon"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Gửi tin nhắn"
              title="Gửi (Enter)"
              type="button"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        {uploading > 0 && (
          <div className="tiny faint mt-1 row gap-2">
            <span className="spinner" /> Đang tải tệp lên…
          </div>
        )}

        {(listening || dictation.error) && (
          <div className="tiny mt-1 row gap-2">
            {listening ? (
              <>
                <span className="mic-dot" />
                <span className="muted">
                  Đang nghe…{interimText ? ` “${interimText}”` : ""} — bấm micro để dừng.
                </span>
              </>
            ) : (
              <span className="error-text">{dictation.error}</span>
            )}
          </div>
        )}

        <div className="tiny faint composer-hint">
          Enter để gửi · Shift+Enter xuống dòng
          {activeSkill ? ` · Kỹ năng: ${activeSkill.label}` : " · Kỹ năng: Tự động"}
          {modelValue ? ` · ${modelValue.split("::")[1]}` : " · Mô hình mặc định"}
          {` · Tệp tối đa ${maxUploadMb}MB`}
        </div>
      </div>
    </div>
  );
});
