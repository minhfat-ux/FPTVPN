import { api, ApiError } from "../api/client";
import { render, type AdjustmentValues, type CanvasSource, type DrawText } from "./canvasLib";

/** Thông tin tối thiểu của tệp đã lưu, đủ để hiển thị và tải về. */
export interface SavedFile {
  id: string;
  name: string;
}

/** Ghi một canvas thành tệp để người dùng tải về máy. */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  fileName: string,
  format: "png" | "jpeg" | "webp",
  quality: number,
): Promise<void> {
  const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error("Không tạo được tệp ảnh");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName.replace(/\.[^.]+$/, "") || "flowgpt"}-${Date.now()}.${format === "jpeg" ? "jpg" : format}`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Lưu canvas thành artifact trong FlowGpt và trả về thông tin tệp đã lưu. */
export async function uploadCanvas(canvas: HTMLCanvasElement, conversationId: string | null): Promise<SavedFile> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Không đọc được ảnh từ canvas");
  const result = await api.uploadBlob(blob, `edited-${Date.now()}.png`, conversationId);
  return result.file;
}

/** Bọc lỗi API thành thông điệp tiếng Việt để hiển thị toast. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Vẽ ảnh nguồn (kèm bộ lọc và chữ) ra một canvas mới — dùng để "bake" thay đổi. */
export function bake(source: CanvasSource, adjust: AdjustmentValues, text?: DrawText): HTMLCanvasElement {
  const node = document.createElement("canvas");
  render(node, source, undefined, { adjust, text: text ?? null });
  return node;
}
