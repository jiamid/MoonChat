import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppSettings } from "../../../src/shared/contracts.js";

const settingsSchema = z.object({
  ui: z
    .object({
      themeMode: z.enum(["light", "dark"]).default("dark"),
    })
    .default({ themeMode: "dark" }),
  telegram: z.object({
    botToken: z.string().default(""),
  }),
  ai: z.object({
    provider: z.string().default("openai"),
    apiKey: z.string().default(""),
    baseUrl: z.string().default("https://api.openai.com/v1"),
    model: z.string().default("gpt-4.1-mini"),
    temperature: z.coerce.number().default(0.4),
    systemPrompt: z
      .string()
      .default(
        "你是 MoonChat 的 AI 助手，负责在聊天聚合工作台里协助进行自然、稳妥、贴近上下文的回复。",
      ),
  }),
});

export class AppSettingsService {
  private readonly settingsPath: string;
  private settings: AppSettings;

  private constructor(settingsPath: string, settings: AppSettings) {
    this.settingsPath = settingsPath;
    this.settings = settings;
  }

  static async bootstrap(dataDir: string) {
    const settingsPath = path.join(dataDir, "settings.json");
    const defaultSettings = settingsSchema.parse({
      ui: {
        themeMode: "dark",
      },
      telegram: {
        botToken: "",
      },
      ai: {
        provider: "openai",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        temperature: 0.4,
        systemPrompt:
          "你是 MoonChat 的 AI 助手，负责在聊天聚合工作台里协助进行自然、稳妥、贴近上下文的回复。",
      },
    });

    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      const persisted = settingsSchema.parse(JSON.parse(raw));
      return new AppSettingsService(settingsPath, persisted);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(defaultSettings, null, 2), "utf8");
      return new AppSettingsService(settingsPath, defaultSettings);
    }
  }

  getSettings() {
    return structuredClone(this.settings);
  }

  async updateSettings(nextSettings: AppSettings) {
    const parsed = settingsSchema.parse(nextSettings);
    this.settings = parsed;
    await fs.writeFile(this.settingsPath, JSON.stringify(parsed, null, 2), "utf8");
    return this.getSettings();
  }
}
