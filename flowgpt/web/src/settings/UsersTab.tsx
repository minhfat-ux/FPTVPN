import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { ConfirmDialog, EmptyState, Field, Modal, Spinner } from "../components/ui";
import type { Role, User } from "../types";

type AdminUser = User & { conversationCount: number };

const EMPTY_FORM = { email: "", password: "", name: "", role: "user" as Role };

/** Settings → Người dùng. */
export function UsersTab() {
  const { user: currentUser } = useAuth();
  const { push } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api.adminUsers()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không tải được danh sách người dùng", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.deleteUser(removing.id);
      setUsers((current) => current.filter((item) => item.id !== removing.id));
      push(`Đã xoá người dùng ${removing.email}`, "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không xoá được người dùng", "error");
    } finally {
      setDeleting(false);
    }
  };

  const create = async () => {
    if (!form.email.trim() || !form.password) {
      push("Nhập email và mật khẩu", "error");
      return;
    }
    setCreating(true);
    try {
      await api.createUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        role: form.role,
      });
      push(`Đã thêm người dùng ${form.email.trim()}`, "success");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không tạo được người dùng", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="row">
        <div className="grow">
          <div className="card-title">Người dùng</div>
          <div className="card-desc">
            Tài khoản đầu tiên của hệ thống luôn là quản trị viên. Bạn không thể tự xoá tài khoản đang đăng nhập.
          </div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Tạo người dùng bằng mật khẩu (dự phòng)
        </button>
      </div>

      <div className="hint">
        Người dùng thường đăng nhập bằng mã một lần gửi qua email (cấu hình ở tab Hệ thống). Cách tạo tài khoản kèm mật
        khẩu dưới đây chỉ là đường dự phòng; đăng nhập SSO (Firebase/Facebook) sẽ được bổ sung sau.
      </div>

      {loading && <Spinner label="Đang tải người dùng…" />}

      {!loading && !users.length && (
        <EmptyState icon="👥" title="Chưa có người dùng nào" hint="Thêm tài khoản đầu tiên bằng nút “Thêm người dùng”." />
      )}

      {!loading && users.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tên</th>
                <th>Vai trò</th>
                <th>Hội thoại</th>
                <th>Ngày tạo</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const self = item.id === currentUser?.id;
                return (
                  <tr key={item.id}>
                    <td className="mono">
                      {item.email}
                      {self && <span className="badge badge-accent badge-inline">Bạn</span>}
                    </td>
                    <td>{item.name ?? <span className="faint">—</span>}</td>
                    <td>
                      <span className={`badge ${item.role === "admin" ? "badge-accent" : ""}`}>
                        {item.role === "admin" ? "Quản trị viên" : "Người dùng"}
                      </span>
                    </td>
                    <td>{item.conversationCount}</td>
                    <td className="nowrap">{formatDate(item.createdAt)}</td>
                    <td>
                      {!self && (
                        <button
                          className="btn btn-sm btn-danger"
                          type="button"
                          onClick={() => setRemoving(item)}
                          title={`Xoá ${item.email}`}
                        >
                          <Trash2 size={14} /> Xoá
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        title="Tạo người dùng bằng mật khẩu (dự phòng)"
        description="Dùng khi cần tạo tài khoản thủ công hoặc khi email đăng nhập chưa hoạt động. Người dùng có thể đổi mật khẩu trong phần tài khoản."
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn" type="button" onClick={() => setCreateOpen(false)} disabled={creating}>
              Huỷ
            </button>
            <button className="btn btn-primary" type="button" onClick={create} disabled={creating}>
              {creating ? "Đang tạo…" : "Tạo người dùng"}
            </button>
          </>
        }
      >
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="nguoidung@congty.vn"
          />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự.">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>
        <Field label="Tên hiển thị (tuỳ chọn)">
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nguyễn Văn A"
          />
        </Field>
        <Field label="Vai trò" hint="Quản trị viên xem được trang Cài đặt này và cấu hình nhà cung cấp/MCP.">
          <select
            className="select"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
          >
            <option value="user">Người dùng</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Xoá người dùng"
        message={`Xoá tài khoản "${removing?.email ?? ""}" cùng ${removing?.conversationCount ?? 0} hội thoại của họ? Thao tác này không thể hoàn tác.`}
        busy={deleting}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
