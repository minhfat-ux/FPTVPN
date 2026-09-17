import { useState } from "react";
import { RefreshCw, Sparkles, Square, User as UserIcon, Volume2 } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../state/store";
import { CopyButton, Markdown } from "../components/ui";
import { useVoice } from "../voice/VoiceProvider";
import { ArtifactGrid } from "./ArtifactCard";
import { ToolCard } from "./ToolCard";
import type { FileRef, Message, StreamingTurn, ToolResult } from "../types";

const STATUS_LABELS: Record<string, string> = {
  thinking: "Đang suy nghĩ…",
  calling_tool: "Đang gọi công cụ…",
  finishing: "Đang hoàn tất…",
  reading_file: "Đang đọc tệp…",
};

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Đang xử lý…";
  return STATUS_LABELS[status] ?? "Đang xử lý…";
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

function roleLabel(message: Message): string {
  return message.role === "user" ? "Bạn" : "FlowGpt";
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

/** Đọc / dừng đọc one assistant answer with the configured voice engine. */
function SpeakButton({ text }: { text: string }) {
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
      title={reading ? "Dừng đọc" : "Đọc câu trả lời"}
      aria-label={reading ? "Dừng đọc" : "Đọc câu trả lời"}
    >
      {reading ? <Square size={13} /> : <Volume2 size={13} />} {reading ? "Dừng đọc" : "Đọc"}
    </button>
  );
}

export function MessageItem({
  message,
  isLastAssistant = false,
  canRegenerate = false,
  onRegenerate,
  providerName,
}: {
  message: Message;
  isLastAssistant?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  /** Resolves `message.providerId` to a human-readable provider name. */
  providerName?: (providerId: string | null | undefined) => string | undefined;
}) {
  const resolvedProvider = providerName?.(message.providerId);
  const isUser = message.role === "user";

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar">{isUser ? <UserIcon size={15} /> : <Sparkles size={15} />}</div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="bold">{roleLabel(message)}</span>
          <span>{timeLabel(message.createdAt)}</span>
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
            {message.error && <div className="msg-error">Lỗi: {message.error}</div>}
            {message.content && <Markdown content={message.content} />}
            {(message.toolCalls ?? []).map((call) => (
              <ToolCard
                key={call.id}
                call={call}
                result={(message.toolResults ?? []).find((item: ToolResult) => item.id === call.id)}
              />
            ))}
            <ArtifactGrid files={message.artifacts ?? []} />
            {(message.model || message.usage) && (
              <div className="msg-meta mt-2">
                {resolvedProvider && <span>{resolvedProvider}</span>}
                {message.model && <span className="mono">{message.model}</span>}
                {message.usage && (
                  <span>
                    {message.usage.in} vào · {message.usage.out} ra token
                  </span>
                )}
              </div>
            )}
            <div className="msg-actions">
              <CopyButton value={message.content} label="Sao chép nội dung" />
              {message.content.trim().length > 0 && <SpeakButton text={message.content} />}
              {isLastAssistant && canRegenerate && onRegenerate && (
                <button className="btn btn-sm btn-ghost" onClick={onRegenerate} type="button" title="Tạo lại câu trả lời">
                  <RefreshCw size={13} /> Tạo lại
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
  const running = !turn.done;
  const showStatus = running && !turn.content;
  const lastAction = canStop ? undefined : onRegenerate;

  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar">
        <Sparkles size={15} />
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="bold">FlowGpt</span>
          {turn.model && <span className="mono">{turn.model}</span>}
        </div>

        {showStatus && (
          <div className="status-line">
            <span className="spinner" />
            <span>{statusLabel(turn.status)}</span>
          </div>
        )}

        {turn.reasoning && (
          <details className="reasoning">
            <summary>Quá trình suy luận</summary>
            <div className="pre-wrap small">{turn.reasoning}</div>
          </details>
        )}

        {turn.error && <div className="msg-error">Lỗi: {turn.error}</div>}

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
              {turn.usage.in} vào · {turn.usage.out} ra token
            </span>
          </div>
        )}

        {(turn.content || !running) && (
          <div className="msg-actions">
            {turn.content && <CopyButton value={turn.content} label="Sao chép nội dung" />}
            {!running && lastAction && (
              <button className="btn btn-sm btn-ghost" onClick={lastAction} type="button" title="Tạo lại câu trả lời">
                <RefreshCw size={13} /> Tạo lại
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
