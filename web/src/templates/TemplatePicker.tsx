import { useCallback, useEffect, useState } from "react";
import { CloudUpload, FileSpreadsheet, FileText, Presentation, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Modal, Spinner } from "../components/ui";
import { useToast } from "../state/store";
import { useI18n } from "../i18n";
import type { TemplateItem } from "../types";

/**
 * Thư viện MẪU của người dùng (Word/Excel/PPT).
 *
 * Yêu cầu chủ dự án 2026-09-20: người dùng tự đưa mẫu của họ lên để fBuddy dùng lại cho họ.
 * Mẫu được chọn cho từng lượt chat: `.xlsx` thì fBuddy ĐIỀN số liệu vào chính workbook mẫu
 * (giữ công thức/định dạng/logo), `.docx`/`.pptx` thì bám đúng bố cục và thứ tự mục của mẫu.
 */
/**
 * Nội dung thư viện mẫu — dùng được ở HAI nơi:
 *  - trong modal mở từ ô chat (chọn mẫu cho lượt này),
 *  - trong mục Tài khoản (quản lý mẫu: tải lên/xoá).
 */
export function TemplateLibraryPanel({
  value,
  onSelect,
  autoLoad = true,
}: {
  value?: string | null;
  onSelect?: (id: string | null) => void;
  autoLoad?: boolean;
}) {
  const { t, d } = useI18n();
  const { push } = useToast();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.templates()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("chat.template.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  const upload = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["docx", "xlsx", "pptx"].includes(ext)) {
      push(t("chat.template.wrongType"), "error");
      return;
    }
    setUploading(true);
    try {
      const { template } = await api.uploadTemplate(file, { name: name.trim() || undefined });
      push(t("chat.template.uploaded", { name: template.name }), "success");
      setName("");
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("chat.template.uploadFailed"), "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: TemplateItem) => {
    try {
      await api.deleteTemplate(item.id);
      if (value && value === item.id) onSelect?.(null);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      push(t("chat.template.deleted", { name: item.name }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("chat.template.deleteFailed"), "error");
    }
  };

  const icon = (kind: string) =>
    kind === "xlsx" ? <FileSpreadsheet size={16} /> : kind === "pptx" ? <Presentation size={16} /> : <FileText size={16} />;

  return (
    <div className="stack gap-3">
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input
            className="input"
            placeholder={t("chat.template.namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="btn btn-sm" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
            <CloudUpload size={14} /> {uploading ? t("chat.template.uploading") : t("chat.template.upload")}
            <input
              type="file"
              accept=".docx,.xlsx,.pptx"
              style={{ display: "none" }}
              onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="hint">{t("chat.template.hint")}</div>

        {loading && <Spinner label={t("common.loading")} />}

        {!loading && !items.length && <div className="hint">{t("chat.template.empty")}</div>}

        {items.map((item) => (
          <div
            key={item.id}
            className={`card hub-card ${value === item.id ? "active" : ""}`}
            style={{ padding: "12px 14px", cursor: "pointer" }}
            onClick={() => onSelect?.(item.id)}
          >
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <span className="hub-card-icon" style={{ flex: "0 0 34px", width: 34, height: 34 }}>{icon(item.kind)}</span>
              <div className="grow">
                <div className="card-title">{item.name}</div>
                <div className="hint">
                  {item.kind.toUpperCase()} · {Math.round(item.size / 1024)} KB
                  {item.shared ? ` · ${t("chat.template.shared")}` : ""}
                  {` · ${d(item.createdAt)}`}
                </div>
              </div>
              {value === item.id && <span className="badge badge-accent">{t("chat.template.selected")}</span>}
              <button
                className="btn btn-sm btn-danger"
                type="button"
                onClick={(event) => { event.stopPropagation(); void remove(item); }}
                title={t("chat.template.delete")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}

/** Modal mở từ ô chat: chọn mẫu cho LƯỢT NÀY (quản lý mẫu nằm ở Tài khoản). */
export function TemplatePicker({
  open,
  onClose,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={t("chat.template.title")}
      description={t("chat.template.description")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={() => onSelect(null)}>{t("chat.template.clear")}</button>
          <button className="btn btn-primary" type="button" onClick={onClose}>{t("common.close")}</button>
        </>
      }
    >
      {open && <TemplateLibraryPanel value={value} onSelect={onSelect} autoLoad={open} />}
    </Modal>
  );
}
