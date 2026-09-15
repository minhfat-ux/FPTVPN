/**
 * Cấp / thu hồi peer WireGuard trên MỌI exit node đang bật.
 *
 * Vì sao cần: control plane chỉ đẩy peer vào **một** node mà nó chọn, và lỗi ở bước
 * đẩy bị nuốt. Khi node đó không nhận được peer (SSH hỏng, node thiếu key), API vẫn
 * trả 201 và app vẫn báo "Connected", nhưng handshake không bao giờ xong ⇒ khách mất
 * mạng mà log không nói gì (đã xảy ra thật 15/09: node-2 thiếu SSH key nên mọi peer
 * của node-1 đều không được tạo).
 *
 * Ở đây ta: (1) mirror peer sang mọi node để node nào khách chọn cũng handshake được,
 * (2) ném lỗi ra ngoài khi node **chính** thất bại để request không "thành công" giả,
 * (3) log rõ từng node lỗi.
 */

/** Bỏ node trùng id, giữ thứ tự (node chính luôn đứng đầu). */
function dedupeNodes(nodes) {
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    if (!node || !node.id || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function describe(error) {
  return error?.message ?? String(error);
}

/**
 * Cấp peer trên node chính + mọi node còn lại.
 *
 * @param {object} input
 * @param {object|null} input.primaryNode - Node khách sẽ kết nối tới (lỗi ⇒ ném ra).
 * @param {object[]} input.nodes - Các node đang bật (để mirror).
 * @param {string} input.publicKey - Khoá công khai của thiết bị.
 * @param {string} input.allowedIPs - Ví dụ "10.77.0.42/32".
 * @param {(node: object, publicKey: string, allowedIPs: string) => Promise<void>} input.upsert
 * @param {object} [input.log] - logger (mặc định console).
 * @returns {Promise<{provisioned: string[], failures: {nodeId: string, error: Error}[]}>}
 */
export async function provisionEverywhere({ primaryNode, nodes = [], publicKey, allowedIPs, upsert, log = console }) {
  const targets = dedupeNodes([primaryNode, ...nodes]);
  const provisioned = [];
  const failures = [];

  for (const node of targets) {
    try {
      await upsert(node, publicKey, allowedIPs);
      provisioned.push(node.id);
    } catch (error) {
      failures.push({ nodeId: node.id, error });
      log.error?.(`peer-mirror: cấp peer ${allowedIPs} trên node ${node.id} thất bại: ${describe(error)}`);
    }
  }

  const primaryFailed = primaryNode ? failures.find((f) => f.nodeId === primaryNode.id) : undefined;
  if (primaryFailed) {
    const error = new Error(
      `Không cấp được peer trên exit node ${primaryNode.id}: ${describe(primaryFailed.error)}`,
    );
    error.statusCode = 502;
    error.code = "exit_node_provision_failed";
    error.failures = failures.map((f) => ({ nodeId: f.nodeId, error: describe(f.error) }));
    throw error;
  }

  return { provisioned, failures };
}

/**
 * Thu hồi peer trên mọi node (dùng khi thiết bị bị thu hồi / thay thế slot).
 * Không ném lỗi: thu hồi là best-effort, nhưng mọi thất bại đều được log.
 *
 * @returns {Promise<{removed: string[], failures: {nodeId: string, error: Error}[]}>}
 */
export async function revokeEverywhere({ nodes = [], publicKey, remove, log = console }) {
  const removed = [];
  const failures = [];

  if (!publicKey) return { removed, failures };

  for (const node of dedupeNodes(nodes)) {
    try {
      await remove(node, publicKey);
      removed.push(node.id);
    } catch (error) {
      failures.push({ nodeId: node.id, error });
      log.error?.(`peer-mirror: thu hồi peer trên node ${node.id} thất bại: ${describe(error)}`);
    }
  }

  return { removed, failures };
}
