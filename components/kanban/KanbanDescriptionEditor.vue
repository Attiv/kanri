<!-- SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev> -->
<!-- -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->

<template>
  <bubble-menu
    v-if="editor"
    :editor="editor"
    :tippy-options="{ duration: 100 }"
  >
    <div
      class="bg-primary border-elevation-1 -mb-1.5 flex flex-row items-center gap-1 rounded-md border px-2 py-1"
    >
      <button
        :class="{ 'is-active': editor.isActive('bold') }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Bold"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <ph-text-b class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive('italic') }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Italic"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <ph-text-italic class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive('strike') }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Strikethrough"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <ph-text-strikethrough class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive('code') }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Code"
        @click="editor.chain().focus().toggleCode().run()"
      >
        <ph-code class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive('codeBlock') }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Code Block"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        <ph-file-code class="size-5" />
      </button>

      <div class="bg-elevation-3 mx-1 h-6 w-px" />

      <button
        :class="{ 'is-active': editor.isActive({ textAlign: 'left' }) }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Align Left"
        @click="editor.chain().focus().setTextAlign('left').run()"
      >
        <ph-text-align-left class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive({ textAlign: 'center' }) }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Align Center"
        @click="editor.chain().focus().setTextAlign('center').run()"
      >
        <ph-text-align-center class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive({ textAlign: 'right' }) }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Align Right"
        @click="editor.chain().focus().setTextAlign('right').run()"
      >
        <ph-text-align-right class="size-5" />
      </button>
      <button
        :class="{ 'is-active': editor.isActive({ textAlign: 'justify' }) }"
        class="bg-elevation-2-hover rounded-md p-1"
        title="Justify"
        @click="editor.chain().focus().setTextAlign('justify').run()"
      >
        <ph-text-align-justify class="size-5" />
      </button>
    </div>
  </bubble-menu>
  <editor-content
    class="bg-elevation-2 mt-1 rounded-sm"
    :editor="editor"
    @dblclick="handleEditorDoubleClick"
  />

  <div class="mt-1 flex flex-row flex-wrap items-center gap-2 text-xs">
    <template v-if="uploadingCount > 0">
      <ph-spinner-gap class="text-accent size-3.5 shrink-0 animate-spin" />
      <span class="text-accent">
        {{ $t("components.kanban.descriptionEditor.uploading", { count: uploadingCount }) }}
      </span>
    </template>
    <span v-else class="text-dim-3">{{ imageHint }}</span>

    <button
      class="bg-elevation-2 bg-elevation-3-hover ml-auto flex shrink-0 cursor-pointer flex-row items-center gap-1 rounded-md px-1.5 py-0.5"
      type="button"
      @click="openImagePicker"
    >
      <ph-image class="size-3.5" />
      {{ $t("components.kanban.descriptionEditor.insertImage") }}
    </button>
    <input
      ref="imageInput"
      accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
      class="hidden"
      multiple
      type="file"
      @change="insertPickedImages"
    >
  </div>

  <div
    v-if="uploadError"
    class="mt-1 flex flex-row items-start gap-1.5 text-xs text-red-500"
  >
    <ph-warning-circle class="mt-0.5 size-3.5 shrink-0" />
    <span role="alert">{{ uploadError }}</span>
    <button
      class="shrink-0 hover:text-red-600"
      type="button"
      @click="dismissUploadError"
    >
      <ph-x class="size-3.5" />
    </button>
  </div>

  <ImagePreview
    :alt="previewAlt"
    :open="isPreviewOpen"
    :source="previewSource"
    @close="closeImagePreview"
  />
</template>

<script>
import Image from "@tiptap/extension-image";
import ImagePreview from "@/components/ImagePreview.vue";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { BubbleMenu, Editor, EditorContent } from "@tiptap/vue-3";
import {
  PhTextB,
  PhTextItalic,
  PhTextStrikethrough,
  PhCode,
  PhFileCode,
  PhTextAlignLeft,
  PhTextAlignCenter,
  PhTextAlignRight,
  PhTextAlignJustify,
    PhSpinnerGap,
    PhWarningCircle,
    PhX,
    PhImage,
  } from "@phosphor-icons/vue";

