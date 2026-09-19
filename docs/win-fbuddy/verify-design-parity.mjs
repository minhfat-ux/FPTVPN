#!/usr/bin/env node
// Nghiệm thu "design parity": app mobile có dùng ĐÚNG theme/asset của web không?
//
// Đây là lệnh --verify cho các task UI/UX giao harness Windows (xem docs/TASK-HANDOFF-RULES.md).
// Chạy trên máy Mac (bên giao) — RULE-DELEGATE-FB-006.
//
//   node ops/verify-design-parity.mjs            # kiểm và in báo cáo
//   node ops/verify-design-parity.mjs --json     # xuất JSON để dán vào bằng chứng
//   node ops/verify-design-parity.mjs --section theme    # chỉ kiểm theme (task UI-01)
//   node ops/verify-design-parity.mjs --section assets   # chỉ kiểm logo/icon (task UI-02)
//   node ops/verify-design-parity.mjs --section specs    # chỉ kiểm screen-spec (task UI-03)
//   node ops/verify-design-parity.mjs --section shots    # chỉ kiểm ảnh chụp 390px (GATE 2 — Mac)
//
// Exit 0 = PASS (mọi mục đạt) · Exit 1 = FAIL (in rõ mục nào chưa đạt).

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath: `new URL(...).pathname` cho ra '/C:/...' trên Windows ⇒ existsSync luôn false.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const JSON_OUT = process.argv.includes('--json')
// --section theme|assets|specs : chỉ kiểm một phần (mỗi task UI/UX có lệnh nghiệm thu riêng)
const secArg = process.argv.find(a => a.startsWith('--section'))
const SECTION = secArg ? (secArg.includes('=') ? secArg.split('=')[1] : process.argv[process.argv.indexOf(secArg) + 1]) : null
const SECTIONS = {
  theme: ['DP-01', 'DP-02', 'DP-03', 'DP-04', 'DP-05'],
  assets: ['DP-06', 'DP-07'],
  // DP-08 = tài liệu screen-spec (việc của Windows).
  // DP-09 = ảnh chụp 390×844 — chỉ có được khi ĐÃ có app build (GATE 2, việc của Mac),
  //         nên tách riêng để không chặn task screen-spec.
  specs: ['DP-08'],
  shots: ['DP-09'],
}
const checks = []
const add = (id, title, ok, detail) => checks.push({ id, title, ok: !!ok, detail })

