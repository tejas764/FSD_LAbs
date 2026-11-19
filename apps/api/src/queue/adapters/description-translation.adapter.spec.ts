import { ConfigService } from "@nestjs/config";
import {
  LibreTranslateAdapter,
  MockDescriptionTranslationAdapter,
  buildDescriptionTranslationAdapter,
} from "./description-translation.adapter";

describe("DescriptionTranslationAdapter selection", () => {
  it("selects deterministic mock adapter for test env", () => {
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "TRANSLATION_ADAPTER") return "mock";
        return undefined;
      }),
    } as unknown as ConfigService;

    const adapter = buildDescriptionTranslationAdapter(config);
    expect(adapter).toBeInstanceOf(MockDescriptionTranslationAdapter);
  });

  it("selects LibreTranslate adapter for runtime env", () => {
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "TRANSLATION_ADAPTER") return "libretranslate";
        if (key === "LIBRETRANSLATE_URL") return "http://localhost:5000";
        return undefined;
      }),
    } as unknown as ConfigService;

    const adapter = buildDescriptionTranslationAdapter(config);
    expect(adapter).toBeInstanceOf(LibreTranslateAdapter);
  });

  it("mock adapter returns deterministic output", async () => {
    const adapter = new MockDescriptionTranslationAdapter();

    const resultA = await adapter.translate({
      text: "Observed heavy damage",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    const resultB = await adapter.translate({
      text: "Observed heavy damage",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });

    expect(resultA).toBe(resultB);
    expect(resultA).toContain("ar");
  });
});
