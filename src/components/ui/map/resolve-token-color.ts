/**
 * MapLibre paints to a canvas, so CSS variables (and oklch colors) can't reach its layers directly:
 * resolve a `--color-*` token to a concrete `rgb()` string once, by actually painting a pixel and
 * reading back the rasterized sRGB channels. MapLibre's color parser predates oklch, and both
 * `getComputedStyle` and the canvas fillStyle getter keep oklch as-is.
 */
export function resolveTokenColor(token: string, fallback: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context || !resolved) {
    return fallback;
  }
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);
  const [r = 66, g = 133, b = 244] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