function walk (dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// Kích thước ảnh PNG đọc trực tiếp từ header (không cần thư viện)
function pngSize (file) {
  const b = readFileSync(file)
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

// ---------- 1. Token nguồn ----------
const tokensPath = join(ROOT, 'docs/mobile/theme-tokens.json')
let tokens = null
try { tokens = JSON.parse(readFileSync(tokensPath, 'utf8')) } catch { /* để check dưới báo */ }
add('DP-01', 'docs/mobile/theme-tokens.json đọc được', tokens !== null,
  tokens ? 'có color.dark' : 'thiếu hoặc JSON hỏng')

const dark = tokens?.color?.dark || {}
const hexTokens = [...new Set(Object.entries(dark)
  .filter(([, v]) => /^#[0-9A-Fa-f]{6}$/.test(v))
  .map(([, v]) => v.toUpperCase()))]
add('DP-02', 'Bộ token dark có màu hex để đối chiếu', hexTokens.length >= 10,
  `${hexTokens.length} giá trị hex khác nhau`)

// ---------- 2. Theme iOS ----------
const swiftFiles = walk(join(ROOT, 'ios')).filter(f => extname(f) === '.swift')
const iosTheme = swiftFiles.filter(f => /(FBTheme|Theme)\.swift$/.test(f) && /Theme/i.test(f))
if (iosTheme.length === 0) {
  add('DP-03', 'Có file theme iOS (FBTheme.swift)', false, 'chưa có ios/**/Theme/FBTheme.swift')
} else {
  const src = iosTheme.map(f => readFileSync(f, 'utf8')).join('\n').toUpperCase()
  const missing = hexTokens.filter(h => !src.includes(h))
  add('DP-03', 'Theme iOS khớp 100% màu dark của web', missing.length === 0,
    missing.length ? `thiếu: ${missing.join(', ')}` : `${hexTokens.length}/${hexTokens.length} khớp · ${iosTheme.length} file`)
}

// ---------- 3. Theme Android ----------
const ktFiles = walk(join(ROOT, 'android')).filter(f => extname(f) === '.kt')
const androidTheme = ktFiles.filter(f => /theme/i.test(f))
if (androidTheme.length === 0) {
  add('DP-04', 'Có file theme Android (Theme.kt)', false, 'chưa có android/**/theme/Theme.kt')
} else {
  const src = androidTheme.map(f => readFileSync(f, 'utf8')).join('\n').toUpperCase()
  const missing = hexTokens.filter(h => !src.includes(h) && !src.includes('FF' + h.slice(1)))
  add('DP-04', 'Theme Android khớp 100% màu dark của web', missing.length === 0,
    missing.length ? `thiếu: ${missing.join(', ')}` : `${hexTokens.length}/${hexTokens.length} khớp · ${androidTheme.length} file`)
}

// ---------- 4. Không hard-code màu trong màn hình ----------
const themeSet = new Set([...iosTheme, ...androidTheme])
const uiFiles = [...swiftFiles, ...ktFiles].filter(f => !themeSet.has(f))
const offenders = []
for (const f of uiFiles) {
  const src = readFileSync(f, 'utf8')
  const hits = [...src.matchAll(/Color\(\s*(?:red:|0x)|Color\(0x[0-9A-Fa-f]{6}/g)]
  if (hits.length) offenders.push(`${f.replace(ROOT, '')} (${hits.length})`)
}
add('DP-05', 'Không hard-code màu ngoài file theme', offenders.length === 0,
  offenders.length ? offenders.join(', ') : `${uiFiles.length} file giao diện đã quét`)

// ---------- 5. Asset logo/icon ----------
const appIcons = walk(join(ROOT, 'ios')).filter(f => /AppIcon\.appiconset\/.*\.png$/i.test(f))
const bigIcon = appIcons.map(f => ({ f, s: pngSize(f) })).find(x => x.s && x.s.width >= 1024 && x.s.height >= 1024)
add('DP-06', 'iOS có AppIcon 1024×1024', !!bigIcon,
  bigIcon ? bigIcon.f.replace(ROOT, '') : `thấy ${appIcons.length} file icon, chưa có bản ≥1024`)

const androidIcons = walk(join(ROOT, 'android')).filter(f => /res\/mipmap[^/]*\/ic_launcher.*\.(png|xml|webp)$/i.test(f))
add('DP-07', 'Android có launcher icon (mipmap/adaptive)', androidIcons.length >= 3,
  androidIcons.length ? `${androidIcons.length} file` : 'chưa có android/**/res/mipmap-*/ic_launcher*')

// ---------- 6. Screen spec + ảnh chụp 390px ----------
const designDir = join(ROOT, 'docs/design')
// Screen-spec theo brief UI-03: docs/design/SCREEN-SPEC-*.md (xem docs/tasks/UI-03-screen-specs.md)
const specs = existsSync(designDir)
  ? readdirSync(designDir).filter(f => /^SCREEN-SPEC-.*\.md$/i.test(f))
  : []
add('DP-08', 'Có ≥8 screen-spec cho màn hình MVP', specs.length >= 8,
  specs.length ? `${specs.length} file: ${specs.slice(0, 8).join(', ')}` : 'chưa có docs/design/SCREEN-SPEC-*.md')

// Ảnh bằng chứng: mọi .png dưới docs/design/ phải có bề rộng 390px (khung 390×844)
const shots = existsSync(designDir) ? walk(designDir).filter(f => /\.png$/i.test(f)) : []
const shot390 = shots.filter(f => { const s = pngSize(f); return s && Math.abs(s.width - 390) <= 2 })
add('DP-09', 'Có ≥8 ảnh chụp màn hình bề rộng 390px', shot390.length >= 8,
  shots.length ? `${shot390.length}/8 ảnh đúng 390px (tổng ${shots.length} ảnh trong docs/design/)` : 'chưa có ảnh .png nào trong docs/design/')

// ---------- Kết quả ----------
let scoped = checks
if (SECTION) {
  const ids = SECTIONS[SECTION]
  if (!ids) { console.error(`✗ --section không hợp lệ: ${SECTION} (chọn: ${Object.keys(SECTIONS).join(', ')})`); process.exit(2) }
  scoped = checks.filter(c => ids.includes(c.id))
}
const passed = scoped.filter(c => c.ok).length
const result = { section: SECTION || 'all', total: scoped.length, passed, failed: scoped.length - passed, checks: scoped }

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`Nghiệm thu design parity${SECTION ? ` (phần: ${SECTION})` : ''} — web là nguồn sự thật\n`)
  for (const c of scoped) console.log(`${c.ok ? '✓' : '✗'} ${c.id} ${c.title}\n    ${c.detail}`)
  console.log(`\n${passed}/${scoped.length} mục đạt`)
}
process.exit(passed === scoped.length ? 0 : 1)
