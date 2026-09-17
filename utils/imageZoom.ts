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
 * Geometry behind the image preview overlay.
 *
 * The image is centred by `translate(-50%, -50%)` and then offset and scaled, which
 * means changing the scale leaves the image centre exactly where it was. Zooming
 * around a point therefore only has to correct the offset, and that correction is
 * easy to get wrong by a sign - hence the pure functions.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  height: number;
  width: number;
}

export interface ZoomState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Two scales are considered equal below this difference (used to detect "at fit"). */
export const SCALE_EPSILON = 0.01;

export const clampScale = (scale: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, scale));

/**
 * The scale at which the whole image is visible inside the viewport. Never returns
 * more than 1, so a small image is not blown up just because the window is large.
 */
export const computeFitScale = (
  natural: Size,
  viewport: Size,
  padding: { x: number; y: number }
) => {
  if (
    !natural.width ||
    !natural.height ||
    !viewport.width ||
    !viewport.height
  ) {
    return 1;
  }

  return Math.min(
    (viewport.width * padding.x) / natural.width,
    (viewport.height * padding.y) / natural.height,
    1
  );
};

/**
 * Rescales the image while keeping the image point currently under `anchor` pinned
 * to that same position, which is what makes wheel zooming feel attached to the
 * pointer instead of jumping towards the centre.
 */
export const zoomAroundPoint = (
  current: ZoomState,
  targetScale: number,
  anchor: Point,
  center: Point
): ZoomState => {
  const ratio = targetScale / current.scale;
  const distanceX = anchor.x - center.x;
  const distanceY = anchor.y - center.y;

  return {
    offsetX: distanceX - ratio * (distanceX - current.offsetX),
    offsetY: distanceY - ratio * (distanceY - current.offsetY),
    scale: targetScale,
  };
};

/** True while `scale` still sits at the fit scale, i.e. the image was not zoomed. */
export const isAtFitScale = (scale: number, fitScale: number) =>
  Math.abs(scale - fitScale) < SCALE_EPSILON;
