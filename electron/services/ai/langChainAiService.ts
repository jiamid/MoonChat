import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { AppSettings } from "../../../src/shared/contracts.js";
import type { ConversationMessage } from "../../../src/shared/contracts.js";

const aiConfigSchema = z.object({
  provider: z.string().default("openai"),
  apiKey: z.string().optional(),
  baseUrl: z.string().default("https://api.openai.com/v1"),
  model: z.string().default("gpt-4.1-mini"),
  temperature: z.coerce.number().default(0.4),
  systemPrompt: z
    .string()
    .default(
      "你是 MoonChat 的 AI 助手。你的回复要自然、稳妥、尊重上下文，优先使用已有记忆和最近消息，不要编造事实。",
    ),
});

export interface LearningArtifacts {
  summary: string;
  userProfile: string;
  keyFacts: string[];
  strategyNotes: string;
}

export class LangChainAiService {
  private config = aiConfigSchema.parse({});
  private model: ChatOpenAI | null = null;

  constructor(settings?: AppSettings["ai"]) {
    if (settings) {
      this.configure(settings);
      return;
    }

    this.config = aiConfigSchema.parse({});
  }

  configure(settings: AppSettings["ai"]) {
    this.config = aiConfigSchema.parse(settings);
    this.model = null;
  }

  isConfigured() {
    return Boolean(this.config.apiKey);
  }

  getModelName() {
    return this.config.model;
  }

  getProviderName() {
    return this.config.provider;
  }

  async generateAutoReply(input: {
    conversationTitle: string;
    inboundText: string;
    memoryContext: string;
    recentMessages: ConversationMessage[];
  }) {
    if (!this.isConfigured()) {
      return null;
    }

    const chain = ChatPromptTemplate.fromMessages([
      [
        "system",
        [
          this.config.systemPrompt,
          "你在一个本地聊天聚合工作台中工作。",
          "如果上下文不足，就给出保守、简洁、自然的回复。",
          "禁止声称自己执行过未执行的操作，禁止凭空捏造用户事实。",
          "直接输出要发送给用户的回复正文，不要加解释。",
        ].join("\n"),
      ],
      [
        "human",
        [
          `会话标题: {conversationTitle}`,
          "相关记忆:",
          "{memoryContext}",
          "最近消息:",
          "{recentMessagesText}",
          "用户刚发来的消息:",
          "{inboundText}",
        ].join("\n\n"),
      ],
    ])
      .pipe(this.getModel())
      .pipe(new StringOutputParser());

    return chain.invoke({
      conversationTitle: input.conversationTitle,
      inboundText: input.inboundText,
      memoryContext: input.memoryContext || "暂无记忆",
      recentMessagesText: serializeMessages(input.recentMessages),
    });
  }

  async generateLearningArtifacts(input: {
    conversationTitle: string;
    participantLabel: string;
    recentMessages: ConversationMessage[];
  }): Promise<LearningArtifacts> {
    if (!this.isConfigured()) {
      return buildFallbackArtifacts(input.recentMessages);
    }

    const chain = ChatPromptTemplate.fromMessages([
      [
        "system",
        [
          "你负责从聊天记录中提炼长期有价值的记忆。",
          "请仅根据给定聊天内容总结，不要脑补没有出现的事实。",
          "输出必须是严格 JSON，不要使用 Markdown 代码块。",
          '字段必须包含: "summary", "userProfile", "keyFacts", "strategyNotes"。',
          '"keyFacts" 必须是字符串数组。',
        ].join("\n"),
      ],
      [
        "human",
        [
          `会话标题: {conversationTitle}`,
          `参与者标签: {participantLabel}`,
          "最近消息:",
          "{recentMessagesText}",
        ].join("\n\n"),
      ],
    ])
      .pipe(this.getModel())
      .pipe(new StringOutputParser());

    const raw = await chain.invoke({
      conversationTitle: input.conversationTitle,
      participantLabel: input.participantLabel,
      recentMessagesText: serializeMessages(input.recentMessages),
    });

    return parseLearningArtifacts(raw, input.recentMessages);
  }

  private getModel() {
    if (!this.model) {
      this.model = new ChatOpenAI({
        apiKey: this.config.apiKey,
        model: this.config.model,
        temperature: this.config.temperature,
        configuration: {
          baseURL: this.config.baseUrl,
        },
      });
    }

    return this.model;
  }
}

function serializeMessages(messages: ConversationMessage[]) {
  if (!messages.length) {
    return "暂无消息";
  }

  return messages
    .map(
      (message) =>
        `${message.createdAt} | ${message.senderType}/${message.messageRole}/${message.sourceType}: ${message.contentText}`,
    )
    .join("\n");
}

function parseLearningArtifacts(raw: string, messages: ConversationMessage[]): LearningArtifacts {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned) as Partial<LearningArtifacts>;
      return {
      summary: parsed.summary?.trim() || buildFallbackArtifacts(messages).summary,
      userProfile: parsed.userProfile?.trim() || "暂无足够信息形成稳定用户画像。",
      keyFacts: Array.isArray(parsed.keyFacts)
        ? parsed.keyFacts.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          )
        : [],
      strategyNotes: parsed.strategyNotes?.trim() || "后续继续观察用户表达风格和偏好。",
    };
  } catch {
    return buildFallbackArtifacts(messages);
  }
}

function buildFallbackArtifacts(messages: ConversationMessage[]): LearningArtifacts {
  const ordered = messages.slice(-20);
  const summary = ordered
    .map((message) => `${message.senderType}/${message.messageRole}: ${message.contentText}`)
    .join("\n")
    .slice(0, 3000);

  return {
    summary,
    userProfile: "当前仍以原始聊天记录为主，尚未形成稳定用户画像。",
    keyFacts: [],
    strategyNotes: "优先基于最近消息和明确事实回复，避免过度推测。",
  };
}
