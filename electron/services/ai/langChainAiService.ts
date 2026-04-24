import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
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

export interface AiAssistantMemoryUpdate {
  memoryType: "base" | "style" | "knowledge";
  content: string;
  summary: string;
}

export interface AiAssistantResult {
  reply: string;
  memoryUpdates: AiAssistantMemoryUpdate[];
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
          `当前 AI 系统设定: ${this.config.systemPrompt}`,
          "你负责从聊天记录中提炼长期有价值的记忆。",
          "请仅根据给定聊天内容总结，不要脑补没有出现的事实。",
          '"summary" 必须是一段 1-3 句的摘要，概括这段会话主要聊了什么、当前进展和用户核心关注点。',
          '"summary" 绝对不能按时间顺序复述消息，不能写成一条一条的流水账，不能直接拼接原话。',
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

  async generateAiAssistantResponse(input: {
    userMessage: string;
    recentMessages: ConversationMessage[];
    baseMemory: string;
    styleMemory: string;
    knowledgeMemory: string;
    imageDataUrl?: string;
  }): Promise<AiAssistantResult> {
    if (!this.isConfigured()) {
      return {
        reply: "AI 尚未配置。请先到 AI > 模型 中填写可用的模型和 API 配置。",
        memoryUpdates: [],
      };
    }

    const promptText = [
      "当前基础记忆:",
      input.baseMemory || "暂无基础记忆",
      "当前风格记忆:",
      input.styleMemory || "暂无风格记忆",
      "当前知识记忆:",
      input.knowledgeMemory || "暂无知识记忆",
      "最近对话:",
      serializeMessages(input.recentMessages),
      "用户刚才说:",
      input.userMessage || "用户仅发送了一张图片，请结合图片理解意图。",
      input.imageDataUrl ? "用户还附带了一张图片，请结合图片内容一起理解。" : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const humanContent = input.imageDataUrl
      ? [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ]
      : promptText;

    const rawResponse = await this.getModel().invoke([
      new SystemMessage(
        [
          "你是 MoonChat 的 AI 助手配置官。",
          "你的职责是和用户对话，并在用户明确提出修改 AI 基础记忆、风格记忆、知识记忆时，输出对应的更新建议。",
          "如果用户只是咨询、讨论或闲聊，可以只回复，不必更新记忆。",
          "输出必须是严格 JSON，不要使用 Markdown 代码块。",
          'JSON 必须包含 "reply" 和 "memoryUpdates" 两个字段。',
          '"memoryUpdates" 是数组，元素结构为 { "memoryType": "base" | "style" | "knowledge", "content": string, "summary": string }。',
          "只有在你确信用户希望修改对应记忆时才返回 memoryUpdates。",
          "reply 使用自然中文，说明你做了什么或为什么没有修改。",
        ].join("\n"),
      ),
      new HumanMessage({ content: humanContent }),
    ]);

    const raw = extractTextFromResponse(rawResponse.content);

    return parseAiAssistantResult(raw);
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
        `${message.createdAt} | ${message.senderType}/${message.messageRole}/${message.sourceType}: ${message.contentText || "[无文字]"}${
          message.attachmentImageDataUrl ? " [附图]" : ""
        }`,
    )
    .join("\n");
}

function extractTextFromResponse(
  content:
    | string
    | Array<{ type?: string; text?: string; [key: string]: unknown }>
    | unknown,
) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }

  return "";
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
  const summary = buildFallbackSummary(ordered);

  return {
    summary,
    userProfile: "当前仍以原始聊天记录为主，尚未形成稳定用户画像。",
    keyFacts: [],
    strategyNotes: "优先基于最近消息和明确事实回复，避免过度推测。",
  };
}

function buildFallbackSummary(messages: ConversationMessage[]) {
  const visibleMessages = messages
    .filter((message) => !message.isDeleted && (message.contentText?.trim() || message.attachmentImageDataUrl))
    .slice(-8);

  if (!visibleMessages.length) {
    return "本轮会话暂无足够内容，暂时无法形成有效摘要。";
  }

  const userTopics = visibleMessages
    .filter((message) => message.senderType === "user")
    .map((message) => message.contentText?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(-3);
  const workbenchReplies = visibleMessages
    .filter((message) => message.senderType === "human_agent" || message.senderType === "ai_agent")
    .map((message) => message.contentText?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(-2);

  const userSummary = userTopics.length
    ? `用户主要在讨论：${userTopics.join("；")}。`
    : "用户本轮主要进行了简短互动。";
  const replySummary = workbenchReplies.length
    ? `当前回复进展为：${workbenchReplies.join("；")}。`
    : "当前尚未形成明确回复结论。";

  return `${userSummary}${replySummary}`;
}

function parseAiAssistantResult(raw: string): AiAssistantResult {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned) as Partial<AiAssistantResult>;
    const memoryUpdates = Array.isArray(parsed.memoryUpdates)
      ? parsed.memoryUpdates.filter(isValidMemoryUpdate)
      : [];

    return {
      reply: typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : "我已经理解你的要求，但这次没有形成可执行的记忆更新。",
      memoryUpdates,
    };
  } catch {
    return {
      reply: "我已经收到你的要求，但这次没有成功解析结构化结果，所以暂时没有改动记忆。",
      memoryUpdates: [],
    };
  }
}

function isValidMemoryUpdate(value: unknown): value is AiAssistantMemoryUpdate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.memoryType === "base" ||
      candidate.memoryType === "style" ||
      candidate.memoryType === "knowledge") &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0 &&
    typeof candidate.summary === "string" &&
    candidate.summary.trim().length > 0
  );
}
