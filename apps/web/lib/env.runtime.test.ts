import { describe, it, expect } from "vitest";
import { getRuntimeConfig } from "./env.runtime";

describe("getRuntimeConfig", () => {
  it("returns default max photo size when env is missing", () => {
    const result = getRuntimeConfig({});
    expect(result.MAX_PHOTO_SIZE_MB).toBe(5);
  });

  it("returns default max photo size when env is invalid", () => {
    const result = getRuntimeConfig({ MAX_PHOTO_SIZE_MB: "invalid" });
    expect(result.MAX_PHOTO_SIZE_MB).toBe(5);
  });

  it("returns env max photo size when env is a positive number", () => {
    const result = getRuntimeConfig({ MAX_PHOTO_SIZE_MB: "7" });
    expect(result.MAX_PHOTO_SIZE_MB).toBe(7);
  });

  it("returns default offline max attempts when env is missing", () => {
    const result = getRuntimeConfig({});
    expect(result.OFFLINE_MAX_ATTEMPTS).toBe(5);
  });

  it("returns env offline max attempts when env is a positive number", () => {
    const result = getRuntimeConfig({ NEXT_PUBLIC_OFFLINE_MAX_ATTEMPTS: "8" });
    expect(result.OFFLINE_MAX_ATTEMPTS).toBe(8);
  });

  it("ignores non-public offline max attempts env for runtime config", () => {
    const result = getRuntimeConfig({ OFFLINE_MAX_ATTEMPTS: "9" });
    expect(result.OFFLINE_MAX_ATTEMPTS).toBe(5);
  });
});
