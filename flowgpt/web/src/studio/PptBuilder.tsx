import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, FileDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Artifact } from "../types";
import { Field, Spinner } from "../components/ui";
import { useChat } from "../state/chat";
import { useToast } from "../state/store";

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  bullets: string;
  notes: string;
}

type Theme = "flow" | "dark" | "warm" | "mint";

const THEMES: { id: Theme; label: string }[] = [
  { id: "flow", label: "Flow (xanh FlowTech)" },
  { id: "dark", label: "Dark (nền tối)" },
  { id: "warm", label: "Warm (cam ấm)" },
  { id: "mint", label: "Mint (bạc hà)" },
];

const SAMPLE_SLIDES: { title: string; subtitle: string; bullets: string; notes: string }[] = [
  {
    title: "FlowGpt — Trợ lý AI cho doanh nghiệp Việt",
    subtitle: "Báo cáo giới thiệu sản phẩm",
    bullets: "Nền tảng chat AI đa kỹ năng\nHỗ trợ tiếng Việt tự nhiên\nTriển khai nội bộ, an toàn dữ liệu",
    notes: "Mở đầu bằng con số: 70% yêu cầu lặp lại có thể tự động hoá.",
  },
  {
    title: "Vấn đề hiện tại",
    subtitle: "Vì sao cần một trợ lý AI nội bộ",
    bullets: "Nhân viên mất 2–3 giờ/ngày cho việc tổng hợp tài liệu\nDữ liệu nằm rải rác ở nhiều công cụ\nChi phí đào tạo nhân sự mới cao",
    notes: "Nhấn mạnh chi phí cơ hội, không chỉ thời gian.",
  },
  {
    title: "Bốn kỹ năng chính",
    subtitle: "Một nền tảng, bốn công cụ",
    bullets: "Sửa ảnh trực tiếp trên canvas\nTạo slide PowerPoint tự động\nTạo bảng tính Excel có dòng tổng\nPhân tích dữ liệu và vẽ biểu đồ",
    notes: "Demo trực tiếp kỹ năng tạo slide nếu còn thời gian.",
  },
  {
    title: "Kết quả thử nghiệm",
    subtitle: "Chạy thử với 30 nhân sự",
    bullets: "Giảm 45% thời gian soạn báo cáo\n92% người dùng hài lòng với bản tiếng Việt\nTạo được 180 tệp PPTX/Excel trong 2 tuần",
    notes: "Số liệu lấy từ đợt pilot nội bộ quý trước.",
  },
  {
    title: "Bước tiếp theo",
    subtitle: "Kế hoạch 3 tháng tới",
    bullets: "Mở rộng cho toàn bộ khối vận hành\nBổ sung kết nối MCP tới hệ thống nội bộ\nĐo lường mức tiết kiệm theo phòng ban",
    notes: "Chốt bằng đề xuất phê duyệt ngân sách giai đoạn 2.",
  },
];

function newSlide(): Slide {
  return { id: `s_${Math.random().toString(36).slice(2)}`, title: "", subtitle: "", bullets: "", notes: "" };
}

