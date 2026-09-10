export function cleanPaperImage(input: Float32Array, width: number, height: number) {
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  const radius = Math.max(5, Math.round(Math.min(width, height) / 24));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += input[y * width + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const pixels = new Float32Array(input.length);
  const background = new Float32Array(input.length);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const at = y * width + x;
      const paper = (sums[bottom * stride + right] - sums[top * stride + right] - sums[bottom * stride + left] + sums[top * stride + left]) / ((right - left) * (bottom - top));
      const contrast = Math.max(0, 1 - input[at] / Math.max(1, paper));
      const ink = Math.max(0, (contrast - 0.04) * 1.25);
      background[at] = paper;
      pixels[at] = Math.max(0, Math.min(255, input[at] >= paper ? input[at] : paper * (1 - ink)));
    }
  }
  return { pixels, background };
}
