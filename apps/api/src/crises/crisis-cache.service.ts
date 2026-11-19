import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

type CacheEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class CrisisCacheService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly memoryCache = new Map<string, CacheEntry>();

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const redisUrl = configService.get<string>("REDIS_URL");

    if (!redisUrl) {
      this.redis = null;
      return;
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    const memoryEntry = this.memoryCache.get(key);

    if (memoryEntry) {
      if (memoryEntry.expiresAt > now) {
        return JSON.parse(memoryEntry.value) as T;
      }
      this.memoryCache.delete(key);
    }

    if (!this.redis) {
      return null;
    }

    try {
      await this.redis.connect();
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.memoryCache.set(key, {
      value: serializedValue,
      expiresAt,
    });

    if (!this.redis) {
      return;
    }

    try {
      await this.redis.connect();
      await this.redis.set(key, serializedValue, "EX", ttlSeconds);
    } catch {
      // Memory cache remains as a safe fallback when Redis is unavailable.
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }

    if (this.redis.status === "ready" || this.redis.status === "connect") {
      try {
        await this.redis.quit();
      } catch {
        // Ignore teardown errors in test/local environments.
      }
    }
  }
}
