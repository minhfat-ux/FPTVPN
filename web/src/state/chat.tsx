import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, streamChat, ApiError } from "../api/client";
import { useI18n } from "../i18n";
import type {
  Artifact,
  ChatEvent,
  Conversation,
  FileRef,
  Message,
  SkillId,
  StreamingTurn,
  ToolCall,
  ToolResult,
} from "../types";
import { useAuth, useData, useToast } from "./store";

export interface SendOptions {
  content: string;
  conversationId?: string | null;
  attachments?: FileRef[];
  /** Any catalogue skill id (built-ins today, marketplace skills later). */
  skill?: string;
  providerId?: string | null;
  model?: string | null;
  toolMode?: "auto" | "off" | "required";
}

interface ChatContextValue {
  conversationId: string | null;
  conversation: Conversation | null;
  messages: Message[];
  streaming: StreamingTurn | null;
  loading: boolean;
  sending: boolean;
  openConversation: (id: string) => Promise<void>;
  startNewChat: () => void;
  send: (options: SendOptions) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  /** Uploads a file and returns the FileRef (not yet attached to a message). */
  uploadAttachment: (file: File) => Promise<FileRef | null>;
  pendingArtifacts: Artifact[];
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat phải nằm trong <ChatProvider>");
  return ctx;
}

