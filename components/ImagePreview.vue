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
  <Teleport to="body">
    <transition name="image-preview-fade">
      <div
        v-if="open"
        ref="stage"
        :aria-label="alt || $t('components.imagePreview.title')"
        aria-modal="true"
        class="image-preview"
        role="dialog"
        tabindex="-1"
        @click.self="handleBackdropClick"
        @pointercancel="endDrag"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @wheel.prevent="handleWheel"
      >
        <div class="image-preview-toolbar">
          <button
            :disabled="scale <= minScale"
            :title="$t('components.imagePreview.zoomOut')"
            class="image-preview-button"
            type="button"
            @click="zoomOut"
          >
            <ph-magnifying-glass-minus class="size-4" />
          </button>
          <span class="image-preview-zoom">{{ zoomLabel }}</span>
          <button
            :disabled="scale >= MAX_SCALE"
            :title="$t('components.imagePreview.zoomIn')"
            class="image-preview-button"
            type="button"
            @click="zoomIn"
          >
            <ph-magnifying-glass-plus class="size-4" />
          </button>
          <span class="image-preview-divider" />
          <button
            :title="$t('components.imagePreview.fit')"
            class="image-preview-button"
            type="button"
            @click="() => applyFit(true)"
          >
            <ph-corners-out class="size-4" />
          </button>
          <button
            :title="$t('components.imagePreview.close')"
            class="image-preview-button"
            type="button"
            @click="close"
          >
            <ph-x class="size-4" />
          </button>
        </div>

        <img
          v-show="!failed"
          ref="image"
          :alt="alt"
          class="image-preview-image"
          draggable="false"
          :src="source"
          :style="imageStyle"
          @dblclick.prevent.stop="toggleZoom"
          @error="handleError"
          @load="handleLoad"
        >

        <div v-if="failed" class="image-preview-status">
          <ph-warning-circle class="size-5" />
          <span>{{ $t("components.imagePreview.loadFailed") }}</span>
        </div>
        <div v-else-if="!loaded" class="image-preview-status">
          <ph-spinner-gap class="size-5 animate-spin" />
          <span>{{ $t("components.imagePreview.loading") }}</span>
        </div>

        <p class="image-preview-hint">
          {{ $t("components.imagePreview.hint") }}
        </p>
      </div>
    </transition>
  </Teleport>
</template>

<script>
import {
  clampScale,
  computeFitScale,
  isAtFitScale,
  zoomAroundPoint,
} from "@/utils/imageZoom";
import {
  PhCornersOut,
  PhMagnifyingGlassMinus,
  PhMagnifyingGlassPlus,
  PhSpinnerGap,
  PhWarningCircle,
  PhX,
} from "@phosphor-icons/vue";

/** The smallest zoom the user can reach, expressed as a fraction of the fit scale. */
const MIN_ZOOM_FACTOR = 4;
/** Absolute upper bound, so a tiny image cannot be blown up indefinitely. */
const MAX_SCALE = 8;
/** Share of the viewport the "fit to window" zoom uses, the rest is breathing room. */
const FIT_PADDING_X = 0.92;
const FIT_PADDING_Y = 0.8;
/** Trackpads report tiny pixel deltas, a mouse wheel around 100 - this smooths both. */
const WHEEL_SENSITIVITY = 0.0022;
/** Every step of the zoom in/out buttons. */
const BUTTON_ZOOM_STEP = 1.4;
/** Zoom applied on double click when the image already fits without being scaled up. */
const DOUBLE_CLICK_ZOOM = 2;
/** Pointer travel in pixels before a click counts as a drag instead. */
const DRAG_THRESHOLD = 3;
/** How far the arrow keys move the image per press. */
const KEYBOARD_PAN_STEP = 48;

