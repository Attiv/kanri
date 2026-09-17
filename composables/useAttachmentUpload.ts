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

import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";

import { generateUniqueID } from "@/utils/idGenerator";

/** Folder inside the app data directory that holds every pasted image. */
const ATTACHMENTS_DIRECTORY = "attachments";

export class AttachmentUploadError extends Error {}

/** True when the app runs inside the Tauri webview instead of a plain browser. */
export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useAttachmentUpload() {
  /** Cached so the directory is only resolved and created once per session. */
  let attachmentsDirectory: Promise<string> | null = null;

  const getAttachmentsDirectory = (): Promise<string> => {
    if (!attachmentsDirectory) {
      attachmentsDirectory = (async () => {
        const directory = await join(
          await appLocalDataDir(),
          ATTACHMENTS_DIRECTORY
        );
        await mkdir(directory, { recursive: true });
        return directory;
      })().catch((error: unknown) => {
        // Let the next upload try again instead of caching a broken directory.
        attachmentsDirectory = null;
        throw error;
      });
    }

    return attachmentsDirectory;
  };

  /**
   * Stores a pasted image and returns a URL that can be used as image source.
   *
   * The image is copied into the app data directory so that the card description
   * only ever references a local file instead of embedding the whole image data
   * in the board data.
   */
  const uploadImage = async (file: File, extension: string): Promise<string> => {
    if (!isTauriRuntime()) {
      // Without Tauri (e.g. the plain browser dev server) there is no file system
      // to write to, so the image data is embedded instead.
      return readFileAsDataUrl(file);
    }

    let path: string;

    try {
      path = await join(
        await getAttachmentsDirectory(),
        `${generateUniqueID()}.${extension}`
      );
      await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      throw new AttachmentUploadError(
        `Failed to store the image attachment: ${String(error)}`
      );
    }

    return convertFileSrc(path);
  };

  return { uploadImage };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(new AttachmentUploadError("Failed to read the image data"))
    );
    reader.readAsDataURL(file);
  });
}
