import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Sparkles } from "lucide-react";
import { skillIcon, skillLabel } from "./SkillPicker";
import type { SkillDescriptor } from "../types";

/**
 * The skill picker in the composer: a dropdown with the user's installed skills
 * (top 10) plus a "Thêm kỹ năng…" entry that opens the picker / marketplace.
 *
 * A custom menu is used instead of a native <select> so each row can carry an
 * icon and a one-line description.
 */
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
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = value === "auto" ? null : skills.find((skill) => skill.id === value) ?? null;
  const label = value === "auto" ? "Tự động" : current?.label ?? skillLabel(skills, value);

  const pick = (skillId: string) => {
    onChange(skillId);
    setOpen(false);
  };

  return (
    <div className="skill-menu" ref={boxRef}>
      <button
        type="button"
        className="skill-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Kỹ năng: ${label}`}
        disabled={disabled}
        title={current?.description ?? "Để FlowGpt tự chọn cách trả lời"}
      >
        {value === "auto" ? <Sparkles size={15} /> : skillIcon(current?.icon ?? "", 15)}
        <span className="skill-trigger-label">{label}</span>
        <ChevronDown size={14} className="skill-trigger-caret" />
      </button>

      {open && (
        <div className="skill-dropdown" role="listbox" aria-label="Chọn kỹ năng">
          <button
            type="button"
            role="option"
            aria-selected={value === "auto"}
            className={`skill-dropdown-item${value === "auto" ? " active" : ""}`}
            onClick={() => pick("auto")}
          >
            <Sparkles size={15} />
            <span className="skill-dropdown-text">
              <span className="skill-dropdown-name">Tự động</span>
              <span className="skill-dropdown-desc">Không chọn kỹ năng cụ thể</span>
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

          {!skills.length && <div className="empty small">Chưa có kỹ năng nào</div>}

          <div className="skill-dropdown-sep" />

          <button
            type="button"
            className="skill-dropdown-more"
            onClick={() => {
              setOpen(false);
              onOpenPicker();
            }}
          >
            <Plus size={15} /> Thêm kỹ năng…
          </button>
        </div>
      )}
    </div>
  );
}
