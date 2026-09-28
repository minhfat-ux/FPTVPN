# HANDOFF → harness Windows: nối route `reset-quota` cho nút admin “Reset 30 ngày”

- **Chủ dự án yêu cầu (27/09/2026):** *"trên control panel admin, anh muốn có thêm feature reset hạn mức đã cấp cho user về 30 ngày"*.
- **Đã chốt:** reset = **hôm nay + 30 ngày** (ĐẶT LẠI, **không** cộng dồn); route nằm ở `control-plane/src/index.js` — **vùng bảo vệ của WIN (AGENTS §6b)** nên WIN commit, Mac chỉ handoff.
- **Phía Mac ĐÃ XONG (không thuộc vùng bảo vệ):**
  - `control-plane/src/auth-store.js` → thêm `resetSubscription(userId, { productId = "admin.reset", days = 30 })`
    (đặt `expiresAt = now + days`; `days <= 0`/`null` = vĩnh viễn; xoá mọi subscription cũ của user rồi ghi 1 dòng mới ⇒ **idempotent**, bấm 2 lần vẫn 30 ngày).
    Lý do phải có hàm riêng: `grantSubscription` **cộng dồn** vào hạn cũ còn hiệu lực (khách còn 300 ngày + 30 ⇒ 330) — đúng khi bán thêm, sai khi admin muốn reset.
  - `control-plane/src/admin-page.js` → tab **Users**, mỗi dòng có nút **“Reset 30 ngày”**: hỏi xác nhận kèm `hạn cũ → hạn mới`, khoá nút khi đang gửi, gọi
    `POST /v1/admin/users/<id>/reset-quota` với `{ "days": 30 }`, xong thì `loadUsers()`.
  - `control-plane/test/admin-reset-quota.test.js` → **4/4 PASS** (đặt đúng 30 ngày chứ không 330; bấm 2 lần không thành 60; `days=0` ⇒ lifetime; user lạ ⇒ `User not found`).

## VIỆC CỦA WIN — thêm đúng 1 route (dán ngay sau route `POST /v1/admin/users/:id/subscription`)

```js
// Reset hạn mức = ĐẶT LẠI (hôm nay + days), KHÔNG cộng dồn — chủ dự án chốt 27/09/2026.
// Dùng authStore.resetSubscription (khác grantSubscription ở chỗ không cộng hạn cũ).
app.post("/v1/admin/users/:id/reset-quota", requireAdminAuth, async (req, res) => {
  try {
    const rawDays = req.body?.days;
    const days = rawDays === null ? null : Number(rawDays ?? 30);
    const user = await authStore.resetSubscription(req.params.id, {
      productId: String(req.body?.productId ?? "admin.reset").slice(0, 60),
      days,
    });
    console.log(
      `admin users: reset quota ${req.params.id} -> ` +
        `${days == null || days <= 0 ? "lifetime" : `${days}d`}`,
    );
    res.json({ user });
  } catch (err) {
    res.status(err.statusCode ?? 500).json({ error: err.statusCode ? err.message : "Internal error" });
  }
});
```

## Nghiệm thu (dán output thật)
```bash
node --test control-plane/test/admin-reset-quota.test.js      # 4/4 pass
node -e "import('./control-plane/src/auth-store.js').then(()=>console.log('import ok'))"
# sau khi deploy:
TOK=<AUTH_TOKEN trên node-2>
curl -s -X POST https://t1.meetflowai.site/v1/admin/users/<id>/reset-quota \
  -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"days":30}'   # {"user":{... expires_at ≈ now+30d}}
curl -s https://t1.meetflowai.site/v1/admin/users -H "Authorization: Bearer $TOK" | grep -o '"days_left":[0-9]*' | head -3
```
- Mở `/admin` → tab **Users** → nút **“Reset 30 ngày”** phải hiện; bấm thử 1 user test ⇒ xác nhận hiện `hạn cũ → hạn mới`, sau đó cột hạn đổi thành ~30 ngày.
- Deploy: `bash scripts/server-agent/deploy-control-plane.sh --files index.js` (commit TRƯỚC, deploy SAU), rồi `--check`/health như mọi lần.

## Lưu ý
- Nút này **mất phần thời gian dư** của khách (còn 300 ngày ⇒ về 30) — UI đã có hộp thoại xác nhận ghi rõ; **không** đổi thành cộng dồn.
- Không tạo route thứ hai; nếu WIN muốn gộp vào route `subscription` bằng `mode: "reset"` thì phải giữ nguyên hành vi cộng dồn cho trường hợp cũ (khuyến nghị: route riêng như trên).
- Phát hiện kèm (không thuộc việc này): `control-plane/test/home-page.test.js` đang **fail 3 case** — `(b) esc() chặn XSS`, `(d) plans rỗng`, `(i) bảng giá` (do đợt sửa buy-page, không liên quan reset-quota). Đề nghị WIN xem luôn.
