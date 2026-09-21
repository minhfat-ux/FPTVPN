import { useEffect, useMemo, useRef, useState } from "react";
import { downloadFileFromApi } from "../files/download";
import { Copy, FileDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Artifact } from "../types";
import { Field, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
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

const THEMES: { id: Theme; labelKey: string }[] = [
  { id: "flow", labelKey: "studio.ppt.themeFlow" },
  { id: "dark", labelKey: "studio.ppt.themeDark" },
  { id: "warm", labelKey: "studio.ppt.themeWarm" },
  { id: "mint", labelKey: "studio.ppt.themeMint" },
];

const SAMPLE_KEYS = ["1", "2", "3", "4", "5"];

/** Dàn ý mẫu, dựng lại theo ngôn ngữ đang chọn. */
function sampleSlides(t: (key: string) => string): Slide[] {
  return SAMPLE_KEYS.map((index) => ({
    id: `s_${index}_${Math.random().toString(36).slice(2)}`,
    title: t(`studio.ppt.sample${index}.title`),
    subtitle: t(`studio.ppt.sample${index}.subtitle`),
    bullets: t(`studio.ppt.sample${index}.bullets`),
    notes: t(`studio.ppt.sample${index}.notes`),
  }));
}

function newSlide(): Slide {
  return { id: `s_${Math.random().toString(36).slice(2)}`, title: "", subtitle: "", bullets: "", notes: "" };
}

/** Dựng dàn ý slide rồi giao cho backend tạo tệp .pptx qua một lượt chat (skill `ppt`). */
export function PptBuilder({ onOpenChat }: { onOpenChat?: () => void }) {
  const { t } = useI18n();
  const { send, sending, streaming, pendingArtifacts } = useChat();
  const { push } = useToast();

  const [title, setTitle] = useState(() => t("studio.ppt.defaultTitle"));
  const [subtitle, setSubtitle] = useState(() => t("studio.ppt.defaultSubtitle"));
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
        title: slide.title.trim() || t("studio.ppt.untitledSlide"),
        subtitle: slide.subtitle.trim() || undefined,
        bullets: slide.bullets
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        notes: slide.notes.trim() || undefined,
      })),
    }),
    [title, subtitle, theme, slides, t],
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
      push(t("studio.ppt.needSlide"), "error");
      return;
    }
    if (!outline.slides.some((slide) => slide.title && slide.bullets.length)) {
      push(t("studio.ppt.needContent"), "error");
      return;
    }
    await send({
      content: `${t("studio.ppt.instruction")}\n\`\`\`json\n${JSON.stringify(outline, null, 2)}\n\`\`\``,
      skill: "ppt",
    });
    push(t("studio.ppt.sent"), "info");
  }

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">{t("studio.ppt.infoTitle")}</div>
          <Field label={t("studio.ppt.deckTitle")}>
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label={t("studio.ppt.subtitle")}>
            <input className="input" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
          </Field>
          <Field label={t("studio.ppt.theme")}>
            <select className="select" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              {THEMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <div className="row gap-2">
            <button className="btn btn-sm grow" type="button" onClick={() => setSlides(sampleSlides(t))}>
              <Sparkles size={14} /> {t("studio.ppt.loadSample")}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setSlides([newSlide()])}>
              {t("studio.ppt.clearAll")}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="card-title grow">{t("studio.ppt.slideList", { count: slides.length })}</div>
            <button className="btn btn-sm btn-primary" type="button" onClick={() => setSlides((list) => [...list, newSlide()])}>
              <Plus size={14} /> {t("studio.ppt.add")}
            </button>
          </div>
          <div className="stack gap-2">
            {slides.map((slide, index) => (
              <div className="slide-preview" key={slide.id}>
                <div className="row gap-2 mb-2">
                  <span className="badge badge-accent">{t("studio.ppt.slideN", { index: index + 1 })}</span>
                  <div className="grow" />
                  <button className="btn btn-sm btn-icon" type="button" title={t("studio.ppt.moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button
                    className="btn btn-sm btn-icon"
                    type="button"
                    title={t("studio.ppt.moveDown")}
                    disabled={index === slides.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button className="btn btn-sm btn-icon" type="button" title={t("studio.ppt.duplicate")} onClick={() => duplicate(index)}>
                    <Copy size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-icon btn-danger"
                    type="button"
                    title={t("studio.ppt.removeSlide")}
                    disabled={slides.length === 1}
                    onClick={() => setSlides((list) => list.filter((item) => item.id !== slide.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  className="input mb-2"
                  placeholder={t("studio.ppt.titlePlaceholder")}
                  value={slide.title}
                  onChange={(event) => update(slide.id, { title: event.target.value })}
                />
                <input
                  className="input mb-2"
                  placeholder={t("studio.ppt.subtitlePlaceholder")}
                  value={slide.subtitle}
                  onChange={(event) => update(slide.id, { subtitle: event.target.value })}
                />
                <textarea
                  className="textarea mb-2"
                  placeholder={t("studio.ppt.bulletsPlaceholder")}
                  value={slide.bullets}
                  onChange={(event) => update(slide.id, { bullets: event.target.value })}
                />
                <textarea
                  className="textarea"
                  placeholder={t("studio.ppt.notesPlaceholder")}
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
              <div className="card-title">{t("studio.ppt.generateTitle")}</div>
              <div className="card-desc">{t("studio.ppt.generateDesc")}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={generate} disabled={sending}>
            {sending ? <Spinner label={t("studio.ppt.generating")} /> : <><FileDown size={16} /> {t("studio.ppt.generate")}</>}
          </button>
          {sending && <div className="hint mt-2">{t("studio.ppt.generatingHint")}</div>}
          {onOpenChat && (
            <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
              {t("studio.action.openChat")}
            </button>
          )}
          <div className="hint mt-2">{t("studio.ppt.chatHint")}</div>
        </div>

        {pptFiles.length > 0 && (
          <div className="card">
            <div className="card-title mb-2">{t("studio.ppt.files")}</div>
            {pptFiles.map((file) => (
              <div className="artifact-card" key={file.id}>
                <div className="artifact-icon">PPT</div>
                <div className="grow">
                  <div className="truncate bold small">{file.name}</div>
                  <div className="tiny faint">{file.mime || "application/vnd.openxmlformats-officedocument.presentationml.presentation"}</div>
                </div>
                <button className="btn btn-sm btn-primary" type="button" onClick={() => void downloadFileFromApi(file.id, file.name)}>
                  <FileDown size={14} /> {t("studio.action.download")}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-title mb-2">{t("studio.ppt.preview")}</div>
          <div className="bold">{outline.title || t("studio.ppt.deckUntitled")}</div>
          {outline.subtitle && <div className="muted small">{outline.subtitle}</div>}
          <div className="badge mt-2">{t("studio.ppt.themeBadge", { theme })}</div>
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
                {slide.notes && <div className="tiny faint">{t("studio.ppt.noteLine", { note: slide.notes })}</div>}
              </li>
            ))}
          </ol>
          {!outline.slides.length && <div className="hint">{t("studio.ppt.noSlides")}</div>}
        </div>
      </div>
    </div>
  );
}
