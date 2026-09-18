# Nhập kỹ năng từ Tencent SkillHub vào chợ kỹ năng fBuddy

> Trạng thái: **chuỗi đã chạy thông và được kiểm chứng thật trên instance local**
> (nhập → lên kệ → người mua mua bằng credit → dùng trong chat → người chưa mua không dùng được).
> Công cụ đã có sẵn trong repo: `server/src/skills/skillhub.js`, `ops/skillhub-import.mjs`,
> test offline `server/test/skillhub.test.js` (12 ca).

## 1. Chạy trong 3 lệnh

```bash
# 1) Kiểm tra có gọi được API SkillHub không (chẩn đoán luôn đường mạng)
node ops/skillhub-import.mjs --check

# 2) Tìm skill (chỉ lấy loại miễn phí, sắp theo lượt tải)
node ops/skillhub-import.mjs --search "email marketing" --limit 10 --free

# 3) Nhập vào chợ: mặc định CHẠY THỬ, thêm --apply mới ghi
FBUDDY_ADMIN_TOKEN=<token-admin> node ops/skillhub-import.mjs \
  --slug email-marketing --price-vnd 50000 --apply \
  --base http://127.0.0.1:7790/api --json-out ops/skillhub-imported.json
```
- `--price-vnd` là **giá bán bằng VND** (đúng mô hình giá của chợ: `price_vnd` là nguồn sự thật,
  credit được suy ra theo `vndPerCredit`). Hiện chợ đang bán 50.000đ/kỹ năng.
- `--state` ép trạng thái (`published` / `coming_soon`); mặc định công cụ **tự quyết**:
  skill kèm script hoặc cần API key riêng bị đẩy thành `coming_soon`.
- `--json-out` ghi bản nháp + **nguồn gốc** (slug/version/lượt tải bên SkillHub) để truy vết.
- Chạy lại cùng slug = cập nhật, không tạo trùng.

## 2. Chuỗi người mua đã kiểm chứng (bằng chứng thật)

| Bước | Kết quả đo được |
|---|---|
| Nhập 2 skill Tencent | `email-marketing` (7.237 lượt tải, chỉ dẫn 4.783 ký tự) · `email-design` (9.732 → cắt còn 5.703) — vào chợ ở 50.000đ |
| Chợ hiển thị | `GET /api/hub` trả 2 skill, `priceVnd: 50000`, `price: 50000` credit, `owned: false` |
| Mua | `POST /api/hub/:id/purchase` → trừ **50.000 credit**, số dư 130.000 → 80.000 |
| Tự cài | `installed: true`; `GET /api/skills` có **id skill trong `installed`** và mục trong dropdown với `builtin: false` |
| Mua lại lần 2 | `alreadyOwned: true`, `pricePaid: 0` → **không trừ thêm** |
| **Dùng thật** | `hubSkillForUser` trả skill kèm 4.783 ký tự; `buildSystemPrompt` sinh prompt 7.458 ký tự **có** dòng `Kỹ năng đang dùng: Email Marketing` + toàn bộ chỉ dẫn |
| Người chưa mua | `hubSkillForUser` trả **null** → không chọn được, không dùng được (`hub.js`: `owned = giá 0 || admin || đã mua`) |

## 3. Cách nó ăn vào lượt chat (đọc code để tin)

```
người dùng chọn kỹ năng trong dropdown
  → agent.js: hubSkillForUser({ skillId, userId, role })   // chặn nếu chưa mua
  → agent.js: buildSystemPrompt({ hubSkill })
        parts.push(`Kỹ năng đang dùng: ${hubSkill.name}\n${hubSkill.instructions}`)
  → agent.js: nếu hubSkill.tools có phần tử thì THU HẸP danh sách công cụ còn đúng các tool đó
              (+ list_files) — không khai tools thì giữ nguyên toàn bộ 6 công cụ
```
Nên: skill thuần chỉ dẫn vẫn dùng được ngay; skill muốn ép công cụ thì khai `tools` trong frontmatter.

## 4. Ba giới hạn thật — phải biết trước khi nhập hàng loạt

