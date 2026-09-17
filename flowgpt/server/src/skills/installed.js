import { all, db, insert } from "../db.js";
import { READY_SKILL_IDS, SKILL_CATALOG, publicSkillCatalog } from "./index.js";
import { badRequest, nowIso } from "../util.js";

/**
 * Per-user skill set — what the composer dropdown offers (top 10) and what the
 * future skill marketplace will manage.
 *
 * No rows for a user means "everything that is ready today", so existing accounts
 * keep working without a migration step.
 */

export const MAX_SELECTABLE_SKILLS = 10;

export function listInstalledSkillIds(userId) {
  const rows = all("user_skills", "user_id = ?", [userId], { order: "sort_order ASC" });
  if (!rows.length) return [...READY_SKILL_IDS];
  // Drop ids that no longer exist in the catalogue (a retired skill).
  const known = new Set(READY_SKILL_IDS);
  return rows.map((row) => row.skill_id).filter((id) => known.has(id));
}

export function listInstalledSkills(userId) {
  const ids = listInstalledSkillIds(userId);
  const byId = new Map(publicSkillCatalog().map((skill) => [skill.id, skill]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Replaces the whole list; order matters because the dropdown shows it as-is. */
export function setInstalledSkills(userId, ids) {
  if (!Array.isArray(ids)) throw badRequest("`ids` phải là mảng");
  const ready = new Set(READY_SKILL_IDS);
  const unique = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || id === "auto") continue; // "Tự động" is always available, never stored
    if (!ready.has(id)) {
      const catalogueEntry = SKILL_CATALOG.find((skill) => skill.id === id);
      throw badRequest(
        catalogueEntry
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

export function installSkill(userId, skillId) {
  const current = listInstalledSkillIds(userId);
  if (current.includes(skillId)) return current;
  if (current.length >= MAX_SELECTABLE_SKILLS) {
    throw badRequest(`Danh sách nhanh đã đủ ${MAX_SELECTABLE_SKILLS} kỹ năng — bỏ một kỹ năng trước`);
  }
  return setInstalledSkills(userId, [...current, skillId]);
}

export function uninstallSkill(userId, skillId) {
  const current = listInstalledSkillIds(userId);
  if (current.length <= 1) throw badRequest("Cần giữ lại ít nhất một kỹ năng");
  return setInstalledSkills(userId, current.filter((id) => id !== skillId));
}

/** Back to the defaults (everything ready) — used by admins and tests. */
export function resetUserSkills(userId) {
  db.prepare("DELETE FROM user_skills WHERE user_id = ?").run(userId);
  return listInstalledSkillIds(userId);
}
