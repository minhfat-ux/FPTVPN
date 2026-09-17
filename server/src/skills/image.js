import { resolveOwnedFile, asImagePayload, saveBuffer, publicArtifact } from "../files.js";
import { generateImage } from "../providers/images.js";
import { badRequest } from "../util.js";

/**
 * `edit_image` — AI image editing. Requires a provider with an image model
 * (Gemini `*-image` or OpenAI `gpt-image-1`). The canvas editor on the web is a
 * separate, key-free path and does not go through this tool.
 */
export async function editImage(args, ctx) {
  const fileId = args?.fileId;
  const instruction = String(args?.instruction ?? "").trim();
  if (!fileId) throw badRequest("edit_image cần `fileId` của ảnh gốc");
  if (!instruction) throw badRequest("edit_image cần `instruction` (mô tả cần sửa gì)");

  const fileRow = resolveOwnedFile({
    id: fileId,
    name: args?.fileName ?? null,
    userId: ctx.userId,
    conversationId: ctx.conversationId ?? null,
    expectKind: "image",
  });
  if (fileRow.kind !== "image") throw badRequest(`${fileRow.name} không phải ảnh`);

  const provider = await ctx.resolveImageProvider(args?.providerId ?? null);
  if (!provider) {
    throw badRequest(
      "Chưa có nhà cung cấp nào hỗ trợ ảnh. Thêm Gemini (model gemini-2.5-flash-image) hoặc OpenAI (gpt-image-1) trong Cài đặt.",
    );
  }

  const image = await asImagePayload(fileRow);
  if (!image) throw badRequest("Ảnh quá lớn để xử lý (giới hạn 8MB)");

  const result = await generateImage({
    provider,
    model: args?.model ?? provider.imageModel,
    prompt: instruction,
    image,
    signal: ctx.signal,
  });

  const row = await saveBuffer({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    name: `edited-${stripExt(fileRow.name)}.png`,
    mime: result.mime ?? "image/png",
    buffer: Buffer.from(result.dataBase64, "base64"),
    kind: "image",
    origin: "artifact",
    meta: { tool: "edit_image", sourceFileId: fileRow.id, instruction, providerId: provider.id },
  });
  const artifact = publicArtifact(row);

  return {
    ok: true,
    summary: `Đã sửa ảnh bằng ${provider.name}: ${artifact.name}`,
    data: { providerId: provider.id, providerName: provider.name, model: args?.model ?? provider.imageModel, note: result.note ?? null },
    artifacts: [artifact],
    modelText: `Đã tạo ảnh mới "${artifact.name}" (id: ${artifact.id}) theo yêu cầu: ${instruction}`,
  };
}

/** Built-in canvas-quality edits that need no AI key (deterministic, instant). */
export async function transformImage(args, ctx) {
  const fileId = args?.fileId;
  if (!fileId) throw badRequest("transform_image cần `fileId`");
  const fileRow = resolveOwnedFile({
    id: fileId,
    userId: ctx.userId,
    conversationId: ctx.conversationId ?? null,
    expectKind: "image",
  });
  if (fileRow.kind !== "image") throw badRequest(`${fileRow.name} không phải ảnh`);
  // No pixel library on the server on purpose (no native deps on a 1GB VPS):
  // the web Image Studio performs crop/rotate/filter/draw locally and uploads
  // the result back as a new file.
  return {
    ok: true,
    summary: "Nên xử lý ảnh này bằng Image Studio trên web",
    data: { fileId: fileRow.id, suggestion: "open_image_studio" },
    artifacts: [],
    modelText:
      "Các thao tác cắt/xoay/filter/vẽ chữ nên thực hiện ở Image Studio trên web (miễn phí, không cần key). " +
      "Nếu cần sửa nội dung ảnh bằng AI, hãy gọi edit_image.",
  };
}

function stripExt(name) {
  return String(name).replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "image";
}
