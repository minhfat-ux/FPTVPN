import { applyFilterPreset, cropImage, flipImage, resizeImage, rotateImage, type CanvasSource } from "./canvasLib";

export type CanvasAction = "rotate-left" | "rotate-right" | "flip-h" | "flip-v" | "grayscale" | "sepia" | "invert";

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Chuẩn hoá vùng kéo (có thể âm) thành hình chữ nhật dương. */
export function normalizeBox(box: CropBox): CropBox {
  return {
    x: Math.min(box.x, box.x + box.width),
    y: Math.min(box.y, box.y + box.height),
    width: Math.abs(box.width),
    height: Math.abs(box.height),
  };
}

/** Thực hiện một thao tác biến đổi ảnh, trả về ảnh nguồn mới. */
export function runAction(source: CanvasSource, action: CanvasAction): HTMLCanvasElement {
  switch (action) {
    case "rotate-left":
      return rotateImage(source, false);
    case "rotate-right":
      return rotateImage(source, true);
    case "flip-h":
      return flipImage(source, true);
    case "flip-v":
      return flipImage(source, false);
    default:
      return applyFilterPreset(source, action);
  }
}

export { cropImage, resizeImage };
