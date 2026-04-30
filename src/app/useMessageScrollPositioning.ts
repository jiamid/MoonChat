import { useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { positionCanvasAfterRender, positionElementAfterRender, writeConversationReadAt } from "./utils";

export function useMessageScrollPositioning({
  isAssistantView,
  view,
  activeConversationId,
  selectedConversationId,
  loadedMessagesConversationId,
  messageCount,
  latestMessageCreatedAt,
  isPrependingOlderMessagesRef,
  aiMessagesEndRef,
  chatMessageCanvasRef,
  chatUnreadAnchorRef,
  setUnreadCountByConversationId,
}: {
  isAssistantView: boolean;
  view: "chat" | "channels" | "ai";
  activeConversationId: string | null;
  selectedConversationId: string | null;
  loadedMessagesConversationId: string | null;
  messageCount: number;
  latestMessageCreatedAt: string | null;
  isPrependingOlderMessagesRef: RefObject<boolean>;
  aiMessagesEndRef: RefObject<HTMLDivElement | null>;
  chatMessageCanvasRef: RefObject<HTMLDivElement | null>;
  chatUnreadAnchorRef: RefObject<HTMLDivElement | null>;
  setUnreadCountByConversationId: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const previousAiMessageCountRef = useRef(0);
  const previousChatMessageCountRef = useRef(0);
  const previousAiConversationIdRef = useRef<string | null>(null);
  const previousChatConversationIdRef = useRef<string | null>(null);
  const [readyAiConversationId, setReadyAiConversationId] = useState<string | null>(null);
  const [readyChatConversationId, setReadyChatConversationId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const isConversationLoaded = loadedMessagesConversationId === activeConversationId;

    if (!isAssistantView) {
      setReadyAiConversationId(null);
      previousAiConversationIdRef.current = null;
      previousAiMessageCountRef.current = 0;
      return;
    }

    if (!isConversationLoaded) {
      return;
    }

    const hasNewAssistantMessage =
      messageCount > previousAiMessageCountRef.current ||
      activeConversationId !== previousAiConversationIdRef.current ||
      readyAiConversationId !== activeConversationId;

    if (hasNewAssistantMessage) {
      positionElementAfterRender(aiMessagesEndRef.current, () => {
        setReadyAiConversationId(activeConversationId);
      });
    }

    previousAiMessageCountRef.current = messageCount;
    previousAiConversationIdRef.current = activeConversationId;
  }, [
    activeConversationId,
    aiMessagesEndRef,
    isAssistantView,
    loadedMessagesConversationId,
    messageCount,
    readyAiConversationId,
  ]);

  useLayoutEffect(() => {
    const activeChatConversationId = view === "chat" ? selectedConversationId : null;
    const isConversationLoaded = loadedMessagesConversationId === activeChatConversationId;

    if (view !== "chat" || !isConversationLoaded) {
      return;
    }

    const hasNewChatMessage =
      messageCount > previousChatMessageCountRef.current ||
      activeChatConversationId !== previousChatConversationIdRef.current ||
      readyChatConversationId !== activeChatConversationId;

    if (isPrependingOlderMessagesRef.current) {
      previousChatMessageCountRef.current = messageCount;
      previousChatConversationIdRef.current = activeChatConversationId;
      return;
    }

    if (hasNewChatMessage) {
      positionCanvasAfterRender(chatMessageCanvasRef.current, chatUnreadAnchorRef.current, () => {
        setReadyChatConversationId(activeChatConversationId);
        if (activeChatConversationId && latestMessageCreatedAt) {
          writeConversationReadAt(activeChatConversationId, latestMessageCreatedAt);
          setUnreadCountByConversationId((current) => ({
            ...current,
            [activeChatConversationId]: 0,
          }));
        }
      });
    }

    previousChatMessageCountRef.current = messageCount;
    previousChatConversationIdRef.current = activeChatConversationId;
  }, [
    chatMessageCanvasRef,
    chatUnreadAnchorRef,
    isPrependingOlderMessagesRef,
    latestMessageCreatedAt,
    loadedMessagesConversationId,
    messageCount,
    readyChatConversationId,
    selectedConversationId,
    setUnreadCountByConversationId,
    view,
  ]);

  return {
    readyAiConversationId,
    readyChatConversationId,
  };
}
