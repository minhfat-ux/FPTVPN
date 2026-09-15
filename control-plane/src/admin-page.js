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
    }
    .logo img { height: 120px; width: auto; max-width: 100%; display: block; }

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
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="logo"><img src="data:image/png;base64,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" alt="FlowTech" width="480" height="156"></div>
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
