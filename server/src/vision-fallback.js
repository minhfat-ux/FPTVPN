import { modelAcceptsImages } from "./providers/vision.js";
import { readImageContent } from "./skills/vision.js";
import { resolveVisionTarget } from "./settings.js";

/**
 * "Model không xem được ảnh thì backend tự chuyển sang model có thị giác."
 *
 * When the model the user picked cannot read images (the free `glm-4-flash`,
 * DeepSeek…), two things are true at once: the gateway *rejects* the image part
 * (`messages.content.type 参数非法，取值范围 ['text']`), and the user still expects
 * their photo to be understood ("đưa hết data trong ảnh thành excel").
 *
 * So instead of dropping the picture, the backend:
 *   1. finds a provider/model that really accepts images (configurable via
 *      `visionProviderId`/`visionModel`, otherwise auto),
 *   2. reads each attached image there (text + optional table),
 *   3. puts the extracted text into this turn's messages and removes the bytes,
 *   4. tells the user which model did the reading (SSE `notice`).
 *
 * `readImage`/`resolveTarget` are injectable so the behaviour can be tested
 * without a network call.
 */
export async function applyVisionFallback({
  messages,
  provider,
  model,
  user,
  conversationId,
  signal,
  channel,
  readImage = readImageContent,
  resolveTarget = resolveVisionTarget,
}) {
  const imagesInTurn = messages.reduce((total, message) => total + (message.images?.length ?? 0), 0);
  if (!imagesInTurn) return { applied: false, reason: "no_images" };
  if (modelAcceptsImages(provider, model)) return { applied: false, reason: "model_sees_images" };

  let target = null;
  try {
    target = resolveTarget({ preferProviderId: provider?.id ?? null, preferModel: model ?? null });
  } catch {
    target = null;
  }

  if (!target) {
    channel?.send("notice", {
      message:
        `${imagesInTurn} ảnh đính kèm không gửi được vì model đang chọn không xem được ảnh và hệ thống chưa có model thị giác nào. ` +
        "Vào Cài đặt → Nhà cung cấp AI thêm một provider có model đọc được ảnh (ví dụ OpenRouter với google/gemini-2.5-flash).",
    });
    for (const message of messages) if (message.images?.length) message.images = [];
    return { applied: false, reason: "no_vision_provider", images: imagesInTurn };
  }

  channel?.send("notice", {
    message: `Model đang chọn không xem được ảnh nên fBuddy đang đọc ảnh bằng ${target.provider.name}…`,
  });

  let read = 0;
  for (const message of messages) {
    if (!message.images?.length) continue;
    const notes = [];
    for (const image of message.images) {
      try {
        const result = await readImage(
          { fileId: image.fileId, instruction: message.content ?? "" },
          { userId: user?.id, conversationId, signal },
        );
        if (result?.data?.text) {
          const label = image.fileId ? `"${image.name}" (id: ${image.fileId})` : `"${image.name}"`;
          const hint = image.fileId && result.data.table ? ` — nếu người dùng cần Excel, gọi \`xlsx_from_image\` với id ${image.fileId}` : "";
          notes.push(`[Nội dung ảnh ${label} do ${target.provider.name} đọc được${hint}]\n${result.data.text}`);
          read += 1;
        }
      } catch (err) {
        console.warn("[fbuddy] đọc ảnh thất bại:", err?.message ?? err);
      }
    }
    message.images = [];
    if (notes.length) message.content = [message.content, ...notes].filter(Boolean).join("\n\n");
  }

  channel?.send("notice", {
    message: read
      ? `Đã đọc ${read} ảnh bằng ${target.provider.name} và đưa nội dung vào ngữ cảnh của lượt này.`
      : `${target.provider.name} không đọc được ảnh này. Hãy gửi ảnh rõ hơn hoặc chọn model có thị giác ở ô chọn model.`,
  });

  return {
    applied: true,
    read,
    images: imagesInTurn,
    providerId: target.provider.id,
    providerName: target.provider.name,
    model: target.model,
  };
}
