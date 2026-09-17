/* SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>

SPDX-License-Identifier: GPL-3.0-or-later

Kanri is an offline Kanban board app made using Tauri and Nuxt.
Copyright (C) 2022-2026 trobonox <hello@trobo.dev>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Rules for images that are pasted into (or dropped onto) a card description.
 *
 * Everything in here is free of Tauri and editor side effects so that the accepted
 * formats and the limits live in exactly one place and stay easy to reason about.
 */

/** Every image format that can be attached, mapped to the extension it is stored with. */
export const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Some applications put a non standard mime type on the clipboard. */
const MIME_TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-bmp": "image/bmp",
  "image/x-ms-bmp": "image/bmp",
  "image/x-png": "image/png",
};

/** Maximum size of a single image. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum number of images a single card description may contain. */
export const MAX_IMAGES_PER_DESCRIPTION = 10;

/** Maximum number of images handled by one paste/drop action. */
export const MAX_IMAGES_PER_PASTE = 5;

/** Readable list of accepted formats, e.g. "PNG, JPG, WEBP, GIF, BMP, AVIF". */
export const SUPPORTED_FORMAT_HINT = [
  "png",
  "jpg",
  "webp",
  "gif",
  "bmp",
  "avif",
]
  .map((extension) => extension.toUpperCase())
  .join(", ");

export type ImageRejectionCode =
  | "too-large"
  | "too-many-per-description"
  | "too-many-per-paste"
  | "unsupported-format";

export type ImageRejection = {
  code: ImageRejectionCode;
  /** Name of the file the user tried to attach. */
  fileName: string;
  /** Limit that was exceeded - a byte count or an image count. */
  limit?: number;
};

export type ImageCheckResult =
  | { extension: string; mimeType: string; ok: true }
  | { ok: false; rejection: ImageRejection };

