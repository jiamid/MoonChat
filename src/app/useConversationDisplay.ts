import { useMemo } from "react";
import type { AppSettings, ConversationSummary } from "../shared/contracts";
import { describeChannel, getConversationPreferredName } from "./utils";

export function useConversationDisplay({
  settings,
  conversations,
}: {
  settings: AppSettings;
  conversations: ConversationSummary[];
}) {
  const selectedChannelConversations = useMemo(
    () => conversations.filter((conversation) => conversation.channelType !== "local_ai"),
    [conversations],
  );
  const channelNameById = useMemo(
    () =>
      new Map(
        settings.channels.map((channel) => [
          channel.id,
          channel.name.trim() || describeChannel(channel.type),
        ] as const),
      ),
    [settings.channels],
  );

  const getConversationChannelName = (conversation: ConversationSummary) =>
    conversation.channelId
      ? channelNameById.get(conversation.channelId) ?? describeChannel(conversation.channelType)
      : describeChannel(conversation.channelType);

  const getConversationDisplayName = (conversation: ConversationSummary) =>
    getConversationPreferredName(conversation);

  return {
    channelConversations: selectedChannelConversations,
    channelNameById,
    getConversationChannelName,
    getConversationDisplayName,
  };
}
