/**
 * Cách ly (quarantine) + khoá (lock) file/tiến trình trên macOS.
 *
 * Nguyên tắc:
 *  1. Trung thành với bằng chứng — KHÔNG xoá. Mọi thứ bị cách ly được chuyển vào vault
 *     (ngoài vùng sync iCloud) kèm manifest sha256 để còn đối chiếu về sau.
 *  2. Vô hiệu hoá trước, dời sau: gỡ exec bit + gắn xattr quarantine ngay tại chỗ, nên kể cả
 *     khi bước dời thất bại thì file cũng đã không chạy được nữa.
 *  3. Không bao giờ đụng vào chính mã nguồn của mac-selfdefense.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

/** Flag "hard" (0x80) + "quarantined" (0x01): Gatekeeper chặn, không cho phép chạy. */
export const QUARANTINE_XATTR_VALUE = "0081;00000000;MacSelfDefense;";

/**
 * Vault phải nằm trên filesystem CÓ lưu POSIX permission, nếu không thì `chmod a-x`
 * (một nửa của việc vô hiệu hoá) trở thành vô nghĩa.
 *
 * Đã gặp thật 22/09/2026: `/Volumes/BIWIN` là **ExFAT mount `noowners`** — mọi file trong
 * vault đều hiện `-rwx------` bất kể đã chmod; xattr thì vẫn giữ được qua AppleDouble.
 * Nên mặc định ưu tiên thư mục home (APFS), volume ngoài chỉ là phương án sau.
 */
export const DEFAULT_VAULT_CANDIDATES = [
  path.join(os.homedir(), ".local", "state", "mac-selfdefense", "vault"),
  "/Volumes/BIWIN/SourcesCode/_quarantine",
];

/** Chọn vault đầu tiên ghi được. Không có cái nào thì trả về ứng viên cuối (sẽ tạo). */
export function defaultVault(candidates = DEFAULT_VAULT_CANDIDATES) {
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      /* thử cái kế tiếp */
    }
  }
  return candidates[candidates.length - 1];
}

