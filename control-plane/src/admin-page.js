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
      <div class="logo"><img src="data:image/png;base64,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" alt="FlowTech" width="162" height="162" style="border-radius:42px"></div>
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