### 4.1 Chỉ skill "thuần prompt" mới port được
SkillHub nhiều skill kèm `scripts/*.py` hoặc cần API key riêng. fBuddy **không chạy script**;
công cụ tự phát hiện và đưa vào `coming_soon` kèm cảnh báo. Đo được: trong một lượt tìm 6 từ khoá,
chỉ **5 skill** thuần prompt, còn lại dính script/key.
→ Skill cần công cụ ngoài thì đường đúng là **cắm qua MCP server** (fBuddy đã hỗ trợ MCP
`http`/`sse`/`stdio` ở Cài đặt → MCP), rồi viết prompt pack mỏng gọi công cụ đó. Đừng cố nhồi
script vào prompt pack.

### 4.2 Trần 6.000 ký tự cắt mất phần lớn skill dài
Đo thật: `email-design` 9.732 → 5.703 (59%) · `kit-email-marketing` còn 42% ·
`mailerlite-email-marketing` còn **33%** · `smart-charts` còn **31%**.
Trần nằm ở `server/src/skills/hub.js` (`.slice(0, 6000)` trong `createHubSkill`/`updateHubSkill`).
Nâng trần được nhưng **tốn token mỗi lượt** (prompt ở ví dụ trên đã 7.458 ký tự ≈ 2.000 token
chỉ riêng cho kỹ năng) — tức là chi phí credit mỗi lượt tăng. Cân nhắc trước khi nâng.

### 4.3 Chỉ dẫn của skill Tencent là **tiếng Trung**
Model vẫn làm theo được và trả lời tiếng Việt (system prompt quy định), nhưng nội dung thiên về
nền tảng Trung Quốc (小红书, 公众号…). Hai cách xử lý:
1. **Chỉ chọn skill trung tính** (email, Excel, cấu trúc tài liệu, phân tích dữ liệu).
2. **Dịch khi nhập**: thêm bước dịch sang tiếng Việt bằng chính provider đang cấu hình
   (chưa làm — nên làm nếu nhập nhiều).

## 5. Nguồn gốc & bản quyền

- SkillHub là nền tảng cộng đồng: có skill `pricing_type: paid`, có skill của doanh nghiệp.
  Trước khi **bán lại** trong chợ của mình: ưu tiên skill không tính phí, và ghi rõ nguồn
  (`skillhub.cn/<slug>@<version>`) trong tài liệu nội bộ / mô tả sản phẩm.
- Giữ `--json-out` cho **mọi** lần nhập: đó là sổ nguồn gốc duy nhất (DB chưa có cột source).
- Gợi ý kỹ thuật: đặt tiền tố slug (`tx-<slug>`) để nhìn là biết skill nhập từ Tencent, tránh
  trùng tên với skill tự viết.

## 6. Việc nên làm tiếp (theo thứ tự giá trị)

1. **Admin UI trong control panel**: ô tìm kiếm SkillHub + nút "Nhập" ngay trong
   Cài đặt → Chợ kỹ năng, để không phải mở terminal mỗi lần nhập.
2. **Bước dịch sang tiếng Việt** khi nhập (`--translate vi`) — quyết định lớn nhất về chất lượng.
3. **Nhập một bộ chọn lọc lên production** (5–10 skill trung tính), đặt giá theo chợ hiện tại.
4. Cân nhắc nâng trần chỉ dẫn **có kiểm soát** (ví dụ 12.000) sau khi đo lại chi phí credit/lượt.

## 7. Bẫy đã gặp khi làm

- **API SkillHub chặn theo vùng IP**: có lúc gọi được, có lúc timeout tuỳ đường mạng. `--check`
  in luôn chẩn đoán; đổi đường bằng `SKILLHUB_BASE_URL` nếu dùng relay.
- `--token-file` mặc định nằm ở `os.tmpdir()` (khác `/tmp` trên macOS) → cứ dùng biến
  `FBUDDY_ADMIN_TOKEN` cho chắc.
- Đọc `GET /api/skills`: **`installed` là mảng ID**, không phải mảng object — kiểm tra sai kiểu
  sẽ tưởng app lỗi (đã vấp đúng một lần khi viết kiểm chứng).
