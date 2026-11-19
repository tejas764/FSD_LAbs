import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const DESCRIPTION_TRANSLATION_ADAPTER_TOKEN =
  "DESCRIPTION_TRANSLATION_ADAPTER_TOKEN";

export type DescriptionTranslationInput = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export interface DescriptionTranslationAdapter {
  translate(input: DescriptionTranslationInput): Promise<string>;
}

@Injectable()
export class MockDescriptionTranslationAdapter implements DescriptionTranslationAdapter {
  async translate(input: DescriptionTranslationInput): Promise<string> {
    return `[${input.targetLanguage}] ${input.text}`;
  }
}

@Injectable()
export class LibreTranslateAdapter implements DescriptionTranslationAdapter {
  constructor(private readonly baseUrl: string) {}

  async translate(input: DescriptionTranslationInput): Promise<string> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/translate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: input.text,
          source: input.sourceLanguage,
          target: input.targetLanguage,
          format: "text",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Translation request failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as { translatedText?: string };
    return body.translatedText ?? input.text;
  }
}

export function buildDescriptionTranslationAdapter(
  configService: ConfigService,
): DescriptionTranslationAdapter {
  const selected = configService.get<string>("TRANSLATION_ADAPTER", "mock");
  if (selected === "libretranslate") {
    const baseUrl = configService.get<string>(
      "LIBRETRANSLATE_URL",
      "http://localhost:5000",
    );
    return new LibreTranslateAdapter(baseUrl);
  }
  return new MockDescriptionTranslationAdapter();
}

export const injectDescriptionTranslationAdapter = () =>
  Inject(DESCRIPTION_TRANSLATION_ADAPTER_TOKEN);
