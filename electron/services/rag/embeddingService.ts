import fs from "node:fs/promises";
import type { RagProgressEvent } from "../../../src/shared/contracts.js";

export interface EmbeddingProviderStatus {
  ok: boolean;
  provider: "builtin";
  model: string;
  message: string;
}

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
type ProgressListener = (event: Partial<RagProgressEvent>) => void;

export class EmbeddingService {
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(
    private readonly cacheDir: string,
    private readonly onProgress: ProgressListener,
  ) {}

  getModelName() {
    return EMBEDDING_MODEL;
  }

  async getStatus(): Promise<EmbeddingProviderStatus> {
    return {
      ok: true,
      provider: "builtin",
      model: EMBEDDING_MODEL,
      message: this.extractorPromise
        ? "内置 embedding 模型已加载。"
        : "内置 embedding 已启用，首次索引会自动下载模型到本地缓存。",
    };
  }

  async embed(text: string, inputType: "query" | "passage" = "passage"): Promise<number[]> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return [];
    }

    const extractor = await this.getExtractor();
    const prefixedText = `${inputType}: ${normalizedText}`;
    const output = await extractor(prefixedText, { pooling: "mean", normalize: true });

    if (!output?.data) {
      throw new Error("内置 embedding 返回格式异常。");
    }

    return Array.from(output.data);
  }

  private async getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadExtractor();
    }
    return this.extractorPromise;
  }

  private async loadExtractor(): Promise<FeatureExtractionPipeline> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = this.cacheDir;
    env.useFSCache = true;
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    this.onProgress({
      phase: "model_loading",
      message: `正在加载内置 embedding 模型 ${EMBEDDING_MODEL}`,
      model: EMBEDDING_MODEL,
      percent: null,
      error: null,
    });

    try {
      const extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL, {
        progress_callback: (progress: unknown) => this.handleLoadProgress(progress),
      })) as FeatureExtractionPipeline;
      this.onProgress({
        phase: "completed",
        message: "内置 embedding 模型已加载。",
        model: EMBEDDING_MODEL,
        percent: 100,
        error: null,
      });
      return extractor;
    } catch (error) {
      this.extractorPromise = null;
      this.onProgress({
        phase: "error",
        message: "内置 embedding 模型加载失败。",
        model: EMBEDDING_MODEL,
        percent: null,
        error: error instanceof Error ? error.message : "未知模型加载错误。",
      });
      throw error;
    }
  }

  private handleLoadProgress(progress: unknown) {
    const payload = normalizeTransformersProgress(progress);
    this.onProgress({
      phase: payload.isDownloading ? "model_downloading" : "model_loading",
      message: payload.message,
      model: EMBEDDING_MODEL,
      percent: payload.percent,
      file: payload.file,
      loaded: payload.loaded,
      total: payload.total,
      error: null,
    });
  }
}

function normalizeTransformersProgress(progress: unknown) {
  const item = progress && typeof progress === "object" ? (progress as Record<string, unknown>) : {};
  const status = typeof item.status === "string" ? item.status : "loading";
  const file =
    typeof item.file === "string"
      ? item.file
      : typeof item.name === "string"
        ? item.name
        : null;
  const loaded = typeof item.loaded === "number" ? item.loaded : null;
  const total = typeof item.total === "number" ? item.total : null;
  const progressValue = typeof item.progress === "number" ? item.progress : null;
  const percent =
    progressValue !== null
      ? Math.max(0, Math.min(100, progressValue > 1 ? progressValue : progressValue * 100))
      : loaded !== null && total
        ? Math.round((loaded / total) * 100)
        : null;
  const isDownloading =
    status.includes("download") ||
    status === "progress" ||
    loaded !== null ||
    total !== null;

  const readableFile = file ? ` ${file}` : "";
  const message = isDownloading
    ? `正在下载模型文件${readableFile}`
    : status === "ready" || status === "done"
      ? `模型文件已准备好${readableFile}`
      : `正在准备模型${readableFile}`;

  return { file, loaded, total, percent, isDownloading, message };
}
