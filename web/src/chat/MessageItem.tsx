import { useState } from "react";
import { RefreshCw, Square, User as UserIcon, Volume2 } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../state/store";
import { CopyButton, Markdown } from "../components/ui";
import { useI18n } from "../i18n";
import { useVoice } from "../voice/VoiceProvider";
import { ArtifactGrid } from "./ArtifactCard";
import { ToolCard } from "./ToolCard";
import type { Choice, FileRef, Message, StreamingTurn, ToolResult } from "../types";

/** i18n keys for the live-turn statuses reported by the server. */
const STATUS_LABEL_KEYS: Record<string, string> = {
  thinking: "chat.message.status.thinking",
  researching: "chat.message.status.researching",
  calling_tool: "chat.message.status.callingTool",
  finishing: "chat.message.status.finishing",
  reading_file: "chat.message.status.readingFile",
};

/** Options a tool attached to this turn (message-level or per tool result). */
function collectChoices(message: Message): Choice[] {
  const direct = message.choices ?? [];
  const fromTools = (message.toolResults ?? []).flatMap((result) => result.choices ?? []);
  const seen = new Set<string>();
  return [...direct, ...fromTools].filter((choice) => {
    if (!choice?.value || seen.has(choice.id)) return false;
    seen.add(choice.id);
    return true;
  });
}

/**
 * Tappable options under an answer — used when the backend needs a decision
 * (e.g. a photo holds both a table and other text, so: which goes into Excel?).
 */
