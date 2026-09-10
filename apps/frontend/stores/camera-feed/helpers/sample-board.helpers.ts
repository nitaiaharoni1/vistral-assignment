import type { Board } from "../../../types";
import type { Corners } from "../../../types";

export const SAMPLE_CORNERS: Corners = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.7, y: 0.733333 },
  { x: 0.3, y: 0.733333 },
];

const PAGE_LEFT = 288;
const PAGE_TOP = 144;
const PAGE_SIZE = 384;
const CELL = PAGE_SIZE / 3;

// Fills the desk and paper behind the sample board.
function paintDesk(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#e6e8e5";
  ctx.fillRect(0, 0, 960, 720);
  ctx.save();
  ctx.shadowColor = "rgba(31, 42, 37, .14)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fdfcf8";
  ctx.fillRect(226, 68, 508, 582);
  ctx.restore();
}

// Draws the sample 3x3 grid lines.
function paintGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#454742";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(PAGE_LEFT + i * CELL - 1, PAGE_TOP - 3);
    ctx.lineTo(PAGE_LEFT + i * CELL + 1, PAGE_TOP + PAGE_SIZE + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PAGE_LEFT - 3, PAGE_TOP + i * CELL + 1);
    ctx.lineTo(PAGE_LEFT + PAGE_SIZE + 3, PAGE_TOP + i * CELL - 1);
    ctx.stroke();
  }
}

// Draws X and O marks on the sample board.
function paintMarks(ctx: CanvasRenderingContext2D, board: Board) {
  board.forEach((mark, index) => {
    if (!mark) return;
    const cx = PAGE_LEFT + ((index % 3) + 0.5) * CELL;
    const cy = PAGE_TOP + (Math.floor(index / 3) + 0.5) * CELL;
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
}

// Writes the sample board caption.
function paintCaption(ctx: CanvasRenderingContext2D, preview: boolean) {
  ctx.fillStyle = "#75786f";
  ctx.font = "13px sans-serif";
  ctx.fillText(preview ? "a pen, a page, a worthy opponent." : "SYNTHETIC SAMPLE · CAMERA PIXELS", PAGE_LEFT, 599);
}

// Draws the preview pen beside the page.
function paintPen(ctx: CanvasRenderingContext2D) {
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

// This is an explicitly synthetic camera source. Its pixels pass through the real worker.
export function drawSample(canvas: HTMLCanvasElement, board: Board, preview = false) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read the video canvas.");
  canvas.width = 960;
  canvas.height = 720;
  paintDesk(ctx);
  paintGrid(ctx);
  paintMarks(ctx, board);
  paintCaption(ctx, preview);
  if (preview) paintPen(ctx);
}
