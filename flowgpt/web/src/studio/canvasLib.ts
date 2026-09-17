/**
 * Thao tác Canvas 2D cho Image Studio — thuần logic, không phụ thuộc React.
 * Mọi hàm đều tự vẽ lại từ `source` (ảnh gốc đã nạp) nên không bị mất chi tiết.
 */

/** Ảnh nguồn của canvas: ảnh gốc hoặc ImageData đã chỉnh sửa trước đó. */
export type CanvasSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement | ImageData;

export interface AdjustmentValues {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
}

export const DEFAULT_ADJUST: AdjustmentValues = { brightness: 100, contrast: 100, saturate: 100, blur: 0 };

export interface DrawOptions {
  adjust?: AdjustmentValues;
  text?: DrawText | null;
  strokes?: StrokeShape[];
}

export type ShapeKind = "rect" | "ellipse" | "arrow" | "brush";

export interface DrawText {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bold: boolean;
}

export interface StrokeShape {
  kind: ShapeKind;
  color: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function formatFilter(values?: AdjustmentValues): string {
  const v = values ?? DEFAULT_ADJUST;
  const parts: string[] = [];
  if (v.brightness !== 100) parts.push(`brightness(${v.brightness}%)`);
  if (v.contrast !== 100) parts.push(`contrast(${v.contrast}%)`);
  if (v.saturate !== 100) parts.push(`saturate(${v.saturate}%)`);
  if (v.blur > 0) parts.push(`blur(${v.blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

export function sourceSize(source: CanvasSource): { width: number; height: number } {
  if (source instanceof ImageData) return { width: source.width, height: source.height };
  if ("naturalWidth" in source) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }
  return { width: source.width, height: source.height };
}

/** Vẽ `shape` (đường/hình đang kéo) lên một context bất kỳ. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: StrokeShape): void {
  ctx.save();
  ctx.filter = "none";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.max(1, shape.width);

  const { x1, y1, x2, y2 } = shape;
  if (shape.kind === "rect") {
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (shape.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.max(1, Math.abs(x2 - x1) / 2),
      Math.max(1, Math.abs(y2 - y1) / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else if (shape.kind === "arrow") {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(10, shape.width * 4);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function paintText(ctx: CanvasRenderingContext2D, text: DrawText): void {
  if (!text.text.trim()) return;
  ctx.save();
  ctx.filter = "none";
  const weight = text.bold ? "700" : "500";
  ctx.font = `${weight} ${Math.max(8, text.size)}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  // Viền tối giúp chữ đọc được trên mọi nền ảnh.
  ctx.lineWidth = Math.max(2, text.size / 8);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  for (const [index, line] of text.text.split("\n").entries()) {
    const y = text.y + index * text.size * 1.25;
    ctx.strokeText(line, text.x, y);
    ctx.fillStyle = text.color;
    ctx.fillText(line, text.x, y);
  }
  ctx.restore();
}

/**
 * Vẽ `source` vào canvas theo kích thước mong muốn, kèm bộ lọc màu, chữ và
 * hình khối đã "bake". `ctx.filter` chỉ áp cho ảnh nên chữ/hình luôn sắc nét.
 */
export function render(
  canvas: HTMLCanvasElement,
  source: CanvasSource,
  target?: { width: number; height: number },
  options: DrawOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = target ?? sourceSize(source);
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));

  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.filter = formatFilter(options.adjust);
  ctx.imageSmoothingQuality = "high";
  if (source instanceof ImageData) ctx.putImageData(source, 0, 0);
  else ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";

  for (const stroke of options.strokes ?? []) drawShape(ctx, stroke);
  if (options.text) paintText(ctx, options.text);
}

/** Xoay ảnh 90° (đổi chỗ chiều rộng/cao), theo chiều kim đồng hồ nếu `clockwise`. */
export function rotateImage(source: CanvasSource, clockwise: boolean): HTMLCanvasElement {
  const { width, height } = sourceSize(source);
  const target = document.createElement("canvas");
  target.width = height;
  target.height = width;
  const ctx = target.getContext("2d");
  if (!ctx) return target;
  ctx.save();
  if (clockwise) {
    ctx.translate(height, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, width);
    ctx.rotate(-Math.PI / 2);
  }
  paintSource(ctx, source, width, height);
  ctx.restore();
  return target;
}

/** Vẽ nguồn ảnh (kể cả ImageData) vào một context đã có sẵn. */
function paintSource(ctx: CanvasRenderingContext2D, source: CanvasSource, width = 0, height = 0): void {
  const size = sourceSize(source);
  if (source instanceof ImageData) {
    ctx.putImageData(source, 0, 0);
    return;
  }
  ctx.drawImage(source, 0, 0, width || size.width, height || size.height);
}

export function flipImage(source: CanvasSource, horizontal: boolean): HTMLCanvasElement {
  const { width, height } = sourceSize(source);
  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d");
  if (!ctx) return target;
  ctx.save();
  if (horizontal) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, height);
    ctx.scale(1, -1);
  }
  paintSource(ctx, source, width, height);
  ctx.restore();
  return target;
}

/** Thu nhỏ theo từng bước 50% để tránh răng cưa khi giảm nhiều lần. */
export function resizeImage(source: CanvasSource, width: number, height: number): HTMLCanvasElement {
  const size = sourceSize(source);
  let current: HTMLCanvasElement | HTMLImageElement | ImageBitmap | ImageData = source;
  let w = size.width;
  let h = size.height;

  while (w / 2 >= width && h / 2 >= height && w > 2 && h > 2) {
    const half = document.createElement("canvas");
    half.width = Math.max(1, Math.round(w / 2));
    half.height = Math.max(1, Math.round(h / 2));
    const ctx = half.getContext("2d");
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    paintSource(ctx, current, half.width, half.height);
    current = half;
    w = half.width;
    h = half.height;
  }

  const target = document.createElement("canvas");
  render(target, current, { width, height });
  return target;
}

export function cropImage(source: CanvasSource, box: { x: number; y: number; width: number; height: number }): HTMLCanvasElement {
  const size = sourceSize(source);
  const x = Math.max(0, Math.min(size.width - 1, Math.floor(box.x)));
  const y = Math.max(0, Math.min(size.height - 1, Math.floor(box.y)));
  const width = Math.max(1, Math.min(size.width - x, Math.round(box.width)));
  const height = Math.max(1, Math.min(size.height - y, Math.round(box.height)));

  const flat = document.createElement("canvas");
  flat.width = size.width;
  flat.height = size.height;
  const flatCtx = flat.getContext("2d");
  if (!flatCtx) return flat;
  paintSource(flatCtx, source, size.width, size.height);

  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d");
  if (!ctx) return target;
  ctx.drawImage(flat, x, y, width, height, 0, 0, width, height);
  return target;
}

export function applyFilterPreset(source: CanvasSource, preset: "grayscale" | "sepia" | "invert"): HTMLCanvasElement {
  const target = document.createElement("canvas");
  const size = sourceSize(source);
  target.width = size.width;
  target.height = size.height;
  const ctx = target.getContext("2d");
  if (!ctx) return target;
  ctx.filter = preset === "grayscale" ? "grayscale(1)" : preset === "sepia" ? "sepia(0.85)" : "invert(1)";
  paintSource(ctx, source, size.width, size.height);
  ctx.filter = "none";
  return target;
}

