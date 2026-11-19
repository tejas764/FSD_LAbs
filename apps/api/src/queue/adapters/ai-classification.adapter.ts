import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { DamageLevel } from "@prisma/client";

async function defaultFetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching image`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const AI_CLASSIFICATION_ADAPTER_TOKEN =
  "AI_CLASSIFICATION_ADAPTER_TOKEN";

/**
 * RAPIDA damage assessment system prompt.
 * Versioned in code — not operator-configurable — because the MINIMAL/PARTIAL/COMPLETE
 * definitions are fixed by the UNDP RAPIDA methodology spec. Changing them is a
 * code change that must go through review and TDD, not a deployment-time env var.
 */
export const RAPIDA_DAMAGE_ASSESSMENT_SYSTEM_PROMPT = [
  "You are a crisis damage assessment specialist for UNDP's RAPIDA methodology.",
  "Classify building damage from the provided photo into exactly one of three levels:",
  "MINIMAL: Minor surface damage only — structure is intact and fully habitable.",
  "PARTIAL: Significant structural damage — partially usable but unsafe without repairs.",
  "COMPLETE: Severe structural failure — uninhabitable or destroyed.",
  "Respond only with a JSON object matching the required schema.",
  "No preamble, no markdown fence, no explanation outside the JSON.",
].join(" ");

export type AiClassificationInput = {
  reportId: string;
  photoKey: string;
};

export type AiClassificationOutput = {
  damageLevel: DamageLevel;
  confidence: number;
};

export interface AiClassificationAdapter {
  classify(input: AiClassificationInput): Promise<AiClassificationOutput>;
}

type RuntimeAiClassificationAdapterOptions = {
  apiKey: string;
  storagePublicUrl: string;
  model: string;
  baseUrl?: string;
  anthropicClient?: {
    messages: {
      create: Anthropic.Messages["create"];
    };
  };
  /** Injectable for tests; defaults to a Node fetch in production. */
  fetchImage?: (url: string) => Promise<Buffer>;
};

@Injectable()
export class MockAiClassificationAdapter implements AiClassificationAdapter {
  async classify(
    input: AiClassificationInput,
  ): Promise<AiClassificationOutput> {
    const hashSource = `${input.reportId}:${input.photoKey}`;
    const hash = [...hashSource].reduce((acc, c) => acc + c.charCodeAt(0), 0);

    const levels: DamageLevel[] = [
      DamageLevel.MINIMAL,
      DamageLevel.PARTIAL,
      DamageLevel.COMPLETE,
    ];

    return {
      damageLevel: levels[hash % levels.length],
      confidence: 0.75,
    };
  }
}

@Injectable()
export class RuntimeAiClassificationAdapter implements AiClassificationAdapter {
  private readonly logger = new Logger(RuntimeAiClassificationAdapter.name);
  private readonly anthropicClient: {
    messages: {
      create: Anthropic.Messages["create"];
    };
  };
  private readonly fetchImage: (url: string) => Promise<Buffer>;

  constructor(private readonly options: RuntimeAiClassificationAdapterOptions) {
    this.anthropicClient =
      options.anthropicClient ??
      new Anthropic({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
      });
    this.fetchImage = options.fetchImage ?? defaultFetchImage;
  }

  async classify(
    input: AiClassificationInput,
  ): Promise<AiClassificationOutput> {
    const photoUrl = this.buildPhotoUrl(input.photoKey);
    let body: {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    this.logger.debug(
      `Classifying report ${input.reportId} with model ${this.options.model} (photo: ${input.photoKey})`,
    );

    const imageBytes = await this.fetchImageBytes(photoUrl, input.reportId);
    const imageBase64 = imageBytes.toString("base64");

    try {
      body = (await this.anthropicClient.messages.create({
        model: this.options.model,
        max_tokens: 256,
        temperature: 0,
        system: [
          {
            type: "text",
            text: RAPIDA_DAMAGE_ASSESSMENT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                damageLevel: {
                  type: "string",
                  enum: ["MINIMAL", "PARTIAL", "COMPLETE"],
                  description: "The RAPIDA damage level classification",
                },
                confidence: {
                  type: "number",
                  description:
                    "Confidence score from 0 (uncertain) to 1 (certain)",
                },
              },
              required: ["damageLevel", "confidence"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Assess the structural damage severity in this crisis photo.",
              },
            ],
          },
        ],
      })) as {
        content?: Array<{ type?: string; text?: string }>;
      };
    } catch (error) {
      // Retryable errors: re-throw unchanged so BullMQ worker can retry with backoff
      if (
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.APIConnectionError ||
        error instanceof Anthropic.InternalServerError
      ) {
        if (error instanceof Anthropic.RateLimitError) {
          this.logger.warn(
            `AI classification rate-limited for report ${input.reportId} — will retry (requestId: ${error.requestID ?? "unknown"})`,
          );
        }
        throw error;
      }
      // Fatal config error: fail with a clear message, do not retry
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger.error(
          `AI classification auth error for report ${input.reportId} — ANTHROPIC_API_KEY may be invalid (${error.status})`,
        );
        throw new Error(
          `AI classification auth failed: check ANTHROPIC_API_KEY (${error.status})`,
        );
      }
      this.logger.error(
        `AI classification failed for report ${input.reportId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new Error(
        `Anthropic AI classification failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    const textResponse = body.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    if (!textResponse) {
      throw new Error("Anthropic AI classification returned empty content");
    }

    const parsed = JSON.parse(textResponse) as {
      damageLevel?: string;
      confidence?: number;
    };

    const result = {
      damageLevel: this.normalizeDamageLevel(parsed.damageLevel),
      confidence: this.normalizeConfidence(parsed.confidence),
    };

    this.logger.debug(
      `Classification complete for report ${input.reportId}: ${result.damageLevel} (confidence=${result.confidence}) | tokens: in=${body.usage?.input_tokens ?? "?"} out=${body.usage?.output_tokens ?? "?"}`,
    );

    return result;
  }

  private buildPhotoUrl(photoKey: string): string {
    const base = this.options.storagePublicUrl.replace(/\/$/, "");
    const encodedPhotoKey = photoKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return `${base}/${encodedPhotoKey}`;
  }

  private async fetchImageBytes(
    url: string,
    reportId: string,
  ): Promise<Buffer> {
    try {
      return await this.fetchImage(url);
    } catch (err) {
      throw new Error(
        `Failed to fetch photo for report ${reportId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private normalizeDamageLevel(value?: string): DamageLevel {
    if (value === DamageLevel.MINIMAL) return DamageLevel.MINIMAL;
    if (value === DamageLevel.PARTIAL) return DamageLevel.PARTIAL;
    if (value === DamageLevel.COMPLETE) return DamageLevel.COMPLETE;
    return DamageLevel.PARTIAL;
  }

  private normalizeConfidence(value?: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0.5;
    }

    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }
}

export function buildAiClassificationAdapter(
  configService: ConfigService,
): AiClassificationAdapter {
  const selected = configService.get<string>(
    "AI_CLASSIFICATION_ADAPTER",
    "mock",
  );
  if (selected === "runtime") {
    const apiKey = configService.get<string>("ANTHROPIC_API_KEY", "");
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required when AI_CLASSIFICATION_ADAPTER=runtime",
      );
    }

    const storagePublicUrl = configService.get<string>(
      "STORAGE_PUBLIC_URL",
      "",
    );
    if (!storagePublicUrl) {
      throw new Error(
        "STORAGE_PUBLIC_URL is required when AI_CLASSIFICATION_ADAPTER=runtime",
      );
    }

    return new RuntimeAiClassificationAdapter({
      apiKey,
      storagePublicUrl,
      model: configService.get<string>("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
      baseUrl: configService.get<string>(
        "ANTHROPIC_API_BASE_URL",
        "https://api.anthropic.com",
      ),
    });
  }
  return new MockAiClassificationAdapter();
}

export const injectAiClassificationAdapter = () =>
  Inject(AI_CLASSIFICATION_ADAPTER_TOKEN);
