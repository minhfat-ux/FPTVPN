import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Check,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Plug,
  Plus,
  Presentation,
  Search,
  Sparkles,
  Store,
  Table2,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Modal, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import type { SkillDescriptor } from "../types";

/** Icon per catalogue entry (unknown ids fall back to a generic sparkle). */
export function skillIcon(icon: string, size = 16) {
  switch (icon) {
    case "chat": return <Brain size={size} />;
    case "image": return <ImageIcon size={size} />;
    case "ppt": return <Presentation size={size} />;
    case "excel": return <FileSpreadsheet size={size} />;
    case "word": return <FileText size={size} />;
    case "data": return <Table2 size={size} />;
    case "mcp": return <Plug size={size} />;
    case "document": return <FileText size={size} />;
    case "translate": return <Languages size={size} />;
    case "org": return <GraduationCap size={size} />;
    default: return <Sparkles size={size} />;
  }
}

export function skillLabel(skills: SkillDescriptor[], id: string, fallback: string): string {
  if (id === "auto") return fallback;
  return skills.find((skill) => skill.id === id)?.label ?? id;
}

/**
 * The "Thêm kỹ năng" picker — and the seed of the skill marketplace: it lists the
 * whole catalogue, lets the user manage their quick list (max 10) and shows what
 * is coming, without pretending those skills work today.
 */
export function SkillPicker({
  open,
  onClose,
  installed,
  catalog,
  maxSelectable,
  onSaved,
  onOpenHub,
}: {
  open: boolean;
  onClose: () => void;
  installed: string[];
  catalog: SkillDescriptor[];
  maxSelectable: number;
  onSaved: (next: SkillDescriptor[]) => void;
  /** Opens the skill marketplace; the entry is hidden when the prop is absent. */
  onOpenHub?: () => void;
}) {
  const { t, n } = useI18n();
  const { push } = useToast();
  const [draft, setDraft] = useState<string[]>(installed);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-sync whenever the modal is reopened with fresh server state.
  useEffect(() => {
    if (open) {
      setDraft(installed);
      setQuery("");
    }
  }, [open, installed]);

  const ready = useMemo(() => catalog.filter((skill) => skill.state !== "coming_soon"), [catalog]);
  const coming = useMemo(() => catalog.filter((skill) => skill.state === "coming_soon"), [catalog]);
  const filteredReady = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ready;
    return ready.filter((skill) =>
      `${skill.label} ${skill.description ?? ""} ${skill.category ?? ""}`.toLowerCase().includes(q),
    );
  }, [ready, query]);
  const filteredComing = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return coming;
    return coming.filter((skill) => `${skill.label} ${skill.description ?? ""}`.toLowerCase().includes(q));
  }, [coming, query]);

  const toggle = (id: string) => {
    setDraft((current) => {
      if (current.includes(id)) return current.filter((skillId) => skillId !== id);
      if (current.length >= maxSelectable) {
        push(t("chat.skillPicker.maxReached", { max: n(maxSelectable) }), "info");
        return current;
      }
      return [...current, id];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.setInstalledSkills(draft);
      onSaved(result.items);
      push(t("chat.skillPicker.saved", { count: n(result.items.length) }), "success");
      onClose();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("chat.skillPicker.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t("chat.skillPicker.title")}
      description={t("chat.skillPicker.description", { max: n(maxSelectable) })}
      footer={
        <>
          <span className="tiny faint grow">
            {t("chat.skillPicker.selectedLabel")}
            <span className="bold">{n(draft.length)}</span>
            {t("chat.skillPicker.selectedCount", { max: n(maxSelectable) })}
          </span>
          {onOpenHub && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                onClose();
                onOpenHub();
              }}
            >
              <Store size={15} /> {t("chat.skillPicker.openHub")}
            </button>
          )}
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving || !draft.length}>
            {saving ? <Spinner label={t("common.saving")} /> : <><Check size={15} /> {t("chat.skillPicker.save")}</>}
          </button>
        </>
      }
    >
      <div className="row mb-3" style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 10, color: "var(--text-faint)" }} />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder={t("chat.skillPicker.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="skill-picker-grid">
        {filteredReady.map((skill) => {
          const active = draft.includes(skill.id);
          const index = draft.indexOf(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              className={`skill-card${active ? " active" : ""}`}
              onClick={() => toggle(skill.id)}
            >
              <span className="skill-card-icon">{skillIcon(skill.icon, 18)}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row gap-2">
                  <span className="bold small">{skill.label}</span>
                  {skill.builtin === false && <span className="badge">{t("chat.skillPicker.external")}</span>}
                </span>
                <span className="tiny muted" style={{ display: "block" }}>
                  {skill.description}
                </span>
              </span>
              <span className={`skill-card-state${active ? " on" : ""}`}>
                {active ? (index === 0 ? <Check size={14} /> : <span className="tiny bold">{index + 1}</span>) : <Plus size={14} />}
              </span>
            </button>
          );
        })}
        {!filteredReady.length && (
          <div className="empty small">{t("chat.skillPicker.noMatch", { query })}</div>
        )}
      </div>

      {filteredComing.length > 0 && (
        <>
          <div className="divider" />
          <div className="row gap-2 mb-2">
            <LayoutGrid size={15} />
            <span className="bold small">{t("chat.skillPicker.comingTitle")}</span>
          </div>
          <p className="hint mb-3">
            {t("chat.skillPicker.comingHint")}
          </p>
          <div className="skill-picker-grid">
            {filteredComing.map((skill) => (
              <div key={skill.id} className="skill-card disabled" aria-disabled="true">
                <span className="skill-card-icon">{skillIcon(skill.icon, 18)}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row gap-2">
                    <span className="bold small">{skill.label}</span>
                    <span className="badge badge-warn">{t("chat.skillPicker.comingBadge")}</span>
                  </span>
                  <span className="tiny muted" style={{ display: "block" }}>
                    {skill.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {draft.length > 0 && (
        <>
          <div className="divider" />
          <div className="row row-wrap gap-2">
            <span className="tiny faint">{t("chat.skillPicker.selecting")}</span>
            {draft.map((id) => (
              <span key={id} className="chip active">
                {skillIcon(catalog.find((skill) => skill.id === id)?.icon ?? "", 14)}
                {skillLabel(catalog, id, t("chat.skill.auto"))}
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={t("chat.skillPicker.removeAria", { name: skillLabel(catalog, id, t("chat.skill.auto")) })}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