import { useAttachmentUpload } from "@/composables/useAttachmentUpload";
import {
  checkImageAttachment,
  collectFilesFromTransfer,
  decodeInlineImage,
  findBlobImageSources,
  findInlineImageSources,
  findLocalFileSources,
  findRemoteImageSources,
  formatFileSize,
  hasUnreadableImageData,
  isInlineImageSource,
  mimeTypeForExtension,
  resolveImageExtension,
  SUPPORTED_FORMAT_HINT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_DESCRIPTION,
} from "@/utils/attachments";

/** How long an upload message stays visible before it disappears on its own. */
const UPLOAD_MESSAGE_TIMEOUT = 8000;

export default {
  components: {
    ImagePreview,
    PhTextB,
    PhTextItalic,
    EditorContent,
    BubbleMenu,
    PhTextStrikethrough,
    PhCode,
    PhFileCode,
    PhTextAlignLeft,
    PhTextAlignCenter,
    PhTextAlignRight,
    PhTextAlignJustify,
    PhSpinnerGap,
    PhWarningCircle,
    PhX,
    PhImage,
  },

  props: {
    modelValue: {
      default: "",
      type: String,
    },
  },

  emits: ["update:modelValue", "editorBlurred"],

  setup(props, { emit }) {
    const { t } = useI18n();
    const { uploadImage } = useAttachmentUpload();

    const editor = ref(null);
    const imageInput = ref(null);
    const uploadingCount = ref(0);
    const uploadError = ref("");
    const isPreviewOpen = ref(false);
    const previewSource = ref("");
    const previewAlt = ref("");
    let uploadErrorTimeout = null;

    const imageHint = computed(() =>
      t("components.kanban.descriptionEditor.imageHint", {
        count: MAX_IMAGES_PER_DESCRIPTION,
        formats: SUPPORTED_FORMAT_HINT,
        size: formatFileSize(MAX_IMAGE_SIZE_BYTES),
      })
    );

    const dismissUploadError = () => {
      if (uploadErrorTimeout) {
        clearTimeout(uploadErrorTimeout);
        uploadErrorTimeout = null;
      }

      uploadError.value = "";
    };

    const showUploadError = (message) => {
      dismissUploadError();
      uploadError.value = message;
      uploadErrorTimeout = setTimeout(dismissUploadError, UPLOAD_MESSAGE_TIMEOUT);
    };

    const getImageCount = () => {
      let count = 0;

      editor.value?.state.doc.descendants((node) => {
        if (node.type.name === "image") count += 1;
        return true;
      });

      return count;
    };

    /** Turns a rejected image into the message shown below the editor. */
    const describeRejection = ({ code, fileName, limit }) => {
      const translationKey = (suffix) =>
        `components.kanban.descriptionEditor.errors.${suffix}`;

      switch (code) {
        case "unsupported-format":
          return t(translationKey("unsupportedFormat"), {
            file: fileName,
            formats: SUPPORTED_FORMAT_HINT,
          });
        case "too-large":
          return t(translationKey("tooLarge"), {
            file: fileName,
            limit: formatFileSize(limit ?? MAX_IMAGE_SIZE_BYTES),
          });
        case "too-many-per-paste":
          return t(translationKey("tooManyPerPaste"), { limit });
        case "too-many-per-description":
          return t(translationKey("tooManyPerDescription"), { limit });
        default:
          return t(translationKey("uploadFailed"), { file: fileName });
      }
    };

    /**
     * Inserts an uploaded image and returns the position the next image of the same
     * paste action goes to, so that multiple images keep the order they were pasted in.
     */
    const insertImage = (source, position) => {
      const instance = editor.value;
      if (!instance || instance.isDestroyed) return position;

      const content = { attrs: { src: source }, type: "image" };

      // The caret may have moved while the image was uploading, so a stale position
      // falls back to the current selection.
      if (
        typeof position === "number" &&
        position <= instance.state.doc.content.size
      ) {
        instance.chain().focus().insertContentAt(position, content).run();
        return instance.state.selection.from;
      }

      instance.chain().focus().insertContent(content).run();
      return undefined;
    };

    const handleImageFiles = async (files, position) => {
      let nextPosition = position;

      for (const [indexInBatch, file] of files.entries()) {
        const check = checkImageAttachment(file, {
          currentCount: getImageCount(),
          indexInBatch,
        });

        if (!check.ok) {
          showUploadError(describeRejection(check.rejection));
          continue;
        }

        uploadingCount.value += 1;

        try {
          const source = await uploadImage(file, check.extension);
          nextPosition = insertImage(source, nextPosition);
        } catch (error) {
          console.error("Failed to upload a pasted image:", error);
          showUploadError(
            t("components.kanban.descriptionEditor.errors.uploadFailed", {
              file: file.name,
            })
          );
        } finally {
          uploadingCount.value -= 1;
        }
      }
    };

    /** Turns a `blob:` source from the clipboard HTML back into a file. */
    const fileFromBlobSource = async (source) => {
      const response = await fetch(source);
      const blob = await response.blob();
      const extension = resolveImageExtension({ name: source, type: blob.type });

      if (!extension) throw new Error("unsupported image format");

      return new File([blob], `pasted-image.${extension}`, {
        type: blob.type || mimeTypeForExtension(extension),
      });
    };

    /**
     * Uploads images that the clipboard only contains as an embedded source.
     * They are decoded and uploaded like any other file so that they keep
     * respecting the format, size and amount limits.
     */
    const handleEmbeddedImageSources = async (sources, position) => {
      const files = [];

      for (const source of sources) {
        if (isInlineImageSource(source)) {
          const decoded = decodeInlineImage(source);

          if (decoded.ok) {
            files.push(
              new File([decoded.image.bytes], decoded.image.fileName, {
                type: decoded.image.mimeType,
              })
            );
          } else if (decoded.reason === "unsupported-format") {
            showUploadError(
              t("components.kanban.descriptionEditor.errors.unsupportedPastedImage", {
                formats: SUPPORTED_FORMAT_HINT,
              })
            );
          }

          continue;
        }

        try {
          files.push(await fileFromBlobSource(source));
        } catch (error) {
          console.error("Failed to read a pasted image:", error);
          showUploadError(
            t("components.kanban.descriptionEditor.errors.unreadableClipboardImage")
          );
        }
      }

      if (files.length > 0) await handleImageFiles(files, position);
    };

    const openImagePicker = () => {
      imageInput.value?.click();
    };

    /**
     * Fallback for everything the paste event cannot hand over: the system file
     * picker always returns readable files.
     */
    const insertPickedImages = (event) => {
      const input = event.target;
      const files = Array.from(input.files ?? []);

      // Reset so that picking the same file twice still triggers a change event.
      input.value = "";

      if (files.length > 0) handleImageFiles(files);
    };

    /**
     * Double clicking an image opens the full size preview. This is bound to the editor
     * wrapper rather than to `editorProps.handleDOMEvents` so that ProseMirror keeps
     * its own selection handling for single clicks untouched.
     */
    const handleEditorDoubleClick = (event) => {
      const target = event.target;

      if (!(target instanceof HTMLImageElement)) return;

      const source = target.getAttribute("src");
      if (!source) return;

      event.preventDefault();
      previewAlt.value = target.getAttribute("alt") ?? "";
      previewSource.value = source;
      isPreviewOpen.value = true;
    };

    const closeImagePreview = () => {
      isPreviewOpen.value = false;
    };

    const handleImagePaste = (view, event) => {
      const clipboard = event.clipboardData;
      if (!clipboard) return false;

      // 1. Files the webview can hand over directly (anything copied in an image
      //    viewer, and in Chromium also pictures copied in the file manager).
      const files = collectFilesFromTransfer(clipboard);
      if (files.length > 0) {
        event.preventDefault();
        handleImageFiles(files, view.state.selection.from);
        return true;
      }

      const html = clipboard.getData("text/html") ?? "";

      // 2. Images embedded in the clipboard HTML. Inserting those directly would
      //    bypass the limits below, so they are uploaded as well.
      const embeddedSources = [
        ...findInlineImageSources(html),
        ...findBlobImageSources(html),
      ];
      if (embeddedSources.length > 0) {
        event.preventDefault();
        handleEmbeddedImageSources(embeddedSources, view.state.selection.from);
        return true;
      }

      // 3. Images that only exist as a URL on some server - useless offline.
      if (findRemoteImageSources(html).length > 0) {
        event.preventDefault();
        showUploadError(t("components.kanban.descriptionEditor.errors.remoteImage"));
        return true;
      }

      // 4. A path copied in the file manager: the clipboard only holds the path,
      //    never the file, so the file picker is the way to insert it.
      const uriList = clipboard.getData("text/uri-list") ?? "";
      if (findLocalFileSources(uriList).length > 0) {
        event.preventDefault();
        showUploadError(t("components.kanban.descriptionEditor.errors.localFile"));
        return true;
      }

      // 5. The clipboard announces an image but the paste event does not expose it
      //    (a macOS screenshot for example) - explain instead of doing nothing.
      if (hasUnreadableImageData(Array.from(clipboard.types ?? []))) {
        event.preventDefault();
        showUploadError(
          t("components.kanban.descriptionEditor.errors.unreadableClipboardImage")
        );
        return true;
      }

      return false;
    };

    const handleFileDrop = (view, event, _slice, moved) => {
      // `moved` is true while existing content is dragged around inside the editor.
      if (moved) return false;

      const files = collectFilesFromTransfer(event.dataTransfer);
      if (files.length === 0) return false;

      event.preventDefault();

      const dropPosition = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      handleImageFiles(files, dropPosition ? dropPosition.pos : undefined);

      return true;
    };

    watch(
      () => props.modelValue,
      (value) => {
        if (editor.value && editor.value.getHTML() !== value) {
          editor.value.commands.setContent(value, false);
        }
      }
    );

    onMounted(() => {
      editor.value = new Editor({
        content: props.modelValue,
        editorProps: {
          handleDrop: handleFileDrop,
          handlePaste: handleImagePaste,
        },
        extensions: [
          StarterKit,
          Image.configure({
            allowBase64: true,
          }),
          Typography,
          TextAlign.configure({
            types: ["heading", "paragraph"],
          }),
        ],
        onBlur: () => {
          emit("editorBlurred");
        },
        onFocus: () => {
          emitter.emit("modalPreventClickOutsideClose");
        },
        onUpdate: () => {
          emit("update:modelValue", editor.value.getHTML());
        },
      });
    });

    onBeforeUnmount(() => {
      dismissUploadError();

      if (editor.value) {
        editor.value.destroy();
      }
    });

    return {
      closeImagePreview,
      dismissUploadError,
      editor,
      handleEditorDoubleClick,
      imageHint,
      imageInput,
      insertPickedImages,
      isPreviewOpen,
      openImagePicker,
      previewAlt,
      previewSource,
      uploadError,
      uploadingCount,
    };
  },
};
</script>

