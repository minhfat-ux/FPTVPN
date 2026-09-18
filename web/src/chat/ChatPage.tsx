import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Coins, ExternalLink } from "lucide-react";
import { Composer, fallbackSkills, usableSkills, type ComposerHandle } from "./Composer";
import { SkillPicker } from "./SkillPicker";
import { MessageList } from "./MessageList";
import { RequestCreditsForm } from "./RequestCreditsForm";
import { useAutoScroll } from "../components/ui";
import { EcosystemBanner } from "../components/EcosystemBanner";
import { useChat } from "../state/chat";
import { useCredits } from "../state/credits";
import { useData, useToast } from "../state/store";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { isInternalTopupUrl } from "../topup/links";
import type { FileRef, ModelOption, SkillDescriptor } from "../types";
import "./chat.css";

const DEFAULT_MAX_MB = 25;
/** Server error code sent when the account has no credit left to spend. */
const INSUFFICIENT_CREDITS = "insufficient_credits";

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

export function ChatPage({
  onOpenHub,
  onOpenTopup,
}: { onOpenHub?: () => void; onOpenTopup?: () => void } = {}) {
  const { models, skills, skillCatalog, maxSelectableSkills, applyInstalledSkills } = useData();
  const { t, n } = useI18n();
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
  const { credits, reload: reloadCredits } = useCredits();

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

  // The live turn reports the code first; after a reload the stored assistant
  // message still carries it as `"insufficient_credits: …"`.
  const outOfCredit = useMemo(() => {
    if (streaming?.errorCode === INSUFFICIENT_CREDITS) return true;
    const last = messages.at(-1);
    return Boolean(last?.role === "assistant" && last.error?.startsWith(INSUFFICIENT_CREDITS));
  }, [streaming?.errorCode, messages]);
  // Keep the card up until the balance is positive again (or the feature is off).
  const creditExhausted = outOfCredit && !!credits && credits.enabled && credits.balance <= 0;
  // The top-up page can be opened in-app when the owner points the URL at it.
  const internalTopup = Boolean(onOpenTopup) && isInternalTopupUrl(credits?.buyUrl);

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
  const heroSkills: SkillDescriptor[] = skills.length ? skills : fallbackSkills(t);
  /** Ids of the user's quick list — the picker edits exactly this set. */
  const installedSkillIds = useMemo(() => skills.map((item) => item.id), [skills]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const accepted: File[] = [];
      for (const file of files) {
        if (file.size > maxUploadBytes) {
          push(t("chat.page.fileTooLarge", { name: file.name, max: n(maxUploadMb) }), "error");
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
    [maxUploadBytes, maxUploadMb, n, push, t, uploadAttachment],
  );

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((file) => file.id !== id));

  const runTurn = async (content: string, files: FileRef[]) => {
    const choice = parseModelValue(modelValue);
    setDraft("");
    setAttachments([]);
    try {
      await send({ content, attachments: files, skill, providerId: choice.providerId, model: choice.model });
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("chat.page.sendFailed"), "error");
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
      <EcosystemBanner />
      <MessageList
        messages={messages}
        streaming={streaming}
        sending={sending}
        loading={loading}
        pendingArtifacts={pendingArtifacts}
        scrollRef={scrollRef}
        onRegenerate={() => void regenerate()}
        onChoose={(value) => void send({ content: value, conversationId, skill, attachments: [] })}
        providerName={providerName}
      />

      {isEmpty && (
        <div className="chat-scroll hero-scroll">
          <div className="chat-inner">
            <div className="hero">
              <div className="hero-brand">
                <img className="hero-mark" src="/brand-mark.png?v=culi2" alt="FlowTech" />
                <span className="hero-word brand-word">fBuddy</span>
              </div>
              <p>
                {t("chat.page.heroIntro")}
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
                <div className="tiny faint mt-3">{t("chat.page.chooseSkill")}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {dragOver && <div className="chat-dropzone">{t("chat.page.dropzone")}</div>}

      {creditExhausted && credits && (
        <div className="credit-exhausted" role="alert">
          <span className="credit-exhausted-icon">
            <CircleAlert size={18} />
          </span>
          <div className="grow">
            <div className="bold">{t("chat.page.outOfCredit.title")}</div>
            <div className="small muted">
              {t("chat.page.outOfCredit.body", {
                balance: n(credits.balance),
                perToken: n(credits.perToken),
              })}
            </div>
            <RequestCreditsForm currentBalance={credits.balance} onOpenTopup={onOpenTopup} />
          </div>
          <div className="credit-exhausted-actions">
            {credits.buyUrl ? (
              internalTopup ? (
                <button className="btn btn-sm" type="button" onClick={onOpenTopup}>
                  <Coins size={14} /> {t("chat.page.topUp")}
                </button>
              ) : (
                <a className="btn btn-sm" href={credits.buyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {t("chat.page.topUp")}
                </a>
              )
            ) : null}
            <button className="btn btn-sm" type="button" onClick={() => void reloadCredits()}>
              {t("chat.page.checkAgain")}
            </button>
          </div>
        </div>
      )}

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
        onOpenHub={onOpenHub}
        onSaved={(items) => {
          applyInstalledSkills(items);
          // The dropdown may point at a skill the user just removed.
          if (!items.some((item) => item.id === skill)) setSkill(items[0]?.id ?? "auto");
        }}
      />
    </div>
  );
}
