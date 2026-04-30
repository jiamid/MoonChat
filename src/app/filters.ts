import type { ConversationMessage, ConversationSummary } from "../shared/contracts";
import type { MessageRoleFilter, MessageSourceFilter } from "./types";
import { describeSource, labelSender } from "./utils";

export function filterConversations(
  conversations: ConversationSummary[],
  keyword: string,
  getConversationChannelName: (conversation: ConversationSummary) => string,
) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return conversations;
  }

  return conversations.filter((conversation) =>
    [
      conversation.title,
      conversation.participantLabel ?? "",
      conversation.externalUserId,
      conversation.channelType,
      getConversationChannelName(conversation),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedKeyword),
  );
}

export function filterMessages({
  messages,
  keyword,
  role,
  source,
}: {
  messages: ConversationMessage[];
  keyword: string;
  role: MessageRoleFilter;
  source: MessageSourceFilter;
}) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return messages.filter((message) => {
    const roleMatched = role === "all" || message.messageRole === role;
    const sourceMatched = source === "all" || message.sourceType === source;
    const textMatched =
      !normalizedKeyword ||
      [
        message.contentText,
        labelSender(message.senderType),
        describeSource(message.sourceType),
        message.messageRole,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedKeyword);

    return roleMatched && sourceMatched && textMatched;
  });
}