export function ChoiceRow({
  choices,
  onPick,
  disabled = false,
}: {
  choices: Choice[];
  onPick?: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  if (!choices.length || !onPick) return null;
  return (
    <div className="choice-row">
      <div className="tiny faint">{t("chat.choices.hint")}</div>
      <div className="choice-list">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="choice-chip"
            title={choice.hint ?? choice.value}
            disabled={disabled}
            onClick={() => onPick(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function statusLabel(status: string | null | undefined, t: (key: string) => string): string {
  const key = status ? STATUS_LABEL_KEYS[status] : undefined;
  return t(key ?? "chat.message.status.processing");
}

function isImage(file: FileRef): boolean {
  return file.kind === "image" || (file.mime ?? "").startsWith("image/");
}

/** Attachment thumbnails shown inside a user bubble. */
export function AttachmentStrip({ files }: { files: FileRef[] }) {
  if (!files.length) return null;
  return (
    <div className="msg-attachments">
      {files.map((file) =>
        isImage(file) ? (
          <a key={file.id} href={api.fileUrl(file.id, true)} target="_blank" rel="noreferrer noopener">
            <img className="msg-attachment-thumb" src={api.fileUrl(file.id, true)} alt={file.name} loading="lazy" />
          </a>
        ) : (
          <span key={file.id} className="attachment-pill" title={file.name}>
            <span className="truncate w-180">{file.name}</span>
            <span className="tiny faint nowrap">{formatBytes(file.size ?? 0)}</span>
          </span>
        ),
      )}
    </div>
  );
}

/** Đọc / dừng đọc one assistant answer with the configured voice engine. */
function SpeakButton({ text }: { text: string }) {
  const { t } = useI18n();
  const { speak, stopSpeaking } = useVoice();
  const [reading, setReading] = useState(false);

  const onClick = async () => {
    if (reading) {
      stopSpeaking();
      setReading(false);
      return;
    }
    setReading(true);
    try {
      await speak(text);
    } finally {
      setReading(false);
    }
  };

  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={() => void onClick()}
      type="button"
      title={reading ? t("chat.message.stopReading") : t("chat.message.readTitle")}
      aria-label={reading ? t("chat.message.stopReading") : t("chat.message.readTitle")}
    >
      {reading ? <Square size={13} /> : <Volume2 size={13} />} {reading ? t("chat.message.stopReading") : t("chat.message.read")}
    </button>
  );
}

export function MessageItem({
  message,
  isLastAssistant = false,
  canRegenerate = false,
  onRegenerate,
  onChoose,
  providerName,
}: {
  message: Message;
  isLastAssistant?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  /** Sends the chosen option as the next user message. */
  onChoose?: (value: string) => void;
  /** Resolves `message.providerId` to a human-readable provider name. */
  providerName?: (providerId: string | null | undefined) => string | undefined;
}) {
  const { t, n, d } = useI18n();
  const resolvedProvider = providerName?.(message.providerId);
  const isUser = message.role === "user";

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar">
        {isUser ? <UserIcon size={15} /> : <img className="msg-avatar-img" src="/brand-mark.png?v=culi2" alt="" />}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="bold">{isUser ? t("chat.message.roleUser") : "fBuddy"}</span>
          <span>{d(message.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        {isUser ? (
          <div className="msg-stack align-end">
            <div className="msg-bubble">{message.content}</div>
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentStrip files={message.attachments} />
            )}
          </div>
        ) : (
          <>
            {message.error && <div className="msg-error">{t("chat.message.error", { message: message.error })}</div>}
            {message.content && <Markdown content={message.content} />}
            {(message.toolCalls ?? []).map((call) => (
              <ToolCard
                key={call.id}
                call={call}
                result={(message.toolResults ?? []).find((item: ToolResult) => item.id === call.id)}
              />
            ))}
            <ArtifactGrid files={message.artifacts ?? []} />
            <ChoiceRow choices={collectChoices(message)} onPick={onChoose} disabled={!isLastAssistant} />
            {/* The model/provider that answered is deliberately NOT shown here —
                users pick a model in the composer and that is the only place it
                appears. Only the token counts stay (they map to credits). */}
            {message.usage && (
              <div className="msg-meta mt-2">
                <span>
                  {t("chat.message.usage", { input: n(message.usage.in), output: n(message.usage.out) })}
                </span>
              </div>
            )}
            <div className="msg-actions">
              <CopyButton value={message.content} label={t("chat.message.copy")} />
              {message.content.trim().length > 0 && <SpeakButton text={message.content} />}
              {isLastAssistant && canRegenerate && onRegenerate && (
                <button className="btn btn-sm btn-ghost" onClick={onRegenerate} type="button" title={t("chat.message.regenerateTitle")}>
                  <RefreshCw size={13} /> {t("chat.message.regenerate")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The live assistant turn, rendered straight from the streaming state. */
export function StreamingMessage({
  turn,
  canStop,
  onRegenerate,
}: {
  turn: StreamingTurn;
  canStop: boolean;
  onRegenerate?: () => void;
}) {
  const { t, n } = useI18n();
  const running = !turn.done;
  const showStatus = running && !turn.content;
  const lastAction = canStop ? undefined : onRegenerate;

  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar">
        <img className="msg-avatar-img" src="/brand-mark.png?v=culi2" alt="" />
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="bold">fBuddy</span>
        </div>

        {showStatus && (
          <div className="status-line">
            <span className="spinner" />
            <span>{statusLabel(turn.status, t)}</span>
          </div>
        )}

        {turn.reasoning && (
          <details className="reasoning">
            <summary>{t("chat.message.reasoning")}</summary>
            <div className="pre-wrap small">{turn.reasoning}</div>
          </details>
        )}

        {turn.error && <div className="msg-error">{t("chat.message.error", { message: turn.error })}</div>}

        {turn.toolCalls.map((call) => (
          <ToolCard
            key={call.id}
            call={call}
            result={turn.toolResults.find((item) => item.id === call.id)}
          />
        ))}

        {turn.content && (
          <div className="stream-body">
            <Markdown content={turn.content} />
            {running && <span className="cursor-blink" />}
          </div>
        )}

        <ArtifactGrid files={turn.artifacts} />

        {turn.usage && (
          <div className="msg-meta mt-2">
            <span>
              {t("chat.message.usage", { input: n(turn.usage.in), output: n(turn.usage.out) })}
            </span>
          </div>
        )}

        {(turn.content || !running) && (
          <div className="msg-actions">
            {turn.content && <CopyButton value={turn.content} label={t("chat.message.copy")} />}
            {!running && lastAction && (
              <button className="btn btn-sm btn-ghost" onClick={lastAction} type="button" title={t("chat.message.regenerateTitle")}>
                <RefreshCw size={13} /> {t("chat.message.regenerate")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
