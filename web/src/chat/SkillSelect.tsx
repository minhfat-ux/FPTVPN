import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Sparkles } from "lucide-react";
import { skillIcon, skillLabel } from "./SkillPicker";
import { useI18n } from "../i18n";
import type { SkillDescriptor } from "../types";

/**
 * The skill picker in the composer: a dropdown with the user's installed skills
 * (top 10) plus a "Thêm kỹ năng…" entry that opens the picker / marketplace.
 *
 * A custom menu is used instead of a native <select> so each row can carry an
 * icon and a one-line description.
 *
 * The menu is rendered in a portal with `position: fixed` and a height measured
 * against the *visible* viewport. iOS Safari was the reason: the old version was
 * a 320px-tall absolutely-positioned box inside `.app { overflow: hidden }`, so
 * with the keyboard open on an iPhone the top rows ended up off-screen and simply
 * could not be tapped. Now the menu is always clamped inside the viewport, flips
 * up or down depending on the room it has, and scrolls when space is tight.
 */

/** Preferred menu height; shrinks when there is less room. */
const DESIRED_HEIGHT = 360;
/** Never smaller than this — it just scrolls instead. */
const MIN_HEIGHT = 168;
const MIN_WIDTH = 268;
const EDGE = 10;
const GAP = 6;

interface Placement {
  left: number;
  width: number;
  top: number;
  maxHeight: number;
}

export function SkillSelect({
  skills,
  value,
  onChange,
  onOpenPicker,
  disabled = false,
}: {
  skills: SkillDescriptor[];
  /** Current skill id; "auto" means "let FlowGpt decide". */
  value: string;
  onChange: (skillId: string) => void;
  onOpenPicker: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewWidth = viewport?.width ?? window.innerWidth;
    const width = Math.min(Math.max(rect.width, MIN_WIDTH), Math.max(MIN_WIDTH, viewWidth - 2 * EDGE));
    const left = Math.min(Math.max(EDGE, rect.left), Math.max(EDGE, viewWidth - width - EDGE));
    const spaceAbove = rect.top - EDGE;
    const spaceBelow = viewHeight - rect.bottom - EDGE;
    // Open upward when that is where the room is (the composer sits at the bottom).
    const up = spaceAbove >= Math.min(DESIRED_HEIGHT, spaceBelow);
    const available = Math.max(MIN_HEIGHT, (up ? spaceAbove : spaceBelow) - GAP);
    const maxHeight = Math.min(DESIRED_HEIGHT, available);
    const top = up
      ? Math.max(EDGE, rect.top - GAP - maxHeight)
      : Math.min(viewHeight - maxHeight - EDGE, rect.bottom + GAP);
    setPlacement({ left, width, top, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    // `mousedown` + `touchstart` instead of a single pointer event: iOS Safari
    // fires the tap sequence differently and one of them always lands.
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open, measure]);

  const current = value === "auto" ? null : skills.find((skill) => skill.id === value) ?? null;
  const label = value === "auto" ? t("chat.skill.auto") : current?.label ?? skillLabel(skills, value, t("chat.skill.auto"));

  const pick = (skillId: string) => {
    onChange(skillId);
    setOpen(false);
  };

  const toggle = () => {
    // Measure before opening so the menu is positioned on its very first paint.
    if (!open) measure();
    setOpen((wasOpen) => !wasOpen);
  };

  return (
    <div className="skill-menu">
      <button
        ref={triggerRef}
        type="button"
        className="skill-trigger"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("chat.skillSelect.aria", { name: label })}
        disabled={disabled}
        title={current?.description ?? t("chat.skillSelect.autoHint")}
      >
        {value === "auto" ? <Sparkles size={15} /> : skillIcon(current?.icon ?? "", 15)}
        <span className="skill-trigger-label">{label}</span>
        <ChevronDown size={14} className="skill-trigger-caret" />
      </button>

      {open &&
        placement &&
        createPortal(
          <div
            ref={menuRef}
            className="skill-dropdown skill-dropdown-portal"
            role="listbox"
            aria-label={t("chat.skillSelect.listAria")}
            style={{
              left: placement.left,
              top: placement.top,
              width: placement.width,
              maxHeight: placement.maxHeight,
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={value === "auto"}
              className={`skill-dropdown-item${value === "auto" ? " active" : ""}`}
              onClick={() => pick("auto")}
            >
              <Sparkles size={15} />
              <span className="skill-dropdown-text">
                <span className="skill-dropdown-name">{t("chat.skill.auto")}</span>
                <span className="skill-dropdown-desc">{t("chat.skillSelect.autoDesc")}</span>
              </span>
              {value === "auto" && <Check size={14} />}
            </button>

            <div className="skill-dropdown-sep" />

            {skills.slice(0, 10).map((skill) => (
              <button
                key={skill.id}
                type="button"
                role="option"
                aria-selected={value === skill.id}
                className={`skill-dropdown-item${value === skill.id ? " active" : ""}`}
                onClick={() => pick(skill.id)}
              >
                {skillIcon(skill.icon, 15)}
                <span className="skill-dropdown-text">
                  <span className="skill-dropdown-name">{skill.label}</span>
                  <span className="skill-dropdown-desc">{skill.description}</span>
                </span>
                {value === skill.id && <Check size={14} />}
              </button>
            ))}

            {!skills.length && <div className="empty small">{t("chat.skillSelect.empty")}</div>}

            <div className="skill-dropdown-sep" />

            <button
              type="button"
              className="skill-dropdown-more"
              onClick={() => {
                setOpen(false);
                onOpenPicker();
              }}
            >
              <Plus size={15} /> {t("chat.skillSelect.more")}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