/** Removes parameters ("image/png;charset=utf-8") and normalises known aliases. */
export function normalizeImageMimeType(rawType: string | undefined): string {
  const mimeType = (rawType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TYPE_ALIASES[mimeType] ?? mimeType;
}

/**
 * Resolves the extension an image should be stored with.
 * Images on the clipboard do not always carry a mime type, so the file name
 * is used as a fallback before the file is rejected.
 */
export function resolveImageExtension(file: {
  name?: string;
  type?: string;
}): string | null {
  const byMimeType = SUPPORTED_IMAGE_TYPES[normalizeImageMimeType(file.type)];
  if (byMimeType) return byMimeType;

  const fromFileName = (file.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  const normalized = fromFileName === "jpeg" ? "jpg" : fromFileName;
  return Object.values(SUPPORTED_IMAGE_TYPES).includes(normalized)
    ? normalized
    : null;
}

export function mimeTypeForExtension(extension: string): string {
  const match = Object.entries(SUPPORTED_IMAGE_TYPES).find(
    ([, value]) => value === extension
  );
  return match ? match[0] : "application/octet-stream";
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Returns the files contained in a paste or drop payload. */
export function collectFilesFromTransfer(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return Array.from(transfer.files ?? []);
}

/**
 * Returns the sources of every image contained in pasted HTML.
 *
 * WebKit hands images over in very different shapes depending on where they were
 * copied from (a `<img src="https://…">` for websites, `data:` for some editors,
 * `blob:` for screenshots), so all of them have to be inspected.
 */
export function collectImageSources(html: string): string[] {
  if (!html) return [];

  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");

    return Array.from(parsed.querySelectorAll("img[src]"))
      .map((image) => image.getAttribute("src") ?? "")
      .filter((source) => source.length > 0);
  } catch {
    // Malformed clipboard HTML is not worth an error - the default paste is used instead.
    return [];
  }
}

/** Sources of images in pasted HTML that point to a remote server. */
export function findRemoteImageSources(html: string): string[] {
  return collectImageSources(html).filter((source) =>
    /^(?:https?|ftp):\/\//i.test(source)
  );
}

/** Sources of images in pasted HTML that are embedded as `data:` URL. */
export function findInlineImageSources(html: string): string[] {
  return collectImageSources(html).filter(isInlineImageSource);
}

/** Sources of images in pasted HTML that live in a `blob:` URL. */
export function findBlobImageSources(html: string): string[] {
  return collectImageSources(html).filter((source) =>
    /^blob:/i.test(source)
  );
}

export function isInlineImageSource(source: string): boolean {
  return /^data:image\//i.test(source.trim());
}

/**
 * Local file paths that were copied in the file manager.
 * WebKit usually puts a `text/uri-list` entry on the clipboard for those, but the
 * file itself cannot be read from the paste event.
 */
export function findLocalFileSources(text: string): string[] {
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^file:\/\//i.test(line));
}

export type InlineImageDecodeResult =
  | {
      image: {
        bytes: Uint8Array;
        extension: string;
        fileName: string;
        mimeType: string;
      };
      ok: true;
    }
  | { ok: false; reason: "malformed" | "unsupported-format" };

const INLINE_IMAGE_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

/**
 * Decodes an inline `data:image/…;base64,…` source into raw bytes.
 * Pasted images must never be inserted as data URL - they would bypass the size
 * and amount limits and bloat the saved board data - so they are decoded and
 * uploaded like any other pasted file.
 */
export function decodeInlineImage(
  source: string,
  fileName = "pasted-image"
): InlineImageDecodeResult {
  const match = INLINE_IMAGE_PATTERN.exec(source.trim());
  if (!match) return { ok: false, reason: "malformed" };

  const mimeType = normalizeImageMimeType(match[1]);
  const extension = SUPPORTED_IMAGE_TYPES[mimeType];
  if (!extension) return { ok: false, reason: "unsupported-format" };

  try {
    const binary = atob((match[2] ?? "").replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return {
      image: {
        bytes,
        extension,
        fileName: `${fileName}.${extension}`,
        mimeType,
      },
      ok: true,
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/**
 * True when the clipboard announces an image without exposing any usable file.
 *
 * On macOS a screenshot (cmd+ctrl+shift+4) puts `public.png`/`public.tiff` on the
 * pasteboard while `clipboardData.files` stays empty, so the paste event alone
 * cannot read it. Detecting the announced types lets the user get an explanation
 * instead of nothing happening at all.
 */
export function hasUnreadableImageData(types: readonly string[]): boolean {
  return types.some((type) => {
    const normalized = type.toLowerCase();
    return (
      normalized.startsWith("image/") ||
      normalized === "public.image" ||
      normalized === "public.png" ||
      normalized === "public.tiff" ||
      normalized === "public.jpeg"
    );
  });
}

/**
 * Validates a single image before it is uploaded.
 *
 * `currentCount` is the number of images already present in the description,
 * `indexInBatch` the position of this file inside the current paste/drop action.
 */
export function checkImageAttachment(
  file: { name?: string; size: number; type?: string },
  context: { currentCount: number; indexInBatch: number }
): ImageCheckResult {
  const fileName = file.name && file.name.trim().length > 0 ? file.name : "image";

  if (context.indexInBatch >= MAX_IMAGES_PER_PASTE) {
    return reject("too-many-per-paste", fileName, MAX_IMAGES_PER_PASTE);
  }

  if (context.currentCount >= MAX_IMAGES_PER_DESCRIPTION) {
    return reject("too-many-per-description", fileName, MAX_IMAGES_PER_DESCRIPTION);
  }

  const extension = resolveImageExtension(file);
  if (!extension) return reject("unsupported-format", fileName);

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return reject("too-large", fileName, MAX_IMAGE_SIZE_BYTES);
  }

  return { extension, mimeType: mimeTypeForExtension(extension), ok: true };
}

function reject(
  code: ImageRejectionCode,
  fileName: string,
  limit?: number
): ImageCheckResult {
  return { ok: false, rejection: { code, fileName, limit } };
}
