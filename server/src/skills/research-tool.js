/**
 * Công cụ `research_web` — cầu nối giữa AGENT CHAT và AGENT TRA CỨU (researcher).
 *
 * Vì sao cần: trước đây server chỉ tra cứu một lần trước khi trả lời (pre-research), agent chat
 * không hỏi thêm được giữa lượt. Yêu cầu chủ dự án 2026-09-20: "agent tra cứu và chat phải
 * communication được với nhau" ⇒ nay agent chat tự gọi công cụ này khi cần thông tin mới.
 */
import { research } from "../researcher.js";
import { badRequest } from "../util.js";

export async function researchForModel(args) {
  const question = String(args?.question ?? "").trim();
  if (question.length < 4) throw badRequest("research_web cần `question` rõ ràng");
  const domain = typeof args?.domain === "string" && args.domain.trim() ? args.domain.trim() : "chung";
  const result = await research({ question, domain });
  const findings = (result?.findings ?? []).slice(0, 8);
  if (!findings.length) {
    return {
      ok: true,
      summary: "Không tra được nguồn nào",
      data: { findings: [], confidence: result?.confidence ?? "low" },
      artifacts: [],
      sources: [],
      modelText:
        "Agent tra cứu KHÔNG tìm được nguồn nào cho câu hỏi này. Hãy nói thẳng với người dùng là " +
        "em chưa tra được nguồn, đừng đoán, và đề nghị họ kiểm tra nguồn chính thức.",
    };
  }
  const lines = findings.map((f, i) => `[${i + 1}] ${f.title ?? ""} — ${f.url ?? ""}\n${String(f.snippet ?? f.summary ?? "").slice(0, 400)}`);
  return {
    ok: true,
    summary: `Agent tra cứu trả về ${findings.length} nguồn`,
    data: { findings: findings.map((f) => ({ title: f.title, url: f.url })), confidence: result?.confidence ?? "medium" },
    artifacts: [],
    // `sources` được lượt chat gom lại và gắn vào khối "Nguồn tra cứu" ở cuối câu trả lời.
    sources: findings.filter((f) => f.url).map((f) => ({ kind: "web", label: f.title || f.url, url: f.url })),
    modelText:
      `KẾT QUẢ TỪ AGENT TRA CỨU (mức chắc chắn: ${result?.confidence ?? "medium"}):\n` +
      `${lines.join("\n\n")}\n\n` +
      "Khi trả lời: nêu rõ nguồn (tên + URL) cho từng số liệu, và chỉ dùng những gì có trong kết quả này.",
  };
}