export default {
  components: {
    PhCornersOut,
    PhMagnifyingGlassMinus,
    PhMagnifyingGlassPlus,
    PhSpinnerGap,
    PhWarningCircle,
    PhX,
  },

  props: {
    /** Accessible label of the dialog, usually the alt text of the image. */
    alt: {
      default: "",
      type: String,
    },
    open: {
      default: false,
      type: Boolean,
    },
    source: {
      default: "",
      type: String,
    },
  },

  emits: ["close"],

  setup(props, { emit }) {
    const stage = ref(null);
    const image = ref(null);
    const scale = ref(1);
    const offsetX = ref(0);
    const offsetY = ref(0);
    const naturalWidth = ref(0);
    const naturalHeight = ref(0);
    const stageSize = ref({ height: 0, width: 0 });
    const loaded = ref(false);
    const failed = ref(false);
    /** Only the discrete actions animate, wheel and drag have to follow the pointer. */
    const smooth = ref(false);
    const dragging = ref(false);
    const hasDragged = ref(false);

    let dragOrigin = { offsetX: 0, offsetY: 0, x: 0, y: 0 };
    let dragDistance = 0;

    /** Scale at which the whole image is visible without ever enlarging it. */
    const fitScale = computed(() =>
      computeFitScale(
        { height: naturalHeight.value, width: naturalWidth.value },
        stageSize.value,
        { x: FIT_PADDING_X, y: FIT_PADDING_Y }
      )
    );

    const minScale = computed(() => fitScale.value / MIN_ZOOM_FACTOR);
    const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
    const canPan = computed(
      () => dragging.value || !isAtFitScale(scale.value, fitScale.value)
    );

    const imageStyle = computed(() => ({
      cursor: canPan.value ? (dragging.value ? "grabbing" : "grab") : "default",
      transform: `translate(-50%, -50%) translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
      transition: smooth.value && !dragging.value ? "transform 150ms ease-out" : "none",
    }));

    const measureStage = () => {
      const rect = stage.value?.getBoundingClientRect();
      stageSize.value = { height: rect?.height ?? 0, width: rect?.width ?? 0 };
    };

    const applyFit = (animate = false) => {
      smooth.value = animate;
      scale.value = fitScale.value;
      offsetX.value = 0;
      offsetY.value = 0;
    };

    /**
     * Zooms while keeping the point under the cursor in place, which is what makes
     * wheel zooming feel attached to the pointer instead of the center.
     */
    const zoomTo = (nextScale, clientX, clientY, animate = false) => {
      const target = clampScale(nextScale, minScale.value, MAX_SCALE);

      if (Math.abs(target - scale.value) < 0.0001) return;

      const rect = stage.value?.getBoundingClientRect();
      const center = {
        x: rect ? rect.left + rect.width / 2 : 0,
        y: rect ? rect.top + rect.height / 2 : 0,
      };

      const next = zoomAroundPoint(
        { offsetX: offsetX.value, offsetY: offsetY.value, scale: scale.value },
        target,
        { x: clientX ?? center.x, y: clientY ?? center.y },
        center
      );

      offsetX.value = next.offsetX;
      offsetY.value = next.offsetY;
      smooth.value = animate;
      scale.value = next.scale;
    };

    const close = () => emit("close");

    const zoomIn = () => {
      if (failed.value) return;
      zoomTo(scale.value * BUTTON_ZOOM_STEP, undefined, undefined, true);
    };

    const zoomOut = () => {
      if (failed.value) return;
      zoomTo(scale.value / BUTTON_ZOOM_STEP, undefined, undefined, true);
    };

    const handleWheel = (event) => {
      if (failed.value || !loaded.value) return;

      zoomTo(
        scale.value * Math.exp(-event.deltaY * WHEEL_SENSITIVITY),
        event.clientX,
        event.clientY
      );
    };

    const toggleZoom = (event) => {
      if (failed.value) return;

      if (!isAtFitScale(scale.value, fitScale.value)) {
        applyFit(true);
        return;
      }

      // Images smaller than the window are shown at 100% when fitting, so the
      // double click has to go past that to be noticeable at all.
      const target =
        fitScale.value >= 1 ? fitScale.value * DOUBLE_CLICK_ZOOM : 1;

      zoomTo(target, event.clientX, event.clientY, true);
    };

    const startDrag = (event) => {
      if (event.button !== 0 || failed.value || !canPan.value) return;

      const target = event.target;
      if (target instanceof Element && target.closest(".image-preview-toolbar"))
        return;

      dragOrigin = {
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        x: event.clientX,
        y: event.clientY,
      };
      dragDistance = 0;
      hasDragged.value = false;
      dragging.value = true;
    };

    const moveDrag = (event) => {
      if (!dragging.value) return;

      const distanceX = event.clientX - dragOrigin.x;
      const distanceY = event.clientY - dragOrigin.y;

      dragDistance = Math.max(dragDistance, Math.hypot(distanceX, distanceY));
      if (dragDistance > DRAG_THRESHOLD) hasDragged.value = true;

      offsetX.value = dragOrigin.offsetX + distanceX;
      offsetY.value = dragOrigin.offsetY + distanceY;
      smooth.value = false;
    };

    const endDrag = () => {
      if (!dragging.value) return;

      dragging.value = false;
      // The click that ends the drag is dispatched before this runs, so the flag is
      // cleared afterwards to keep the backdrop from closing on a pan.
      setTimeout(() => {
        hasDragged.value = false;
      }, 0);
    };

    const handleBackdropClick = () => {
      if (hasDragged.value) return;
      close();
    };

    const handleLoad = async () => {
      const element = image.value;

      if (element) {
        naturalWidth.value = element.naturalWidth;
        naturalHeight.value = element.naturalHeight;
      }

      loaded.value = true;
      failed.value = false;

      await nextTick();
      measureStage();
      applyFit();
    };

    const handleError = () => {
      loaded.value = false;
      failed.value = true;
    };

    const panBy = (deltaX, deltaY) => {
      if (!canPan.value) return;

      smooth.value = true;
      offsetX.value += deltaX;
      offsetY.value += deltaY;
    };

    /**
     * Registered on the window in the capture phase on purpose: the card modal that
     * hosts the editor closes itself on Escape, and stopping the event here keeps a
     * single Escape from closing both the preview and the modal behind it.
     */
    const handleKeyDown = (event) => {
      if (!props.open) return;

      const { key } = event;

      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      const zoomKeys = ["+", "=", "-", "_", "0", "1"];
      const panKeys = ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"];

      if (!zoomKeys.includes(key) && !panKeys.includes(key)) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "+" || key === "=") zoomIn();
      else if (key === "-" || key === "_") zoomOut();
      else if (key === "0") applyFit(true);
      else if (key === "1") zoomTo(1, undefined, undefined, true);
      else if (key === "ArrowUp") panBy(0, KEYBOARD_PAN_STEP);
      else if (key === "ArrowDown") panBy(0, -KEYBOARD_PAN_STEP);
      else if (key === "ArrowLeft") panBy(KEYBOARD_PAN_STEP, 0);
      else if (key === "ArrowRight") panBy(-KEYBOARD_PAN_STEP, 0);
    };

    const handleResize = () => {
      if (!props.open) return;

      const previousFit = fitScale.value;
      measureStage();

      // An image the user already zoomed into keeps its zoom, only one that still
      // sits at the fit scale follows the new window size.
      if (isAtFitScale(scale.value, previousFit)) applyFit();
    };

    watch(
      () => props.open,
      async (isOpen) => {
        if (!isOpen) return;

        loaded.value = false;
        failed.value = false;
        smooth.value = false;
        naturalWidth.value = 0;
        naturalHeight.value = 0;
        scale.value = 1;
        offsetX.value = 0;
        offsetY.value = 0;

        await nextTick();
        measureStage();
        // Focus the overlay so the keys handled below do not reach the editor behind.
        stage.value?.focus({ preventScroll: true });
      }
    );

    onMounted(() => {
      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("resize", handleResize);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleResize);
    });

    return {
      applyFit,
      close,
      endDrag,
      handleBackdropClick,
      handleError,
      handleLoad,
      handleWheel,
      image,
      imageStyle,
      MAX_SCALE,
      minScale,
      moveDrag,
      scale,
      stage,
      startDrag,
      toggleZoom,
      zoomIn,
      zoomLabel,
      zoomOut,
      loaded,
      failed,
    };
  },
};
</script>

<style>
.image-preview {
  background-color: rgba(9, 9, 11, 0.9);
  inset: 0;
  position: fixed;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  z-index: 10000001;
}

.image-preview:focus {
  outline: none;
}

.image-preview-fade-enter-active,
.image-preview-fade-leave-active {
  transition: opacity 0.15s ease-out;
}

.image-preview-fade-enter-from,
.image-preview-fade-leave-to {
  opacity: 0;
}

.image-preview-image {
  left: 50%;
  margin: 0;
  max-height: none;
  max-width: none;
  position: absolute;
  top: 50%;
  transform-origin: center center;
  will-change: transform;
  -webkit-user-drag: none;
}

.image-preview-toolbar {
  align-items: center;
  background-color: rgba(24, 24, 27, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  color: #f4f4f5;
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  left: 50%;
  padding: 0.25rem;
  position: absolute;
  top: 1rem;
  transform: translateX(-50%);
  z-index: 2;
}

.image-preview-button {
  align-items: center;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  padding: 0.375rem;
  transition: background-color 0.15s ease-out;
}

.image-preview-button:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.14);
}

.image-preview-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.image-preview-zoom {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  min-width: 3rem;
  text-align: center;
}

.image-preview-divider {
  background-color: rgba(255, 255, 255, 0.16);
  height: 1.25rem;
  margin: 0 0.125rem;
  width: 1px;
}

.image-preview-status {
  align-items: center;
  color: #e4e4e7;
  display: flex;
  flex-direction: row;
  font-size: 0.875rem;
  gap: 0.5rem;
  left: 50%;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.image-preview-hint {
  bottom: 1rem;
  color: rgba(244, 244, 245, 0.6);
  font-size: 0.75rem;
  left: 50%;
  pointer-events: none;
  position: absolute;
  text-align: center;
  transform: translateX(-50%);
  white-space: nowrap;
}
</style>
