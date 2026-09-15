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
      width: 54px;
      height: 54px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 30% 30%, #58e694, #1c8f50 62%, #0f3d2b);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
      font-size: 29px;
      font-weight: 800;
      color: #06160d;
    }

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
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="logo"><img src="data:image/png;base64,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" alt="FlowTech" width="54" height="54" style="border-radius:14px"></div>
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

        const grantYear = document.createElement("button");
        grantYear.textContent = "Grant 1 nam";
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
        row.children[6].appendChild(grantYear);

        const grant = document.createElement("button");
        grant.className = "secondary";
        grant.textContent = "Grant 30d";
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

        const revoke = document.createElement("button");
        revoke.className = "danger";
        revoke.textContent = user.revoked_at ? "Revoked" : "Revoke";
        revoke.disabled = !!user.revoked_at;
        revoke.onclick = async () => {
          if (!confirm("Revoke user " + (user.email || user.id) + "? Their sessions will stop working.")) return;
          try {
            await request("/v1/admin/users/" + encodeURIComponent(user.id) + "/revoke", { method: "POST" });
            setStatus("Revoked " + (user.email || user.id) + ".");
            await loadUsers();
          } catch (error) { setStatus(error.message, true); }
        };

        row.children[6].append(grant, " ", revoke);
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

        var actions = document.createElement("div");
        actions.className = "row-actions";

        var detail = document.createElement("button");
        detail.className = "secondary";
        detail.textContent = "Chi tiết";
        detail.onclick = function (email) { return function () { aiuShowDetail(email); }; }(r.email);
        actions.appendChild(detail);

        var extend = document.createElement("button");
        extend.textContent = "+30 ngày";
        extend.onclick = function (email) { return function () { aiuGrant(email, 30); }; }(r.email);
        actions.appendChild(extend);

        var year = document.createElement("button");
        year.className = "secondary";
        year.textContent = "+1 năm";
        year.onclick = function (email) { return function () { aiuGrant(email, 365); }; }(r.email);
        actions.appendChild(year);

        if (r.pro.active) {
          var revoke = document.createElement("button");
          revoke.className = "danger";
          revoke.textContent = "Thu hồi";
          revoke.onclick = function (email) { return function () { aiuRevoke(email); }; }(r.email);
          actions.appendChild(revoke);
        }
        tds[9].appendChild(actions);
        fields.aiuBody.appendChild(tr);
      }
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
