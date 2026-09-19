#!/usr/bin/env node
// Nghiệm thu: harness Windows đã JOIN repo fBuddy mới và nhận việc chưa?
//
//   node ops/verify-win-joined.mjs
//
// Điều kiện PASS:
//   1. Mỗi task đang mở giao cho `win` có ít nhất một sự kiện `acked`/`woken`/`done` từ phía win.
//   2. Có RAG entry do WIN ghi trong .privatefbuddy/knowledge/AGENT_ENGINEERING/ (xác nhận đã tham gia).
//   3. `ops/tasks/` đọc được từ git (sổ task thật sự chạy ở repo mới).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TASKS = join(ROOT, 'ops/tasks')

function git (args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }) } catch (e) { return `!git: ${e.message}` }
}

const problems = []
const ok = []

// 1. Sổ task trên remote
const remoteList = git(['ls-tree', '-r', '--name-only', 'origin/main', 'ops/tasks/'])
if (remoteList.startsWith('!git')) problems.push('Không đọc được ops/tasks/ từ origin/main — sổ task chưa push?')
else ok.push(`sổ task trên origin/main: ${remoteList.trim().split('\n').filter(Boolean).length} file`)

// 2. Task giao cho win phải được ack
const ids = existsSync(TASKS)
  ? readdirSync(TASKS).filter(n => /^T-\d{8}-\d{2}$/.test(n))
  : []
if (ids.length === 0) problems.push('Chưa có task nào trong ops/tasks/')

const WIN_EVENTS = new Set(['acked', 'woken', 'progress', 'done'])
for (const id of ids) {
  const dir = join(TASKS, id)
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  let created = null
  let winTouched = false
  for (const f of files) {
    let ev
    try { ev = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { continue }
    if (ev.type === 'created') created = ev.task
    if (WIN_EVENTS.has(ev.type) && String(ev.actor ?? '').toLowerCase().includes('win')) winTouched = true
  }
  if (!created) { problems.push(`${id}: thiếu sự kiện created`); continue }
  if (String(created.to).toLowerCase() !== 'win') continue
  if (winTouched) ok.push(`${id}: WIN đã phản hồi`)
  else problems.push(`${id}: giao cho win nhưng CHƯA thấy ack/woken/progress — Windows chưa join hoặc chưa nhận`)
}

// 3. RAG entry do WIN ghi khi tham gia
const aeDir = join(ROOT, '.privatefbuddy/knowledge/AGENT_ENGINEERING')
// Chỉ tính entry do CHÍNH WIN ghi: front-matter phải có verified_by: WIN (hoặc tên file nói rõ win-join).
const winEntry = existsSync(aeDir)
  ? readdirSync(aeDir).filter(f => /KAE-.*\.md$/.test(f)).filter((f) => {
    const src = readFileSync(join(aeDir, f), 'utf8')
    return /verified_by:\s*WIN\b/i.test(src) || /win-join|win-da-tham-gia/i.test(f)
  })
  : []
if (winEntry.length) ok.push(`RAG entry do WIN ghi: ${winEntry.join(', ')}`)
else problems.push('Chưa có RAG entry trong .privatefbuddy/knowledge/AGENT_ENGINEERING/ xác nhận WIN đã tham gia')

console.log('Nghiệm thu: Windows đã join repo fBuddy?\n')
for (const o of ok) console.log(`✓ ${o}`)
for (const p of problems) console.log(`✗ ${p}`)
console.log(`\n${ok.length} mục đạt · ${problems.length} mục chưa`)
process.exit(problems.length ? 1 : 0)
