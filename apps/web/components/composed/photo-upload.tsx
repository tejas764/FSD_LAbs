"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, X } from "lucide-react";
import NextImage from "next/image";

interface PhotoUploadProps {
  value?: File | null;
  onChange: (file: File | null) => void;
  maxSizeKB?: number;
  required?: boolean;
  className?: string;
}

/**
 * Compresses an image File to WebP (max 800px wide, ~80% quality),
 * stripping EXIF in the process (canvas draw discards EXIF metadata).
 * Returns the compressed File.
 */
async function compressToWebP(file: File, maxWidth = 800): Promise<File> {
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("failed to convert to WebP"));
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
            }),
          );
        },
        "image/webp",
        0.8,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    img.src = url;
  });
}

export function PhotoUpload({
  value = null,
  onChange,
  maxSizeKB = 500,
  required = false,
  className,
}: PhotoUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Keep previewUrl in sync with the `value` prop so that externally-set files
  // (e.g. photo restored from IndexedDB after a page refresh) are displayed.
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const maxSizeBytes = maxSizeKB * 1024;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check raw size before compression
    if (file.size > maxSizeBytes * 10) {
      // extremely large file — reject early
      setError(t("reporter.photo.error_too_large"));
      return;
    }

    setError(null);
    setIsCompressing(true);

    try {
      const compressed = await compressToWebP(file);

      if (compressed.size > maxSizeBytes) {
        setError(t("reporter.photo.error_too_large"));
        setPreviewUrl(null);
        return;
      }

      // previewUrl will be set by the useEffect when `value` prop updates
      onChange(compressed);
    } catch {
      setError(t("reporter.photo.compression_error"));
      setPreviewUrl(null);
    } finally {
      setIsCompressing(false);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    // previewUrl revocation handled by useEffect cleanup when value becomes null
    setError(null);
    onChange(null);
  }

  function handleTriggerClick() {
    inputRef.current?.click();
  }

  const hasError = error !== null;

  return (
    <div className={className}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        {...(required && hasError ? { "aria-invalid": "true" } : {})}
      />

      {value && previewUrl ? (
        /* Preview state */
        <div className="flex flex-col gap-2">
          <div className="relative rounded-lg overflow-hidden border border-border">
            <NextImage
              src={previewUrl}
              alt={t("reporter.photo.captured_photo_alt")}
              width={800}
              height={600}
              unoptimized
              className="w-full h-auto max-h-64 object-contain bg-muted"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground truncate">
              {value.name}
            </span>
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t("reporter.photo.remove_photo")}
              className="flex-shrink-0 rounded-md p-1 text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty / capture state */
        <button
          type="button"
          onClick={handleTriggerClick}
          aria-busy={isCompressing}
          aria-describedby={hasError ? errorId : undefined}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card p-8 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring min-h-[160px]"
        >
          <Camera
            className="h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-card-foreground">
            {isCompressing
              ? t("reporter.photo.compressing")
              : t("reporter.photo.capture_prompt")}
          </span>
        </button>
      )}

      {/* Error message */}
      {hasError && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
