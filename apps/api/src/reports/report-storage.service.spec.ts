import { ConfigService } from "@nestjs/config";
import type { Client as MinioClient } from "minio";
import { ReportStorageService } from "./report-storage.service";

describe("ReportStorageService", () => {
  afterEach(() => {
    delete process.env.CODESPACE_NAME;
    delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  });

  it("rewrites presigned URL origin to STORAGE_PUBLIC_URL", async () => {
    const presignedGetObject = jest
      .fn()
      .mockResolvedValue(
        "http://localhost:9000/crisismap-reports/exports/74.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&Expires=3600",
      );
    const mockMinio = { presignedGetObject } as unknown as MinioClient;

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "STORAGE_BUCKET") return "crisismap-reports";
        if (key === "STORAGE_PUBLIC_URL")
          return "https://codespace-xxxx-9000.app.github.dev/crisismap-reports";
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new ReportStorageService(config, mockMinio);
    const url = await service.createSignedDownloadUrl("exports/74.csv", 3600);

    expect(url).toMatch(/^https:\/\/codespace-xxxx-9000\.app\.github\.dev\//);
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("exports/74.csv");
  });

  it("derives a Codespaces public URL when STORAGE_PUBLIC_URL is still localhost", async () => {
    process.env.CODESPACE_NAME = "scaling-goggles-6q94497xx9f4467";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";

    const presignedGetObject = jest
      .fn()
      .mockResolvedValue(
        "http://localhost:9000/crisismap-reports/exports/149.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&Expires=86400",
      );
    const mockMinio = { presignedGetObject } as unknown as MinioClient;

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "STORAGE_BUCKET") return "crisismap-reports";
        if (key === "STORAGE_PUBLIC_URL")
          return "http://localhost:9000/crisismap-reports";
        if (key === "STORAGE_ENDPOINT") return "http://localhost:9000";
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new ReportStorageService(config, mockMinio);
    const url = await service.createSignedDownloadUrl("exports/149.csv", 86400);

    expect(url).toMatch(
      /^https:\/\/scaling-goggles-6q94497xx9f4467-9000\.app\.github\.dev\//,
    );
    expect(url).toContain("exports/149.csv");
  });

  it("falls back to presigned URL when public URL is unparseable", async () => {
    const presignedGetObject = jest
      .fn()
      .mockResolvedValue("http://localhost:9000/bucket/key?sig=abc");
    const mockMinio = { presignedGetObject } as unknown as MinioClient;

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "STORAGE_BUCKET") return "crisismap-reports";
        if (key === "STORAGE_PUBLIC_URL") return "not-a-valid-url";
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new ReportStorageService(config, mockMinio);
    const url = await service.createSignedDownloadUrl("key", 60);

    expect(url).toBe("http://localhost:9000/bucket/key?sig=abc");
  });

  it("uploads photo to expected bucket and key", async () => {
    const putObject = jest.fn().mockResolvedValue({ etag: "etag" });
    const mockMinio = {
      putObject,
    } as unknown as MinioClient;

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "STORAGE_BUCKET") {
          return "crisismap-reports";
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new ReportStorageService(config, mockMinio);
    const result = await service.uploadReportPhoto({
      reportId: "report-123",
      imageBuffer: Buffer.from([1, 2, 3]),
      contentType: "image/jpeg",
    });

    expect(putObject).toHaveBeenCalledWith(
      "crisismap-reports",
      expect.stringMatching(/^reports\/report-123\//),
      expect.any(Buffer),
      3,
      expect.objectContaining({
        "Content-Type": "image/jpeg",
      }),
    );
    expect(result.photoKey).toMatch(/^reports\/report-123\//);
  });

  it("deletes object from expected bucket", async () => {
    const removeObject = jest.fn().mockResolvedValue(undefined);
    const mockMinio = {
      removeObject,
    } as unknown as MinioClient;

    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "STORAGE_BUCKET") {
          return "crisismap-reports";
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new ReportStorageService(config, mockMinio);
    await service.deleteObject("reports/report-123/123.jpg");

    expect(removeObject).toHaveBeenCalledWith(
      "crisismap-reports",
      "reports/report-123/123.jpg",
    );
  });
});
