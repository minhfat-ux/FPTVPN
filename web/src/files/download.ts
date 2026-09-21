import { api } from "../api/client";

/**
 * Tải tệp từ API rồi lưu xuống máy — KHÔNG dùng `<a href="/api/files/...">`.
 *
 * Vì sao: đường dẫn trực tiếp chỉ gửi được COOKIE phiên, không gửi được token Bearer mà web
 * đang dùng. Chủ dự án gặp đúng lỗi này 21/09/2026: "hiện thẻ tệp nhưng không download được"
 * (server trả 401 vì trình duyệt điều hướng không kèm Authorization).
 *
 * Cách làm ở đây: fetch kèm `Authorization`, nhận blob, rồi tạo link tạm để lưu ⇒ hoạt động
 * bất kể cookie phiên còn hay mất.
 */
export async function downloadFileFromApi(id: string, name?: string | null): Promise<void> {
  const blob = await api.fetchFileBlob(id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name && name.trim() ? name : "fBuddy";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Mở tệp trong tab mới (ảnh xem trước) — cũng phải kèm token. */
export async function openFileFromApi(id: string): Promise<void> {
  const blob = await api.fetchFileBlob(id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
