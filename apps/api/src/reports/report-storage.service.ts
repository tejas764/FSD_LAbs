import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, type ClientOptions } from "minio";
import type { Readable } from "node:stream";

type UploadReportPhotoInput = {
  reportId: string;
  imageBuffer: Buffer;
  contentType: string;
};

type UploadReportPhotoResult = {
  photoKey: string;
  thumbnailKey: string | null;
};

type UploadExportFileInput = {
  objectKey: string;
  content: Buffer | Readable;
  contentType: string;
};

type UploadedObjectInfo = {
  etag: string;
  versionId: string | null;
};

@Injectable()
export class ReportStorageService {
  private readonly client: StorageClient;
  private readonly bucket: string;
  private readonly storagePublicUrl: string;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Optional() minioClient?: Client,
  ) {
    this.bucket = configService.get<string>(
      "STORAGE_BUCKET",
      "crisismap-reports",
    );

    const configuredStoragePublicUrl = configService.get<string>(
      "STORAGE_PUBLIC_URL",
      `http://localhost:9000/${this.bucket}`,
    );
    const endpoint = configService.get<string>(
      "STORAGE_ENDPOINT",
      "http://localhost:9000",
    );
    this.storagePublicUrl = resolveStoragePublicUrl(
      configuredStoragePublicUrl,
      endpoint,
      this.bucket,
    );

    const useInMemoryStorage =
      process.env.NODE_ENV === "test" ||
      process.env.JEST_WORKER_ID !== undefined;

    if (minioClient) {
      this.client = minioClient;
      return;
    }

    if (useInMemoryStorage) {
      this.client = new InMemoryStorageClient(this.storagePublicUrl);
      return;
    }

    const endpointUrl = new URL(endpoint);
    const options: ClientOptions = {
      endPoint: endpointUrl.hostname,
      port: endpointUrl.port
        ? parseInt(endpointUrl.port, 10)
        : endpointUrl.protocol === "https:"
          ? 443
          : 80,
      useSSL: endpointUrl.protocol === "https:",
      accessKey: configService.get<string>(
        "STORAGE_ACCESS_KEY_ID",
        "minioadmin",
      ),
      secretKey: configService.get<string>(
        "STORAGE_SECRET_ACCESS_KEY",
        "minioadmin",
      ),
      region: configService.get<string>("STORAGE_REGION", "us-east-1"),
    };

    this.client = new Client(options);
  }

  async uploadReportPhoto({
    reportId,
    imageBuffer,
    contentType,
  }: UploadReportPhotoInput): Promise<UploadReportPhotoResult> {
    const photoKey = `reports/${reportId}/${Date.now()}.jpg`;

    await this.client.putObject(
      this.bucket,
      photoKey,
      imageBuffer,
      imageBuffer.length,
      {
        "Content-Type": contentType,
      },
    );

    return {
      photoKey,
      thumbnailKey: null,
    };
  }

  async uploadExportFile({
    objectKey,
    content,
    contentType,
  }: UploadExportFileInput): Promise<void> {
    if (Buffer.isBuffer(content)) {
      await this.client.putObject(
        this.bucket,
        objectKey,
        content,
        content.length,
        {
          "Content-Type": contentType,
        },
      );
      return;
    }

    await this.client.putObject(this.bucket, objectKey, content, undefined, {
      "Content-Type": contentType,
    });
  }

  async createSignedDownloadUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const presignedUrl = await this.client.presignedGetObject(
      this.bucket,
      objectKey,
      expiresInSeconds,
    );

    // Rewrite the internal MinIO endpoint origin to the public URL so browsers
    // can download the file (important in Codespaces / behind a reverse proxy).
    try {
      const parsed = new URL(presignedUrl);
      const publicBase = new URL(this.storagePublicUrl);
      // Set protocol, hostname, and port individually so that clearing the port
      // (e.g. public URL has no explicit port) actually removes it from the URL.
      parsed.protocol = publicBase.protocol;
      parsed.hostname = publicBase.hostname;
      parsed.port = publicBase.port;
      return parsed.toString();
    } catch {
      return presignedUrl;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }
}

type StorageClient = Pick<
  Client,
  "putObject" | "presignedGetObject" | "removeObject"
>;

type StoredObject = {
  contentType?: string;
  value: Buffer;
};

class InMemoryStorageClient implements StorageClient {
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly publicBaseUrl: string) {}

  async putObject(
    bucket: string,
    objectKey: string,
    content: Parameters<Client["putObject"]>[2],
    size?: number,
    metaData?: Parameters<Client["putObject"]>[4],
  ): Promise<UploadedObjectInfo> {
    const buffer = await toBuffer(content);
    this.objects.set(`${bucket}/${objectKey}`, {
      contentType: metaData?.["Content-Type"],
      value: size ? buffer.subarray(0, size) : buffer,
    });

    return {
      etag: `in-memory-${bucket}-${objectKey}`,
      versionId: null,
    };
  }

  async presignedGetObject(
    bucket: string,
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const url = new URL(
      `${bucket}/${objectKey}`,
      ensureTrailingSlash(this.publicBaseUrl),
    );
    url.searchParams.set("expiresIn", String(expiresInSeconds));
    return url.toString();
  }

  async removeObject(bucket: string, objectKey: string): Promise<void> {
    this.objects.delete(`${bucket}/${objectKey}`);
  }
}

async function toBuffer(content: Buffer | Readable | string): Promise<Buffer> {
  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (typeof content === "string") {
    return Buffer.from(content);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveStoragePublicUrl(
  configuredStoragePublicUrl: string,
  endpoint: string,
  bucket: string,
): string {
  if (!shouldRewriteForCodespaces(configuredStoragePublicUrl, endpoint)) {
    return configuredStoragePublicUrl;
  }

  const codespaceName = process.env.CODESPACE_NAME;
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const endpointUrl = new URL(endpoint);

  if (!codespaceName || !forwardingDomain || !endpointUrl.port) {
    return configuredStoragePublicUrl;
  }

  return `https://${codespaceName}-${endpointUrl.port}.${forwardingDomain}/${bucket}`;
}

function shouldRewriteForCodespaces(
  configuredStoragePublicUrl: string,
  endpoint: string,
): boolean {
  try {
    const publicUrl = new URL(configuredStoragePublicUrl);
    const endpointUrl = new URL(endpoint);

    return (
      publicUrl.hostname === endpointUrl.hostname &&
      publicUrl.port === endpointUrl.port &&
      (publicUrl.hostname === "localhost" || publicUrl.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