function localId() {
  return `local_${Math.random().toString(36).slice(2)}`;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, lastConversationId, setLastConversationId } = useAuth();
  const { upsertConversation, reloadConversations } = useData();
  const { push } = useToast();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingArtifacts, setPendingArtifacts] = useState<Artifact[]>([]);

  const abortRef = useRef<(() => void) | null>(null);
  const lastRequestRef = useRef<SendOptions | null>(null);
  // Cross-device sync reads the newest state without re-subscribing.
  const stateRef = useRef({ conversationId, conversation, messages, sending, streaming });
  stateRef.current = { conversationId, conversation, messages, sending, streaming };
  const resumedRef = useRef(false);

  // A different account must never inherit the previous session's messages.
  useEffect(() => {
    if (!user) {
      setConversationId(null);
      setConversation(null);
      setMessages([]);
      setStreaming(null);
      setPendingArtifacts([]);
      resumedRef.current = false;
    }
  }, [user]);

  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.();
      setLoading(true);
      setStreaming(null);
      try {
        const result = await api.getConversation(id);
        setConversationId(result.conversation.id);
        setConversation(result.conversation);
        setMessages(result.messages);
        setPendingArtifacts([]);
        // Tell the backend this is the account's current thread, so opening
        // FlowGpt on another device lands here too.
        setLastConversationId(result.conversation.id);
        void api.activateConversation(result.conversation.id).catch(() => undefined);
      } catch (err) {
        push(err instanceof ApiError ? err.message : t("shell.state.openConversationFailed"), "error");
      } finally {
        setLoading(false);
      }
    },
    [push, setLastConversationId, t],
  );

  const startNewChat = useCallback(() => {
    abortRef.current?.();
    setConversationId(null);
    setConversation(null);
    setMessages([]);
    setStreaming(null);
    setPendingArtifacts([]);
    setLastConversationId(null);
    void api.clearActiveConversation().catch(() => undefined);
  }, [setLastConversationId]);

  // Resume the thread this account was working on — from any device. Runs once
  // per app load; "chat mới" clears the pointer on the server, so it will not
  // drag the user back into an old conversation afterwards.
  useEffect(() => {
    if (!user || resumedRef.current || !lastConversationId) return;
    resumedRef.current = true;
    if (conversationId) return;
    void openConversation(lastConversationId);
  }, [user, lastConversationId, conversationId, openConversation]);

  // Cross-device continuity: while this tab is visible and idle, pick up turns
  // another device just ran (cheap `?since=` poll, plus one sync on focus).
  useEffect(() => {
    if (!user || !conversationId) return;
    let cancelled = false;
    let polling = false;

    const sync = async () => {
      const state = stateRef.current;
      if (cancelled || polling || state.sending || state.streaming) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      polling = true;
      try {
        const last = state.messages.at(-1)?.id ?? null;
        const result = await api.getConversation(conversationId, last);
        if (cancelled || !result.messages.length) return;
        setConversation(result.conversation);
        setMessages((current) => {
          const seen = new Set(current.map((message) => message.id));
          const fresh = result.messages.filter((message) => !seen.has(message.id));
          return fresh.length ? [...current, ...fresh] : current;
        });
        upsertConversation(result.conversation);
        reloadConversations();
      } catch {
        /* transient: try again on the next tick */
      } finally {
        polling = false;
      }
    };

    const timer = window.setInterval(sync, 5000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [conversationId, user, reloadConversations, upsertConversation]);

  const stop = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setSending(false);
    // Finalisation happens in onClose so the assistant turn is appended exactly once.
  }, []);

  const runTurn = useCallback(
    async (options: SendOptions, { replaceLastAssistant = false } = {}) => {
      if (sending) return;
      lastRequestRef.current = options;
      setSending(true);

      const userMessage: Message = {
        id: localId(),
        conversationId: conversationId ?? "pending",
        role: "user",
        content: options.content,
        attachments: options.attachments ?? [],
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => {
        const base = replaceLastAssistant && current.at(-1)?.role === "assistant" ? current.slice(0, -1) : current;
        return [...base, userMessage];
      });

      const initial: StreamingTurn = {
        conversationId: conversationId ?? "",
        messageId: null,
        userMessage,
        content: "",
        reasoning: "",
        status: "thinking",
        toolCalls: [],
        toolResults: [],
        artifacts: [],
        usage: null,
        error: null,
        done: false,
        model: options.model ?? undefined,
      };
      // The turn is accumulated in a local variable as well as in state. A fast
      // provider delivers every event inside one React batch, so `onClose` must
      // not read state (or a ref updated by an effect) — it would still be the
      // initial value and the assistant reply would be dropped.
      let turn = initial;
      setStreaming(initial);
      setPendingArtifacts([]);

      const abort = streamChat(
        {
          content: options.content,
          conversationId: options.conversationId ?? conversationId,
          attachments: (options.attachments ?? []).map((file) => file.id),
          skill: options.skill,
          providerId: options.providerId,
          model: options.model,
          toolMode: options.toolMode,
        },
        {
          onEvent: (event) => {
            // Side effects that touch other stores run outside the reducer.
            if (event.event === "start") {
              setConversationId(event.data.conversationId);
              setConversation(event.data.conversation);
              upsertConversation(event.data.conversation);
              if (event.data.notice) push(event.data.notice, "info");
              const serverUserMessage = event.data.userMessage;
              setMessages((list) =>
                list.map((message) => (message.id === userMessage.id ? serverUserMessage : message)),
              );
            }
            if (event.event === "artifact") {
              setPendingArtifacts((list) => dedupeArtifacts([...list, event.data]));
            }
            if (event.event === "notice") {
              push(event.data.message, "info");
            }

            turn = reduceTurn(turn, event);
            setStreaming(turn);
          },
          onError: (error) => {
            push(error.message, "error");
            turn = { ...turn, error: error.message, errorCode: error.code, done: true };
            setStreaming(turn);
          },
          onClose: () => {
            setSending(false);
            abortRef.current = null;
            const finished = turn;
            if (finished.content || finished.toolCalls.length || finished.error) {
              setMessages((list) => {
                const alreadyStored = finished.messageId && list.some((m) => m.id === finished.messageId);
                if (alreadyStored) return list;
                return [...list, turnToMessage({ ...finished, done: true })];
              });
            }
            setStreaming(null);
            reloadConversations();
          },
        },
      );
      abortRef.current = abort;
    },
    [conversationId, push, reloadConversations, sending, upsertConversation],
  );

  const send = useCallback(
    async (options: SendOptions) => {
      if (!options.content.trim() && !(options.attachments ?? []).length) return;
      await runTurn(options);
    },
    [runTurn],
  );

  const regenerate = useCallback(async () => {
    const last = lastRequestRef.current;
    if (last) await runTurn(last, { replaceLastAssistant: true });
  }, [runTurn]);

  const uploadAttachment = useCallback(
    async (file: File): Promise<FileRef | null> => {
      try {
        const result = await api.upload(file, conversationId);
        return result.file;
      } catch (err) {
        push(err instanceof ApiError ? err.message : t("shell.state.uploadFailed"), "error");
        return null;
      }
    },
    [conversationId, push, t],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      conversationId,
      conversation,
      messages,
      streaming,
      loading,
      sending,
      openConversation,
      startNewChat,
      send,
      stop,
      regenerate,
      uploadAttachment,
      pendingArtifacts,
    }),
    [
      conversationId,
      conversation,
      messages,
      streaming,
      loading,
      sending,
      openConversation,
      startNewChat,
      send,
      stop,
      regenerate,
      uploadAttachment,
      pendingArtifacts,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

function dedupeArtifacts(list: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return list.filter((artifact) => {
    if (seen.has(artifact.id)) return false;
    seen.add(artifact.id);
    return true;
  });
}

/**
 * Pure reducer for one streaming turn. Kept pure (and outside the component) so
 * the same code path serves both the live render and the final persisted
 * message — a fast provider can emit every event before React commits.
 */
export function reduceTurn(turn: StreamingTurn, event: ChatEvent): StreamingTurn {
  switch (event.event) {
    case "start":
      return {
        ...turn,
        conversationId: event.data.conversationId,
        userMessage: event.data.userMessage,
        providerName: event.data.providerName,
        model: event.data.model,
        status: "thinking",
      };
    case "status":
      return { ...turn, status: event.data.stage };
    case "delta":
      return { ...turn, content: turn.content + event.data.text, status: null };
    case "reasoning":
      return { ...turn, reasoning: turn.reasoning + event.data.text };
    case "tool_call":
      return { ...turn, toolCalls: [...turn.toolCalls, event.data], status: "calling_tool" };
    case "tool_result":
      return {
        ...turn,
        toolResults: [...turn.toolResults, event.data],
        artifacts: dedupeArtifacts([...turn.artifacts, ...(event.data.artifacts ?? [])]),
      };
    case "artifact":
      return { ...turn, artifacts: dedupeArtifacts([...turn.artifacts, event.data]) };
    case "usage":
      return { ...turn, usage: event.data };
    case "notice":
      return { ...turn, notice: event.data.message };
    case "error":
      return { ...turn, error: event.data.message, errorCode: event.data.code, status: null };
    case "done":
      // The credit badge / profile modal listen for this and update instantly.
      if (event.data.credits && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("flowgpt:credits", {
            detail: { balance: event.data.credits.balance, cost: event.data.credits.cost },
          }),
        );
      }
      return {
        ...turn,
        done: true,
        messageId: event.data.messageId,
        usage: event.data.usage ?? turn.usage,
        // Buttons the server wants the user to choose from (e.g. "confirm this plan").
        ...(event.data.choices?.length ? { choices: event.data.choices } : {}),
      };
    default:
      return turn;
  }
}

export function turnToMessage(turn: StreamingTurn): Message {
  return {
    id: turn.messageId ?? localId(),
    conversationId: turn.conversationId,
    role: "assistant",
    content: turn.content,
    toolCalls: turn.toolCalls,
    toolResults: turn.toolResults,
    artifacts: turn.artifacts,
    usage: turn.usage,
    choices: turn.choices ?? [],
    model: turn.model ?? null,
    error: turn.error,
    createdAt: new Date().toISOString(),
  };
}
