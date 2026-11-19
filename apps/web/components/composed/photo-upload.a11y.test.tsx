// a11y test — runs in jsdom via the a11y vitest project (no annotation needed here)
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { PhotoUpload } from "./photo-upload";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("PhotoUpload — accessibility", () => {
  it("has no axe violations in initial (empty) state", async () => {
    const { container } = render(<PhotoUpload onChange={vi.fn()} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations with a photo selected", async () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    const { container } = render(
      <PhotoUpload value={file} onChange={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations in error state", async () => {
    const oversized = new File([new ArrayBuffer(6 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    const { container } = render(
      <PhotoUpload value={oversized} onChange={vi.fn()} maxSizeKB={500} />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
