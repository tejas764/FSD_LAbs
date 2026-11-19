import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("global animation utilities", () => {
  it("imports tw-animate-css so Radix animation classes resolve", () => {
    const globalsPath = join(process.cwd(), "app", "globals.css");
    const css = readFileSync(globalsPath, "utf8");

    expect(css).toContain('@import "tw-animate-css";');
  });
});
