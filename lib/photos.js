// Sizes and file names of the published images, shared by the site build and
// the photo script (tools/photos/photos.mjs).

export const MAX_WIDTH = 1600;
export const MAX_HEIGHT = 1200;
export const WIDTHS = [400, 800, 1200];

// Never upscaled, fitting in MAX_WIDTH x MAX_HEIGHT.
export function photoSizes(width, height) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  const maxWidth = Math.floor(width * scale);
  return [...WIDTHS.filter(w => w < maxWidth), maxWidth]
    .map(w => ({ width: w, height: Math.max(1, Math.round(height * w / width)) }));
}

export const photoFile = (id, width) => `photos/${id}-${width}.jpg`;
export const thumbFile = id => `photos/${id}-mini.jpg`;
