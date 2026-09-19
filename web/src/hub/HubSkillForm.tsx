import { useMemo } from "react";
import { Save } from "lucide-react";
import { Field, Modal, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import type { HubSkill, HubSkillKind, HubSkillOrigin } from "../types";
import { HUB_ICON_NAMES } from "./icons";

type HubState = HubSkill["state"];

/** Built-in tools an admin may attach to a skill (empty = every tool). */
const HUB_TOOLS: { name: string; labelKey: string }[] = [
  { name: "generate_pptx", labelKey: "hub.form.toolGeneratePptx" },
  { name: "generate_xlsx", labelKey: "hub.form.toolGenerateXlsx" },
  { name: "analyze_data", labelKey: "hub.form.toolAnalyzeData" },
  { name: "edit_image", labelKey: "hub.form.toolEditImage" },
  { name: "list_files", labelKey: "hub.form.toolListFiles" },
];

const STATE_OPTIONS: { value: HubState; labelKey: string }[] = [
  { value: "published", labelKey: "hub.form.statePublished" },
  { value: "coming_soon", labelKey: "hub.form.stateComingSoon" },
  { value: "hidden", labelKey: "hub.form.stateHidden" },
];

export interface HubFormState {
  name: string;
  tagline: string;
  description: string;
  category: string;
  /** Chuyên gia (đóng vai) hay kỹ năng (quy trình) — quyết định tab trong chợ. */
  kind: HubSkillKind;
  /** Mình tự làm hay clone về — quyết định có được đặt giá hay không. */
  origin: HubSkillOrigin;
  icon: string;
  priceVnd: string;
  state: HubState;
  sortOrder: string;
  instructions: string;
  tools: string[];
}

export const EMPTY_HUB_FORM: HubFormState = {
  name: "",
  tagline: "",
  description: "",
  category: "",
  // Mục tạo tay mặc định là nội dung mình viết ("own"); đường nhập từ nguồn ngoài tự đặt "clone".
  kind: "skill",
  origin: "own",
  icon: "sparkles",
  priceVnd: "0",
  state: "published",
  sortOrder: "0",
  instructions: "",
  tools: [],
};

/** "1.000" → 1000; anything unparsable → 0. */
export function toHubNumber(value: string): number {
  const parsed = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Credits a buyer is charged for that money price. Mirrors the server
 * (`creditsForPriceVnd`): rounded up, and a paid skill is never free.
 */
export function creditsForVnd(priceVnd: number, vndPerCredit: number): number {
  const vnd = Math.max(0, Math.trunc(Number(priceVnd) || 0));
  const perCredit = Math.max(0, Number(vndPerCredit) || 0);
  if (!vnd || !perCredit) return 0;
  return Math.max(1, Math.ceil(vnd / perCredit));
}

/** Prefills the form from a listed skill, including the admin-only prompt pack. */
export function formFromSkill(skill: HubSkill): HubFormState {
  return {
    ...EMPTY_HUB_FORM,
    name: skill.name,
    tagline: skill.tagline ?? "",
    description: skill.description ?? "",
    category: skill.category,
    kind: skill.kind ?? (skill.category === "Chuyên gia" ? "expert" : "skill"),
    origin: skill.origin ?? "clone",
    icon: skill.icon || "sparkles",
    priceVnd: String(skill.priceVnd ?? 0),
    state: skill.state,
    sortOrder: String(skill.sortOrder ?? 0),
    instructions: skill.instructions ?? "",
    tools: Array.isArray(skill.tools) ? [...skill.tools] : [],
  };
}

/**
 * Create/edit form for one marketplace skill. The parent owns the request; the
 * dialog only reports the draft back through `onSubmit`.
 */
export function HubSkillFormDialog({
  open,
  editing,
  categories,
  value,
  saving,
  vndPerCredit = 0,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: HubSkill | null;
  categories: string[];
  value: HubFormState;
  saving: boolean;
  /** Owner-set 1-credit price; 0 hides the VND readout. */
  vndPerCredit?: number;
  onChange: (next: Partial<HubFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t, n } = useI18n();
  const categoryOptions = useMemo(() => {
    const all = [...categories];
    if (editing && !all.includes(editing.category)) all.push(editing.category);
    return all;
  }, [categories, editing]);

  const toggleTool = (name: string) =>
    onChange({
      tools: value.tools.includes(name) ? value.tools.filter((tool) => tool !== name) : [...value.tools, name],
    });

  return (
    <Modal
      open={open}
      wide
      title={editing ? t("hub.form.editTitle", { name: editing.name }) : t("hub.form.createTitle")}
      description={t("hub.form.description")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            {t("hub.form.cancel")}
          </button>
          <button className="btn btn-primary" type="button" onClick={onSubmit} disabled={saving}>
            {saving ? <Spinner label={t("hub.form.saving")} /> : <><Save size={15} /> {t("hub.form.save")}</>}
          </button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label={t("hub.form.nameLabel")} hint={t("hub.form.nameHint")}>
          <input className="input" value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("hub.form.categoryLabel")} hint={t("hub.form.categoryHint")}>
          <select
            className="select"
            value={value.category}
            onChange={(event) => onChange({ category: event.target.value })}
          >
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label={t("hub.form.kindLabel")} hint={t("hub.form.kindHint")}>
          <select
            className="select"
            value={value.kind}
            onChange={(event) => onChange({ kind: event.target.value as HubSkillKind })}
          >
            <option value="expert">{t("hub.form.kindExpert")}</option>
            <option value="skill">{t("hub.form.kindSkill")}</option>
          </select>
        </Field>
        <Field label={t("hub.form.originLabel")} hint={t("hub.form.originHint")}>
          <select
            className="select"
            value={value.origin}
            onChange={(event) => onChange({ origin: event.target.value as HubSkillOrigin })}
          >
            <option value="own">{t("hub.form.originOwn")}</option>
            <option value="clone">{t("hub.form.originClone")}</option>
          </select>
        </Field>
      </div>

      {value.origin === "clone" && <div className="hint pricing-warn">{t("hub.form.originCloneWarn")}</div>}

      <Field label={t("hub.form.taglineLabel")} hint={t("hub.form.taglineHint")}>
        <input
          className="input"
          maxLength={200}
          value={value.tagline}
          onChange={(event) => onChange({ tagline: event.target.value })}
        />
      </Field>

      <Field label={t("hub.form.descriptionLabel")} hint={t("hub.form.descriptionHint")}>
        <textarea
          className="textarea"
          rows={4}
          maxLength={2000}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>

      <div className="grid grid-3">
        <Field label={t("hub.form.iconLabel")} hint={t("hub.form.iconHint", { names: HUB_ICON_NAMES.join(", ") })}>
          <input
            className="input input-mono"
            value={value.icon}
            onChange={(event) => onChange({ icon: event.target.value })}
          />
        </Field>
        <Field label={t("hub.form.priceLabel")} hint={t("hub.form.priceHint")}>
          <input
            className="input w-num"
            type="number"
            min={0}
            step={10000}
            value={value.priceVnd}
            // Mục "clone về" không được bán (server cũng chặn): khoá ô giá để không gõ công vô ích.
            disabled={value.origin === "clone"}
            onChange={(event) => onChange({ priceVnd: event.target.value })}
          />
          {vndPerCredit > 0 && (
            <span className="hint">
              {t("hub.form.priceVnd", {
                credits: n(creditsForVnd(toHubNumber(value.priceVnd), vndPerCredit)),
                perCredit: n(vndPerCredit),
              })}
            </span>
          )}
        </Field>
        <Field label={t("hub.form.sortOrderLabel")} hint={t("hub.form.sortOrderHint")}>
          <input
            className="input w-num"
            type="number"
            value={value.sortOrder}
            onChange={(event) => onChange({ sortOrder: event.target.value })}
          />
        </Field>
      </div>

      <Field label={t("hub.form.stateLabel")} hint={t("hub.form.stateHint")}>
        <select
          className="select w-num"
          value={value.state}
          onChange={(event) => onChange({ state: event.target.value as HubState })}
        >
          {STATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t("hub.form.instructionsLabel")}
        hint={t("hub.form.instructionsHint")}
      >
        <textarea
          className="textarea"
          rows={7}
          maxLength={6000}
          value={value.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
        />
      </Field>
      {editing && <div className="hint mb-3">{t("hub.form.instructionsKeep")}</div>}

      <div className="field">
        <span className="label">{t("hub.form.toolsLabel")}</span>
        <div className="stack gap-2">
          {HUB_TOOLS.map((tool) => (
            <label className="row gap-2 small" key={tool.name}>
              <input type="checkbox" checked={value.tools.includes(tool.name)} onChange={() => toggleTool(tool.name)} />
              <span>{t(tool.labelKey)}</span>
            </label>
          ))}
        </div>
        <span className="hint">{t("hub.form.toolsHint")}</span>
      </div>
    </Modal>
  );
}
