export function adminPageHTML() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FlowVPN Admin - Exit Nodes</title>
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

    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }

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

    .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; color: #06160d; background: var(--accent); font-size: 12px; font-weight: 700; }
    .pill.off { color: #fff; background: rgba(255, 255, 255, 0.2); }

    .hidden { display: none !important; }

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

    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--stroke); padding: 10px 0; }
      td { border: 0; padding: 7px 0; }
      td::before { content: attr(data-label); display: block; color: var(--muted); font-size: 12px; margin-bottom: 3px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="logo">F</div>
      <div>
        <h1>Exit Node Admin</h1>
        <div class="subtitle">FlowVPN backend configuration</div>
      </div>
    </div>
  </header>

  <main>
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
    </section>

    <section class="card">
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="nodesBody">
            <tr><td colspan="6">No data loaded.</td></tr>
          </tbody>
        </table>
      </div>
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
      editTitle: document.getElementById("editTitle"),
    };

    let editingId = null; // null = create mode

    // Auto-detect the API base: when this page is served under
    // /PrivateVPN/Admin (Caddy strips the prefix), keep the prefix so API
    // calls hit the proxy too; when served at /admin (SSH tunnel) use origin.
    fields.baseUrl.value =
      window.location.origin +
      window.location.pathname.replace(/\/admin\/?$/i, "");

    // Persist token + base across visits so the page can auto-load nodes.
    fields.token.value = localStorage.getItem("fvpn_admin_token") || "";
    fields.baseUrl.value = localStorage.getItem("fvpn_admin_base") || fields.baseUrl.value;
    fields.token.addEventListener("input", () => localStorage.setItem("fvpn_admin_token", fields.token.value.trim()));
    fields.baseUrl.addEventListener("input", () => localStorage.setItem("fvpn_admin_base", fields.baseUrl.value));

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
        fields.nodesBody.innerHTML = '<tr><td colspan="6">No exit nodes found.</td></tr>';
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
          '<td data-label="Actions"></td>',
        ].join("");
        row.children[0].querySelector("code").textContent = node.id;
        row.children[1].textContent = node.name + " - " + node.city + ", " + node.country;
        row.children[2].querySelector("code").textContent = node.endpoint;
        row.children[3].querySelector("code").textContent = node.public_key;
        row.children[4].innerHTML = node.active ? '<span class="pill">Active</span>' : '<span class="pill off">Disabled</span>';

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

        row.children[5].append(edit, " ", disable);
        fields.nodesBody.appendChild(row);
      }
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

    document.getElementById("loadNodes").onclick = loadNodes;
    document.getElementById("addNode").onclick = openCreate;
    document.getElementById("saveNode").onclick = saveNode;
    document.getElementById("cancelEdit").onclick = () => showView("list");
    document.getElementById("backToList").onclick = (event) => {
      event.preventDefault();
      showView("list");
    };

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
