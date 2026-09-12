# WORKER TASK BRIEF — mẫu brief để agent chính giao việc cho worker (opencode/codebuddy)

> Dùng mẫu này cho MỌI task giao cho worker. Worker không thấy context phiên của agent chính.
> Brief phải self-contained; thiếu mục nào thì đừng giao task.

```
Repo: <đường dẫn tuyệt đối>
Đọc và tuân thủ: AGENTS.md, docs/templates/agentic-project/RULES.md
Ràng buộc cứng: KHÔNG chạy git (add/commit/push/checkout), KHÔNG ssh/scp, KHÔNG đụng server,
KHÔNG thêm dependency, KHÔNG sửa file ngoài danh sách dưới.

## 1. Bối cảnh & mục tiêu
<mô tả ngắn, vì sao cần>

## 2. Phạm vi file được sửa (whitelist)
- <path 1>
- <path 2>
(cấm sửa mọi file khác; nếu buộc phải sửa thêm → DỪNG và báo)

## 3. Nguồn sự thật
<ví dụ: "code production trong src/ là chuẩn; chỉ sửa test cho khớp">
<copy nguyên đoạn logic/điều kiện liên quan vào đây để worker không phải đoán>

## 4. Hành vi đúng hiện tại (phải giữ nguyên)
<điều kiện, thông báo lỗi, response shape, tên hàm…>

## 5. Tiêu chí nghiệm thu (kiểm chứng được)
- [ ] <ví dụ: `cd control-plane && npm test` → toàn bộ pass>
- [ ] <ví dụ: chỉ 2 file trong whitelist bị thay đổi>
- [ ] <ví dụ: assertion cụ thể, không nới lỏng>

## 6. Báo cáo cuối (theo AGENT_HANDOFF.md)
- Bảng file đã thay đổi
- Lệnh đã chạy + output thật (dán số pass/fail)
- Điểm chưa chắc / blocker
```

## Sau khi worker trả kết quả — checklist verify của agent chính (RULE-DELEGATE-001)
1. `git status --porcelain` — chỉ đúng whitelist
2. Đọc diff — hành vi ngoài ý muốn? style/naming có theo convention?
3. **Tự chạy lại** test/lệnh nghiệm thu
4. Assertion không bị nới lỏng; không có dependency/secret mới
5. Nếu chạm server: deploy + kiểm tra hành vi thật + dọn dữ liệu test
6. Chỉ khi qua hết mới commit/push (và ghi công worker trong commit message nếu cần)
