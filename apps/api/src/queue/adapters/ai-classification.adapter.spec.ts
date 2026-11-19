import { DamageLevel } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { Logger } from "@nestjs/common";
import {
  MockAiClassificationAdapter,
  RuntimeAiClassificationAdapter,
  buildAiClassificationAdapter,
} from "./ai-classification.adapter";

/** Stub fetchImage for tests that don't care about the fetching behaviour. */
const STUB_FETCH = (): Promise<Buffer> => Promise.resolve(Buffer.from("fake-jpeg"));

describe("AiClassificationAdapter selection", () => {
  it("selects deterministic mock adapter for test env", () => {
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "AI_CLASSIFICATION_ADAPTER") return "mock";
        return undefined;
      }),
    } as unknown as ConfigService;

    const adapter = buildAiClassificationAdapter(config);
    expect(adapter).toBeInstanceOf(MockAiClassificationAdapter);
  });

  it("selects runtime adapter for production env", () => {
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "AI_CLASSIFICATION_ADAPTER") return "runtime";
        if (key === "ANTHROPIC_API_KEY") return "test-key";
        if (key === "STORAGE_PUBLIC_URL") {
          return "https://storage.example.test";
        }
        if (key === "ANTHROPIC_MODEL") return "claude-test";
        return undefined;
      }),
    } as unknown as ConfigService;

    const adapter = buildAiClassificationAdapter(config);
    expect(adapter).toBeInstanceOf(RuntimeAiClassificationAdapter);
  });

  it("mock adapter returns deterministic output", async () => {
    const adapter = new MockAiClassificationAdapter();

    const resultA = await adapter.classify({
      reportId: "report-1",
      photoKey: "reports/photo-a.jpg",
    });
    const resultB = await adapter.classify({
      reportId: "report-1",
      photoKey: "reports/photo-a.jpg",
    });

    expect(resultA).toEqual(resultB);
    expect(Object.values(DamageLevel)).toContain(resultA.damageLevel);
  });

  it("runtime adapter calls Anthropic and parses assessment", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            damageLevel: "COMPLETE",
            confidence: 0.92,
          }),
        },
      ],
    });

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: {
        messages: {
          create: createMock,
        },
      },
      fetchImage: STUB_FETCH,
    });

    const result = await adapter.classify({
      reportId: "report-77",
      photoKey: "reports/report-77/photo.jpg",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-test",
      }),
    );
    expect(result).toEqual({
      damageLevel: DamageLevel.COMPLETE,
      confidence: 0.92,
    });
  });

  it("runtime adapter throws when Anthropic request fails", async () => {
    const createMock = jest
      .fn()
      .mockRejectedValue(new Error("service unavailable"));

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: {
        messages: {
          create: createMock,
        },
      },
      fetchImage: STUB_FETCH,
    });

    await expect(
      adapter.classify({
        reportId: "report-77",
        photoKey: "reports/report-77/photo.jpg",
      }),
    ).rejects.toThrow("Anthropic AI classification failed");
  });

  it("sends system prompt with prompt caching enabled", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "PARTIAL", confidence: 0.8 }),
        },
      ],
    });

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await adapter.classify({
      reportId: "r1",
      photoKey: "reports/r1/photo.jpg",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            cache_control: { type: "ephemeral" },
          }),
        ]),
      }),
    );
  });

  it("uses output_config json_schema for reliable structured output", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "COMPLETE", confidence: 0.95 }),
        },
      ],
    });

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await adapter.classify({
      reportId: "r1",
      photoKey: "reports/r1/photo.jpg",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        output_config: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" }),
        }),
      }),
    );
  });

  it("output_config confidence schema omits minimum/maximum (not supported by API)", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "PARTIAL", confidence: 0.7 }),
        },
      ],
    });

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await adapter.classify({
      reportId: "r1",
      photoKey: "reports/r1/photo.jpg",
    });

    const callArg = createMock.mock.calls[0][0] as {
      output_config: {
        format: {
          schema: { properties: { confidence: Record<string, unknown> } };
        };
      };
    };
    const confidenceSchema =
      callArg.output_config.format.schema.properties.confidence;
    expect(confidenceSchema).not.toHaveProperty("minimum");
    expect(confidenceSchema).not.toHaveProperty("maximum");
  });

  it("places image block before assessment text in user content", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "MINIMAL", confidence: 0.6 }),
        },
      ],
    });

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await adapter.classify({
      reportId: "r1",
      photoKey: "reports/r1/photo.jpg",
    });

    const callArg = createMock.mock.calls[0][0] as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    const userContent = callArg.messages[0].content;
    expect(userContent[0].type).toBe("image");
    expect(userContent[1].type).toBe("text");
  });

  it("re-throws RateLimitError unchanged so BullMQ can retry with backoff", async () => {
    const mockHeaders = { get: () => null } as unknown as Headers;
    const rateLimitErr = new Anthropic.RateLimitError(
      429,
      { error: { type: "rate_limit_error", message: "too many requests" } },
      "too many requests",
      mockHeaders,
    );
    const createMock = jest.fn().mockRejectedValue(rateLimitErr);

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await expect(
      adapter.classify({ reportId: "r1", photoKey: "reports/r1/photo.jpg" }),
    ).rejects.toBeInstanceOf(Anthropic.RateLimitError);
  });

  it("re-throws APIConnectionError unchanged so BullMQ can retry", async () => {
    const connErr = new Anthropic.APIConnectionError({
      message: "ECONNREFUSED",
    });
    const createMock = jest.fn().mockRejectedValue(connErr);

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await expect(
      adapter.classify({ reportId: "r1", photoKey: "reports/r1/photo.jpg" }),
    ).rejects.toBeInstanceOf(Anthropic.APIConnectionError);
  });

  it("re-throws InternalServerError unchanged so BullMQ can retry", async () => {
    const mockHeaders = { get: () => null } as unknown as Headers;
    const serverErr = new Anthropic.InternalServerError(
      500,
      { error: { type: "api_error", message: "internal error" } },
      "internal error",
      mockHeaders,
    );
    const createMock = jest.fn().mockRejectedValue(serverErr);

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await expect(
      adapter.classify({ reportId: "r1", photoKey: "reports/r1/photo.jpg" }),
    ).rejects.toBeInstanceOf(Anthropic.InternalServerError);
  });

  it("wraps AuthenticationError with descriptive message (do-not-retry)", async () => {
    const mockHeaders = { get: () => null } as unknown as Headers;
    const authErr = new Anthropic.AuthenticationError(
      401,
      { error: { type: "authentication_error", message: "invalid key" } },
      "invalid key",
      mockHeaders,
    );
    const createMock = jest.fn().mockRejectedValue(authErr);

    const adapter = new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });

    await expect(
      adapter.classify({ reportId: "r1", photoKey: "reports/r1/photo.jpg" }),
    ).rejects.toThrow("AI classification auth failed");
  });

  it("uses default Anthropic model when ANTHROPIC_MODEL is not set", async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            damageLevel: "PARTIAL",
            confidence: 0.7,
          }),
        },
      ],
    });

    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === "AI_CLASSIFICATION_ADAPTER") return "runtime";
        if (key === "ANTHROPIC_API_KEY") return "test-key";
        if (key === "STORAGE_PUBLIC_URL") {
          return "https://storage.example.test";
        }
        if (key === "ANTHROPIC_API_BASE_URL") {
          return "https://api.anthropic.com";
        }
        return fallback;
      }),
    } as unknown as ConfigService;

    const adapter = buildAiClassificationAdapter(
      config,
    ) as RuntimeAiClassificationAdapter;

    Object.assign(adapter as object, {
      anthropicClient: {
        messages: {
          create: createMock,
        },
      },
      fetchImage: STUB_FETCH,
    });

    await adapter.classify({
      reportId: "report-88",
      photoKey: "reports/report-88/photo.jpg",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
      }),
    );
  });
});