/** Dựng dàn ý slide rồi giao cho backend tạo tệp .pptx qua một lượt chat (skill `ppt`). */
export function PptBuilder({ onOpenChat }: { onOpenChat?: () => void }) {
  const { send, sending, streaming, pendingArtifacts } = useChat();
  const { push } = useToast();

  const [title, setTitle] = useState("Bộ slide giới thiệu FlowGpt");
  const [subtitle, setSubtitle] = useState("Trợ lý AI đa kỹ năng cho doanh nghiệp Việt");
  const [theme, setTheme] = useState<Theme>("flow");
  const [slides, setSlides] = useState<Slide[]>([newSlide()]);
  const [produced, setProduced] = useState<Artifact[]>([]);

  const wasSending = useRef(false);
  const latest = useRef<Artifact[]>([]);
  latest.current = streaming?.artifacts?.length ? streaming.artifacts : pendingArtifacts;

  // Khi lượt chat kết thúc, `streaming` bị xoá — giữ lại tệp đã tạo để người dùng vẫn tải được.
  useEffect(() => {
    if (sending) wasSending.current = true;
    else if (wasSending.current) {
      wasSending.current = false;
      setProduced((list) => {
        const merged = [...latest.current, ...list];
        return merged.filter((item, index) => merged.findIndex((other) => other.id === item.id) === index);
      });
    }
  }, [sending]);

  const outline = useMemo(
    () => ({
      __tool: "generate_pptx",
      title: title.trim(),
      subtitle: subtitle.trim(),
      theme,
      slides: slides.map((slide) => ({
        title: slide.title.trim() || "Slide chưa có tiêu đề",
        subtitle: slide.subtitle.trim() || undefined,
        bullets: slide.bullets
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        notes: slide.notes.trim() || undefined,
      })),
    }),
    [title, subtitle, theme, slides],
  );

  const artifacts: Artifact[] = streaming?.artifacts?.length
    ? streaming.artifacts
    : pendingArtifacts.length
      ? pendingArtifacts
      : produced;
  const pptFiles = artifacts.filter((item) => item.kind === "pptx" || item.name.endsWith(".pptx"));

  function update(id: string, patch: Partial<Slide>) {
    setSlides((list) => list.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide)));
  }

  function move(index: number, delta: number) {
    setSlides((list) => {
      const at = index + delta;
      if (at < 0 || at >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(at, 0, item);
      return next;
    });
  }

  function duplicate(index: number) {
    setSlides((list) => {
      const next = [...list];
      next.splice(index + 1, 0, { ...list[index], id: `s_${Math.random().toString(36).slice(2)}` });
      return next;
    });
  }

  async function generate() {
    if (!outline.slides.length) {
      push("Cần ít nhất một slide", "error");
      return;
    }
    if (!outline.slides.some((slide) => slide.title && slide.bullets.length)) {
      push("Hãy nhập tiêu đề và ít nhất một gạch đầu dòng", "error");
      return;
    }
    await send({
      content: `Tạo file PowerPoint từ dàn ý JSON sau, giữ nguyên nội dung:\n\`\`\`json\n${JSON.stringify(outline, null, 2)}\n\`\`\``,
      skill: "ppt",
    });
    push("Đã gửi dàn ý — tệp .pptx sẽ xuất hiện sau khi xử lý xong", "info");
  }

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">Thông tin bộ slide</div>
          <Field label="Tiêu đề bộ slide">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Phụ đề">
            <input className="input" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
          </Field>
          <Field label="Bảng màu (theme)">
            <select className="select" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              {THEMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="row gap-2">
            <button className="btn btn-sm grow" type="button" onClick={() => setSlides(SAMPLE_SLIDES.map((slide) => ({ ...slide, id: `s_${Math.random().toString(36).slice(2)}` })))}>
              <Sparkles size={14} /> Nạp dàn ý mẫu
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setSlides([newSlide()])}>
              Xoá hết
            </button>
          </div>
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">Danh sách slide ({slides.length})</div>
            <button className="btn btn-sm btn-primary" type="button" onClick={() => setSlides((list) => [...list, newSlide()])}>
              <Plus size={14} /> Thêm
            </button>
          </div>
          <div className="stack gap-2">
            {slides.map((slide, index) => (
              <div className="slide-preview" key={slide.id}>
                <div className="row gap-2 mb-2">
                  <span className="badge badge-accent">Slide {index + 1}</span>
                  <div className="grow" />
                  <button className="btn btn-sm btn-icon" type="button" title="Lên" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button
                    className="btn btn-sm btn-icon"
                    type="button"
                    title="Xuống"
                    disabled={index === slides.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button className="btn btn-sm btn-icon" type="button" title="Nhân bản" onClick={() => duplicate(index)}>
                    <Copy size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-icon btn-danger"
                    type="button"
                    title="Xoá slide"
                    disabled={slides.length === 1}
                    onClick={() => setSlides((list) => list.filter((item) => item.id !== slide.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  className="input mb-2"
                  placeholder="Tiêu đề slide"
                  value={slide.title}
                  onChange={(event) => update(slide.id, { title: event.target.value })}
                />
                <input
                  className="input mb-2"
                  placeholder="Phụ đề (tuỳ chọn)"
                  value={slide.subtitle}
                  onChange={(event) => update(slide.id, { subtitle: event.target.value })}
                />
                <textarea
                  className="textarea mb-2"
                  placeholder="Gạch đầu dòng — mỗi dòng một ý"
                  value={slide.bullets}
                  onChange={(event) => update(slide.id, { bullets: event.target.value })}
                />
                <textarea
                  className="textarea"
                  placeholder="Ghi chú cho người trình bày (tuỳ chọn)"
                  value={slide.notes}
                  onChange={(event) => update(slide.id, { notes: event.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <div className="grow">
              <div className="card-title">Tạo file .pptx</div>
              <div className="card-desc">
                Dàn ý được gửi kèm hướng dẫn tiếng Việt để AI tạo tệp PowerPoint thật.
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={generate} disabled={sending}>
            {sending ? <Spinner label="Đang tạo slide…" /> : <><FileDown size={16} /> Tạo file .pptx</>}
          </button>
          {sending && <div className="hint mt-2">Đang xử lý: AI đang dựng nội dung và xuất tệp, vui lòng chờ.</div>}
          {onOpenChat && (
            <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
              Mở chat
            </button>
          )}
          <div className="hint mt-2">Tệp được tạo trong phiên chat; mở khung chat nếu bạn muốn xem hội thoại đầy đủ.</div>
        </div>

        {pptFiles.length > 0 && (
          <div className="card">
            <div className="card-title mb-2">Tệp đã tạo</div>
            {pptFiles.map((file) => (
              <div className="artifact-card" key={file.id}>
                <div className="artifact-icon">PPT</div>
                <div className="grow">
                  <div className="truncate bold small">{file.name}</div>
                  <div className="tiny faint">{file.mime || "application/vnd.openxmlformats-officedocument.presentationml.presentation"}</div>
                </div>
                <a className="btn btn-sm btn-primary" href={api.fileUrl(file.id)} download>
                  <FileDown size={14} /> Tải về
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-title mb-2">Xem trước dàn ý</div>
          <div className="bold">{outline.title || "Bộ slide chưa có tiêu đề"}</div>
          {outline.subtitle && <div className="muted small">{outline.subtitle}</div>}
          <div className="badge mt-2">Theme: {theme}</div>
          <div className="divider" />
          <ol className="outline-list">
            {outline.slides.map((slide, index) => (
              <li key={index}>
                <div className="bold small">{slide.title}</div>
                {slide.subtitle && <div className="tiny muted">{slide.subtitle}</div>}
                <ul className="outline-bullets">
                  {slide.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="small">
                      {bullet}
                    </li>
                  ))}
                </ul>
                {slide.notes && <div className="tiny faint">Ghi chú: {slide.notes}</div>}
              </li>
            ))}
          </ol>
          {!outline.slides.length && <div className="hint">Chưa có slide nào.</div>}
        </div>
      </div>
    </div>
  );
}
