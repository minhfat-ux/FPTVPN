import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { AudioLines, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../state/store";
import { fileIconLabel } from "../components/ui";
import { useI18n } from "../i18n";
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

/** id, icon, label key, description key — for the chips shown before /api/skills answers. */
const FALLBACK_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["chat", "✨", "chat.skill.auto", "chat.skill.autoHint"],
  ["image", "🎨", "chat.skill.image", "chat.skill.imageHint"],
  ["ppt", "📊", "chat.skill.ppt", "chat.skill.pptHint"],
  ["excel", "📈", "chat.skill.excel", "chat.skill.excelHint"],
  ["data", "🧮", "chat.skill.data", "chat.skill.dataHint"],
];

/** Chips shown while `/api/skills` has not answered yet. */
export function fallbackSkills(t: (key: string) => string): SkillDescriptor[] {
  return FALLBACK_ROWS.map(([id, icon, key, hint]) => ({
    id, icon, label: t(key), description: t(hint), starterPrompts: [],
  }));
}

/** Skills list with a sane fallback so the chips never render empty. */
export function usableSkills(skills: SkillDescriptor[], t: (key: string) => string): SkillDescriptor[] {
  if (!skills.length) return fallbackSkills(t);
  // The "Tự động" chip is only added when the server list has no chat entry.
  return skills.some((item) => item.id === "chat") ? skills : [fallbackSkills(t)[0], ...skills];
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
  const { t, n } = useI18n();
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
  // Never print the vendor's model id at the user — show the FlowGpt label.
  const selectedModelLabel = useMemo(() => {
    const model = modelValue.split("::")[1] ?? "";
    const option = models.find((item) => `${item.providerId}::${item.model}` === modelValue);
    return option?.label ?? option?.model ?? model;
  }, [modelValue, models]);
  const chips = usableSkills(skills, t);
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
                  aria-label={t("chat.composer.removeFileAria", { name: file.name })}
                  title={t("chat.composer.removeFile")}
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
          aria-label={t("chat.composer.inputAria")}
          placeholder={t("chat.composer.placeholder")}
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
            title={t("chat.composer.attachTitle", { max: n(maxUploadMb) })}
            aria-label={t("chat.composer.attach")}
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
                ? t("chat.composer.dictationUnsupported")
                : listening
                  ? t("chat.composer.dictationStop")
                  : t("chat.composer.dictationStart")
            }
            aria-label={t("chat.composer.dictationStart")}
            aria-pressed={listening}
            type="button"
          >
            <Mic size={17} />
          </button>

          <div className="grow">
            <SkillSelect
              skills={skills.length ? skills : fallbackSkills(t).filter((item) => item.id !== "chat")}
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
            aria-label={t("chat.composer.modelSelect")} title={t("chat.composer.modelSelect")}
          >
            <option value="">{t("chat.composer.modelDefault")}</option>
            {models.map((option) => (
              <option key={`${option.providerId}::${option.model}`} value={`${option.providerId}::${option.model}`}>
                {option.label ?? option.model}
                {option.isDefault ? t("chat.composer.modelIsDefault") : ""}
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
            title={t("chat.composer.voiceModeTitle")}
            type="button"
          >
            <AudioLines size={16} /> {t("chat.composer.voiceMode")}
          </button>

          {sending ? (
            <button className="btn btn-danger nowrap" onClick={onStop} type="button" title={t("chat.composer.stopTitle")}>
              <Square size={14} /> {t("chat.composer.stop")}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-icon"
              onClick={onSend}
              disabled={!canSend}
              aria-label={t("chat.composer.send")}
              title={t("chat.composer.sendTitle")}
              type="button"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        {uploading > 0 && (
          <div className="tiny faint mt-1 row gap-2">
            <span className="spinner" /> {t("chat.composer.uploading")}
          </div>
        )}

        {(listening || dictation.error) && (
          <div className="tiny mt-1 row gap-2">
            {listening ? (
              <>
                <span className="mic-dot" />
                <span className="muted">
                  {t("chat.composer.listening", { interim: interimText ? t("chat.composer.listeningInterim", { text: interimText }) : "" })}
                </span>
              </>
            ) : (
              <span className="error-text">{dictation.error}</span>
            )}
          </div>
        )}

        <div className="tiny faint composer-hint">
          {t("chat.composer.hintEnter")}
          {t("chat.composer.hintSkill", { name: activeSkill?.label ?? t("chat.skill.auto") })}
          {modelValue ? t("chat.composer.hintModel", { name: selectedModelLabel }) : t("chat.composer.hintModelDefault")}
          {t("chat.composer.hintMaxFile", { max: n(maxUploadMb) })}
        </div>
      </div>
    </div>
  );
});
