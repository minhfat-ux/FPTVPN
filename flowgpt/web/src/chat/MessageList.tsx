import type { RefObject } from "react";
import { ArtifactGrid } from "./ArtifactCard";
import { MessageItem, StreamingMessage } from "./MessageItem";
import { Spinner } from "../components/ui";
import type { Artifact, Message, StreamingTurn } from "../types";

/** Static transcript plus the live turn and any artifacts produced in this session. */
export function MessageList({
  messages,
  streaming,
  sending,
  loading,
  pendingArtifacts,
  scrollRef,
  onRegenerate,
  providerName,
}: {
  messages: Message[];
  streaming: StreamingTurn | null;
  sending: boolean;
  loading: boolean;
  pendingArtifacts: Artifact[];
  scrollRef: RefObject<HTMLDivElement>;
  onRegenerate: () => void;
  providerName: (providerId: string | null | undefined) => string | undefined;
}) {
  const streamedIds = new Set(
    streaming ? [streaming.messageId, streaming.userMessage.id].filter((id): id is string => Boolean(id)) : [],
  );
  const visible = messages.filter((message) => !streamedIds.has(message.id));
  const lastAssistantId = [...visible].reverse().find((message) => message.role === "assistant")?.id;
  const busy = sending || Boolean(streaming);

  // The session list would repeat every artifact that already sits under its own
  // message (and the one being streamed), so only genuinely unshown files remain.
  const shownArtifactIds = new Set<string>([
    ...visible.flatMap((message) => (message.artifacts ?? []).map((artifact) => artifact.id)),
    ...(streaming?.artifacts ?? []).map((artifact) => artifact.id),
  ]);
  const sessionArtifacts = pendingArtifacts.filter((artifact) => !shownArtifactIds.has(artifact.id));

  return (
    <div className="chat-scroll" ref={scrollRef}>
      <div className="chat-inner">
        {loading && (
          <div className="row self-center">
            <Spinner label="Đang tải hội thoại…" />
          </div>
        )}

        {visible.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            providerName={providerName}
            isLastAssistant={message.id === lastAssistantId}
            canRegenerate={!busy && message.id === lastAssistantId}
            onRegenerate={onRegenerate}
          />
        ))}

        {streaming && (
          <>
            <MessageItem message={streaming.userMessage} />
            <StreamingMessage turn={streaming} canStop={sending} onRegenerate={onRegenerate} />
          </>
        )}

        {sessionArtifacts.length > 0 && (
          <div className="session-artifacts">
            <div className="tiny faint">Tệp tạo trong phiên này</div>
            <ArtifactGrid files={sessionArtifacts} />
          </div>
        )}
      </div>
    </div>
  );
}
