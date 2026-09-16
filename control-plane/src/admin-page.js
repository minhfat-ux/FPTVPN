export function adminPageHTML() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FlowTech Control Panel</title>
  <link rel="icon" type="image/png" href="data:image/png;base64,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">
  <style>
    :root {
      color-scheme: dark;
      --bg-top: #051525;
      --bg-bottom: #0a1f3a;
      --card: rgba(255, 255, 255, 0.07);
      --stroke: rgba(255, 255, 255, 0.13);
      --text: #ffffff;
      --muted: rgba(255, 255, 255, 0.64);
      --accent: #33c773;
      --danger: #ff5a6a;
      --warning: #ffb84d;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, var(--bg-top), var(--bg-bottom));
    }

    header {
      border-bottom: 1px solid var(--stroke);
      background: rgba(0, 0, 0, 0.18);
    }

    .bar, main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 22px 0;
    }

    .logo {
      flex: none;
      display: block;
      overflow: hidden;
      border-radius: 12px;
    }
    .logo img { height: 120px; width: auto; max-width: 100%; display: block; object-fit: contain; }

    h1 { margin: 0; font-size: clamp(25px, 4vw, 38px); letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 17px; }

    .subtitle { margin-top: 4px; color: var(--muted); font-size: 15px; }

    main { padding: 26px 0 42px; display: grid; gap: 18px; }

    .card {
      padding: 18px;
      background: var(--card);
      border: 1px solid var(--stroke);
      border-radius: 8px;
      backdrop-filter: blur(18px);
    }

    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }

    label { display: grid; gap: 7px; color: var(--muted); font-size: 13px; }

    input, textarea, select {
      width: 100%;
      border: 1px solid var(--stroke);
      border-radius: 8px;
      padding: 11px 12px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.08);
      font: inherit;
      outline: none;
    }

    textarea { min-height: 76px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    input:focus, textarea:focus, select:focus {
      border-color: rgba(51, 199, 115, 0.8);
      box-shadow: 0 0 0 3px rgba(51, 199, 115, 0.16);
    }

    input[readonly] { opacity: 0.6; cursor: not-allowed; }

    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; align-items: center; }
    .actions button { min-height: 38px; min-width: 92px; display: inline-flex; align-items: center; justify-content: center; }
    .row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    /* Thao tác trên một user: mỗi nhóm chức năng (cấp hạn / thu hồi) là một khối KHÔNG tự xuống dòng,
       các nhóm xếp cạnh nhau trên cùng một hàng và ngăn bằng vạch dọc; chỉ khi màn hình quá hẹp mới
       cho nhóm rớt xuống dòng (rớt cả nhóm, không rớt lẻ nút — trước đây nút append rời nên so le). */
    .act-groups { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .act-group { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 6px; }
    .act-label { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .act-groups button { min-height: 34px; padding: 8px 12px; white-space: nowrap; }
    .act-sep { width: 1px; align-self: stretch; min-height: 24px; background: var(--stroke); }

    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      color: #06160d;
      background: var(--accent);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button.secondary { color: var(--text); background: rgba(255, 255, 255, 0.12); border: 1px solid var(--stroke); }
    button.danger { color: #fff; background: var(--danger); }
    button:disabled { opacity: 0.55; cursor: not-allowed; }

    .status {
      min-height: 22px;
      color: var(--muted);
      font-size: 13px;
      margin-top: 12px;
      white-space: pre-wrap;
    }

    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }

    th, td { padding: 12px; border-bottom: 1px solid var(--stroke); text-align: left; vertical-align: top; font-size: 14px; }

    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
      background: rgba(255, 255, 255, 0.06);
    }

    td code { word-break: break-all; color: rgba(255, 255, 255, 0.82); }

    td code.health { white-space: pre-line; color: rgba(255, 255, 255, 0.82); }

    .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; color: #06160d; background: var(--accent); font-size: 12px; font-weight: 700; }
    .pill.off { color: #fff; background: rgba(255, 255, 255, 0.2); }

    .hidden { display: none !important; }

    .tabs { display: flex; gap: 8px; margin-bottom: 18px; }
    .tab {
      border: 1px solid var(--stroke);
      background: rgba(255, 255, 255, 0.08);
      color: var(--muted);
      font-weight: 600;
    }
    .tab.active { background: var(--accent); color: #06160d; border-color: var(--accent); }

    .area-tabs { margin-bottom: 12px; }
    .area-tabs .tab { padding: 12px 22px; font-size: 15px; }

    .backlink {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
      margin-bottom: 14px;
    }
    .backlink:hover { color: var(--text); }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 14px 0; }
    .stat-card {
      padding: 16px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--stroke);
      border-radius: 10px;
      text-align: center;
    }
    .stat-card .num { font-size: 30px; font-weight: 800; color: var(--accent); line-height: 1.1; }
    .stat-card .lbl { margin-top: 6px; color: var(--muted); font-size: 13px; }
    .stat-card .sub { margin-top: 2px; color: rgba(255,255,255,.4); font-size: 12px; }

    .stats-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; }
    .stats-bars { display: grid; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 110px 1fr 46px; gap: 10px; align-items: center; font-size: 13px; }
    .bar-row .name { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-row .track { height: 14px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
    .bar-row .fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width .3s ease; }
    .bar-row .val { text-align: right; color: var(--text); font-weight: 600; }
    .bar-row.alt .fill { background: var(--warning); }

    .user-card {
      padding: 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--stroke);
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .user-card .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .user-card .email { font-weight: 700; color: var(--text); }
    .user-card .meta { color: var(--muted); font-size: 13px; }
    .user-card .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .chip {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(51, 199, 115, 0.16);
      color: var(--accent);
      border: 1px solid rgba(51, 199, 115, 0.3);
    }
    .chip.off { background: rgba(255,255,255,0.08); color: var(--muted); border-color: var(--stroke); }

    .badge {
      display: inline-block; padding: 3px 9px; border-radius: 999px;
      font-size: 12px; font-weight: 700; white-space: nowrap;
    }
    .badge.ok { background: rgba(51,199,115,.18); color: #58e694; border: 1px solid rgba(51,199,115,.35); }
    .badge.warn { background: rgba(255,184,77,.16); color: var(--warning); border: 1px solid rgba(255,184,77,.35); }
    .badge.bad { background: rgba(255,90,106,.16); color: var(--danger); border: 1px solid rgba(255,90,106,.35); }
    .badge.mute { background: rgba(255,255,255,.09); color: var(--muted); border: 1px solid var(--stroke); }
    .badge.info { background: rgba(90,170,255,.16); color: #7ab8ff; border: 1px solid rgba(90,170,255,.35); }

    .kpi-value.revenue { color: #58e694; }
    .kpi-value.count { color: var(--text); }
    .src-chip {
      display: inline-block; padding: 2px 7px; margin: 1px 2px 1px 0; border-radius: 6px;
      font-size: 11px; background: rgba(255,255,255,.08); color: var(--muted); border: 1px solid var(--stroke);
    }

    .fb-panel {
      padding: 14px; border-radius: 10px; margin-bottom: 14px; font-size: 13.5px;
      background: rgba(255,184,77,.07); border: 1px solid rgba(255,184,77,.28);
    }
    .fb-panel.ok { background: rgba(51,199,115,.07); border-color: rgba(51,199,115,.3); }
    .fb-panel .fb-title { font-weight: 700; margin-bottom: 6px; }
    .fb-panel .fb-body { color: rgba(255,255,255,.72); line-height: 1.6; }
    .fb-panel details { margin-top: 10px; }
    .fb-panel summary { cursor: pointer; color: var(--accent); font-weight: 600; }
    .fb-panel pre { margin: 0; padding: 10px; background: rgba(0,0,0,.25); border-radius: 8px;
                    font-size: 12px; overflow-x: auto; color: rgba(255,255,255,.85); }

    .mini-bars { display: grid; gap: 6px; margin-top: 6px; }
    .mini-bars .mb-row { display: grid; grid-template-columns: 74px 1fr 60px; gap: 8px; align-items: center; font-size: 12px; }
    .mini-bars .mb-track { height: 10px; background: rgba(255,255,255,.08); border-radius: 999px; overflow: hidden; }
    .mini-bars .mb-fill { height: 100%; background: linear-gradient(90deg,#33c773,#58e694); border-radius: 999px; }
    .mini-bars .mb-name { color: var(--muted); }
    .mini-bars .mb-val { text-align: right; color: var(--text); font-weight: 600; }

    .note-line {
      margin: 4px 0 14px; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.6;
      color: rgba(255,255,255,.66); background: rgba(255,184,77,.07); border: 1px solid rgba(255,184,77,.22);
    }
    .note-line b { color: rgba(255,255,255,.86); }

    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
    .detail-grid .d-item { padding: 10px; background: rgba(255,255,255,.05); border: 1px solid var(--stroke); border-radius: 8px; }
    .detail-grid .d-lbl { color: var(--muted); font-size: 12px; }
    .detail-grid .d-val { margin-top: 3px; font-weight: 600; word-break: break-all; }

    @media (max-width: 760px) {
      .stats-cols { grid-template-columns: 1fr; }
      .logo img { height: 56px; }
    }

    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--stroke); padding: 10px 0; }
      td { border: 0; padding: 7px 0; }
      td::before { content: attr(data-label); display: block; color: var(--muted); font-size: 12px; margin-bottom: 3px; }
      .actions button, .row-actions button { width: 100%; }
      .actions { flex-direction: column; }
      /* Màn hẹp: mỗi nhóm chức năng xuống một hàng, vạch ngăn không còn ý nghĩa. */
      .act-groups { flex-direction: column; align-items: stretch; gap: 8px; }
      .act-group { flex-direction: column; align-items: stretch; }
      .act-sep { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="logo"><img src="data:image/png;base64,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" alt="FlowTech" width="480" height="166"></div>
      <div>
        <h1>FlowTech Control Panel</h1>
        <div class="subtitle">Non-stop flow tech</div>
      </div>
    </div>
  </header>

  <main>
    <!-- Điều hướng cấp khu: tách bạch 2 sản phẩm + khu hệ thống. Cấp con: tab trong khu. -->
    <nav class="tabs area-tabs" id="areaTabs">
      <button class="tab active" id="areaVpn" data-area="vpn">VPNFlow</button>
      <button class="tab" id="areaAi" data-area="ai">MeetFlow AI</button>
      <button class="tab" id="areaSystem" data-area="system">Hệ thống</button>
    </nav>

    <div class="tabs" id="tabsVpn" data-area="vpn">
      <button class="tab active" id="tabStats">Dashboard</button>
      <button class="tab" id="tabUsers">Users</button>
      <button class="tab" id="tabIos">iOS UDID</button>
      <button class="tab" id="tabPayments">Payments</button>
      <button class="tab" id="tabPlans">Plans</button>
    </div>
    <div class="tabs hidden" id="tabsAi" data-area="ai">
      <button class="tab" id="tabAi">MeetFlow AI</button>
      <button class="tab" id="tabAiUsers">AI Users</button>
    </div>
    <div class="tabs hidden" id="tabsSystem" data-area="system">
      <button class="tab" id="tabNodes">Nodes</button>
    </div>

    <!-- ===================== LIST VIEW ===================== -->
    <section class="card" id="view-list">
      <div class="grid">
        <label>
          Admin Bearer Token
          <input id="token" type="password" autocomplete="off" placeholder="AUTH_TOKEN">
        </label>
        <label>
          API Base
          <input id="baseUrl" type="url" value="" placeholder="https://api.meetflowai.site">
        </label>
      </div>
      <div class="actions">
        <button id="loadNodes">Load Nodes</button>
        <button id="addNode">+ Add Node</button>
      </div>
      <div class="status" id="status"></div>

      <div style="margin-top:18px;">
        <h2>Exit Nodes</h2>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Location</th>
                <th>Endpoint</th>
                <th>Public Key</th>
                <th>Status</th>
                <th>Health</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="nodesBody">
              <tr><td colspan="7">No data loaded.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===================== USERS VIEW ===================== -->
    <section class="card hidden" id="view-users">
      <h2>Users</h2>
      <div class="grid" style="margin-bottom:6px">
        <label>
          Thêm user VPNFlow (email)
          <input id="newUserEmail" type="email" placeholder="khach@gmail.com" autocomplete="off">
        </label>
        <label>
          Kích hoạt Premium
          <select id="newUserDays">
            <option value="30">30 ngày</option>
            <option value="90">3 tháng (90 ngày)</option>
            <option value="180">6 tháng (180 ngày)</option>
            <option value="365" selected>1 năm (365 ngày)</option>
            <option value="0">Trọn đời (không hết hạn)</option>
            <option value="none">Không cấp gói (chỉ tạo tài khoản)</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button id="addUserBtn">➕ Thêm &amp; kích hoạt</button>
        <button class="secondary" id="loadUsers">Load Users</button>
        <span class="status-inline" id="addUserStatus"></span>
      </div>
      <div id="expirySummary" style="margin:10px 0;font-size:13px;line-height:2;"></div>
      <div class="actions" style="margin-top:10px">
        <input id="usersSearch" placeholder="Tìm theo email / User ID..." style="max-width:240px">
        <button class="secondary" id="usersPrev">← Trước</button>
        <span class="status-inline" id="usersPageInfo">Trang 1/1</span>
        <button class="secondary" id="usersNext">Sau →</button>
        <span class="status-inline" id="usersTotal"></span>
      </div>
      <div style="overflow-x:auto; margin-top: 12px;">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>User ID</th>
              <th>Created</th>
              <th>Subscription</th>
              <th>Han dung / Con lai</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="usersBody">
            <tr><td colspan="7">No data loaded.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===================== IOS UDID VIEW ===================== -->
    <section class="card hidden" id="view-ios">
      <h2>iOS Ad Hoc — quản lý UDID</h2>
      <div class="actions">
        <button id="loadIos">Refresh</button>
        <button class="secondary" id="ascRegisterAll">⬆️ Đăng ký tất cả lên Apple</button>
        <input id="iosSearch" placeholder="Tìm theo UDID / email..." style="max-width:240px">
        <span class="status-inline" id="iosStatus"></span>
      </div>

      <div class="fb-panel" id="ascPanel">
        <div class="fb-title" id="ascTitle">App Store Connect API — chưa kiểm tra</div>
        <div class="fb-body" id="ascBody">Nạp Issuer ID + Key ID + file .p8 để server tự thêm UDID lên Apple Developer (không phải copy tay).</div>
        <details>
          <summary>Nạp / đổi khoá API</summary>
          <div class="grid" style="margin-top:10px">
            <label>Key ID
              <input id="ascKeyId" type="text" placeholder="ABC123DEFG" autocomplete="off">
            </label>
            <label>Issuer ID
              <input id="ascIssuerId" type="text" placeholder="12345678-1234-1234-1234-123456789012" autocomplete="off">
            </label>
            <label>Team ID (tuỳ chọn)
              <input id="ascTeamId" type="text" placeholder="ABCDE12345" autocomplete="off">
            </label>
          </div>
          <label style="display:block;margin-top:8px">Nội dung file .p8 (dán cả dòng BEGIN/END)
            <textarea id="ascKey" rows="6" placeholder="-----BEGIN PRIVATE KEY-----" style="width:100%;font-family:ui-monospace,monospace;font-size:12px"></textarea>
          </label>
          <div class="actions">
            <button id="ascSave">Lưu khoá</button>
            <button class="secondary" id="ascClear">Xoá khoá</button>
            <span class="status-inline" id="ascStatus"></span>
          </div>
        </details>
      </div>

      <div style="overflow-x:auto; margin-top:12px;">
        <table>
          <thead><tr><th>UDID</th><th>Model / iOS</th><th>Email</th><th>User ID</th><th>Registered</th><th>Built</th><th>Apple</th><th>Map account</th></tr></thead>
          <tbody id="iosBody"><tr><td colspan="8">Bấm Refresh.</td></tr></tbody>
        </table>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="secondary" id="iosPrev">← Trước</button>
        <span class="status-inline" id="iosPageInfo">Trang 1/1</span>
        <button class="secondary" id="iosNext">Sau →</button>
        <span class="status-inline" id="iosTotal"></span>
      </div>
      <div class="status" id="iosAppleStatus"></div>
    </section>

    <!-- ===================== PAYMENTS VIEW ===================== -->
    <section class="card hidden" id="view-payments">
      <h2>Payments - don cho xac nhan</h2>
      <div class="actions">
        <button id="loadPayments">Refresh</button>
        <button class="secondary" id="deleteUnpaidPayments">Xoá tất cả đơn chưa thanh toán</button>
        <button id="remindAllPayments">Gửi nhắc chuyển tiền</button>
        <label style="display:inline-flex;align-items:center;gap:6px;color:var(--muted)">
          <input type="checkbox" id="remindDryRun"> chạy thử (không gửi thật)
        </label>
        <span class="status-inline" id="paymentsStatus"></span>
      </div>
      <div style="overflow-x:auto; margin-top:12px;">
        <table>
          <thead><tr><th>Ma don</th><th>Email khach</th><th>Goi</th><th>Method</th><th>So tien</th><th>Ngay tao</th><th>Kich hoat</th><th>Het han</th><th>Trang thai</th><th>Action</th></tr></thead>
          <tbody id="paymentsBody"><tr><td colspan="10">Bam Refresh.</td></tr></tbody>
        </table>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="secondary" id="paymentsPrev">← Trước</button>
        <span class="status-inline" id="paymentsPageInfo">Trang 1/1</span>
        <button class="secondary" id="paymentsNext">Sau →</button>
        <span class="status-inline" id="paymentsTotal"></span>
      </div>
    </section>

    <!-- ===================== PLANS VIEW ===================== -->
    <section class="card hidden" id="view-plans">
      <h2>Gói bán — giá &amp; thời hạn</h2>
      <div class="subtitle">Sửa ở đây là trang /buy đổi ngay, không cần deploy. Ngừng bán một gói thì Retire (không xoá) để hoá đơn và đơn cũ vẫn tra được tên gói.</div>
      <div class="actions">
        <button id="loadPlans">Refresh</button>
        <span class="status-inline" id="plansStatus"></span>
      </div>
      <div style="overflow-x:auto; margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Giá (VND)</th>
              <th>Số ngày</th>
              <th>Label (hoá đơn / admin)</th>
              <th>Badge (tên ngắn trên /buy)</th>
              <th>Trạng thái</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="plansBody"><tr><td colspan="7">Bấm Refresh.</td></tr></tbody>
        </table>
      </div>

      <h2 style="margin-top:22px;">Thêm gói mới</h2>
      <div class="grid">
        <label>
          ID (slug, không đổi được sau khi tạo)
          <input id="newPlanId" type="text" placeholder="promo60" autocomplete="off">
        </label>
        <label>
          Giá (VND)
          <input id="newPlanAmount" type="number" min="1" step="1000" placeholder="300000">
        </label>
        <label>
          Số ngày (để trống = vĩnh viễn)
          <input id="newPlanDays" type="number" min="1" step="1" placeholder="60">
        </label>
        <label>
          Label
          <input id="newPlanLabel" type="text" maxlength="120" placeholder="Promo 2 months (300,000 VND / 60 days)">
        </label>
        <label>
          Badge
          <input id="newPlanBadge" type="text" maxlength="40" placeholder="2 Months">
        </label>
      </div>
      <div class="actions">
        <button id="addPlanBtn">➕ Thêm gói</button>
        <span class="status-inline" id="addPlanStatus"></span>
      </div>
    </section>

    <!-- ===================== MEETFLOW AI VIEW ===================== -->
    <section class="card hidden" id="view-ai">
      <h2>MeetFlow AI Pro — don cho xac nhan</h2>
      <div class="actions">
        <button id="loadAi">Refresh</button>
        <span class="status-inline" id="aiStatus"></span>
      </div>
      <div style="overflow-x:auto; margin-top:12px;">
        <table>
          <thead><tr><th>Ma don</th><th>Email khach</th><th>Goi</th><th>Method</th><th>So tien</th><th>Ngay tao</th><th>Ngon ngu</th><th>Trang thai</th><th>Action</th></tr></thead>
          <tbody id="aiBody"><tr><td colspan="9">Bam Refresh.</td></tr></tbody>
        </table>
      </div>

      <h2 style="margin-top:26px">MeetFlow AI Pro — khach dang co Pro</h2>
      <div style="overflow-x:auto; margin-top:12px;">
        <table>
          <thead><tr><th>Email</th><th>Goi</th><th>Kich hoat</th><th>Het han</th><th>Ma don</th><th>Trang thai</th></tr></thead>
          <tbody id="aiEntBody"><tr><td colspan="6">Bam Refresh.</td></tr></tbody>
        </table>
      </div>
    </section>

    <!-- ================= MEETFLOW AI USERS (dashboard) ================= -->
    <section class="card hidden" id="view-ai-users">
      <h2>MeetFlow AI — quản lý user</h2>
      <div class="fb-panel" id="aiuSourcePanel">
        <div class="fb-title" id="aiuSourceTitle">Đang kiểm tra nguồn dữ liệu...</div>
        <div class="fb-body" id="aiuSourceBody">Firebase Authentication là nơi lưu tài khoản đăng ký của MeetFlow AI.</div>
        <details id="aiuCredDetails">
          <summary>Kết nối Firebase (dán service account JSON)</summary>
          <div style="margin-top:10px">
            <div class="fb-body" style="margin-bottom:8px">
              Firebase Console → ⚙️ Project settings → <b>Service accounts</b> → <b>Generate new private key</b>
              → mở file JSON vừa tải → dán toàn bộ nội dung vào ô dưới → bấm Lưu.
              File được lưu trên VPS với quyền 0600 và không bao giờ gửi ngược lại trình duyệt.
            </div>
            <textarea id="aiuCredJson" placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}' style="min-height:120px"></textarea>
            <div class="actions">
              <button id="aiuSaveCred">Lưu &amp; kiểm tra</button>
              <button class="secondary" id="aiuClearCred">Xoá key đã lưu</button>
            </div>
          </div>
        </details>
      </div>

      <div class="stats-grid" id="aiuCards"></div>
      <div class="note-line">
        <b>Nguồn gói:</b> gói mua <b>trên web</b> (VietQR · MoMo · WeChat Pay · Alipay) và gói admin cấp tay
        được ghi nhận đầy đủ. Gói mua qua <b>Google Play</b> do app báo về khi mua/khôi phục (bản app 1.0.3 trở lên)
        và chỉ tính khi xác thực được với Google Play Developer API — xem mục "Gói mua qua Google Play" bên dưới.
        Gói mua qua <b>App Store</b> (iOS) chưa được hỗ trợ nên vẫn hiện là "chưa thấy gói".
      </div>
      <div class="stats-cols">
        <div>
          <h2>Doanh thu 6 tháng (Pro web)</h2>
          <div class="mini-bars" id="aiuRevenueBars"></div>
        </div>
        <div>
          <h2>User mới theo tháng</h2>
          <div class="mini-bars" id="aiuNewUserBars"></div>
        </div>
      </div>

      <div class="actions" style="margin-top:18px">
        <input id="aiuSearch" placeholder="Tìm theo email..." style="max-width:230px">
        <select id="aiuStatus" style="max-width:190px">
          <option value="all">Mọi trạng thái</option>
          <option value="lifetime">Trọn đời</option>
          <option value="active">Đang hoạt động</option>
          <option value="expiring">Sắp hết hạn (&lt;=7 ngày)</option>
          <option value="expired">Đã hết hạn</option>
          <option value="none">Chưa có Pro</option>
        </select>
        <select id="aiuSource" style="max-width:200px">
          <option value="all">Mọi nguồn</option>
          <option value="firebase">Có tài khoản Firebase</option>
          <option value="paid">Đã thanh toán</option>
          <option value="app">App đã liên hệ</option>
          <option value="noorders">Chưa có đơn hàng</option>
        </select>
        <select id="aiuSort" style="max-width:190px">
          <option value="recent">Hoạt động gần nhất</option>
          <option value="newest">Đăng ký mới nhất</option>
          <option value="expiry">Sắp hết hạn trước</option>
          <option value="revenue">Chi nhiều nhất</option>
          <option value="email">Email A-Z</option>
        </select>
        <select id="aiuLimit" style="max-width:130px">
          <option value="100">100 dòng</option>
          <option value="200" selected>200 dòng</option>
          <option value="500">500 dòng</option>
          <option value="1000">1000 dòng</option>
        </select>
        <button id="loadAiUsers">Refresh</button>
        <button class="secondary" id="aiuExport">Export CSV</button>
      </div>
      <div class="actions" style="margin-top:8px">
        <button class="secondary" id="aiuPrev">← Trước</button>
        <span class="status-inline" id="aiuPageInfo">Trang 1/1</span>
        <button class="secondary" id="aiuNext">Sau →</button>
        <span class="status-inline" id="aiuTotal"></span>
      </div>
      <div class="status" id="aiuStatusLine"></div>

      <div style="overflow-x:auto; margin-top:8px;">
        <table>
          <thead><tr>
            <th>Email</th><th>Nguồn</th><th>Pro</th><th>Gói</th><th>Hết hạn</th>
            <th>Còn</th><th>Đơn</th><th>Đã trả</th><th>Hoạt động cuối</th><th>Action</th>
          </tr></thead>
          <tbody id="aiuBody"><tr><td colspan="10">Bấm Refresh.</td></tr></tbody>
        </table>
      </div>

      <div class="user-card hidden" id="aiuDetail"></div>

      <h2 style="margin-top:26px">Gói mua qua Google Play / App Store</h2>
      <div class="fb-panel" id="storePanel">
        <div class="fb-title" id="storeTitle">Đang kiểm tra cấu hình Google Play...</div>
        <div class="fb-body" id="storeBody">App báo từng giao dịch mua trong app về server; server xác thực bằng Google Play Developer API.</div>
        <details id="storeCredDetails">
          <summary>Kết nối Google Play (dán service account JSON)</summary>
          <div style="margin-top:10px">
            <div class="fb-body" style="margin-bottom:8px">
              Google Cloud Console → tạo <b>service account</b> → tạo <b>key JSON</b> → bật
              <b>Google Play Android Developer API</b> → vào Play Console → <b>Users and permissions</b>
              → mời email service account với quyền <b>View financial data</b> (hoặc Manage orders).
              Rồi dán nội dung file JSON vào đây → <b>Lưu</b>.
            </div>
            <textarea id="storeCredJson" placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}' style="min-height:110px"></textarea>
            <div class="actions">
              <button id="storeSaveCred">Lưu key Play</button>
              <button class="secondary" id="storeClearCred">Xoá key đã lưu</button>
            </div>
          </div>
        </details>
      </div>
      <div class="actions">
        <button class="secondary" id="loadStore">Tải giao dịch</button>
        <span class="status-inline" id="storeStatus"></span>
      </div>
      <div style="overflow-x:auto; margin-top:10px;">
        <table>
          <thead><tr>
            <th>Báo lúc</th><th>Nền tảng</th><th>Sản phẩm</th><th>Gói</th><th>Người mua</th>
            <th>Hết hạn</th><th>Tự gia hạn</th><th>Xác thực</th><th>Action</th>
          </tr></thead>
          <tbody id="storeBody2"><tr><td colspan="9">Bấm "Tải giao dịch".</td></tr></tbody>
        </table>
      </div>

      <h2 style="margin-top:26px">Tài khoản Firebase Auth (đăng ký gốc)</h2>
      <div class="actions">
        <button class="secondary" id="loadFirebaseUsers">Tải danh sách Firebase</button>
        <button id="remindVerify">📧 Gửi email xác thực cho tất cả (chưa xác thực)</button>
        <span class="status-inline" id="fbStatus"></span>
      </div>
      <div style="overflow-x:auto; margin-top:10px;">
        <table>
          <thead><tr>
            <th>Email</th><th>UID</th><th>Cách đăng nhập</th><th>Ngày tạo</th>
            <th>Đăng nhập cuối</th><th>Xác thực email</th><th>Trạng thái</th><th>Action</th>
          </tr></thead>
          <tbody id="fbBody"><tr><td colspan="8">Bấm "Tải danh sách Firebase".</td></tr></tbody>
        </table>
      </div>
    </section>

    <!-- ===================== DASHBOARD VIEW ===================== -->
    <section class="card hidden" id="view-stats">
      <h2>Dashboard</h2>
      <div class="actions">
        <button id="loadStats">Refresh</button>
        <button class="secondary" id="autoStats" style="display:inline-flex;align-items:center;gap:6px;">Auto-refresh: OFF</button>
      </div>

      <div class="stats-grid" id="statsCards"></div>
      <div class="stats-cols">
        <div>
          <h2>Devices by Platform</h2>
          <div id="statsPlatform" class="stats-bars"></div>
        </div>
        <div>
          <h2>Online Devices by ISP</h2>
          <div id="statsRegions" class="stats-bars"></div>
        </div>
      </div>

      <h2 style="margin-top:18px;">Online Devices per Server</h2>
      <div id="statsNodes" class="stats-bars"></div>

      <h2 style="margin-top:18px;">Online Devices (live)</h2>
      <div style="overflow-x:auto; margin-top:10px;">
        <table>
          <thead><tr>
            <th>Thiết bị</th><th>Nền tảng</th><th>Tài khoản</th><th>Server</th>
            <th>IP công khai</th><th>ISP / Location</th><th>Đã kết nối</th><th>Traffic</th>
          </tr></thead>
          <tbody id="statsOnline"><tr><td colspan="8">Bấm "Refresh".</td></tr></tbody>
        </table>
      </div>

      <h2 style="margin-top:18px;">Devices by User</h2>
      <div id="statsUsers"></div>
      <div class="status" id="statsStatus"></div>
    </section>

    <!-- ===================== EDIT VIEW ===================== -->
    <section class="card hidden" id="view-edit">
      <a class="backlink" href="#" id="backToList">&larr; Back to list</a>
      <h2 id="editTitle">Edit Node</h2>
      <div class="grid">
        <label>
          Node ID
          <input id="nodeId" placeholder="vietnam-1">
        </label>
        <label>
          Display Name
          <input id="name" placeholder="Vietnam 1">
        </label>
        <label>
          Country
          <input id="country" maxlength="2" placeholder="VN">
        </label>
        <label>
          City
          <input id="city" placeholder="Hanoi">
        </label>
        <label>
          Endpoint
          <input id="endpoint" placeholder="103.173.155.50:443">
        </label>
        <label>
          Priority
          <input id="priority" type="number" value="100">
        </label>
        <label>
          Active
          <select id="active">
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </select>
        </label>
      </div>
      <label style="margin-top: 14px;">
        WireGuard Server Public Key
        <textarea id="publicKey" placeholder="base64 public key"></textarea>
      </label>
      <div class="actions">
        <button id="saveNode">Save Node</button>
        <button class="secondary" id="cancelEdit">Cancel</button>
      </div>
    </section>
  </main>

  <script>
    const fields = {
      token: document.getElementById("token"),
      baseUrl: document.getElementById("baseUrl"),
      nodeId: document.getElementById("nodeId"),
      name: document.getElementById("name"),
      country: document.getElementById("country"),
      city: document.getElementById("city"),
      endpoint: document.getElementById("endpoint"),
      priority: document.getElementById("priority"),
      active: document.getElementById("active"),
      publicKey: document.getElementById("publicKey"),
      status: document.getElementById("status"),
      nodesBody: document.getElementById("nodesBody"),
      viewList: document.getElementById("view-list"),
      viewEdit: document.getElementById("view-edit"),
      viewUsers: document.getElementById("view-users"),
      usersBody: document.getElementById("usersBody"),
      usersSearch: document.getElementById("usersSearch"),
      usersPrev: document.getElementById("usersPrev"),
      usersNext: document.getElementById("usersNext"),
      usersPageInfo: document.getElementById("usersPageInfo"),
      usersTotal: document.getElementById("usersTotal"),
      newUserEmail: document.getElementById("newUserEmail"),
      newUserDays: document.getElementById("newUserDays"),
      addUserStatus: document.getElementById("addUserStatus"),
      editTitle: document.getElementById("editTitle"),
      areaVpn: document.getElementById("areaVpn"),
      areaAi: document.getElementById("areaAi"),
      areaSystem: document.getElementById("areaSystem"),
      tabsVpn: document.getElementById("tabsVpn"),
      tabsAi: document.getElementById("tabsAi"),
      tabsSystem: document.getElementById("tabsSystem"),
      tabNodes: document.getElementById("tabNodes"),
      tabUsers: document.getElementById("tabUsers"),
      tabIos: document.getElementById("tabIos"),
      viewIos: document.getElementById("view-ios"),
      iosBody: document.getElementById("iosBody"),
      iosStatus: document.getElementById("iosStatus"),
      iosSearch: document.getElementById("iosSearch"),
      iosPrev: document.getElementById("iosPrev"),
      iosNext: document.getElementById("iosNext"),
      iosPageInfo: document.getElementById("iosPageInfo"),
      iosTotal: document.getElementById("iosTotal"),
      loadIos: document.getElementById("loadIos"),
      ascTitle: document.getElementById("ascTitle"),
      ascBody: document.getElementById("ascBody"),
      ascKeyId: document.getElementById("ascKeyId"),
      ascIssuerId: document.getElementById("ascIssuerId"),
      ascTeamId: document.getElementById("ascTeamId"),
      ascKey: document.getElementById("ascKey"),
      ascStatus: document.getElementById("ascStatus"),
      iosAppleStatus: document.getElementById("iosAppleStatus"),
      tabStats: document.getElementById("tabStats"),
      viewStats: document.getElementById("view-stats"),
      statsCards: document.getElementById("statsCards"),
      statsPlatform: document.getElementById("statsPlatform"),
      statsRegions: document.getElementById("statsRegions"),
      statsNodes: document.getElementById("statsNodes"),
      statsOnline: document.getElementById("statsOnline"),
      statsStatus: document.getElementById("statsStatus"),
      loadStats: document.getElementById("loadStats"),
      autoStats: document.getElementById("autoStats"),
      statsUsers: document.getElementById("statsUsers"),
      tabPayments: document.getElementById("tabPayments"),
      viewPayments: document.getElementById("view-payments"),
      paymentsBody: document.getElementById("paymentsBody"),
      paymentsStatus: document.getElementById("paymentsStatus"),
      loadPayments: document.getElementById("loadPayments"),
      deleteUnpaidPayments: document.getElementById("deleteUnpaidPayments"),
      remindAllPayments: document.getElementById("remindAllPayments"),
      remindDryRun: document.getElementById("remindDryRun"),
      paymentsPrev: document.getElementById("paymentsPrev"),
      paymentsNext: document.getElementById("paymentsNext"),
      paymentsPageInfo: document.getElementById("paymentsPageInfo"),
      paymentsTotal: document.getElementById("paymentsTotal"),
      tabPlans: document.getElementById("tabPlans"),
      viewPlans: document.getElementById("view-plans"),
      plansBody: document.getElementById("plansBody"),
      plansStatus: document.getElementById("plansStatus"),
      loadPlans: document.getElementById("loadPlans"),
      newPlanId: document.getElementById("newPlanId"),
      newPlanAmount: document.getElementById("newPlanAmount"),
      newPlanDays: document.getElementById("newPlanDays"),
      newPlanLabel: document.getElementById("newPlanLabel"),
      newPlanBadge: document.getElementById("newPlanBadge"),
      addPlanBtn: document.getElementById("addPlanBtn"),
      addPlanStatus: document.getElementById("addPlanStatus"),
      viewAi: document.getElementById("view-ai"),
      tabAi: document.getElementById("tabAi"),
      loadAi: document.getElementById("loadAi"),
      aiStatus: document.getElementById("aiStatus"),
      aiBody: document.getElementById("aiBody"),
      aiEntBody: document.getElementById("aiEntBody"),
      tabAiUsers: document.getElementById("tabAiUsers"),
      viewAiUsers: document.getElementById("view-ai-users"),
      aiuCards: document.getElementById("aiuCards"),
      aiuBody: document.getElementById("aiuBody"),
      aiuStatusLine: document.getElementById("aiuStatusLine"),
      aiuSearch: document.getElementById("aiuSearch"),
      aiuStatus: document.getElementById("aiuStatus"),
      aiuSource: document.getElementById("aiuSource"),
      aiuSort: document.getElementById("aiuSort"),
      aiuLimit: document.getElementById("aiuLimit"),
      aiuPrev: document.getElementById("aiuPrev"),
      aiuNext: document.getElementById("aiuNext"),
      aiuPageInfo: document.getElementById("aiuPageInfo"),
      aiuTotal: document.getElementById("aiuTotal"),
      aiuExport: document.getElementById("aiuExport"),
      aiuDetail: document.getElementById("aiuDetail"),
      aiuSourcePanel: document.getElementById("aiuSourcePanel"),
      aiuSourceTitle: document.getElementById("aiuSourceTitle"),
      aiuSourceBody: document.getElementById("aiuSourceBody"),
      aiuCredJson: document.getElementById("aiuCredJson"),
      aiuRevenueBars: document.getElementById("aiuRevenueBars"),
      aiuNewUserBars: document.getElementById("aiuNewUserBars"),
      loadAiUsers: document.getElementById("loadAiUsers"),
      loadStore: document.getElementById("loadStore"),
      storeStatus: document.getElementById("storeStatus"),
      storeBody2: document.getElementById("storeBody2"),
      storePanel: document.getElementById("storePanel"),
      storeTitle: document.getElementById("storeTitle"),
      storeBody: document.getElementById("storeBody"),
      storeCredJson: document.getElementById("storeCredJson"),
      loadFirebaseUsers: document.getElementById("loadFirebaseUsers"),
      fbBody: document.getElementById("fbBody"),
      fbStatus: document.getElementById("fbStatus"),
    };

    let editingId = null; // null = create mode

    // ===== ADMIN PAGINATION HELPERS (giữ khối này liền mạch để test trích xuất) =====
    // Số bản ghi mỗi trang cho "Quản lý user" và "Quản lý UDID".
    // Đổi 1 chỗ này là đổi cho cả hai bảng.
    const ADMIN_PAGE_SIZE = 10;

    /**
     * Sắp xếp bản ghi theo thời gian đăng ký mới nhất lên trên.
     * getTime trả về chuỗi ISO (hoặc số) của thời điểm đăng ký. Bản ghi thiếu
     * thời gian bị đẩy xuống cuối; thứ tự gốc được giữ ổn định khi bằng nhau.
     */
    function adminSortByTimeDesc(items, getTime) {
      return (items || [])
        .map(function (item, index) { return { item: item, index: index }; })
        .sort(function (a, b) {
          const ta = Date.parse(getTime(a.item));
          const tb = Date.parse(getTime(b.item));
          const va = Number.isFinite(ta) ? ta : -Infinity;
          const vb = Number.isFinite(tb) ? tb : -Infinity;
          if (va !== vb) return vb - va;
          return a.index - b.index;
        })
        .map(function (entry) { return entry.item; });
    }

    /**
     * Lọc trên TOÀN BỘ dữ liệu (trước khi phân trang). So khớp không phân biệt
     * hoa/thường trên từng trường do getText trả về (chuỗi hoặc mảng chuỗi).
     */
    function adminFilterItems(items, query, getText) {
      const q = String(query == null ? "" : query).trim().toLowerCase();
      if (!q) return items || [];
      return (items || []).filter(function (item) {
        const raw = getText(item);
        const parts = Array.isArray(raw) ? raw : [raw];
        return parts.some(function (part) {
          return String(part == null ? "" : part).toLowerCase().indexOf(q) >= 0;
        });
      });
    }

    /**
     * Cắt danh sách theo trang. Tự kẹp page vào [1, totalPages] nên khi dữ
     * liệu làm mới ngắn hơn (đang ở trang > tổng trang) sẽ tự về trang cuối.
     */
    function adminPaginate(items, page, pageSize) {
      const list = items || [];
      const size = pageSize > 0 ? pageSize : ADMIN_PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(list.length / size));
      const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
      const start = (current - 1) * size;
      return { page: current, totalPages: totalPages, total: list.length, items: list.slice(start, start + size) };
    }

    /** Cập nhật thanh phân trang: nhãn "Trang X/Y", tổng số, disable nút đầu/cuối. */
    function adminUpdatePager(prevBtn, nextBtn, infoEl, totalEl, view, unit) {
      if (infoEl) infoEl.textContent = "Trang " + view.page + "/" + view.totalPages;
      if (totalEl) totalEl.textContent = "Tổng " + view.total + " " + unit;
      if (prevBtn) prevBtn.disabled = view.page <= 1;
      if (nextBtn) nextBtn.disabled = view.page >= view.totalPages;
    }
    // ===== END ADMIN PAGINATION HELPERS =====

    // ===== ADMIN AREA NAV HELPERS (giữ khối này liền mạch để test trích xuất) =====
    // Chia trang admin thành 3 khu theo sản phẩm. Mỗi tab con chỉ thuộc ĐÚNG một
    // khu; thêm/bớt tab phải cập nhật bảng này để không sót panel.
    const ADMIN_TAB_AREA = {
      stats: "vpn", users: "vpn", ios: "vpn", payments: "vpn", plans: "vpn",
      ai: "ai", aiu: "ai",
      nodes: "system",
    };
    // Tab mặc định khi mở một khu (khu mặc định toàn trang là vpn → VPNFlow).
    const ADMIN_AREA_DEFAULT_TAB = { vpn: "stats", ai: "ai", system: "nodes" };
    // Deep-link: /Admin#vpnflow | #meetflow-ai | #he-thong
    const ADMIN_AREA_HASH = { vpn: "vpnflow", ai: "meetflow-ai", system: "he-thong" };
    const ADMIN_HASH_AREA = { vpnflow: "vpn", "meetflow-ai": "ai", "he-thong": "system" };
    function adminAreaForTab(tab) {
      return Object.prototype.hasOwnProperty.call(ADMIN_TAB_AREA, tab) ? ADMIN_TAB_AREA[tab] : "";
    }
    // ===== END ADMIN AREA NAV HELPERS =====

    // Trạng thái phân trang/lọc của hai bảng (dữ liệu đã tải về client).
    const usersState = { all: [], expiry: {}, page: 1 };
    const iosState = { all: [], page: 1 };
    // Bảng Payments cũng phân trang 10 dòng/trang (adminPaginate tự kẹp trang).
    const paymentsState = { all: [], page: 1 };

    // Auto-detect the API base: when this page is served under
    // /PrivateVPN/Admin (Caddy strips the prefix), keep the prefix so API
    // calls hit the proxy too; when served at /admin (SSH tunnel/Funnel) use origin.
    const detectedBase =
      window.location.origin +
      window.location.pathname.replace(/\\/admin\\/?$/i, "");

    // Persist token + base across visits so the page can auto-load nodes.
    // Chỉ dùng lại base đã lưu khi nó CÙNG origin với trang đang mở: khi mạng
    // chặn domain chính (GFW) phải mở panel qua đường khác (Tailscale Funnel),
    // base cũ trỏ về domain đang bị chặn sẽ làm mọi lời gọi API treo.
    fields.token.value = localStorage.getItem("fvpn_admin_token") || "";
    const savedBase = localStorage.getItem("fvpn_admin_base") || "";
    fields.baseUrl.value = savedBase.startsWith(window.location.origin) ? savedBase : detectedBase;
    fields.token.addEventListener("input", () => localStorage.setItem("fvpn_admin_token", fields.token.value.trim()));
    fields.baseUrl.addEventListener("input", () => localStorage.setItem("fvpn_admin_base", fields.baseUrl.value));

    // Enter trong ô token/base = bấm "Load Nodes" luôn, khỏi phải với chuột.
    [fields.token, fields.baseUrl].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        loadNodes();
      });
    });

    function setStatus(message, isError = false) {
      fields.status.textContent = message;
      fields.status.style.color = isError ? "var(--danger)" : "var(--muted)";
    }

    function apiURL(path) {
      return fields.baseUrl.value.replace(/\\/$/, "") + path;
    }

    function authHeaders() {
      return {
        "Authorization": "Bearer " + fields.token.value.trim(),
        "Content-Type": "application/json",
      };
    }

    function showTab(tab) {
      const nodes = tab === "nodes";
      fields.tabNodes.classList.toggle("active", nodes);
      fields.tabUsers.classList.toggle("active", tab === "users");
      fields.tabIos.classList.toggle("active", tab === "ios");
      fields.tabStats.classList.toggle("active", tab === "stats");
      fields.tabPayments.classList.toggle("active", tab === "payments");
      fields.viewList.classList.toggle("hidden", !nodes);
      fields.viewUsers.classList.toggle("hidden", tab !== "users");
      fields.viewIos.classList.toggle("hidden", tab !== "ios");
      fields.viewStats.classList.toggle("hidden", tab !== "stats");
      fields.viewPayments.classList.toggle("hidden", tab !== "payments");
      if (fields.tabPlans) fields.tabPlans.classList.toggle("active", tab === "plans");
      if (fields.viewPlans) fields.viewPlans.classList.toggle("hidden", tab !== "plans");
      if (fields.tabAi) fields.tabAi.classList.toggle("active", tab === "ai");
      if (fields.viewAi) fields.viewAi.classList.toggle("hidden", tab !== "ai");
      if (fields.tabAiUsers) fields.tabAiUsers.classList.toggle("active", tab === "aiu");
      if (fields.viewAiUsers) fields.viewAiUsers.classList.toggle("hidden", tab !== "aiu");
      fields.viewEdit.classList.add("hidden");
      adminSyncArea(tab);
      if (tab === "users" && !fields.usersLoaded) {
        fields.usersLoaded = true;
        loadUsers();
      }
      if (tab === "ios") loadIosDevices();
      if (tab === "stats") loadStats();
      if (tab === "payments") loadPayments();
      if (tab === "plans") loadPlans();
      if (tab === "ai") loadAi();
      if (tab === "aiu") loadAiUsers();
    }

    /** Đồng bộ nav cấp khu + nhóm tab con với tab đang xem, và nhớ lựa chọn. */
    function adminSyncArea(tab) {
      const area = adminAreaForTab(tab) || "vpn";
      if (fields.areaVpn) fields.areaVpn.classList.toggle("active", area === "vpn");
      if (fields.areaAi) fields.areaAi.classList.toggle("active", area === "ai");
      if (fields.areaSystem) fields.areaSystem.classList.toggle("active", area === "system");
      if (fields.tabsVpn) fields.tabsVpn.classList.toggle("hidden", area !== "vpn");
      if (fields.tabsAi) fields.tabsAi.classList.toggle("hidden", area !== "ai");
      if (fields.tabsSystem) fields.tabsSystem.classList.toggle("hidden", area !== "system");
      try {
        localStorage.setItem("fvpn_admin_area", area);
        localStorage.setItem("fvpn_admin_tab", tab);
        localStorage.setItem("fvpn_admin_tab_" + area, tab);
      } catch (error) { /* chế độ riêng tư có thể chặn localStorage */ }
      try {
        const hash = "#" + (ADMIN_AREA_HASH[area] || area);
        if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
      } catch (error) { /* bỏ qua nếu history bị chặn */ }
    }

    /** Mở một khu; nhớ tab con đã xem lần trước, nếu không có thì mở tab mặc định. */
    function showArea(area) {
      let tab = "";
      try { tab = localStorage.getItem("fvpn_admin_tab_" + area) || ""; } catch (error) { /* bỏ qua */ }
      if (adminAreaForTab(tab) !== area) tab = ADMIN_AREA_DEFAULT_TAB[area] || "stats";
      showTab(tab);
    }

    /**
     * Chọn tab lúc mở trang: ưu tiên deep-link hash, rồi tab đã nhớ, cuối cùng
     * là mặc định VPNFlow. Nhờ vậy F5 không nhảy về tab đầu.
     */
    function adminInitTab() {
      const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      let tab = "";
      if (Object.prototype.hasOwnProperty.call(ADMIN_HASH_AREA, hash)) {
        const area = ADMIN_HASH_AREA[hash];
        try { tab = localStorage.getItem("fvpn_admin_tab_" + area) || ""; } catch (error) { /* bỏ qua */ }
        if (adminAreaForTab(tab) !== area) tab = ADMIN_AREA_DEFAULT_TAB[area] || "stats";
      } else if (Object.prototype.hasOwnProperty.call(ADMIN_TAB_AREA, hash)) {
        tab = hash;
      } else {
        try { tab = localStorage.getItem("fvpn_admin_tab") || ""; } catch (error) { /* bỏ qua */ }
      }
      if (!adminAreaForTab(tab)) tab = ADMIN_AREA_DEFAULT_TAB.vpn;
      showTab(tab);
    }

    /** Adds a VPNFlow account by email and (optionally) activates Premium. */
    async function addUser() {
      const email = (fields.newUserEmail.value || "").trim();
      const choice = fields.newUserDays.value;
      if (!email || email.indexOf("@") < 1) {
        fields.addUserStatus.textContent = "Nhap email hop le.";
        return;
      }
      const payload = { email: email };
      if (choice !== "none") {
        payload.grant = true;
        payload.days = choice === "0" ? null : Number(choice);
      }
      const label = choice === "none" ? "chi tao tai khoan"
        : choice === "0" ? "tron doi" : choice + " ngay";
      if (!confirm("Them " + email + " va " + label + "?")) return;
      try {
        fields.addUserStatus.textContent = "Dang xu ly " + email + "...";
        const data = await request("/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
        const u = data.user || {};
        const exp = u.expires_at ? new Date(u.expires_at).toLocaleDateString("vi-VN") : "khong het han";
        fields.addUserStatus.textContent =
          (data.created ? "✅ Da tao moi " : "ℹ️ Da co san ") + email +
          (choice === "none" ? "" : " · Premium den " + exp);
        fields.newUserEmail.value = "";
        await loadUsers();
      } catch (error) {
        fields.addUserStatus.textContent = error.message;
      }
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[char]));
    }

    function iosAppleCell(d) {
      if (d.appleRegisteredAt) return "✅ " + (d.appleAlreadyRegistered ? "đã có trên Apple" : "đã đăng ký");
      if (d.appleError) return "⚠️ " + escapeHtml(d.appleError);
      return "—";
    }

    async function loadAscStatus() {
      try {
        const data = await request("/v1/admin/ios/apple");
        const c = data.credentials || {};
        fields.ascTitle.textContent = c.configured
          ? "App Store Connect API — đã cấu hình (Key " + (c.keyId || "?") + ")"
          : "App Store Connect API — CHƯA cấu hình";
        const apple = data.apple || {};
        fields.ascBody.textContent = c.configured
          ? (apple.ok
              ? "Kết nối Apple OK · " + (apple.devices || []).length + " thiết bị trên tài khoản."
              : "Chưa gọi được Apple: " + (apple.error || "lỗi không rõ"))
          : "Nạp Issuer ID + Key ID + file .p8 để server tự thêm UDID lên Apple Developer.";
        if (fields.ascKeyId && !fields.ascKeyId.value) fields.ascKeyId.value = c.keyId || "";
        if (fields.ascTeamId && !fields.ascTeamId.value) fields.ascTeamId.value = c.teamId || "";
      } catch (error) {
        fields.ascTitle.textContent = "App Store Connect API — lỗi kiểm tra";
        fields.ascBody.textContent = error.message;
      }
    }

    async function saveAscCredential() {
      const privateKey = (fields.ascKey.value || "").trim();
      if (!fields.ascKeyId.value.trim() || !fields.ascIssuerId.value.trim() || !privateKey) {
        fields.ascStatus.textContent = "Cần Key ID, Issuer ID và nội dung file .p8.";
        return;
      }
      fields.ascStatus.textContent = "Đang lưu...";
      try {
        const data = await request("/v1/admin/ios/apple/credentials", {
          method: "POST",
          body: JSON.stringify({
            keyId: fields.ascKeyId.value.trim(),
            issuerId: fields.ascIssuerId.value.trim(),
            teamId: fields.ascTeamId.value.trim(),
            privateKey: privateKey,
          }),
        });
        fields.ascKey.value = "";
        fields.ascStatus.textContent = data.verified ? "✅ Đã lưu và kết nối Apple OK" : "⚠️ Đã lưu nhưng Apple từ chối: " + (data.verify_error || "");
        await loadAscStatus();
      } catch (error) {
        fields.ascStatus.textContent = error.message;
      }
    }

    async function clearAscCredential() {
      if (!confirm("Xoá khoá App Store Connect đang lưu?")) return;
      try {
        await request("/v1/admin/ios/apple/credentials", { method: "DELETE" });
        fields.ascStatus.textContent = "Đã xoá khoá.";
        await loadAscStatus();
      } catch (error) {
        fields.ascStatus.textContent = error.message;
      }
    }

    async function registerAllApple() {
      if (!confirm("Đăng ký TẤT CẢ UDID chưa có lên Apple?")) return;
      fields.iosAppleStatus.textContent = "Đang đăng ký lên Apple...";
      try {
        const data = await request("/v1/admin/ios/apple/register-pending", { method: "POST", body: JSON.stringify({}) });
        fields.iosAppleStatus.textContent = "Đã đăng ký " + (data.registered || []).length + " máy" +
          ((data.failed || []).length ? " · lỗi " + (data.failed || []).length + " máy" : "");
        await loadIosDevices();
      } catch (error) {
        fields.iosAppleStatus.textContent = error.message;
      }
    }

    async function registerOneApple(udid) {
      fields.iosAppleStatus.textContent = "Đang đăng ký " + udid.slice(-8) + " lên Apple...";
      try {
        await request("/v1/admin/ios/devices/" + encodeURIComponent(udid) + "/register-apple", {
          method: "POST",
          body: JSON.stringify({}),
        });
        fields.iosAppleStatus.textContent = "Đã đăng ký " + udid.slice(-8) + ".";
        await loadIosDevices();
      } catch (error) {
        fields.iosAppleStatus.textContent = error.message;
      }
    }

    async function loadIosDevices() {
      try {
        fields.iosStatus.textContent = "Loading...";
        const data = await request("/v1/admin/ios/devices");
        // Mặc định: UDID đăng ký mới nhất lên trên (client đã có registeredAt).
        iosState.all = adminSortByTimeDesc(data.devices || [], function (d) { return d.registeredAt; });
        renderIosDevices();
        fields.iosStatus.textContent = "Loaded " + iosState.all.length + " device(s).";
        await loadAscStatus();
      } catch (error) {
        fields.iosStatus.textContent = error.message;
      }
    }

    function renderIosDevices() {
      // Lọc trên toàn bộ dữ liệu rồi mới cắt trang; adminPaginate tự kẹp trang.
      const filtered = adminFilterItems(iosState.all, fields.iosSearch ? fields.iosSearch.value : "", function (d) {
        return [d.udid, d.email, d.userId, d.model, d.iosVersion];
      });
      const view = adminPaginate(filtered, iosState.page, ADMIN_PAGE_SIZE);
      iosState.page = view.page;
      adminUpdatePager(fields.iosPrev, fields.iosNext, fields.iosPageInfo, fields.iosTotal, view, "UDID");
      fields.iosBody.innerHTML = view.items.length ? view.items.map(function (d) {
        return "<tr>" +
          "<td><code>" + escapeHtml(d.udid || "") + "</code></td>" +
          "<td>" + escapeHtml(d.model || "-") + " / " + escapeHtml(d.iosVersion || "-") + "</td>" +
          "<td>" + escapeHtml(d.email || "-") + "</td>" +
          "<td><code>" + escapeHtml(d.userId || "-") + "</code></td>" +
          "<td>" + escapeHtml(d.registeredAt || "-") + "</td>" +
          "<td>" + (d.built ? "✅" : "⏳") + "</td>" +
          "<td>" + iosAppleCell(d) + "</td>" +
          "<td>" +
            '<button class="secondary ios-map" data-udid="' + escapeHtml(d.udid || "") + '">Map</button> ' +
            (d.appleRegisteredAt ? "" : '<button class="secondary ios-apple" data-udid="' + escapeHtml(d.udid || "") + '">→ Apple</button>') +
          "</td>" +
          "</tr>";
      }).join("") : '<tr><td colspan="8">Chưa có UDID.</td></tr>';
      fields.iosBody.querySelectorAll(".ios-map").forEach(function (button) {
        button.onclick = async function () {
          const email = window.prompt("Email account cần map:", "");
          if (!email) return;
          try {
            await request("/v1/admin/ios/devices/" + encodeURIComponent(button.dataset.udid) + "/account", {
              method: "POST",
              body: JSON.stringify({ email: email }),
            });
            await loadIosDevices();
          } catch (error) {
            fields.iosStatus.textContent = error.message;
          }
        };
      });
      fields.iosBody.querySelectorAll(".ios-apple").forEach(function (button) {
        button.onclick = function () { registerOneApple(button.dataset.udid); };
      });
    }

    async function loadUsers() {
      try {
        setStatus("Loading users...");
        const data = await request("/v1/admin/users");
        usersState.expiry = data.expiry || {};
        // Mặc định: user đăng ký mới nhất lên trên (server trả created_at ISO).
        usersState.all = adminSortByTimeDesc(data.users || [], function (user) { return user.created_at; });
        renderUsers();
        setStatus("Loaded " + usersState.all.length + " user(s).");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function renderUsers() {
      const expiry = usersState.expiry;
      const sumEl = document.getElementById("expirySummary");
      if (sumEl) {
        const e = expiry || {};
        const chips = [
          ["Lifetime", e.lifetime || 0, "#33c773"],
          ["Active", e.active || 0, "var(--accent)"],
          ["Sap het han (<=7d)", e.expiring_soon || 0, "#ffb84d"],
          ["Het han", e.expired || 0, "#ff5a6a"],
          ["Chua mua", e.none || 0, "rgba(255,255,255,.5)"],
        ].filter((c) => c[1] > 0);
        sumEl.innerHTML = chips.length
          ? chips.map((c) => '<span class="pill" style="margin:2px 6px 2px 0;color:' + c[2] + ';border-color:' + c[2] + '">' + c[0] + ': <b>' + c[1] + '</b></span>').join("")
          : '<span style="color:var(--muted)">Khong co user.</span>';
      }
      // Lọc trên toàn bộ dữ liệu rồi mới cắt trang; adminPaginate tự kẹp trang.
      const filtered = adminFilterItems(usersState.all, fields.usersSearch ? fields.usersSearch.value : "", function (user) {
        return [user.email, user.id, user.apple_user_id];
      });
      const view = adminPaginate(filtered, usersState.page, ADMIN_PAGE_SIZE);
      usersState.page = view.page;
      adminUpdatePager(fields.usersPrev, fields.usersNext, fields.usersPageInfo, fields.usersTotal, view, "user");
      if (!view.items.length) {
        fields.usersBody.innerHTML = '<tr><td colspan="7">No users found.</td></tr>';
        return;
      }
      fields.usersBody.innerHTML = "";
      for (const user of view.items) {
        const row = document.createElement("tr");
        row.innerHTML = [
          '<td data-label="Email"></td>',
          '<td data-label="User ID"><code></code></td>',
          '<td data-label="Created"></td>',
          '<td data-label="Subscription"></td>',
          '<td data-label="Expiry"></td>',
          '<td data-label="Status"></td>',
          '<td data-label="Actions"></td>',
        ].join("");
        row.children[0].textContent = user.email || (user.apple_user_id ? "apple:" + user.apple_user_id.slice(0, 8) : "—");
        row.children[1].querySelector("code").textContent = user.id;
        row.children[2].textContent = (user.created_at || "").slice(0, 10);
        const sub = user.subscription_status || {};
        const prod = (sub.product_id || "?").replace(/^(bankqr|payos|test)\./, "");
        const st = user.expiry_status || (user.revoked_at ? "revoked" : sub.is_active ? "active" : "none");

        // Subscription cell
        if (user.revoked_at) {
          row.children[3].innerHTML = '<span class="pill off">revoked</span>';
        } else if (st === "none") {
          row.children[3].innerHTML = '<span class="pill off">no subscription</span>';
        } else if (st === "lifetime") {
          row.children[3].innerHTML = "lifetime (<b>" + prod + "</b>)";
        } else {
          row.children[3].innerHTML = "<b>" + prod + "</b> · " + (user.expires_at || "").slice(0, 10);
        }
        // Expiry cell
        if (user.revoked_at) {
          row.children[4].innerHTML = "-";
        } else if (st === "lifetime") {
          row.children[4].innerHTML = '<span class="pill" style="color:#33c773;border-color:#33c773">vinh vien</span>';
        } else if (st === "expired") {
          row.children[4].innerHTML = '<span class="pill" style="color:#ff5a6a;border-color:#ff5a6a">DA HET HAN</span>';
          row.style.opacity = "0.65";
        } else if (st === "expiring_soon") {
          row.children[4].innerHTML = '<span class="pill" style="color:#ffb84d;border-color:#ffb84d">con ' + (user.days_left != null ? user.days_left + " ngay" : "sap het") + '</span>';
        } else if (st === "active") {
          row.children[4].innerHTML = "con " + user.days_left + " ngay";
        } else {
          row.children[4].innerHTML = "-";
        }
        // Status cell
        row.children[5].innerHTML = user.revoked_at
          ? '<span class="pill off">revoked</span>'
          : '<span class="pill">active</span>';

        // Ô Actions: 2 NHÓM chức năng riêng biệt, cùng một hàng —
        //   nhóm "Cấp hạn" (30 ngày / 1 năm) | vạch ngăn | nhóm "Thu hồi".
        // Gộp thành khối flex (thay vì append rời từng nút) để các nút thẳng hàng, không so le.
        const actions = document.createElement("div");
        actions.className = "row-actions act-groups";

        const grantGroup = document.createElement("div");
        grantGroup.className = "act-group";
        const grantLabel = document.createElement("span");
        grantLabel.className = "act-label";
        grantLabel.textContent = "Cấp hạn";
        grantGroup.appendChild(grantLabel);

        const grantYear = document.createElement("button");
        grantYear.textContent = "1 năm";
        grantYear.disabled = !!user.revoked_at;
        grantYear.onclick = async () => {
          try {
            await request("/v1/admin/users/" + encodeURIComponent(user.id) + "/subscription", {
              method: "POST",
              body: JSON.stringify({ days: 365 }),
            });
            setStatus("Da cap Premium 1 nam cho " + (user.email || user.id) + ".");
            await loadUsers();
          } catch (error) {
            setStatus(error.message, true);
          }
        };

        const grant = document.createElement("button");
        grant.textContent = "30 ngày";
        grant.disabled = !!user.revoked_at;
        grant.onclick = async () => {
          try {
            await request("/v1/admin/users/" + encodeURIComponent(user.id) + "/subscription", {
              method: "POST",
              body: JSON.stringify({ days: 30 }),
            });
            setStatus("Granted 30-day subscription to " + (user.email || user.id) + ".");
            await loadUsers();
          } catch (error) { setStatus(error.message, true); }
        };
        grantGroup.append(grant, grantYear);
        actions.appendChild(grantGroup);

        const sep = document.createElement("span");
        sep.className = "act-sep";
        actions.appendChild(sep);

        const revokeGroup = document.createElement("div");
        revokeGroup.className = "act-group";
        const revoke = document.createElement("button");
        revoke.className = "danger";
        revoke.textContent = user.revoked_at ? "Đã thu hồi" : "Thu hồi";
        revoke.disabled = !!user.revoked_at;
        revoke.onclick = async () => {
          if (!confirm("Revoke user " + (user.email || user.id) + "? Their sessions will stop working.")) return;
          try {
            await request("/v1/admin/users/" + encodeURIComponent(user.id) + "/revoke", { method: "POST" });
            setStatus("Revoked " + (user.email || user.id) + ".");
            await loadUsers();
          } catch (error) { setStatus(error.message, true); }
        };
        revokeGroup.appendChild(revoke);
        actions.appendChild(revokeGroup);

        row.children[6].appendChild(actions);
        fields.usersBody.appendChild(row);
      }
    }
    function showView(view) {
      const list = view === "list";
      fields.viewList.classList.toggle("hidden", !list);
      fields.viewEdit.classList.toggle("hidden", list);
      if (list) {
        editingId = null;
        fields.editTitle.textContent = "Edit Node";
        fields.nodeId.readOnly = false;
      }
    }

    function formPayload() {
      return {
        name: fields.name.value.trim(),
        country: fields.country.value.trim().toUpperCase(),
        city: fields.city.value.trim(),
        endpoint: fields.endpoint.value.trim(),
        public_key: fields.publicKey.value.trim(),
        priority: Number(fields.priority.value || 100),
        active: fields.active.value === "true",
      };
    }

    // Load the node's WireGuard public key into the edit form.
    function openEdit(node) {
      editingId = node.id;
      fields.editTitle.textContent = "Edit Node: " + node.id;
      fields.nodeId.value = node.id;
      fields.nodeId.readOnly = true;
      fields.name.value = node.name || "";
      fields.country.value = node.country || "";
      fields.city.value = node.city || "";
      fields.endpoint.value = node.endpoint || "";
      fields.publicKey.value = node.public_key || node.serverPublicKey || "";
      fields.priority.value = node.priority ?? 100;
      fields.active.value = node.active === false ? "false" : "true";
      showView("edit");
      fields.name.focus();
    }

    function openCreate() {
      editingId = null;
      fields.editTitle.textContent = "Add Node";
      fields.nodeId.value = "";
      fields.nodeId.readOnly = false;
      fields.name.value = "";
      fields.country.value = "VN";
      fields.city.value = "";
      fields.endpoint.value = "";
      fields.publicKey.value = "";
      fields.priority.value = "100";
      fields.active.value = "true";
      showView("edit");
      fields.nodeId.focus();
    }

    async function request(path, options = {}) {
      const response = await fetch(apiURL(path), {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "HTTP " + response.status);
      }
      return body;
    }

    async function loadNodes() {
      try {
        setStatus("Loading nodes...");
        const data = await request("/v1/admin/nodes");
        renderNodes(data.nodes || []);
        setStatus("Loaded " + (data.nodes || []).length + " node(s).");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function renderNodes(nodes) {
      if (!nodes.length) {
        fields.nodesBody.innerHTML = '<tr><td colspan="7">No exit nodes found.</td></tr>';
        return;
      }

      fields.nodesBody.innerHTML = "";
      for (const node of nodes) {
        const row = document.createElement("tr");
        row.innerHTML = [
          '<td data-label="ID"><code></code></td>',
          '<td data-label="Location"></td>',
          '<td data-label="Endpoint"><code></code></td>',
          '<td data-label="Public Key"><code></code></td>',
          '<td data-label="Status"></td>',
          '<td data-label="Health"><code class="health"></code></td>',
          '<td data-label="Actions"></td>',
        ].join("");
        row.children[0].querySelector("code").textContent = node.id;
        row.children[1].textContent = node.name + " - " + node.city + ", " + node.country;
        row.children[2].querySelector("code").textContent = node.endpoint;
        row.children[3].querySelector("code").textContent = node.public_key;
        row.children[4].innerHTML = node.active ? '<span class="pill">Active</span>' : '<span class="pill off">Disabled</span>';

        const healthCell = row.children[5].querySelector("code");
        healthCell.textContent = "loading...";
        fetchNodeHealth(node.id, healthCell);

        const edit = document.createElement("button");
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.onclick = () => openEdit(node);

        const disable = document.createElement("button");
        disable.className = "danger";
        disable.textContent = "Disable";
        disable.disabled = node.active === false;
        disable.onclick = async () => {
          if (!confirm("Disable exit node " + node.id + "?")) return;
          try {
            await request("/v1/admin/nodes/" + encodeURIComponent(node.id), { method: "DELETE" });
            setStatus("Disabled " + node.id + ".");
            await loadNodes();
          } catch (error) {
            setStatus(error.message, true);
          }
        };

        const enable = document.createElement("button");
        enable.className = "secondary";
        enable.textContent = "Enable";
        enable.disabled = node.active === true;
        enable.onclick = async () => {
          try {
            await request("/v1/admin/nodes/" + encodeURIComponent(node.id), {
              method: "PATCH",
              body: JSON.stringify({ active: true }),
            });
            setStatus("Enabled " + node.id + ".");
            await loadNodes();
          } catch (error) {
            setStatus(error.message, true);
          }
        };

        const del = document.createElement("button");
        del.className = "danger";
        del.textContent = "Delete";
        del.onclick = async () => {
          if (!confirm("Permanently DELETE exit node " + node.id + "? This cannot be undone.")) return;
          try {
            await request("/v1/admin/nodes/" + encodeURIComponent(node.id) + "?hard=1", { method: "DELETE" });
            setStatus("Deleted " + node.id + ".");
            await loadNodes();
          } catch (error) {
            setStatus(error.message, true);
          }
        };

        const actions = document.createElement("div");
        actions.className = "row-actions";
        actions.append(edit, disable, enable, del);
        row.children[6].replaceChildren(actions);
        fields.nodesBody.appendChild(row);
      }
    }

    async function fetchNodeHealth(id, cell) {
      try {
        const h = await request("/v1/admin/nodes/" + encodeURIComponent(id) + "/health");
        const lines = [];
        if (h.latency_ms != null) {
          lines.push(h.latency_ms + " ms" + (h.reachable === false ? " (no reply)" : ""));
        } else {
          lines.push(h.reachable === false ? "unreachable" : "n/a");
        }
        if (h.bandwidth) {
          lines.push("up " + formatBytes(h.bandwidth.tx_bytes) + " / down " + formatBytes(h.bandwidth.rx_bytes));
        } else {
          lines.push("wg n/a");
        }
        const cap = h.capability || {};
        const up = cap.wg_interface_up === false ? "wg down" : "up";
        const peers = cap.peers != null ? cap.peers + " peers" : "";
        const uptime = cap.uptime_s != null ? formatUptime(cap.uptime_s) : "";
        lines.push([up, peers, uptime].filter(Boolean).join(" \u00b7 "));
        cell.textContent = lines.join("\\n");
        cell.title = JSON.stringify(h, null, 2);
      } catch (error) {
        cell.textContent = "n/a";
        cell.title = error.message;
      }
    }

    function formatBytes(bytes) {
      if (bytes == null) return "n/a";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let i = 0;
      let v = bytes;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return v.toFixed(v >= 100 ? 0 : 1) + units[i];
    }

    function formatUptime(seconds) {
      if (seconds < 60) return seconds + "s";
      if (seconds < 3600) return (seconds / 60).toFixed(0) + "m";
      if (seconds < 86400) return (seconds / 3600).toFixed(1) + "h";
      return (seconds / 86400).toFixed(1) + "d";
    }

    async function saveNode() {
      try {
        const payload = formPayload();
        let result;
        if (editingId) {
          result = await request("/v1/admin/nodes/" + encodeURIComponent(editingId), {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          setStatus("Updated " + result.node.id + ".");
        } else {
          const body = { id: fields.nodeId.value.trim(), ...payload };
          result = await request("/v1/admin/nodes", {
            method: "POST",
            body: JSON.stringify(body),
          });
          setStatus("Added " + result.node.id + ".");
        }
        showView("list");
        await loadNodes();
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    // ---------------- Dashboard ----------------
    let statsTimer = null;

    function statCard(num, label, sub) {
      const el = document.createElement("div");
      el.className = "stat-card";
      el.innerHTML = '<div class="num"></div><div class="lbl"></div><div class="sub"></div>';
      el.querySelector(".num").textContent = num;
      el.querySelector(".lbl").textContent = label;
      el.querySelector(".sub").textContent = sub || "";
      return el;
    }

    function renderBars(container, entries, max) {
      container.innerHTML = "";
      if (!entries || !Object.keys(entries).length) {
        container.innerHTML = '<div class="bar-row"><span class="name">No data</span></div>';
        return;
      }
      const total = max || Object.values(entries).reduce((a, b) => a + b, 0) || 1;
      for (const [name, val] of Object.entries(entries).sort((a, b) => b[1] - a[1])) {
        const row = document.createElement("div");
        row.className = "bar-row" + (name === "revoked" ? " alt" : "");
        row.innerHTML = '<span class="name"></span><div class="track"><div class="fill"></div></div><span class="val"></span>';
        row.querySelector(".name").textContent = name;
        row.querySelector(".val").textContent = val;
        row.querySelector(".fill").style.width = Math.round((val / total) * 100) + "%";
        container.appendChild(row);
      }
    }

    function renderUsersByUser(byUser) {
      fields.statsUsers.innerHTML = "";
      if (!byUser.length) {
        fields.statsUsers.innerHTML = '<div class="user-card"><span class="meta">No user-owned devices.</span></div>';
        return;
      }
      for (const u of byUser) {
        const card = document.createElement("div");
        card.className = "user-card";
        const chips = Object.entries(u.platforms || {})
          .map(([p, n]) => '<span class="chip">' + p + ": " + n + "</span>")
          .join("");
        card.innerHTML =
          '<div class="head"><span class="email"></span><span class="meta"></span></div>' +
          '<div class="chips"></div>';
        card.querySelector(".email").textContent = u.email;
        card.querySelector(".meta").textContent =
          u.total + " device(s), " + u.active + " active";
        card.querySelector(".chips").innerHTML = chips;
        fields.statsUsers.appendChild(card);
      }
    }

    function renderOnlineDevices(devices, truncated) {
      const tbody = fields.statsOnline;
      tbody.innerHTML = "";
      if (!devices.length) {
        tbody.innerHTML = '<tr><td colspan="8">Không có thiết bị nào đang kết nối (wg handshake &lt; 3 phút).</td></tr>';
        return;
      }
      for (const d of devices) {
        const tr = document.createElement("tr");
        const cell = (text) => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        };
        cell(d.device_name || (d.device_id ? "device" : "không rõ (chưa đăng ký)"));
        cell(d.platform || "—");
        cell(d.user_email || "—");
        cell(d.node_name + (d.node_location ? " (" + d.node_location + ")" : ""));
        cell(d.client_ip || "—");
        cell(d.isp ? d.isp + (d.country ? " (" + d.country + ")" : "") : "unknown ISP");
        cell(d.connected_sec == null ? "—" : formatUptime(d.connected_sec) + " trước");
        cell(formatBytes(d.rx_bytes) + " ↓ / " + formatBytes(d.tx_bytes) + " ↑");
        tbody.appendChild(tr);
      }
      if (truncated) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 8;
        td.textContent = "Chỉ hiển thị 200 thiết bị đầu tiên.";
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    async function loadStats() {
      try {
        fields.statsStatus.textContent = "Loading stats...";
        const data = await request("/v1/admin/stats");
        const t = data.totals || {};
        fields.statsCards.innerHTML = "";
        fields.statsCards.append(
          statCard(t.devices ?? 0, "Devices", "real, owned by users"),
          statCard(t.users ?? 0, "Users", "accounts"),
          statCard(t.active_devices ?? 0, "Active", "not revoked"),
          statCard(t.online_peers ?? 0, "Online", "wg handshake < 3min"),
          statCard(t.test_devices ?? 0, "Test Devices", "no user (legacy)"),
          statCard(t.revoked_devices ?? 0, "Revoked", "disabled"),
        );
        renderBars(fields.statsPlatform, data.by_platform || {});
        renderUsersByUser(data.by_user || []);

        // Thiết bị đang kết nối theo từng server: nhãn "Tên server · location".
        const perNode = {};
        let maxOnline = 1;
        for (const n of data.by_node || []) {
          const label = n.name + (n.location ? " · " + n.location : "");
          perNode[label] = n.online;
          if (n.online > maxOnline) maxOnline = n.online;
        }
        renderBars(fields.statsNodes, perNode, maxOnline);

        // Location thật (best-effort từ PTR của IP công khai client).
        renderBars(fields.statsRegions, data.by_location || {});

        renderOnlineDevices(data.online_devices || [], data.online_devices_truncated);

        const totals = data.connections_totals || {};
        fields.statsStatus.style.color = "";
        fields.statsStatus.textContent =
          "Generated " + new Date(data.generated_at).toLocaleString() +
          " · " + (totals.online ?? 0) + " online / " + (totals.total ?? 0) + " peer" +
          " trên " + (totals.nodes ?? 0) + " server · " +
          Object.keys(data.by_location || {}).length + " ISP group(s)";
      } catch (error) {
        fields.statsStatus.textContent = error.message;
        fields.statsStatus.style.color = "var(--danger)";
      }
    }

    fields.loadStats.onclick = loadStats;
    let autoStatsOn = false;
    fields.autoStats.onclick = () => {
      autoStatsOn = !autoStatsOn;
      fields.autoStats.textContent = "Auto-refresh: " + (autoStatsOn ? "ON (30s)" : "OFF");
      fields.autoStats.classList.toggle("active", autoStatsOn);
      if (autoStatsOn) {
        statsTimer = setInterval(loadStats, 30000);
        loadStats();
      } else if (statsTimer) {
        clearInterval(statsTimer);
        statsTimer = null;
      }
    };

    // ---------------- Payments ----------------
    async function loadPayments() {
      try {
        fields.paymentsStatus.textContent = "Loading...";
        const data = await request("/v1/admin/payments/pending");
        // Mới nhất lên trên rồi mới phân trang; adminPaginate tự kẹp trang khi
        // danh sách ngắn lại sau khi xoá.
        paymentsState.all = adminSortByTimeDesc(data.orders || [], function (o) { return o.createdAt; });
        renderPayments();
        fields.paymentsStatus.textContent = paymentsState.all.length + " don.";
      } catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    function renderPayments() {
      const view = adminPaginate(paymentsState.all, paymentsState.page, ADMIN_PAGE_SIZE);
      paymentsState.page = view.page;
      adminUpdatePager(fields.paymentsPrev, fields.paymentsNext, fields.paymentsPageInfo, fields.paymentsTotal, view, "don");
      fields.paymentsBody.innerHTML = "";
      if (!view.items.length) {
        fields.paymentsBody.innerHTML = '<tr><td colspan="10">Khong co don cho xac nhan.</td></tr>';
        return;
      }
      for (const o of view.items) {
        const tr = document.createElement("tr");
        const isPaid = Boolean(o.paid);
        tr.innerHTML = "<td>#" + o.orderCode + "</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
        const tds = tr.querySelectorAll("td");
        const amt = o.amount != null ? o.amount.toLocaleString("vi-VN") + " d" : "-";
        tds[1].textContent = o.email;
        tds[2].innerHTML = "<b>" + o.plan_label + "</b><br><small style='color:var(--muted)'>" + (o.days ? o.days + " ngay" : "") + "</small>";
        tds[3].textContent = o.method || "-";
        tds[4].textContent = amt;
        tds[5].textContent = new Date(o.createdAt).toLocaleString();
        tds[6].textContent = o.activatedAt ? new Date(o.activatedAt).toLocaleString() : "-";
        tds[7].textContent = o.expiresAt ? new Date(o.expiresAt).toLocaleString() : "-";
        tds[8].textContent = isPaid ? "Da kich hoat" : "Cho xac nhan";
        tds[8].style.color = isPaid ? "var(--accent)" : "var(--warning)";
        if (!isPaid) {
          const btn = document.createElement("button");
          btn.textContent = "Xac nhan da nhan tien";
          btn.onclick = () => confirmOrder(o.orderCode);
          tds[9].appendChild(btn);

          const remindBtn = document.createElement("button");
          remindBtn.className = "secondary";
          remindBtn.textContent = "Nhắc CK";
          remindBtn.style.marginLeft = "6px";
          remindBtn.onclick = () => remindOne(o.orderCode);
          tds[9].appendChild(remindBtn);
        }
        // Nút Xoá có trên MỌI dòng; server từ chối (409) đơn đã thanh toán.
        const delBtn = document.createElement("button");
        delBtn.className = "secondary";
        delBtn.textContent = "Xoá";
        delBtn.style.marginLeft = "6px";
        delBtn.onclick = () => deleteOrder(o.orderCode);
        tds[9].appendChild(delBtn);
        fields.paymentsBody.appendChild(tr);
      }
    }

    async function confirmOrder(orderCode) {
      if (!confirm("Xac nhan da nhan tien don #" + orderCode + "? Premium se kich hoat ngay.")) return;
      try { await request("/v1/admin/payments/" + orderCode + "/confirm", { method: "POST" }); loadPayments(); }
      catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    async function deleteOrder(orderCode) {
      if (!confirm("Xoá đơn #" + orderCode + "? Chỉ xoá được đơn CHƯA thanh toán — không thể hoàn tác.")) return;
      try {
        await request("/v1/admin/payments/" + orderCode, { method: "DELETE" });
        fields.paymentsStatus.textContent = "Đã xoá đơn #" + orderCode + ".";
        await loadPayments();
      } catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    async function deleteAllUnpaid() {
      const unpaid = paymentsState.all.filter(function (o) { return !o.paid; });
      if (!unpaid.length) { fields.paymentsStatus.textContent = "Không có đơn chưa thanh toán."; return; }
      if (!confirm("Xoá TẤT CẢ " + unpaid.length + " đơn chưa thanh toán? Không thể hoàn tác.")) return;
      try {
        const r = await request("/v1/admin/payments", { method: "DELETE" });
        fields.paymentsStatus.textContent = "Đã xoá " + (r.removed || 0) + " đơn chưa thanh toán.";
        await loadPayments();
      } catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    function reminderSummary(r) {
      const parts = ["Đã gửi " + (r.sent || 0), "bỏ qua " + (r.skipped || 0), "lỗi " + (r.failed || 0)];
      if (r.dry) parts.unshift("Chạy thử (không gửi thật)");
      return parts.join(" · ");
    }

    async function remindAll() {
      const dry = Boolean(fields.remindDryRun && fields.remindDryRun.checked);
      if (!dry && !confirm("Gửi nhắc chuyển tiền cho tối đa 50 đơn đủ điều kiện? Đơn đã nhắc trong 24h sẽ bị bỏ qua.")) return;
      try {
        fields.paymentsStatus.textContent = "Đang gửi...";
        const r = await request("/v1/admin/payments/remind" + (dry ? "?dry=1" : ""), { method: "POST" });
        fields.paymentsStatus.textContent = reminderSummary(r);
        if (!dry) await loadPayments();
      } catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    async function remindOne(orderCode) {
      const dry = Boolean(fields.remindDryRun && fields.remindDryRun.checked);
      if (!dry && !confirm("Gửi email nhắc chuyển tiền cho đơn #" + orderCode + "?")) return;
      try {
        const r = await request("/v1/admin/payments/remind" + (dry ? "?dry=1" : ""), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderCode: orderCode }),
        });
        fields.paymentsStatus.textContent = "Đơn #" + orderCode + ": " + reminderSummary(r);
        if (!dry) await loadPayments();
      } catch (error) { fields.paymentsStatus.textContent = error.message; }
    }

    fields.loadPayments.onclick = loadPayments;
    fields.deleteUnpaidPayments.onclick = deleteAllUnpaid;
    fields.remindAllPayments.onclick = remindAll;
    fields.paymentsPrev.onclick = function () { paymentsState.page -= 1; renderPayments(); };
    fields.paymentsNext.onclick = function () { paymentsState.page += 1; renderPayments(); };

    // ---------------- Bảng gói bán (giá/thời hạn sửa được, không cần deploy) ----------------
    // Sửa thẳng trong bảng rồi bấm Save: mỗi gói chỉ có 4 field ngắn nên không cần
    // màn hình edit riêng như Nodes. Retire = ngừng bán, KHÔNG xoá gói.
    async function loadPlans() {
      try {
        fields.plansStatus.textContent = "Loading...";
        const data = await request("/v1/admin/plans");
        const plans = data.plans || [];
        renderPlans(plans);
        const sellable = plans.filter((p) => p.retired !== true).length;
        fields.plansStatus.textContent = plans.length + " gói · đang bán " + sellable + ".";
      } catch (error) {
        fields.plansStatus.textContent = error.message;
      }
    }

    function renderPlans(plans) {
      if (!plans.length) {
        fields.plansBody.innerHTML = '<tr><td colspan="7">Chưa có gói nào.</td></tr>';
        return;
      }
      fields.plansBody.innerHTML = "";
      for (const plan of plans) {
        const row = document.createElement("tr");
        row.innerHTML = [
          '<td data-label="ID"><code></code></td>',
          '<td data-label="Giá (VND)"><input class="planAmount" type="number" min="1" step="1000"></td>',
          '<td data-label="Số ngày"><input class="planDays" type="number" min="1" step="1" placeholder="vĩnh viễn"></td>',
          '<td data-label="Label"><input class="planLabel" type="text" maxlength="120"></td>',
          '<td data-label="Badge"><input class="planBadge" type="text" maxlength="40"></td>',
          '<td data-label="Trạng thái"></td>',
          '<td data-label="Actions"></td>',
        ].join("");
        row.children[0].querySelector("code").textContent = plan.id;
        const amountIn = row.querySelector(".planAmount");
        amountIn.value = plan.amount;
        const daysIn = row.querySelector(".planDays");
        daysIn.value = plan.days == null ? "" : plan.days;
        const labelIn = row.querySelector(".planLabel");
        labelIn.value = plan.label || "";
        const badgeIn = row.querySelector(".planBadge");
        badgeIn.value = plan.badge || "";
        row.children[5].innerHTML = plan.retired === true
          ? '<span class="badge mute">Ngừng bán</span>'
          : '<span class="badge ok">Đang bán</span>';

        const save = document.createElement("button");
        save.className = "secondary";
        save.textContent = "Save";
        save.onclick = async () => {
          const daysRaw = String(daysIn.value).trim();
          await savePlan(plan.id, {
            amount: Number(amountIn.value),
            days: daysRaw === "" ? null : Number(daysRaw),
            label: String(labelIn.value).trim(),
            badge: String(badgeIn.value).trim(),
          });
        };

        const toggle = document.createElement("button");
        toggle.className = plan.retired === true ? "secondary" : "danger";
        toggle.textContent = plan.retired === true ? "Activate" : "Retire";
        toggle.onclick = async () => {
          if (plan.retired !== true && !confirm("Ngừng bán gói " + plan.id + "? Đơn và hoá đơn cũ vẫn giữ nguyên tên gói.")) return;
          try {
            if (plan.retired === true) {
              await request("/v1/admin/plans/" + encodeURIComponent(plan.id), {
                method: "PATCH",
                body: JSON.stringify({ retired: false }),
              });
              fields.plansStatus.textContent = "Đã mở bán lại " + plan.id + ".";
            } else {
              await request("/v1/admin/plans/" + encodeURIComponent(plan.id) + "/retire", { method: "POST" });
              fields.plansStatus.textContent = "Đã ngừng bán " + plan.id + " — trang /buy không còn gói này.";
            }
            await loadPlans();
          } catch (error) {
            fields.plansStatus.textContent = error.message;
          }
        };

        const actions = document.createElement("div");
        actions.className = "row-actions";
        actions.appendChild(save);
        actions.appendChild(toggle);
        row.children[6].appendChild(actions);
        fields.plansBody.appendChild(row);
      }
    }

    async function savePlan(id, patch) {
      try {
        await request("/v1/admin/plans/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(patch) });
        fields.plansStatus.textContent = "Đã lưu " + id + " — trang /buy dùng giá mới ngay.";
        await loadPlans();
      } catch (error) {
        fields.plansStatus.textContent = error.message;
      }
    }

    async function addPlan() {
      const daysRaw = String(fields.newPlanDays.value).trim();
      const payload = {
        id: String(fields.newPlanId.value).trim(),
        amount: Number(fields.newPlanAmount.value),
        days: daysRaw === "" ? null : Number(daysRaw),
        label: String(fields.newPlanLabel.value).trim(),
        badge: String(fields.newPlanBadge.value).trim(),
      };
      if (!payload.id || !payload.label) {
        fields.addPlanStatus.textContent = "Cần nhập ID và Label.";
        return;
      }
      try {
        await request("/v1/admin/plans", { method: "POST", body: JSON.stringify(payload) });
        fields.addPlanStatus.textContent = "✅ Đã thêm gói " + payload.id + ".";
        fields.newPlanId.value = "";
        fields.newPlanAmount.value = "";
        fields.newPlanDays.value = "";
        fields.newPlanLabel.value = "";
        fields.newPlanBadge.value = "";
        await loadPlans();
      } catch (error) {
        fields.addPlanStatus.textContent = error.message;
      }
    }

    if (fields.loadPlans) fields.loadPlans.onclick = loadPlans;
    if (fields.addPlanBtn) fields.addPlanBtn.onclick = addPlan;

    // ---------------- MeetFlow AI Pro (web purchases) ----------------
    async function loadAi() {
      try {
        fields.aiStatus.textContent = "Loading...";
        const data = await request("/v1/admin/ai/payments/pending");
        const orders = data.orders || [];
        fields.aiBody.innerHTML = "";
        if (!orders.length) fields.aiBody.innerHTML = '<tr><td colspan="9">Khong co don cho xac nhan.</td></tr>';
        for (const o of orders) {
          const tr = document.createElement("tr");
          tr.innerHTML = "<td>#" + o.orderCode + "</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
          const tds = tr.querySelectorAll("td");
          tds[1].textContent = o.email;
          tds[2].textContent = o.plan;
          tds[3].textContent = o.method || "-";
          tds[4].textContent = "-";
          tds[5].textContent = new Date(o.createdAt).toLocaleString();
          tds[6].textContent = o.lang || "-";
          tds[7].textContent = "Cho xac nhan";
          tds[7].style.color = "var(--warning)";
          const btn = document.createElement("button");
          btn.textContent = "Xac nhan da nhan tien";
          btn.onclick = () => confirmAiOrder(o.orderCode);
          tds[8].appendChild(btn);
          fields.aiBody.appendChild(tr);
        }
        fields.aiStatus.textContent = orders.length + " don cho xac nhan.";

        const entData = await request("/v1/admin/ai/entitlements");
        const ents = entData.entitlements || [];
        fields.aiEntBody.innerHTML = "";
        if (!ents.length) fields.aiEntBody.innerHTML = '<tr><td colspan="6">Chua co khach nao.</td></tr>';
        for (const e of ents) {
          const active = !e.expiresAt || Date.parse(e.expiresAt) > Date.now();
          const tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td>";
          const tds = tr.querySelectorAll("td");
          tds[0].textContent = e.email;
          tds[1].textContent = e.plan || "-";
          tds[2].textContent = e.grantedAt ? new Date(e.grantedAt).toLocaleString() : "-";
          tds[3].textContent = e.expiresAt ? new Date(e.expiresAt).toLocaleString() : "Khong gioi han";
          tds[4].textContent = e.orderCode ? "#" + e.orderCode : "-";
          tds[5].textContent = active ? "Dang hoat dong" : "Het han";
          tds[5].style.color = active ? "var(--accent)" : "var(--muted)";
          fields.aiEntBody.appendChild(tr);
        }
      } catch (error) { fields.aiStatus.textContent = error.message; }
    }

    async function confirmAiOrder(orderCode) {
      if (!confirm("Xac nhan da nhan tien don MeetFlow AI #" + orderCode + "? Pro se kich hoat ngay.")) return;
      try {
        const data = await request("/v1/admin/ai/payments/" + orderCode + "/confirm", { method: "POST" });
        if (fields.aiStatus) {
          fields.aiStatus.textContent = data && data.mailSent
            ? "✅ Đã kích hoạt #" + orderCode + " — hoá đơn/xác nhận đã gửi tới " + (data.email || "khách")
            : "⚠️ Đã kích hoạt #" + orderCode + " nhưng CHƯA gửi được email hoá đơn — kiểm tra SMTP";
        }
        loadAi();
      } catch (error) { fields.aiStatus.textContent = error.message; }
    }

    // ---------------- MeetFlow AI users (dashboard + support actions) ----------------
    // rows: dữ liệu đã lọc/sắp từ server; page: trang hiện tại (adminPaginate tự kẹp).
    var aiuState = { rows: [], stats: null, firebase: null, page: 1 };
    var aiuSearchTimer = null;

    function aiuNum(value) {
      return Number(value || 0).toLocaleString("vi-VN");
    }

    function aiuMoney(value) {
      return aiuNum(value) + "d";
    }

    function aiuFmtDate(iso) {
      if (!iso) return "-";
      var d = new Date(iso);
      return isNaN(d.getTime()) ? "-" : d.toLocaleString("vi-VN");
    }

    function aiuFmtDay(iso) {
      if (!iso) return "-";
      var d = new Date(iso);
      return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("vi-VN");
    }

    function aiuLeftText(pro) {
      if (!pro) return "-";
      if (pro.status === "lifetime") return "vĩnh viễn";
      if (pro.daysLeft === null || pro.daysLeft === undefined) return "-";
      if (pro.daysLeft <= 0) return "đã hết";
      return pro.daysLeft + " ngày";
    }

    function aiuStatusBadge(pro) {
      var map = {
        lifetime: ["Trọn đời", "ok"],
        active: ["Hoạt động", "ok"],
        expiring: ["Sắp hết hạn", "warn"],
        expired: ["Hết hạn", "bad"],
        none: ["Chưa có Pro", "mute"],
      };
      var item = map[pro.status] || map.none;
      var span = document.createElement("span");
      span.className = "badge " + item[1];
      span.textContent = item[0];
      return span;
    }

    function aiuSourceChips(sources) {
      var wrap = document.createElement("div");
      var labels = { firebase: "firebase", app: "app", purchase: "đơn hàng", pro: "pro", admin: "admin", store: "google play" };
      for (var i = 0; i < (sources || []).length; i++) {
        var chip = document.createElement("span");
        chip.className = "src-chip";
        chip.textContent = labels[sources[i]] || sources[i];
        wrap.appendChild(chip);
      }
      if (!wrap.childNodes.length) {
        var none = document.createElement("span");
        none.className = "src-chip";
        none.textContent = "-";
        wrap.appendChild(none);
      }
      return wrap;
    }

    function aiuQueryString() {
      var params = [];
      params.push("q=" + encodeURIComponent(fields.aiuSearch ? fields.aiuSearch.value.trim() : ""));
      params.push("status=" + encodeURIComponent(fields.aiuStatus ? fields.aiuStatus.value : "all"));
      params.push("source=" + encodeURIComponent(fields.aiuSource ? fields.aiuSource.value : "all"));
      params.push("sort=" + encodeURIComponent(fields.aiuSort ? fields.aiuSort.value : "recent"));
      params.push("limit=" + encodeURIComponent(fields.aiuLimit ? fields.aiuLimit.value : "200"));
      return params.join("&");
    }

    function aiuRenderCards(stats) {
      if (!fields.aiuCards) return;
      fields.aiuCards.innerHTML = "";
      var cards = [
        ["Tổng user biết được", aiuNum(stats.total), "registry + Firebase", "count"],
        ["Pro đang hoạt động", aiuNum(stats.proActive + stats.proLifetime), (stats.proLifetime || 0) + " trọn đời", ""],
        ["Sắp hết hạn (<=7 ngày)", aiuNum(stats.proExpiring), "cần nhắc gia hạn", "warn"],
        ["Đã hết hạn", aiuNum(stats.proExpired), "", ""],
        ["Chưa thấy gói (web)", aiuNum(stats.noPro), "chưa gồm Google Play / App Store", ""],
        ["User mới 30 ngày", aiuNum(stats.newLast30), "", ""],
        ["Khách đã trả tiền", aiuNum(stats.paidUsers), aiuNum(stats.ordersPaid) + " đơn đã xác nhận", ""],
        ["Doanh thu Pro (web)", aiuMoney(stats.revenue), aiuNum(stats.ordersPending) + " đơn chờ xác nhận", "revenue"],
        ["Gói mua qua store", aiuNum(stats.storePurchases || 0),
          aiuNum(stats.storeVerified || 0) + " đã xác thực · " + aiuNum(stats.storeActive || 0) + " đang hiệu lực", ""],
        ["Chưa xác thực email", aiuNum((stats.firebase && stats.firebase.unverified) || 0),
          "tự động nhắc tối đa " + "3 lần, cách nhau 7 ngày", stats.firebase && stats.firebase.unverified ? "warn" : ""],
        ["Tài khoản Firebase", stats.firebase && stats.firebase.configured ? aiuNum(stats.firebase.count) : "chưa kết nối",
          stats.firebase && stats.firebase.linked ? aiuNum(stats.firebase.linked) + " khớp với dữ liệu Pro" : "dán key ở khung phía trên", ""],
      ];
      for (var i = 0; i < cards.length; i++) {
        var card = document.createElement("div");
        card.className = "stat-card";
        var num = document.createElement("div");
        num.className = "num " + (cards[i][3] === "revenue" ? "kpi-value revenue" : "");
        num.textContent = cards[i][1];
        num.style.color = cards[i][3] === "revenue" ? "#58e694" : "";
        if (cards[i][3] === "warn") num.style.color = "var(--warning)";
        var lbl = document.createElement("div");
        lbl.className = "lbl";
        lbl.textContent = cards[i][0];
        var sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = cards[i][2];
        card.appendChild(num); card.appendChild(lbl); card.appendChild(sub);
        fields.aiuCards.appendChild(card);
      }
    }

    function aiuRenderBars(target, series, pick, money) {
      if (!target) return;
      target.innerHTML = "";
      var max = 0;
      for (var i = 0; i < series.length; i++) max = Math.max(max, pick(series[i]));
      if (!max) max = 1;
      for (var j = 0; j < series.length; j++) {
        var value = pick(series[j]);
        var row = document.createElement("div");
        row.className = "mb-row";
        var name = document.createElement("div");
        name.className = "mb-name";
        name.textContent = series[j].month;
        var track = document.createElement("div");
        track.className = "mb-track";
        var fill = document.createElement("div");
        fill.className = "mb-fill";
        fill.style.width = Math.round((value / max) * 100) + "%";
        track.appendChild(fill);
        var val = document.createElement("div");
        val.className = "mb-val";
        val.textContent = money ? aiuMoney(value) : aiuNum(value);
        row.appendChild(name); row.appendChild(track); row.appendChild(val);
        target.appendChild(row);
      }
    }

    function aiuRenderSourcePanel(firebase, stats) {
      if (!fields.aiuSourcePanel) return;
      var ok = firebase && firebase.configured && !firebase.error;
      fields.aiuSourcePanel.className = "fb-panel" + (ok ? " ok" : "");
      if (ok) {
        fields.aiuSourceTitle.textContent = "Firebase đã kết nối" + (firebase.projectId ? " (" + firebase.projectId + ")" : "");
        fields.aiuSourceBody.innerHTML = "";
        fields.aiuSourceBody.textContent =
          aiuNum(firebase.count) + " tài khoản Firebase Auth: " +
          aiuNum((stats.firebase && stats.firebase.linked) || 0) + " có email (hiện trong bảng bên dưới), " +
          aiuNum((stats.firebase && stats.firebase.anonymous) || 0) + " tài khoản ẩn danh không có email. " +
          aiuNum((stats.firebase && stats.firebase.unverified) || 0) + " chưa xác thực email · " +
          aiuNum((stats.firebase && stats.firebase.disabled) || 0) + " đang bị khoá.";
      } else if (firebase && firebase.error) {
        fields.aiuSourceTitle.textContent = "Firebase đã cấu hình nhưng đọc lỗi";
        fields.aiuSourceBody.textContent = firebase.error;
      } else {
        fields.aiuSourceTitle.textContent = "Chưa kết nối Firebase Authentication";
        fields.aiuSourceBody.textContent =
          "Đang hiển thị user mà hệ thống thanh toán tự biết: khách đã mua Pro, đơn hàng, và các email app đã liên hệ. " +
          "Để thấy toàn bộ tài khoản đăng ký (kể cả chưa trả tiền), dán service account JSON ở khung bên dưới.";
      }
    }

    async function loadAiUsers() {
      if (!fields.aiuBody) return;
      try {
        fields.aiuStatusLine.textContent = "Đang tải...";
        var data = await request("/v1/admin/ai/users?" + aiuQueryString());
        aiuState.rows = data.users || [];
        // Mặc định "hoạt động gần nhất": AI users chỉ có lastSeen/firstSeen (không
        // có created_at). Các kiểu sắp xếp khác đã do server trả về sẵn.
        if ((fields.aiuSort ? fields.aiuSort.value : "recent") === "recent") {
          aiuState.rows = adminSortByTimeDesc(aiuState.rows, function (r) { return r.lastSeen; });
        }
        aiuState.stats = data.stats || {};
        aiuState.firebase = data.firebase || {};
        aiuRenderCards(aiuState.stats);
        aiuRenderSourcePanel(data.firebase, aiuState.stats);
        var series = (aiuState.stats && aiuState.stats.series) || [];
        aiuRenderBars(fields.aiuRevenueBars, series, function (s) { return s.revenue; }, true);
        aiuRenderBars(fields.aiuNewUserBars, series, function (s) { return s.newUsers; }, false);
        aiuRenderRows();
        aiuRenderStorePanel(data.play, aiuState.stats);
        fields.aiuStatusLine.textContent =
          "Hiển thị " + aiuState.rows.length + "/" + aiuNum(data.total) + " user (tổng " + aiuNum(data.totalKnown) + ")" +
          " · cập nhật " + new Date(data.generatedAt).toLocaleTimeString("vi-VN");
      } catch (error) {
        fields.aiuStatusLine.textContent = error.message;
      }
    }

    function aiuRenderRows() {
      // Server đã lọc/sắp trên toàn bộ dữ liệu; ở đây chỉ cắt trang bằng đúng
      // helper chung (tự kẹp về trang cuối khi refresh làm danh sách ngắn lại).
      var view = adminPaginate(aiuState.rows, aiuState.page, ADMIN_PAGE_SIZE);
      aiuState.page = view.page;
      adminUpdatePager(fields.aiuPrev, fields.aiuNext, fields.aiuPageInfo, fields.aiuTotal, view, "user");
      var rows = view.items;
      fields.aiuBody.innerHTML = "";
      if (!rows.length) {
        fields.aiuBody.innerHTML = '<tr><td colspan="10">Không có user nào khớp bộ lọc.</td></tr>';
        return;
      }
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var tr = document.createElement("tr");
        tr.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
        var tds = tr.querySelectorAll("td");

        var mail = document.createElement("div");
        mail.textContent = r.email;
        mail.style.fontWeight = "600";
        if (r.firebase && r.firebase.disabled) {
          var lock = document.createElement("span");
          lock.className = "badge bad";
          lock.textContent = "bị khoá";
          lock.style.marginLeft = "6px";
          mail.appendChild(lock);
        }
        tds[0].appendChild(mail);

        tds[1].appendChild(aiuSourceChips(r.sources));
        tds[2].appendChild(aiuStatusBadge(r.pro));
        tds[3].textContent = r.pro.plan || "-";
        tds[4].textContent = r.pro.lifetime ? "không giới hạn" : aiuFmtDay(r.pro.expiresAt);
        tds[5].textContent = aiuLeftText(r.pro);
        tds[6].textContent = r.orders.count ? aiuNum(r.orders.count) + (r.orders.pending ? " (" + r.orders.pending + " chờ)" : "") : "-";
        tds[7].textContent = r.orders.amount ? aiuMoney(r.orders.amount) : "-";
        tds[8].textContent = aiuFmtDay(r.lastSeen) + (r.inRegistry ? "" : " (Firebase)");

        // Cùng cách bố trí như tab Users: nhóm chức năng tách bằng vạch ngăn, nút cùng hàng cùng cỡ.
        var actions = document.createElement("div");
        actions.className = "row-actions act-groups";

        var infoGroup = document.createElement("div");
        infoGroup.className = "act-group";
        var detail = document.createElement("button");
        detail.className = "secondary";
        detail.textContent = "Chi tiết";
        detail.onclick = function (email) { return function () { aiuShowDetail(email); }; }(r.email);
        infoGroup.appendChild(detail);
        actions.appendChild(infoGroup);

        actions.appendChild(aiuSep());

        var grantGroup = document.createElement("div");
        grantGroup.className = "act-group";
        var grantLabel = document.createElement("span");
        grantLabel.className = "act-label";
        grantLabel.textContent = "Cấp hạn";
        grantGroup.appendChild(grantLabel);

        var extend = document.createElement("button");
        extend.textContent = "+30 ngày";
        extend.onclick = function (email) { return function () { aiuGrant(email, 30); }; }(r.email);
        grantGroup.appendChild(extend);

        var year = document.createElement("button");
        year.textContent = "+1 năm";
        year.onclick = function (email) { return function () { aiuGrant(email, 365); }; }(r.email);
        grantGroup.appendChild(year);
        actions.appendChild(grantGroup);

        if (r.pro.active) {
          actions.appendChild(aiuSep());
          var revokeGroup = document.createElement("div");
          revokeGroup.className = "act-group";
          var revoke = document.createElement("button");
          revoke.className = "danger";
          revoke.textContent = "Thu hồi";
          revoke.onclick = function (email) { return function () { aiuRevoke(email); }; }(r.email);
          revokeGroup.appendChild(revoke);
          actions.appendChild(revokeGroup);
        }
        tds[9].appendChild(actions);
        fields.aiuBody.appendChild(tr);
      }
    }

    /** Vạch ngăn dọc giữa hai nhóm chức năng trong ô Actions (xem CSS .act-groups). */
    function aiuSep() {
      var sep = document.createElement("span");
      sep.className = "act-sep";
      return sep;
    }

    function aiuDetailItem(label, value) {
      var wrap = document.createElement("div");
      wrap.className = "d-item";
      var l = document.createElement("div");
      l.className = "d-lbl";
      l.textContent = label;
      var v = document.createElement("div");
      v.className = "d-val";
      v.textContent = value;
      wrap.appendChild(l); wrap.appendChild(v);
      return wrap;
    }

    async function aiuShowDetail(email) {
      if (!fields.aiuDetail) return;
      try {
        fields.aiuDetail.classList.remove("hidden");
        fields.aiuDetail.innerHTML = '<div class="meta">Đang tải chi tiết...</div>';
        var data = await request("/v1/admin/ai/users/" + encodeURIComponent(email));
        var u = data.user;
        fields.aiuDetail.innerHTML = "";

        var head = document.createElement("div");
        head.className = "head";
        var mailEl = document.createElement("span");
        mailEl.className = "email";
        mailEl.textContent = u.email;
        head.appendChild(mailEl);
        head.appendChild(aiuStatusBadge(u.pro));
        var close = document.createElement("button");
        close.className = "secondary";
        close.textContent = "Đóng";
        close.style.marginLeft = "auto";
        close.onclick = function () { fields.aiuDetail.classList.add("hidden"); };
        head.appendChild(close);
        fields.aiuDetail.appendChild(head);

        var grid = document.createElement("div");
        grid.className = "detail-grid";
        grid.appendChild(aiuDetailItem("Gói hiện tại", u.pro.plan || "-"));
        grid.appendChild(aiuDetailItem("Hết hạn", u.pro.lifetime ? "không giới hạn" : aiuFmtDate(u.pro.expiresAt)));
        grid.appendChild(aiuDetailItem("Còn lại", aiuLeftText(u.pro)));
        grid.appendChild(aiuDetailItem("Kích hoạt lần cuối", aiuFmtDate(u.pro.grantedAt)));
        grid.appendChild(aiuDetailItem("Số lần cấp Pro", aiuNum(u.pro.grantCount)));
        grid.appendChild(aiuDetailItem("Tổng đã trả", aiuMoney(u.orders.amount)));
        grid.appendChild(aiuDetailItem("Đơn hàng", aiuNum(u.orders.paid) + " đã trả / " + aiuNum(u.orders.pending) + " chờ"));
        grid.appendChild(aiuDetailItem("Đăng ký (first seen)", aiuFmtDate(u.firstSeen)));
        grid.appendChild(aiuDetailItem("Hoạt động cuối", aiuFmtDate(u.lastSeen)));
        grid.appendChild(aiuDetailItem("Nền tảng", (u.platform || "-") + (u.appVersion ? " · " + u.appVersion : "")));
        grid.appendChild(aiuDetailItem("Nguồn dữ liệu", (u.sources || []).join(", ") || "-"));
        grid.appendChild(aiuDetailItem("Firebase", u.firebase ? (u.firebase.uid + (u.firebase.disabled ? " (đang khoá)" : "")) : "chưa có"));
        fields.aiuDetail.appendChild(grid);

        if (u.note) {
          var note = document.createElement("div");
          note.className = "meta";
          note.style.marginTop = "8px";
          note.textContent = "Ghi chú: " + u.note;
          fields.aiuDetail.appendChild(note);
        }

        var actions = document.createElement("div");
        actions.className = "actions";
        var addMonth = document.createElement("button");
        addMonth.textContent = "Cấp thêm 30 ngày";
        addMonth.onclick = function () { aiuGrant(u.email, 30); };
        var addYear = document.createElement("button");
        addYear.className = "secondary";
        addYear.textContent = "Cấp thêm 1 năm";
        addYear.onclick = function () { aiuGrant(u.email, 365); };
        var notify = document.createElement("button");
        notify.className = "secondary";
        notify.textContent = "Cấp 30 ngày + gửi email";
        notify.onclick = function () { aiuGrant(u.email, 30, true); };
        actions.appendChild(addMonth); actions.appendChild(addYear); actions.appendChild(notify);
        if (u.pro.active) {
          var revoke = document.createElement("button");
          revoke.className = "danger";
          revoke.textContent = "Thu hồi Pro";
          revoke.onclick = function () { aiuRevoke(u.email); };
          actions.appendChild(revoke);
        }
        if (u.firebase && !u.firebase.emailVerified) {
          var remindBtn = document.createElement("button");
          remindBtn.textContent = "📧 Gửi email xác thực";
          remindBtn.onclick = function (uid2, email2) { return function () { remindVerify(uid2, email2); }; }(u.firebase.uid, u.email);
          actions.appendChild(remindBtn);
        }
        if (u.firebase) {
          var lock = document.createElement("button");
          lock.className = "secondary";
          lock.textContent = u.firebase.disabled ? "Mở khoá tài khoản" : "Khoá tài khoản";
          lock.onclick = function () { fbAction(u.firebase.uid, u.firebase.disabled ? "enable" : "disable", u.email); };
          actions.appendChild(lock);
          var reset = document.createElement("button");
          reset.className = "secondary";
          reset.textContent = "Link đặt lại mật khẩu";
          reset.onclick = function () { fbAction(u.firebase.uid, "reset", u.email); };
          actions.appendChild(reset);
        }
        var forget = document.createElement("button");
        forget.className = "secondary";
        forget.textContent = "Xoá khỏi danh sách theo dõi";
        forget.onclick = function () { aiuForget(u.email); };
        actions.appendChild(forget);
        fields.aiuDetail.appendChild(actions);

        var orders = data.orders || [];
        if (orders.length) {
          var title = document.createElement("div");
          title.style.marginTop = "14px";
          title.style.fontWeight = "700";
          title.textContent = "Lịch sử đơn hàng";
          fields.aiuDetail.appendChild(title);
          for (var i = 0; i < orders.length; i++) {
            var o = orders[i];
            var line = document.createElement("div");
            line.className = "meta";
            line.style.marginTop = "4px";
            line.textContent =
              "#" + o.orderCode + " · " + (o.plan || "-") + " · " + (o.method || "-") + " · " +
              (o.paidAt ? "đã nhận tiền " + aiuFmtDate(o.paidAt) : "chờ xác nhận") + " · tạo " + aiuFmtDate(o.createdAt);
            fields.aiuDetail.appendChild(line);
          }
        }
        if (u.pro.history && u.pro.history.length) {
          var hTitle = document.createElement("div");
          hTitle.style.marginTop = "14px";
          hTitle.style.fontWeight = "700";
          hTitle.textContent = "Lịch sử cấp Pro";
          fields.aiuDetail.appendChild(hTitle);
          for (var j = 0; j < u.pro.history.length; j++) {
            var h = u.pro.history[j];
            var hLine = document.createElement("div");
            hLine.className = "meta";
            hLine.style.marginTop = "4px";
            hLine.textContent = aiuFmtDate(h.at) + " · " + (h.plan || "-") + " · " + (h.days ? h.days + " ngày" : "thu hồi") +
              (h.orderCode ? " · đơn #" + h.orderCode : "") + (h.note ? " · " + h.note : "");
            fields.aiuDetail.appendChild(hLine);
          }
        }
      } catch (error) {
        fields.aiuDetail.innerHTML = "";
        var err = document.createElement("div");
        err.className = "meta";
        err.textContent = error.message;
        fields.aiuDetail.appendChild(err);
      }
    }

    async function aiuGrant(email, days, notify) {
      if (!confirm("Cấp/gia hạn " + days + " ngày Pro cho " + email + "?" + (notify ? "\\nEmail thông báo sẽ được gửi." : ""))) return;
      try {
        fields.aiuStatusLine.textContent = "Đang cấp Pro cho " + email + "...";
        await request("/v1/admin/ai/users/" + encodeURIComponent(email) + "/grant", {
          method: "POST",
          body: JSON.stringify({ days: days, notify: notify === true }),
        });
        fields.aiuStatusLine.textContent = "Đã cấp " + days + " ngày cho " + email + ".";
        await loadAiUsers();
        if (fields.aiuDetail && !fields.aiuDetail.classList.contains("hidden")) aiuShowDetail(email);
      } catch (error) {
        fields.aiuStatusLine.textContent = error.message;
      }
    }

    async function aiuRevoke(email) {
      if (!confirm("Thu hồi Pro của " + email + "? Quyền Pro sẽ hết hiệu lực ngay.")) return;
      try {
        await request("/v1/admin/ai/users/" + encodeURIComponent(email) + "/revoke", { method: "POST" });
        fields.aiuStatusLine.textContent = "Đã thu hồi Pro của " + email + ".";
        await loadAiUsers();
        if (fields.aiuDetail && !fields.aiuDetail.classList.contains("hidden")) aiuShowDetail(email);
      } catch (error) {
        fields.aiuStatusLine.textContent = error.message;
      }
    }

    async function aiuForget(email) {
      if (!confirm("Xoá " + email + " khỏi danh sách theo dõi của control plane?\\n(Không ảnh hưởng tài khoản Firebase và lịch sử đơn hàng.)")) return;
      try {
        await request("/v1/admin/ai/users/" + encodeURIComponent(email) + "/forget", { method: "POST" });
        fields.aiuDetail.classList.add("hidden");
        await loadAiUsers();
      } catch (error) {
        fields.aiuStatusLine.textContent = error.message;
      }
    }

    // ---------------- Email verification reminders ----------------
    async function remindVerify(uid, email) {
      if (!confirm("Gửi email nhắc xác thực tới " + email + "?")) return;
      try {
        fields.fbStatus.textContent = "Đang gửi tới " + email + "...";
        var data = await request("/v1/admin/ai/firebase/users/" + encodeURIComponent(uid) + "/verify-email", {
          method: "POST",
          body: JSON.stringify({ email: email }),
        });
        fields.fbStatus.textContent = data.sent
          ? "✅ Đã gửi email xác thực tới " + email + " (lần " + data.count + ")"
          : "⚠️ Chưa gửi được: " + (data.reason || "không rõ") + (data.lastAt ? " · lần trước " + aiuFmtDate(data.lastAt) : "");
        if (data.sent) await loadFirebaseUsers();
      } catch (error) {
        fields.fbStatus.textContent = error.message;
      }
    }

    async function remindVerifyBulk() {
      if (!confirm("Gửi email xác thực cho TẤT CẢ tài khoản chưa xác thực?\\n(Chỉ gửi cho ai chưa được nhắc trong 7 ngày qua, tối đa 3 lần.)")) return;
      try {
        fields.fbStatus.textContent = "Đang gửi hàng loạt...";
        var data = await request("/v1/admin/ai/verify-email/remind", { method: "POST", body: JSON.stringify({}) });
        fields.fbStatus.textContent = "Đã gửi " + data.sent + "/" + data.unverified + " tài khoản chưa xác thực" +
          (data.skipped ? " · " + data.skipped + " bỏ qua (vừa nhắc gần đây hoặc quá số lần)" : "");
        await loadFirebaseUsers();
        await loadAiUsers();
      } catch (error) {
        fields.fbStatus.textContent = error.message;
      }
    }

    // ---------------- Store purchases (Google Play / App Store) ----------------
    function aiuRenderStorePanel(play, stats) {
      if (!fields.storePanel) return;
      var ok = play && play.configured;
      fields.storePanel.className = "fb-panel" + (ok ? " ok" : "");
      if (ok) {
        fields.storeTitle.textContent = "Google Play đã kết nối" + (play.projectId ? " (" + play.projectId + ")" : "");
        fields.storeBody.textContent =
          "Package " + (play.packageName || "?") + " · " + aiuNum((stats && stats.storePurchases) || 0) + " giao dịch app báo về, " +
          aiuNum((stats && stats.storeVerified) || 0) + " đã xác thực với Google, " +
          aiuNum((stats && stats.storeActive) || 0) + " đang còn hiệu lực.";
      } else {
        fields.storeTitle.textContent = "Chưa kết nối Google Play Developer API";
        fields.storeBody.textContent =
          "Giao dịch app báo về vẫn được lưu (" + aiuNum((stats && stats.storePurchases) || 0) + " giao dịch) nhưng " +
          "CHƯA xác thực được nên không tính là Pro. Dán service account JSON của Google Cloud ở khung bên dưới để bật xác thực.";
      }
    }

    async function loadStorePurchases() {
      if (!fields.storeBody2) return;
      try {
        fields.storeStatus.textContent = "Đang tải...";
        var data = await request("/v1/admin/ai/store/purchases");
        aiuRenderStorePanel(data.play, data.summary);
        var rows = data.purchases || [];
        fields.storeBody2.innerHTML = "";
        if (!rows.length) {
          fields.storeBody2.innerHTML = '<tr><td colspan="9">Chưa có giao dịch nào được app báo về.</td></tr>';
        }
        for (var i = 0; i < rows.length; i++) {
          var p = rows[i];
          var tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
          var tds = tr.querySelectorAll("td");
          tds[0].textContent = aiuFmtDate(p.lastReportedAt) + (p.reportCount > 1 ? " (" + p.reportCount + " lần)" : "");
          tds[1].textContent = p.platform === "ios" ? "App Store" : "Google Play";
          var prod = document.createElement("code");
          prod.textContent = p.productId || "-";
          tds[2].appendChild(prod);
          tds[3].textContent = p.plan || "-";
          var who = document.createElement("div");
          who.textContent = p.email || "(chưa biết email)";
          var sub = document.createElement("div");
          sub.className = "meta";
          sub.style.fontSize = "12px";
          sub.textContent = "uid: " + (p.uid || p.obfuscatedAccountId || "-") + (p.orderId ? " · " + p.orderId : "");
          tds[4].appendChild(who); tds[4].appendChild(sub);
          tds[5].textContent = p.expiresAt ? aiuFmtDate(p.expiresAt) : "-";
          tds[6].textContent = p.autoRenewing === true ? "có" : (p.autoRenewing === false ? "không" : "-");
          var badge = document.createElement("span");
          badge.className = "badge " + (p.verified ? (p.active ? "ok" : "warn") : "mute");
          badge.textContent = p.verified ? (p.active ? "đã xác thực · hiệu lực" : "đã xác thực · hết hạn") : "chưa xác thực";
          tds[7].appendChild(badge);
          if (!p.verified && p.verifyError) {
            var err = document.createElement("div");
            err.className = "meta";
            err.style.fontSize = "11.5px";
            err.textContent = p.verifyError.slice(0, 120);
            tds[7].appendChild(err);
          }
          var actions = document.createElement("div");
          actions.className = "row-actions";
          var verify = document.createElement("button");
          verify.className = "secondary";
          verify.textContent = "Xác thực lại";
          verify.onclick = function (tokenId) { return function () { storeVerify(tokenId); }; }(p.tokenId);
          actions.appendChild(verify);
          if (p.email) {
            var grant = document.createElement("button");
            grant.textContent = "Cấp 30 ngày";
            grant.onclick = function (email) { return function () { aiuGrant(email, 30); }; }(p.email);
            actions.appendChild(grant);
          }
          var forget = document.createElement("button");
          forget.className = "danger";
          forget.textContent = "Xoá";
          forget.onclick = function (tokenId) { return function () { storeForget(tokenId); }; }(p.tokenId);
          actions.appendChild(forget);
          tds[8].appendChild(actions);
          fields.storeBody2.appendChild(tr);
        }
        fields.storeStatus.textContent = rows.length + " giao dịch · " + aiuNum(data.summary.verified) +
          " đã xác thực · doanh thu ghi nhận: " + (Object.keys(data.summary.revenue || {}).length
            ? Object.keys(data.summary.revenue).map(function (c) { return aiuNum(Math.round(data.summary.revenue[c])) + " " + c; }).join(", ")
            : "chưa có");
      } catch (error) {
        fields.storeStatus.textContent = error.message;
      }
    }

    async function storeVerify(tokenId) {
      try {
        fields.storeStatus.textContent = "Đang xác thực với Google...";
        var data = await request("/v1/admin/ai/store/purchases/" + encodeURIComponent(tokenId) + "/verify", { method: "POST" });
        fields.storeStatus.textContent = data.verified
          ? "Đã xác thực giao dịch " + tokenId + (data.purchase && data.purchase.expiresAt ? " · hết hạn " + aiuFmtDate(data.purchase.expiresAt) : "")
          : "Chưa xác thực được: " + (data.error || "không rõ lỗi");
        await loadStorePurchases();
        await loadAiUsers();
      } catch (error) {
        fields.storeStatus.textContent = error.message;
      }
    }

    async function storeForget(tokenId) {
      if (!confirm("Xoá giao dịch " + tokenId + " khỏi danh sách?")) return;
      try {
        await request("/v1/admin/ai/store/purchases/" + encodeURIComponent(tokenId) + "/forget", { method: "POST" });
        await loadStorePurchases();
        await loadAiUsers();
      } catch (error) {
        fields.storeStatus.textContent = error.message;
      }
    }

    async function storeSaveCredential() {
      if (!fields.storeCredJson || !fields.storeCredJson.value.trim()) {
        fields.storeBody.textContent = "Dán nội dung file service account JSON của Google Cloud trước.";
        return;
      }
      try {
        fields.storeTitle.textContent = "Đang lưu key Play...";
        var data = await request("/v1/admin/ai/store/credentials", {
          method: "POST",
          body: JSON.stringify({ json: fields.storeCredJson.value.trim() }),
        });
        fields.storeCredJson.value = "";
        fields.storeStatus.textContent = "Đã lưu key Play cho service account " + data.client_email + " · package " + data.packageName;
        await loadStorePurchases();
        await loadAiUsers();
      } catch (error) {
        fields.storeTitle.textContent = "Không lưu được key Play";
        fields.storeBody.textContent = error.message;
      }
    }

    async function storeClearCredential() {
      if (!confirm("Xoá service account key của Google Play đã lưu trên VPS?")) return;
      try {
        await request("/v1/admin/ai/store/credentials", { method: "DELETE" });
        fields.storeStatus.textContent = "Đã xoá key Play.";
        await loadStorePurchases();
      } catch (error) {
        fields.storeStatus.textContent = error.message;
      }
    }

    // ---------------- Firebase Auth accounts ----------------
    async function loadFirebaseUsers() {
      if (!fields.fbBody) return;
      try {
        fields.fbStatus.textContent = "Đang tải từ Firebase...";
        var data = await request("/v1/admin/ai/firebase");
        fields.fbBody.innerHTML = "";
        if (!data.configured) {
          fields.fbBody.innerHTML = '<tr><td colspan="8">Chưa kết nối Firebase — dán service account JSON ở khung phía trên.</td></tr>';
          fields.fbStatus.textContent = "Chưa cấu hình.";
          return;
        }
        if (data.error) {
          fields.fbBody.innerHTML = '<tr><td colspan="8">Lỗi đọc Firebase: xem thông báo bên dưới.</td></tr>';
          fields.fbStatus.textContent = data.error;
          return;
        }
        var users = data.users || [];
        if (!users.length) fields.fbBody.innerHTML = '<tr><td colspan="8">Chưa có tài khoản nào.</td></tr>';
        for (var i = 0; i < users.length; i++) {
          var u = users[i];
          var tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>";
          var tds = tr.querySelectorAll("td");
          tds[0].textContent = u.email || "(không có email)";
          var uid = document.createElement("code");
          uid.textContent = u.uid;
          tds[1].appendChild(uid);
          tds[2].textContent = u.provider || "-";
          tds[3].textContent = aiuFmtDate(u.created);
          tds[4].textContent = aiuFmtDate(u.lastSignIn);
          tds[5].textContent = u.emailVerified ? "đã xác thực" : "chưa xác thực";
          tds[5].style.color = u.emailVerified ? "var(--accent)" : "var(--warning)";
          var state = document.createElement("span");
          state.className = "badge " + (u.disabled ? "bad" : "ok");
          state.textContent = u.disabled ? "đang khoá" : "hoạt động";
          tds[6].appendChild(state);
          if (!u.email) {
            // Anonymous Firebase accounts have no address to verify.
            var anonTag = document.createElement("div");
            anonTag.className = "badge mute";
            anonTag.style.marginTop = "4px";
            anonTag.textContent = "ẩn danh (không có email)";
            tds[6].appendChild(anonTag);
          } else if (!u.emailVerified) {
            var verifyTag = document.createElement("div");
            verifyTag.className = "badge warn";
            verifyTag.style.marginTop = "4px";
            verifyTag.textContent = "chưa xác thực email";
            tds[6].appendChild(verifyTag);
          }

          var actions = document.createElement("div");
          actions.className = "row-actions";
          if (!u.emailVerified && u.email) {
            var remind = document.createElement("button");
            remind.textContent = "Gửi email xác thực";
            remind.onclick = function (uid2, email2) { return function () { remindVerify(uid2, email2); }; }(u.uid, u.email);
            actions.appendChild(remind);
          }
          var lock = document.createElement("button");
          lock.className = "secondary";
          lock.textContent = u.disabled ? "Mở khoá" : "Khoá";
          lock.onclick = function (uid2, disabled) { return function () { fbAction(uid2, disabled ? "enable" : "disable", null); }; }(u.uid, u.disabled);
          actions.appendChild(lock);
          var reset = document.createElement("button");
          reset.className = "secondary";
          reset.textContent = "Reset mật khẩu";
          reset.onclick = function (uid2, email2) { return function () { fbAction(uid2, "reset", email2); }; }(u.uid, u.email);
          actions.appendChild(reset);
          var del = document.createElement("button");
          del.className = "danger";
          del.textContent = "Xoá";
          del.onclick = function (uid2, email2) { return function () { fbAction(uid2, "delete", email2); }; }(u.uid, u.email);
          actions.appendChild(del);
          tds[7].appendChild(actions);
          fields.fbBody.appendChild(tr);
        }
        fields.fbStatus.textContent = users.length + " tài khoản Firebase" + (data.truncated ? " (giới hạn 2000)" : "") +
          (data.projectId ? " · project " + data.projectId : "");
      } catch (error) {
        fields.fbStatus.textContent = error.message;
      }
    }

    async function fbAction(uid, action, email) {
      var labels = { disable: "Khoá", enable: "Mở khoá", delete: "XOÁ VĨNH VIỄN", reset: "Tạo link đặt lại mật khẩu cho" };
      if (action === "reset") {
        if (!email) { alert("Tài khoản này không có email."); return; }
      } else if (!confirm(labels[action] + " tài khoản " + (email || uid) + "?")) {
        return;
      }
      try {
        if (action === "disable" || action === "enable") {
          await request("/v1/admin/ai/firebase/users/" + encodeURIComponent(uid) + "/disable", {
            method: "POST",
            body: JSON.stringify({ disabled: action === "disable" }),
          });
          fields.fbStatus.textContent = (action === "disable" ? "Đã khoá " : "Đã mở khoá ") + (email || uid);
        } else if (action === "delete") {
          await request("/v1/admin/ai/firebase/users/" + encodeURIComponent(uid), { method: "DELETE" });
          fields.fbStatus.textContent = "Đã xoá tài khoản " + (email || uid) + " khỏi Firebase.";
        } else if (action === "reset") {
          var data = await request("/v1/admin/ai/firebase/users/" + encodeURIComponent(uid) + "/password-reset", {
            method: "POST",
            body: JSON.stringify({ email: email }),
          });
          fields.fbStatus.textContent = "Link đặt lại mật khẩu cho " + email + " (gửi cho khách):";
          if (fields.fbBody) {
            var pre = document.createElement("pre");
            pre.textContent = data.link;
            fields.fbBody.appendChild(pre);
          }
          return;
        }
        await loadFirebaseUsers();
        await loadAiUsers();
      } catch (error) {
        fields.fbStatus.textContent = error.message;
      }
    }

    async function aiuSaveCredential() {
      if (!fields.aiuCredJson || !fields.aiuCredJson.value.trim()) {
        fields.aiuSourceBody.textContent = "Dán nội dung file service account JSON trước.";
        return;
      }
      try {
        fields.aiuSourceTitle.textContent = "Đang lưu và kiểm tra key...";
        var data = await request("/v1/admin/ai/firebase/credentials", {
          method: "POST",
          body: JSON.stringify({ json: fields.aiuCredJson.value.trim() }),
        });
        fields.aiuCredJson.value = "";
        fields.aiuSourceTitle.textContent = data.reachable ? "Firebase đã kết nối" : "Đã lưu key nhưng đọc Firebase lỗi";
        fields.aiuSourceBody.textContent = data.reachable
          ? "Project " + (data.projectId || "?") + " · đọc được " + aiuNum(data.count) + " tài khoản."
          : (data.error || "Không rõ lỗi");
        await loadAiUsers();
        await loadFirebaseUsers();
      } catch (error) {
        fields.aiuSourceTitle.textContent = "Không lưu được key";
        fields.aiuSourceBody.textContent = error.message;
      }
    }

    async function aiuClearCredential() {
      if (!confirm("Xoá service account key đã lưu trên VPS?")) return;
      try {
        await request("/v1/admin/ai/firebase/credentials", { method: "DELETE" });
        fields.aiuSourceTitle.textContent = "Đã xoá key Firebase";
        fields.aiuSourceBody.textContent = "Danh sách giờ chỉ còn dữ liệu do hệ thống thanh toán tự biết.";
        fields.fbBody.innerHTML = '<tr><td colspan="8">Chưa kết nối Firebase.</td></tr>';
        fields.fbStatus.textContent = "";
        await loadAiUsers();
      } catch (error) {
        fields.aiuSourceBody.textContent = error.message;
      }
    }

    if (fields.loadAiUsers) fields.loadAiUsers.onclick = loadAiUsers;
    if (fields.loadStore) fields.loadStore.onclick = loadStorePurchases;
    var storeSaveBtn = document.getElementById("storeSaveCred");
    if (storeSaveBtn) storeSaveBtn.onclick = storeSaveCredential;
    var storeClearBtn = document.getElementById("storeClearCred");
    if (storeClearBtn) storeClearBtn.onclick = storeClearCredential;
    if (fields.loadFirebaseUsers) fields.loadFirebaseUsers.onclick = loadFirebaseUsers;
    var remindBulkBtn = document.getElementById("remindVerify");
    if (remindBulkBtn) remindBulkBtn.onclick = remindVerifyBulk;
    // Đổi bộ lọc/sắp xếp → quay về trang 1; Refresh giữ trang để adminPaginate tự kẹp.
    function aiuReloadFromFirstPage() { aiuState.page = 1; loadAiUsers(); }
    if (fields.aiuPrev) fields.aiuPrev.onclick = function () { aiuState.page -= 1; aiuRenderRows(); };
    if (fields.aiuNext) fields.aiuNext.onclick = function () { aiuState.page += 1; aiuRenderRows(); };
    if (fields.aiuStatus) fields.aiuStatus.onchange = aiuReloadFromFirstPage;
    if (fields.aiuSource) fields.aiuSource.onchange = aiuReloadFromFirstPage;
    if (fields.aiuSort) fields.aiuSort.onchange = aiuReloadFromFirstPage;
    if (fields.aiuLimit) fields.aiuLimit.onchange = aiuReloadFromFirstPage;
    if (fields.aiuSearch) {
      fields.aiuSearch.oninput = function () {
        clearTimeout(aiuSearchTimer);
        aiuSearchTimer = setTimeout(aiuReloadFromFirstPage, 350);
      };
    }
    if (fields.aiuExport) {
      fields.aiuExport.onclick = function () {
        var base = (fields.baseUrl.value || "").replace(/\\/$/, "");
        var url = base + "/v1/admin/ai/users.csv?" + aiuQueryString();
        fetch(url, { headers: { "Authorization": "Bearer " + fields.token.value.trim() } })
          .then(function (res) { return res.blob(); })
          .then(function (blob) {
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "meetflow-ai-users.csv";
            link.click();
            URL.revokeObjectURL(link.href);
          })
          .catch(function (error) { fields.aiuStatusLine.textContent = error.message; });
      };
    }
    var aiuSaveBtn = document.getElementById("aiuSaveCred");
    if (aiuSaveBtn) aiuSaveBtn.onclick = aiuSaveCredential;
    var aiuClearBtn = document.getElementById("aiuClearCred");
    if (aiuClearBtn) aiuClearBtn.onclick = aiuClearCredential;

    if (fields.loadAi) fields.loadAi.onclick = loadAi;

    document.getElementById("areaVpn").onclick = () => showArea("vpn");
    document.getElementById("areaAi").onclick = () => showArea("ai");
    document.getElementById("areaSystem").onclick = () => showArea("system");
    document.getElementById("tabNodes").onclick = () => showTab("nodes");
    document.getElementById("tabUsers").onclick = () => showTab("users");
    document.getElementById("tabIos").onclick = () => showTab("ios");
    document.getElementById("tabStats").onclick = () => showTab("stats");
    document.getElementById("tabPayments").onclick = () => showTab("payments");
    document.getElementById("tabPlans").onclick = () => showTab("plans");
    document.getElementById("tabAi").onclick = () => showTab("ai");
    document.getElementById("tabAiUsers").onclick = () => showTab("aiu");
    document.getElementById("loadUsers").onclick = loadUsers;
    document.getElementById("loadIos").onclick = loadIosDevices;

    // Phân trang + lọc cho bảng Users và UDID (lọc client trên toàn bộ dữ liệu).
    if (fields.usersPrev) fields.usersPrev.onclick = function () { usersState.page -= 1; renderUsers(); };
    if (fields.usersNext) fields.usersNext.onclick = function () { usersState.page += 1; renderUsers(); };
    if (fields.usersSearch) {
      fields.usersSearch.oninput = function () { usersState.page = 1; renderUsers(); };
    }
    if (fields.iosPrev) fields.iosPrev.onclick = function () { iosState.page -= 1; renderIosDevices(); };
    if (fields.iosNext) fields.iosNext.onclick = function () { iosState.page += 1; renderIosDevices(); };
    if (fields.iosSearch) {
      fields.iosSearch.oninput = function () { iosState.page = 1; renderIosDevices(); };
    }
    document.getElementById("ascSave").onclick = saveAscCredential;
    document.getElementById("ascClear").onclick = clearAscCredential;
    document.getElementById("ascRegisterAll").onclick = registerAllApple;
    document.getElementById("addUserBtn").onclick = addUser;
    document.getElementById("loadNodes").onclick = loadNodes;
    document.getElementById("addNode").onclick = openCreate;
    document.getElementById("saveNode").onclick = saveNode;
    document.getElementById("cancelEdit").onclick = () => showView("list");
    document.getElementById("backToList").onclick = (event) => {
      event.preventDefault();
      showView("list");
    };

    // Mở đúng khu/tab đã chọn (mặc định VPNFlow) — F5 không nhảy về tab đầu.
    adminInitTab();
    // Auto-load the existing node(s) on open when a token is already saved.
    if (fields.token.value) {
      loadNodes();
    } else {
      setStatus("Enter the admin token, then click Load Nodes.");
    }
  </script>
</body>
</html>`;
}
