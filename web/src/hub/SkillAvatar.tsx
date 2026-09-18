import React from "react";

/**
 * Avatar tự sinh (monogram) cho chuyên gia/kỹ năng — không dùng ảnh ngoài.
 *
 * Màu nền + chữ cái đầu được suy ra DETERMINISTIC từ slug nên mỗi kỹ năng luôn có một
 * avatar riêng, ổn định qua mọi lần render, và là tài sản của mình (không vi phạm bản quyền
 * ảnh của bên thứ ba — xem docs/CONTENT-POLICY.md).
 */

/** Gradient theo palette thương hiệu (xanh lá accent + xanh dương đậm nền). */
const PALETTE: Array<[string, string]> = [
  ["#33C773", "#0E2747"],
  ["#2E7CF6", "#123052"],
  ["#14B8A6", "#0E2747"],
  ["#F59E0B", "#7C3AED"],
  ["#EC4899", "#123052"],
  ["#8B5CF6", "#0E2747"],
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Lấy tối đa 2 chữ cái đầu của các từ trong tên; từ đơn thì lấy chữ đầu. */
function initialsOf(name: string, h: number): string {
  const words = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function SkillAvatar({
  name,
  seed,
  size = 22,
}: {
  name: string;
  seed?: string;
  size?: number;
}) {
  const h = hash(String(seed ?? name ?? "?"));
  const [from, to] = PALETTE[h % PALETTE.length];
  return (
    <span
      className="skill-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {initialsOf(name, h)}
    </span>
  );
}
