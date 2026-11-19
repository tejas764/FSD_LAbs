// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock canvas API for jsdom (compression path)
const toBlob = vi.fn((cb: BlobCallback) =>
  cb(new Blob(["compressed"], { type: "image/webp" })),
);
const mockCanvas = {
  getContext: () => ({
    drawImage: vi.fn(),
  }),
  toBlob,
  width: 0,
  height: 0,
};
vi.stubGlobal(
  "HTMLCanvasElement",
  class extends HTMLElement {
    getContext() {
      return mockCanvas.getContext();
    }
    toBlob(cb: BlobCallback) {
      toBlob(cb);
    }
  },
);
document.createElement = new Proxy(document.createElement.bind(document), {
  apply(target, thisArg, [tagName, ...rest]) {
    if (tagName === "canvas") {
      return Object.assign(target.call(thisArg, tagName, ...rest), mockCanvas);
    }
    return target.call(thisArg, tagName, ...rest);
  },
});

// Mock Image
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 400;
  naturalHeight = 300;
  private _src = "";

  set src(v: string) {
    this._src = v;
    if (this.onload) setTimeout(() => this.onload?.(), 0);
  }

  get src() {
    return this._src;
  }
}
vi.stubGlobal("Image", MockImage);

// Mock URL.createObjectURL
// Spy on URL static methods without replacing the URL constructor
vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

describe("PhotoUpload — behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    // Spy on URL static methods without replacing the URL constructor
  });

  it("renders a button to select a photo", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    render(<PhotoUpload onChange={vi.fn()} />);

    // Should have a button or label that triggers the file input
    const trigger = screen.getByRole("button");
    expect(trigger).toBeInTheDocument();
  });

  it("file input has accept='image/*' and capture='environment'", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const { container } = render(<PhotoUpload onChange={vi.fn()} />);

    const input = container.querySelector("input[type=file]");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("capture", "environment");
  });

  it("file input is visually hidden (sr-only or hidden)", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const { container } = render(<PhotoUpload onChange={vi.fn()} />);

    const input = container.querySelector("input[type=file]");
    // Input should not be directly visible — either sr-only, hidden, or display:none
    const style = window.getComputedStyle(input!);
    const hasHiddenClass =
      input!.className.includes("sr-only") ||
      input!.className.includes("hidden") ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.clip === "rect(0px, 0px, 0px, 0px)";
    expect(hasHiddenClass).toBe(true);
  });

  it("shows preview image when value is provided", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });

    render(<PhotoUpload value={file} onChange={vi.fn()} />);

    // Should show the captured photo preview
    const preview = screen.getByRole("img");
    expect(preview).toBeInTheDocument();
  });

  it("remove button appears when photo is selected and calls onChange(null)", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    const onChange = vi.fn();

    render(<PhotoUpload value={file} onChange={onChange} />);

    // Remove button should be present
    const removeBtn = screen.getByRole("button", {
      name: /reporter\.photo\.remove_photo|remove/i,
    });
    expect(removeBtn).toBeInTheDocument();

    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("activates file input when button is clicked", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const { container } = render(<PhotoUpload onChange={vi.fn()} />);

    const input = container.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button"));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("button is keyboard-activatable (Enter key)", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    render(<PhotoUpload onChange={vi.fn()} />);

    const btn = screen.getByRole("button");
    // Enter key should trigger click on the button
    expect(btn.tagName.toLowerCase()).toBe("button");
  });

  it("error message shown when file exceeds maxSizeKB", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    // 6 MB file triggers the early reject path (10× 500 KB = 5 MB threshold)
    const oversized = new File([new ArrayBuffer(6 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    const onChange = vi.fn();

    const { container } = render(
      <PhotoUpload onChange={onChange} maxSizeKB={500} />,
    );
    const input = container.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;

    Object.defineProperty(input, "files", {
      value: [oversized],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      // Should show an error indicator (aria-invalid or error text)
      const errorEl = container.querySelector("[role=alert]");
      expect(errorEl).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("aria-label on remove button is non-empty", async () => {
    const { PhotoUpload } = await import("./photo-upload");
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });

    render(<PhotoUpload value={file} onChange={vi.fn()} />);

    const removeBtn = screen.getByRole("button", {
      name: /reporter\.photo\.remove_photo|remove/i,
    });
    expect(removeBtn).toHaveAccessibleName();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
});