<style>
.tiptap:focus {
  outline: none;
}

.tiptap h1 {
  font-size: larger;
  font-weight: bold;
  margin-bottom: 4px;
}

.tiptap h2 {
  font-size: medium;
  font-weight: bold;
}

.tiptap.ProseMirror {
  height: 148px;
  overflow: auto;
  padding: 4px;
  resize: vertical;
}

.tiptap ul {
  padding: 0 1.3rem;
}

.tiptap ol {
  list-style: decimal;
  padding: 0 1.6rem;
}

.tiptap h1,
.tiptap h2,
.tiptap h3,
.tiptap h4,
.tiptap h5,
.tiptap h6 {
  line-height: 1.1;
}

.tiptap code {
  background-color: rgba(0, 0, 0, 0.1);
  color: color-mix(in srgb, var(--accent) 50%, white);
}

.tiptap pre {
  background: #0d0d0d;
  color: #fff;
  font-family: "JetBrainsMono", monospace;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  border-radius: 0.5rem;
}

.tiptap pre code {
  color: inherit;
  padding: 0;
  background: none;
  font-size: 0.8rem;
}

.tiptap img {
  max-width: 100%;
  height: auto;
}

.tiptap hr {
  margin: 1rem 0;
}

.tiptap blockquote {
  padding-left: 1rem;
  border-left: 2px solid var(--text-dim-2);
}

.tiptap ul::marker {
  color: var(-text-normal);
}

.tiptap ul {
  list-style-type: disc;
}
</style>