describe("RuntimeAiClassificationAdapter logging", () => {
  afterEach(() => jest.restoreAllMocks());

  function makeAdapter(createMock: jest.Mock) {
    return new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "https://storage.example.test",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage: STUB_FETCH,
    });
  }

  it("logs debug with reportId and model before calling the API", async () => {
    const debugSpy = jest
      .spyOn(Logger.prototype, "debug")
      .mockImplementation(() => {});
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "PARTIAL", confidence: 0.8 }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10 },
    });

    await makeAdapter(createMock).classify({
      reportId: "r-log-1",
      photoKey: "reports/r-log-1/photo.jpg",
    });

    const firstCall = String(debugSpy.mock.calls[0]?.[0] ?? "");
    expect(firstCall).toContain("r-log-1");
    expect(firstCall).toContain("claude-test");
  });

  it("logs debug with damageLevel, confidence, and token usage after success", async () => {
    const debugSpy = jest
      .spyOn(Logger.prototype, "debug")
      .mockImplementation(() => {});
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ damageLevel: "COMPLETE", confidence: 0.95 }),
        },
      ],
      usage: { input_tokens: 422, output_tokens: 17 },
    });

    await makeAdapter(createMock).classify({
      reportId: "r-log-2",
      photoKey: "reports/r-log-2/photo.jpg",
    });

    const calls = debugSpy.mock.calls.map((c) => String(c[0]));
    const afterCall = calls.find((msg) => msg.includes("COMPLETE"));
    expect(afterCall).toBeDefined();
    expect(afterCall).toContain("0.95");
    expect(afterCall).toContain("422");
    expect(afterCall).toContain("17");
  });

  it("logs warn on RateLimitError before re-throwing", async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const mockHeaders = { get: () => null } as unknown as Headers;
    const err = new Anthropic.RateLimitError(
      429,
      { error: { type: "rate_limit_error", message: "too many" } },
      "too many",
      mockHeaders,
    );
    const createMock = jest.fn().mockRejectedValue(err);

    await expect(
      makeAdapter(createMock).classify({
        reportId: "r-log-3",
        photoKey: "reports/r-log-3/photo.jpg",
      }),
    ).rejects.toBeInstanceOf(Anthropic.RateLimitError);

    const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warnMsg).toContain("r-log-3");
  });

  it("logs error on AuthenticationError before re-throwing wrapped error", async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const mockHeaders = { get: () => null } as unknown as Headers;
    const err = new Anthropic.AuthenticationError(
      401,
      { error: { type: "authentication_error", message: "invalid key" } },
      "invalid key",
      mockHeaders,
    );
    const createMock = jest.fn().mockRejectedValue(err);

    await expect(
      makeAdapter(createMock).classify({
        reportId: "r-log-4",
        photoKey: "reports/r-log-4/photo.jpg",
      }),
    ).rejects.toThrow("AI classification auth failed");

    const errMsg = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(errMsg).toContain("r-log-4");
  });

  it("logs error on unclassified Anthropic failure", async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const createMock = jest.fn().mockRejectedValue(new Error("unexpected"));

    await expect(
      makeAdapter(createMock).classify({
        reportId: "r-log-5",
        photoKey: "reports/r-log-5/photo.jpg",
      }),
    ).rejects.toThrow("Anthropic AI classification failed");

    const errMsg = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(errMsg).toContain("r-log-5");
  });
});

