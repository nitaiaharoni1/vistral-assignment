import type { Board, Corners } from "../../../types";

export const SAMPLE_CORNERS: Corners = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.7, y: 0.733333 },
  { x: 0.3, y: 0.733333 },
];

// This is an explicitly synthetic camera source. Its pixels pass through the real worker.
export function drawSample(
  canvas: HTMLCanvasElement,
  board: Board,
  preview = false,
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read the video canvas.");
  canvas.width = 960;
  canvas.height = 720;
  ctx.fillStyle = "#e6e8e5";
  ctx.fillRect(0, 0, 960, 720);
  ctx.save();
  ctx.shadowColor = "rgba(31, 42, 37, .14)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fdfcf8";
  ctx.fillRect(226, 68, 508, 582);
  ctx.restore();
  const startX = 288,
    startY = 144,
    size = 384,
    cell = size / 3;
  ctx.strokeStyle = "#454742";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(startX + i * cell - 1, startY - 3);
    ctx.lineTo(startX + i * cell + 1, startY + size + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX - 3, startY + i * cell + 1);
    ctx.lineTo(startX + size + 3, startY + i * cell - 1);
    ctx.stroke();
  }
  board.forEach((mark, index) => {
    if (!mark) return;
    const cx = startX + ((index % 3) + 0.5) * cell,
      cy = startY + (Math.floor(index / 3) + 0.5) * cell;
    ctx.strokeStyle = "#343936";
    ctx.lineWidth = 7;
    ctx.beginPath();
    if (mark === "X") {
      ctx.moveTo(cx - 28, cy - 28);
      ctx.lineTo(cx + 27, cy + 29);
      ctx.moveTo(cx + 28, cy - 28);
      ctx.lineTo(cx - 28, cy + 28);
    } else ctx.ellipse(cx, cy, 31, 32, -0.06, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = "#75786f";
  ctx.font = "13px sans-serif";
  ctx.fillText(
    preview
      ? "a pen, a page, a worthy opponent."
      : "SYNTHETIC SAMPLE · CAMERA PIXELS",
    288,
    599,
  );
  if (preview) {
    ctx.save();
    ctx.translate(763, 340);
    ctx.rotate(0.18);
    ctx.fillStyle = "#344b40";
    ctx.fillRect(0, 0, 15, 220);
    ctx.fillStyle = "#b7bdb3";
    ctx.fillRect(0, 18, 15, 7);
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.lineTo(7.5, 245);
    ctx.lineTo(15, 220);
    ctx.fill();
    ctx.restore();
  }
}
