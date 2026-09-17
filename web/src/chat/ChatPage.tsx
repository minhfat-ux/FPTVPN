import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer, FALLBACK_SKILLS, usableSkills, type ComposerHandle } from "./Composer";
import { SkillPicker } from "./SkillPicker";
import { MessageList } from "./MessageList";
import { useAutoScroll } from "../components/ui";
import { useChat } from "../state/chat";
import { useData, useToast } from "../state/store";
import { ApiError } from "../api/client";
import type { FileRef, ModelOption, SkillDescriptor } from "../types";
import "./chat.css";

const DEFAULT_MAX_MB = 25;

interface ModelChoice {
  providerId: string | null;
  model: string | null;
}

function parseModelValue(value: string): ModelChoice {
  const index = value.indexOf("::");
  if (index < 0) return { providerId: null, model: null };
  return { providerId: value.slice(0, index), model: value.slice(index + 2) };
}

function formatModelValue(providerId?: string | null, model?: string | null): string {
  return providerId && model ? `${providerId}::${model}` : "";
}

export function ChatPage() {
  const { models, skills, skillCatalog, maxSelectableSkills, applyInstalledSkills } = useData();
  const { push } = useToast();
  const {
    conversationId,
    conversation,
    messages,
    streaming,
    loading,
    sending,
    send,
    stop,
    regenerate,
    uploadAttachment,
    pendingArtifacts,
  } = useChat();

  const composerRef = useRef<ComposerHandle>(null);
  const dragDepth = useRef(0);
  const draftConversation = useRef<string | null | undefined>(undefined);

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<FileRef[]>([]);
  const [uploading, setUploading] = useState(0);
  // Skill ids are plain strings now (the catalogue is user-managed).
  const [skill, setSkill] = useState<string>("chat");
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [modelValue, setModelValue] = useState("");
  const [heroSkillId, setHeroSkillId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxUploadMb = DEFAULT_MAX_MB;
  const maxUploadBytes = maxUploadMb * 1024 * 1024;
  const isEmpty = messages.length === 0 && !streaming;

  const scrollRef = useAutoScroll<HTMLDivElement>([
    messages.length,
    streaming?.content.length ?? 0,
    streaming?.reasoning.length ?? 0,
    streaming?.toolCalls.length ?? 0,
    streaming?.artifacts.length ?? 0,
    pendingArtifacts.length,
  ]);

  // A conversation carries its own skill/model; the composer mirrors it once per conversation.
  useEffect(() => {
    if (draftConversation.current === conversationId) return;
    draftConversation.current = conversationId;
    setSkill(conversation?.skill ?? "chat");
    setModelValue(formatModelValue(conversation?.providerId, conversation?.model));
    setHeroSkillId(null);
    setAttachments([]);
    setDraft("");
  }, [conversationId, conversation]);

  const providerName = useCallback(
    (providerId: string | null | undefined): string | undefined => {
      if (!providerId) return undefined;
      const option = models.find((item: ModelOption) => item.providerId === providerId);
      return option?.providerName;
    },
    [models],
  );

  const heroSkill: SkillDescriptor | undefined = useMemo(() => {
    if (!heroSkillId) return undefined;
    return skills.find((item) => item.id === heroSkillId);
  }, [heroSkillId, skills]);
  const heroSkills: SkillDescriptor[] = skills.length ? skills : FALLBACK_SKILLS;
  /** Ids of the user's quick list — the picker edits exactly this set. */
  const installedSkillIds = useMemo(() => skills.map((item) => item.id), [skills]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const accepted: File[] = [];
      for (const file of files) {
        if (file.size > maxUploadBytes) {
          push(`“${file.name}” vượt quá ${maxUploadMb}MB nên bị bỏ qua`, "error");
          continue;
        }
        accepted.push(file);
      }
      if (!accepted.length) return;
      setUploading((count) => count + accepted.length);
      try {
        const results: FileRef[] = [];
        for (const file of accepted) {
          const uploaded = await uploadAttachment(file);
          if (uploaded) results.push(uploaded);
        }
        if (results.length) {
          setAttachments((current) => [
            ...current.filter((item) => !results.some((result) => result.id === item.id)),
            ...results,
          ]);
        }
      } finally {
        setUploading((count) => Math.max(0, count - accepted.length));
      }
    },
    [maxUploadBytes, maxUploadMb, push, uploadAttachment],
  );

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((file) => file.id !== id));

  const runTurn = async (content: string, files: FileRef[]) => {
    const choice = parseModelValue(modelValue);
    setDraft("");
    setAttachments([]);
    try {
      await send({ content, attachments: files, skill, providerId: choice.providerId, model: choice.model });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không gửi được tin nhắn", "error");
    }
  };

  const handleSend = () => {
    if (sending) return;
    const content = draft.trim();
    if (!content && !attachments.length) return;
    void runTurn(content, attachments);
  };

  const startFromPrompt = (prompt: string) => {
    if (sending) return;
    setHeroSkillId(null);
    void runTurn(prompt, []);
    composerRef.current?.focus();
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) void addFiles(files);
  };

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  return (
    <div
      className={`chat-shell${dragOver ? " drag-over" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <MessageList
        messages={messages}
        streaming={streaming}
        sending={sending}
        loading={loading}
        pendingArtifacts={pendingArtifacts}
        scrollRef={scrollRef}
        onRegenerate={() => void regenerate()}
        providerName={providerName}
      />

      {isEmpty && (
        <div className="chat-scroll hero-scroll">
          <div className="chat-inner">
            <div className="hero">
              <div className="hero-brand">
                <img className="hero-mark" src="/brand-mark.png" alt="FlowTech" />
                <span className="hero-word brand-word">FlowGpt</span>
              </div>
              <p>
                Trợ lý AI cho công việc hằng ngày: trò chuyện, tạo ảnh, làm slide, bảng tính và phân tích dữ liệu —
                tất cả trong một khung chat.
              </p>

              <div className="chip-row hero-chips">
                {heroSkills.map((item) => (
                  <button
                    key={item.id}
                    className={`chip${item.id === heroSkillId ? " active" : ""}`}
                    onClick={() => {
                      setHeroSkillId(item.id);
                      setSkill(item.id);
                    }}
                    title={item.description}
                    type="button"
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              {heroSkill ? (
                <div className="starter-list">
                  <div className="tiny faint">{heroSkill.description}</div>
                  {heroSkill.starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      className="starter-card"
                      onClick={() => startFromPrompt(prompt)}
                      type="button"
                    >
                      <span className="grow">{prompt}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tiny faint mt-3">Chọn một kỹ năng để xem gợi ý bắt đầu.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {dragOver && <div className="chat-dropzone">Thả tệp vào đây để đính kèm</div>}

      <Composer
        ref={composerRef}
        draft={draft}
        onDraft={setDraft}
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
        uploading={uploading}
        onFiles={(files) => void addFiles(files)}
        skills={skills}
        skill={skill}
        onSkill={setSkill}
        onOpenSkillPicker={() => setSkillPickerOpen(true)}
        models={models}
        modelValue={modelValue}
        onModelValue={setModelValue}
        sending={sending}
        maxUploadMb={maxUploadMb}
        onSend={handleSend}
        onStop={stop}
      />

      <SkillPicker
        open={skillPickerOpen}
        onClose={() => setSkillPickerOpen(false)}
        installed={installedSkillIds}
        catalog={skillCatalog}
        maxSelectable={maxSelectableSkills}
        onSaved={(items) => {
          applyInstalledSkills(items);
          // The dropdown may point at a skill the user just removed.
          if (!items.some((item) => item.id === skill)) setSkill(items[0]?.id ?? "auto");
        }}
      />
    </div>
  );
}
