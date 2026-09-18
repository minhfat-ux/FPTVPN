import { all, db, insert } from "../db.js";
import { READY_SKILL_IDS, SKILL_CATALOG, publicSkillCatalog } from "./index.js";
import { getHubSkillRow, hasPurchased, listHubSkills, skillPriceVnd } from "./hub.js";
import { badRequest, nowIso } from "../util.js";

/**
 * Per-user skill set — what the composer dropdown offers (top 10) and what the
 * skill marketplace manages.
 *
 * A member is either a built-in skill (`skills/index.js`) or a Skill Hub skill
 * (free, or one the user bought). No rows for a user means "every built-in skill",
 * so existing accounts keep working without a migration step.
 */

export const MAX_SELECTABLE_SKILLS = 10;

/** Membership test shared by list/set: built-in, or a hub skill this user may use. */
function isAllowedSkill({ skillId, userId, role = "user" }) {
  if (READY_SKILL_IDS.includes(skillId)) return true;
  const row = getHubSkillRow(skillId);
  if (!row || row.state !== "published") return false;
  if (skillPriceVnd(row) === 0) return true;
  return role === "admin" || hasPurchased(userId, row.id);
}

export function listInstalledSkillIds(userId) {
  const rows = all("user_skills", "user_id = ?", [userId], { order: "sort_order ASC" });
  if (!rows.length) return [...READY_SKILL_IDS];
  // Drop ids the user may no longer use (retired skill, revoked purchase…).
  return rows.map((row) => row.skill_id).filter((id) => isAllowedSkill({ skillId: id, userId }));
}

export function listInstalledSkills(userId, { lang = "vi" } = {}) {
  const ids = listInstalledSkillIds(userId);
  const byId = new Map(publicSkillCatalog(lang).map((skill) => [skill.id, skill]));
  // Hub skills are described by their own catalogue entry.
  for (const skill of listHubSkills({ userId, lang })) {
    byId.set(skill.id, {
      id: skill.id,
      label: skill.name,
      icon: skill.icon,
      description: skill.tagline || skill.description,
      starterPrompts: [],
      category: skill.category,
      state: "ready",
      builtin: false,
      price: skill.price,
      priceVnd: skill.priceVnd,
    });
  }
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Replaces the whole list; order matters because the dropdown shows it as-is. */
export function setInstalledSkills(userId, ids, { role = "user" } = {}) {
  if (!Array.isArray(ids)) throw badRequest("`ids` phải là mảng");
  const unique = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || id === "auto") continue; // "Tự động" is always available, never stored
    if (!isAllowedSkill({ skillId: id, userId, role })) {
      const catalogueEntry = SKILL_CATALOG.find((skill) => skill.id === id);
      const hubEntry = getHubSkillRow(id);
      throw badRequest(
        hubEntry
          ? `Kỹ năng "${hubEntry.name}" chưa mở hoặc chưa mua — vào Chợ kỹ năng để mua.`
          : catalogueEntry
            ? `Kỹ năng "${catalogueEntry.label}" chưa mở — sẽ có ở chợ kỹ năng.`
            : `Không có kỹ năng nào tên "${id}"`,
      );
    }
    if (!unique.includes(id)) unique.push(id);
  }
  if (!unique.length) throw badRequest("Cần giữ lại ít nhất một kỹ năng");
  if (unique.length > MAX_SELECTABLE_SKILLS) {
    throw badRequest(`Chỉ chọn tối đa ${MAX_SELECTABLE_SKILLS} kỹ năng cho danh sách nhanh`);
  }

  db.prepare("DELETE FROM user_skills WHERE user_id = ?").run(userId);
  const installedAt = nowIso();
  unique.forEach((skillId, index) => {
    insert("user_skills", {
      user_id: userId,
      skill_id: skillId,
      sort_order: index,
      installed_at: installedAt,
    });
  });
  return unique;
}

export function installSkill(userId, skillId, options = {}) {
  const current = listInstalledSkillIds(userId);
  if (current.includes(skillId)) return current;
  if (current.length >= MAX_SELECTABLE_SKILLS) {
    throw badRequest(`Danh sách nhanh đã đủ ${MAX_SELECTABLE_SKILLS} kỹ năng — bỏ một kỹ năng trước`);
  }
  return setInstalledSkills(userId, [...current, skillId], options);
}

export function uninstallSkill(userId, skillId, options = {}) {
  const current = listInstalledSkillIds(userId);
  if (current.length <= 1) throw badRequest("Cần giữ lại ít nhất một kỹ năng");
  return setInstalledSkills(userId, current.filter((id) => id !== skillId), options);
}

/** Back to the defaults (everything ready) — used by admins and tests. */
export function resetUserSkills(userId) {
  db.prepare("DELETE FROM user_skills WHERE user_id = ?").run(userId);
  return listInstalledSkillIds(userId);
}
