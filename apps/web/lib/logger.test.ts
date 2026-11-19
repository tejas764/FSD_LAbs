import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an in-memory writable stream and returns it together with a
 *  `lines()` helper that splits the accumulated output into individual
 *  non-empty log records. */
function captureLines(): {
  dest: { write(msg: string): void };
  lines(): string[];
} {
  const chunks: string[] = [];
  const dest = {
    write(msg: string) {
      chunks.push(msg);
    },
  };
  return {
    dest,
    lines() {
      return chunks.flatMap((c) => c.split("\n").filter(Boolean));
    },
  };
}

// ---------------------------------------------------------------------------
// createLogger — the testable factory
// ---------------------------------------------------------------------------

describe("createLogger factory", () => {
  it("returns an object with debug, info, warn, and error methods", async () => {
    const { createLogger } = await import("./logger");
    const log = createLogger({ env: "production", dest: process.stdout });

    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("writes structured JSON in production mode", async () => {
    const { createLogger } = await import("./logger");
    const { dest, lines } = captureLines();

    const log = createLogger({ env: "production", dest });
    log.info("hello world");

    const parsed = JSON.parse(lines()[0]);
    expect(parsed.msg).toBe("hello world");
    // pino encodes `info` as numeric level 30
    expect(parsed.level).toBe(30);
  });

  it("merges context objects into JSON output", async () => {
    const { createLogger } = await import("./logger");
    const { dest, lines } = captureLines();

    const log = createLogger({ env: "production", dest });
    log.info({ requestId: "abc-123", userId: 42 }, "request received");

    const parsed = JSON.parse(lines()[0]);
    expect(parsed.msg).toBe("request received");
    expect(parsed.requestId).toBe("abc-123");
    expect(parsed.userId).toBe(42);
  });

  it("includes a numeric timestamp in every JSON record", async () => {
    const { createLogger } = await import("./logger");
    const { dest, lines } = captureLines();

    const log = createLogger({ env: "production", dest });
    log.warn("check timestamp");

    const parsed = JSON.parse(lines()[0]);
    expect(typeof parsed.time).toBe("number");
    expect(parsed.time).toBeGreaterThan(0);
  });

  it("suppresses records below the configured minimum level", async () => {
    const { createLogger } = await import("./logger");
    const { dest, lines } = captureLines();

    const log = createLogger({ env: "production", dest, level: "warn" });
    log.debug("suppressed");
    log.info("also suppressed");
    log.warn("visible");
    log.error("also visible");

    expect(lines()).toHaveLength(2);
    const levels = lines().map((l) => JSON.parse(l).level);
    // pino: warn=40, error=50
    expect(levels).toEqual([40, 50]);
  });

  it("defaults to info level", async () => {
    const { createLogger } = await import("./logger");
    const { dest, lines } = captureLines();

    const log = createLogger({ env: "production", dest });
    log.debug("suppressed");
    log.info("visible");

    expect(lines()).toHaveLength(1);
    expect(JSON.parse(lines()[0]).msg).toBe("visible");
  });
});

// ---------------------------------------------------------------------------
// logger singleton
// ---------------------------------------------------------------------------

describe("logger singleton", () => {
  it("is exported as a named export from lib/logger", async () => {
    const mod = await import("./logger");
    expect(mod.logger).toBeDefined();
  });

  it("is the same object on repeated imports (singleton)", async () => {
    const { logger: a } = await import("./logger");
    const { logger: b } = await import("./logger");
    expect(a).toBe(b);
  });

  it("has debug, info, warn, and error methods", async () => {
    const { logger } = await import("./logger");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });
});