/** Thư mục sự cố theo ngày, ví dụ vault/2026-09-22-vmware-identitydaemonworker. */
export function incidentDir(vault, label, when = new Date()) {
  const day = when.toISOString().slice(0, 10);
  const slug = String(label ?? "incident")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const dir = path.join(vault, `${day}-${slug}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** sha256 của 1 file; null nếu không đọc được. */
export function sha256File(file) {
  try {
    const h = crypto.createHash("sha256");
    h.update(fs.readFileSync(file));
    return h.digest("hex");
  } catch {
    return null;
  }
}

/** Liệt kê đệ quy các file thường (không đi theo symlink). */
export function walkFiles(root, acc = []) {
  let st;
  try {
    st = fs.lstatSync(root);
  } catch {
    return acc;
  }
  if (st.isSymbolicLink()) return acc;
  if (st.isDirectory()) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      return acc;
    }
    for (const e of entries) walkFiles(path.join(root, e), acc);
    return acc;
  }
  if (st.isFile()) acc.push(root);
  return acc;
}

/** Manifest sha256 của cả cây; bỏ qua file > maxBytes để không treo trên file khổng lồ. */
export function hashTree(root, { maxBytes = 512 * 1024 * 1024 } = {}) {
  const rows = [];
  for (const f of walkFiles(root)) {
    let size = 0;
    try {
      size = fs.lstatSync(f).size;
    } catch {
      continue;
    }
    rows.push({ path: f, size, sha256: size > maxBytes ? "<quá lớn, bỏ qua>" : sha256File(f) });
  }
  return rows;
}

/**
 * Bước 1 — vô hiệu hoá TẠI CHỖ (nhanh, hoàn tác được):
 *  - gỡ mọi bit thực thi
 *  - gắn xattr com.apple.quarantine
 *  - đổi tên .app → .app.DISABLED để Finder/LaunchServices không coi là ứng dụng nữa
 * @returns {{path: string, chmod: number, xattr: number, renamed: string[]}}
 */
export function neutralize(target, { run = execFileSync } = {}) {
  const res = { path: target, chmod: 0, xattr: 0, renamed: [] };
  if (!fs.existsSync(target)) return res;

  const execs = walkFiles(target).filter((f) => {
    try {
      return (fs.lstatSync(f).mode & 0o111) !== 0;
    } catch {
      return false;
    }
  });

  for (const f of execs) {
    try {
      fs.chmodSync(f, fs.lstatSync(f).mode & ~0o111);
      res.chmod += 1;
    } catch {
      /* file của root: bỏ qua, không phải lỗi chặn */
    }
  }

  for (const f of walkFiles(target)) {
    try {
      run("/usr/bin/xattr", ["-w", "com.apple.quarantine", QUARANTINE_XATTR_VALUE, f], {
        stdio: "ignore",
      });
      res.xattr += 1;
    } catch {
      /* xattr không ghi được (file provider/root) — không chặn */
    }
  }

  // Bundle .app: đổi tên để không còn là ứng dụng chạy được.
  const dirs = [];
  const collect = (p, depth) => {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        if (e.name.endsWith(".app")) {
          dirs.push(full);
        } else {
          collect(full, depth + 1);
        }
      }
    }
  };
  if (fs.statSync(target).isDirectory()) collect(target, 0);
  for (const d of dirs) {
    try {
      const to = `${d}.DISABLED`;
      fs.renameSync(d, to);
      res.renamed.push(to);
    } catch {
      /* bỏ qua */
    }
  }
  return res;
}

/**
 * Bước 2 — dời vào vault (giữ xattr bằng `ditto`), rồi xoá bản gốc CHỈ KHI đã đối chiếu khớp.
 * @returns {{moved: string, verified: boolean, manifest: Array}}
 */
export function moveToVault(target, destDir, { run = execFileSync } = {}) {
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  const dest = path.join(destDir, path.basename(target));

  // `ditto` giữ nguyên resource fork + xattr; fs.cpSync không giữ xattr.
  let copied = false;
  try {
    run("/usr/bin/ditto", [target, dest], { stdio: "ignore" });
    copied = true;
  } catch {
    copied = false;
  }
  if (!copied) fs.cpSync(target, dest, { recursive: true, force: true });

  const srcCount = walkFiles(target).length;
  const dstCount = walkFiles(dest).length;
  const verified = srcCount === dstCount;

  const manifest = hashTree(dest);
  if (verified) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  return { moved: dest, verified, manifest };
}

/** Ghi manifest ra file cạnh vault. */
export function writeManifest(destDir, rows, stamp = new Date()) {
  const file = path.join(destDir, `manifest-sha256-${stamp.toISOString().replace(/[:.]/g, "-")}.txt`);
  const body = rows.map((r) => `${r.sha256}  ${r.path}`).join("\n") + "\n";
  fs.writeFileSync(file, body);
  return file;
}

/**
 * Kill 1 tiến trình: TERM trước, đợi `graceMs`, còn sống thì KILL.
 * Chỉ kill được tiến trình cùng user (không có root).
 */
export function killProcess(pid, { graceMs = 1500, run = process.kill } = {}) {
  const out = { pid, term: false, kill: false };
  try {
    run(pid, "SIGTERM");
    out.term = true;
  } catch {
    return out;
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    try {
      run(pid, 0);
    } catch {
      return out; // đã chết
    }
    // busy-wait ngắn: vòng lặp gọi đồng bộ nên không await được ở đây
    execFileSync("/bin/sleep", ["0.1"], { stdio: "ignore" });
  }
  try {
    run(pid, "SIGKILL");
    out.kill = true;
  } catch {
    /* đã chết */
  }
  return out;
}

/** Gỡ 1 LaunchAgent/Daemon khỏi launchd (không cần root cho gui/$UID). */
export function bootout(label, { uid = process.getuid?.() ?? 501, run = execFileSync } = {}) {
  try {
    run("/bin/launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