describe("RuntimeAiClassificationAdapter image fetching (base64)", () => {
  const FAKE_IMAGE_BYTES = Buffer.from("JFIF_fake_jpeg_bytes");
  const FAKE_BASE64 = FAKE_IMAGE_BYTES.toString("base64");

  function makeAdapterWithFetch(
    createMock: jest.Mock,
    fetchImage?: (url: string) => Promise<Buffer>,
  ) {
    return new RuntimeAiClassificationAdapter({
      apiKey: "test-key",
      storagePublicUrl: "http://localhost:9000/crisismap-reports",
      model: "claude-test",
      anthropicClient: { messages: { create: createMock } },
      fetchImage,
    });
  }

  const successResponse = {
    content: [
      {
        type: "text",
        text: JSON.stringify({ damageLevel: "COMPLETE", confidence: 0.9 }),
      },
    ],
  };

  it("fetches image bytes from the storage URL before calling Anthropic", async () => {
    const fetchMock = jest.fn().mockResolvedValue(FAKE_IMAGE_BYTES);
    const createMock = jest.fn().mockResolvedValue(successResponse);

    const adapter = makeAdapterWithFetch(createMock, fetchMock);
    await adapter.classify({
      reportId: "r-b64-1",
      photoKey: "reports/r-b64-1/photo.jpg",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchedUrl = fetchMock.mock.calls[0][0] as string;
    expect(fetchedUrl).toContain("localhost:9000");
    expect(fetchedUrl).toContain("reports/r-b64-1/photo.jpg");
  });

  it("sends image as base64 source type (not url) to Anthropic", async () => {
    const fetchMock = jest.fn().mockResolvedValue(FAKE_IMAGE_BYTES);
    const createMock = jest.fn().mockResolvedValue(successResponse);

    const adapter = makeAdapterWithFetch(createMock, fetchMock);
    await adapter.classify({
      reportId: "r-b64-2",
      photoKey: "reports/r-b64-2/photo.jpg",
    });

    const callArg = createMock.mock.calls[0][0] as {
      messages: Array<{
        content: Array<{
          type: string;
          source?: { type: string; data?: string; media_type?: string };
        }>;
      }>;
    };
    const imageBlock = callArg.messages[0].content[0];
    expect(imageBlock.type).toBe("image");
    expect(imageBlock.source?.type).toBe("base64");
    expect(imageBlock.source?.data).toBe(FAKE_BASE64);
    expect(imageBlock.source?.media_type).toBe("image/jpeg");
  });

  it("throws if image fetch fails", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const createMock = jest.fn();

    const adapter = makeAdapterWithFetch(createMock, fetchMock);

    await expect(
      adapter.classify({
        reportId: "r-b64-3",
        photoKey: "reports/r-b64-3/photo.jpg",
      }),
    ).rejects.toThrow(/fetch.*photo|photo.*fetch|ECONNREFUSED/i);

    expect(createMock).not.toHaveBeenCalled();
  });
});
