import { useState } from "react";
import { Download, ExternalLink, Search, Sparkles } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Field } from "../components/ui";
import type { SkillHubDraft, SkillHubSearchItem } from "../types";

/**
 * Cài đặt → Hệ thống: "Nhập kỹ năng từ SkillHub (Tencent)".
 *
 * Chủ dự án tìm skill trên chợ Tencent rồi nhập thẳng vào chợ của mình, không phải mở
 * terminal. Việc gọi SkillHub do **server** làm (khoá `X-API-Key` không lộ ra trình
 * duyệt); nếu server ở vùng IP bị SkillHub chặn thì card hiện đúng câu giải thích mà
 * API trả về, kèm cách chạy bằng CLI từ máy có đường sang Trung Quốc.
 *
 * Chữ trong card này đang là tiếng Việt trực tiếp (màn quản trị chỉ chủ dự án dùng);
 * muốn đa ngữ thì đưa vào `i18n/locales/<lang>/settings.ts` như các thẻ khác.
 */
const DEFAULT_PRICE_VND = 50000;

const MARKETS = ["Tự quyết theo skill", "published", "coming_soon"] as const;

export function SkillHubImportCard() {
  const { push } = useToast();
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [results, setResults] = useState<SkillHubSearchItem[]>([]);
  const [draft, setDraft] = useState<SkillHubDraft | null>(null);
  const [priceVnd, setPriceVnd] = useState(DEFAULT_PRICE_VND);
  const [state, setState] = useState<(typeof MARKETS)[number]>("Tự quyết theo skill");
  const [translate, setTranslate] = useState<string[]>(["vi"]);
  const [busy, setBusy] = useState(false);

  const t = {
    title: "Nhập kỹ năng từ SkillHub (Tencent)",
    hint:
      "Tìm skill trên chợ Tencent rồi nhập vào chợ của mình. Giá tính bằng VND; credit được suy ra theo giá credit hiện hành.",
    keyword: "Từ khoá (ví dụ: marketing, PPT, 财务)",
    search: "Tìm",
    searching: "Đang tìm…",
    preview: "Xem trước",
    import: "Nhập vào chợ",
    importing: "Đang nhập…",
    price: "Giá bán (VND)",
    state: "Trạng thái",
    translate: "Dịch chỉ dẫn sang",
    noResult: "Không có kết quả.",
  };

  async function runSearch() {
    if (!keyword.trim()) return;
    setSearching(true);
    setDraft(null);
    try {
      const data = await api.skillhubSearch(keyword.trim(), 12, true);
      setResults(data.items ?? []);
      setTotal(data.total ?? 0);
      if (!data.items?.length) push(t.noResult, "info");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không tìm được skill.", "error");
    } finally {
      setSearching(false);
    }
  }

  async function openPreview(slug: string) {
    setBusy(true);
    setDraft(null);
    try {
      const { draft: found } = await api.skillhubPreview(slug, priceVnd);
      setDraft(found);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không xem trước được skill.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api.skillhubImport({
        slug: draft.skillhubSlug,
        priceVnd,
        ...(state === "Tự quyết theo skill" ? {} : { state }),
        ...(translate.length ? { translate } : {}),
      });
      const action = result.updated ? "đã cập nhật" : "đã thêm vào chợ";
      push(`${result.skill.name} — ${action} (${result.skill.priceVnd.toLocaleString("vi-VN")}đ).`, "success");
      for (const warning of result.warnings ?? []) push(warning, "info");
      setDraft(result.skill.instructions ? { ...draft, name: result.skill.name, state: result.skill.state } : draft);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Nhập không thành công.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <Sparkles size={16} />
        <strong>{t.title}</strong>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>{t.hint}</p>

      <div className="row gap-2 row-wrap" style={{ alignItems: "flex-end", marginTop: 10 }}>
        <div style={{ flex: "1 1 260px" }}>
          <Field label={t.keyword}>
            <input
              className="input"
              value={keyword}
              placeholder="marketing · 销售 · 财务 · PPT · 行业研究"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
            />
          </Field>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void runSearch()} disabled={searching || !keyword.trim()}>
          <Search size={15} /> {searching ? t.searching : t.search}
        </button>
      </div>

      {total !== null && (
        <p className="hint" style={{ marginTop: 6 }}>
          {total.toLocaleString("vi-VN")} kết quả trên SkillHub · hiện {results.length}
        </p>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map((item) => (
            <div key={item.slug} className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div className="bold" style={{ fontSize: 13 }}>
                  {item.displayName ?? item.name ?? item.slug}
                  {item.labels?.requires_api_key === "true" && <span className="hint"> · cần API key riêng</span>}
                </div>
                <div className="hint" style={{ fontSize: 12 }}>
                  {item.slug} · {item.category ?? "?"} · {(item.downloads ?? 0).toLocaleString("vi-VN")} lượt tải
                </div>
              </div>
              <button className="btn btn-sm" type="button" onClick={() => void openPreview(item.slug)} disabled={busy}>
                {t.preview}
              </button>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="card" style={{ marginTop: 10, background: "var(--bg-subtle)" }}>
          <div className="bold">{draft.name}</div>
          <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>
            {draft.category} · nguồn skillhub.cn/{draft.skillhubSlug}@{draft.version ?? "?"} · {(draft.downloads ?? 0).toLocaleString("vi-VN")} lượt tải
          </div>
          <div className="hint" style={{ fontSize: 12, marginTop: 4 }}>
            chỉ dẫn {draft.instructions.length.toLocaleString("vi-VN")} ký tự
            {draft.instructionsTruncated ? ` (gốc ${draft.originalLength.toLocaleString("vi-VN")} — ĐÃ CẮT cho vừa trần 6.000 của chợ)` : ""}
            {draft.tools.length ? ` · công cụ: ${draft.tools.join(", ")}` : " · không khai công cụ"}
          </div>
          {(draft.warnings ?? []).map((warning) => (
            <div key={warning} className="hint" style={{ fontSize: 12, color: "var(--warn)", marginTop: 4 }}>⚠ {warning}</div>
          ))}

          <div className="row gap-2 row-wrap" style={{ alignItems: "flex-end", marginTop: 10 }}>
            <div style={{ width: 160 }}>
              <Field label={t.price}>
                <input className="input" type="number" min={0} step={1000} value={priceVnd}
                  onChange={(event) => setPriceVnd(Math.max(0, Number(event.target.value) || 0))} />
              </Field>
            </div>
            <div style={{ width: 190 }}>
              <Field label={t.state}>
                <select className="input" value={state} onChange={(event) => setState(event.target.value as (typeof MARKETS)[number])}>
                  {MARKETS.map((option) => <option key={option} value={option}>{option === "Tự quyết theo skill" ? option : option === "published" ? "Bán ngay" : "Sắp có"}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <div className="hint" style={{ fontSize: 12, marginBottom: 4 }}>{t.translate}</div>
              <div className="row gap-3">
                {(["vi", "en"] as const).map((lang) => (
                  <label key={lang} className="row gap-1" style={{ alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" checked={translate.includes(lang)}
                      onChange={(event) => setTranslate((current) =>
                        event.target.checked ? [...new Set([...current, lang])] : current.filter((l) => l !== lang))} />
                    {lang === "vi" ? "Tiếng Việt" : "English"}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => void runImport()} disabled={busy}>
              <Download size={15} /> {busy ? t.importing : t.import}
            </button>
          </div>
          <p className="hint" style={{ fontSize: 12, marginTop: 6 }}>
            Dịch dùng nhà cung cấp AI đang cấu hình; bản tiếng Việt là bản bán trong chợ (bản gốc vẫn nằm trên skillhub.cn).
            <a href={`https://skillhub.cn`} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>
              <ExternalLink size={12} /> skillhub.cn
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
