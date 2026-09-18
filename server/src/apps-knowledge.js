/**
 * Kiến thức về hệ sinh thái FlowTech — nguồn sự thật DUY NHẤT cho fBuddy.
 *
 * Vì sao có file này: prompt hệ thống không nói gì về các app của mình, nên khi được
 * hỏi "MeetFlow AI là gì" trợ lý tự suy diễn — nhầm MeetFlow AI thành fBuddy hoặc
 * thành tên công ty. Khối dữ kiện dưới đây được ghép vào system prompt ở tầng CODE
 * (như PRONOUN_RULES và buildCreditKnowledge), nên vẫn còn hiệu lực dù admin đổi
 * prompt hệ thống trong Cài đặt.
 *
 * Nguồn của từng dòng (đối chiếu lại khi sản phẩm đổi):
 *   - https://meetflowai.site (bản vi + en) — trang sản phẩm, gói, thiết bị, thanh toán.
 *   - App Store: MeetFlow AI id6765590042 · SuperMom AI id6768231353.
 *   - README.md repo này — tính năng thật của fBuddy (skill, credit, i18n, giọng nói).
 *
 * Ba luật giữ cho file này khỏi bịa:
 *   1. Chỉ ghi thứ đã công bố (web, store, code). Không suy đoán tính năng.
 *   2. App chưa công bố ⇒ CHỈ có tên + trạng thái, không mô tả tính năng.
 *   3. Giá bằng số cụ thể KHÔNG đưa vào prompt (đổi giá là hỏng câu trả lời) — chỉ
 *      chỉ người dùng tới trang mua.
 *
 * Chi phí token: khối định danh (~700 ký tự) luôn được ghép; danh mục đầy đủ
 * (~3.500 ký tự) chỉ ghép khi câu hỏi thật sự nói về app/công ty — xem
 * appsQuestionLikely(). Đặt APPS_KNOWLEDGE_ALWAYS = true nếu muốn ghép đủ mọi lượt.
 */

/** Ghép danh mục đầy đủ cho MỌI lượt (tốn thêm ~1.200 token/lượt). Mặc định: chỉ ghép khi cần. */
export const APPS_KNOWLEDGE_ALWAYS = false;

/** Thông tin chung của công ty/hệ sinh thái. */
export const FLOWTECH = {
  brand: "FlowTech",
  site: "https://meetflowai.site",
  buyUrl: "https://meetflowai.site/buy",
  supportEmail: "support@meetflowai.site",
  /** Trang chủ công bố "hai anh em cùng phát triển". */
  team: "hai anh em",
  languages: "Việt, Anh, Trung, Nhật, Hàn",
};

/** Sản phẩm đã công bố — được phép mô tả chi tiết đúng như dưới đây. */
export const PUBLISHED_APPS = [
  {
    id: "fbuddy",
    name: "fBuddy",
    kind: "app AI đa năng (chính là bạn)",
    /** true = app của chính trợ lý đang trả lời. */
    isSelf: true,
    summary: "app AI đa năng chạy trên web: hỏi đáp, viết, dịch, tóm tắt",
    facts: [
      "chạy trên web tại https://fbuddy.meetflowai.site, mở bằng trình duyệt là dùng được ngay",
      "hỏi đáp, viết, dịch, tóm tắt; trò chuyện bằng giọng nói (đọc câu trả lời, có chế độ rảnh tay)",
      "bốn kỹ năng tạo kết quả thật: làm PowerPoint, làm Excel, phân tích dữ liệu, sửa ảnh",
      "giao diện ba thứ tiếng Việt/Anh/Trung; giọng nói chọn Việt hoặc Anh trong Cài đặt → Giọng nói",
      "tính tiền bằng credit theo token vào + ra mỗi lượt (chi tiết ở khối Credit)",
    ],
    links: { app: "https://fbuddy.meetflowai.site" },
  },
  {
    id: "meetflow",
    name: "MeetFlow AI",
    kind: "app dịch & ghi biên bản cuộc họp — MỘT SẢN PHẨM KHÁC, KHÔNG PHẢI fBuddy",
    summary: "app dịch hội thoại thời gian thực và ghi biên bản cuộc họp",
    facts: [
      "dịch hội thoại đa ngôn ngữ theo thời gian thực cho cuộc gọi và cuộc họp",
      "ghi biên bản cuộc họp (meeting minutes) bằng AI từ cuộc gọi và bản ghi âm",
      "xem lại lịch sử hội thoại, xuất nội dung, nghe lại phần đã dịch (một số mục cần gói Pro)",
      "có trên App Store cho iPhone/iPad (id6765590042), bản macOS, bản Android (APK) và bản Windows dạng overlay",
      "gói 30 ngày / theo tháng / theo năm mua một lần trên web; Pro mở khoá ngay sau khi thanh toán bằng cách kiểm tra đúng email đã mua",
    ],
    links: {
      buy: "https://meetflowai.site/ai/guide",
      ios: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      android: "https://api.meetflowai.site/v1/ai/downloads/android",
    },
  },
  {
    id: "vpnflow",
    name: "VPNFlow",
    kind: "VPN riêng tư",
    summary: "VPN chạy WireGuard, gói gắn với email tài khoản",
    facts: [
      "VPN chạy trên WireGuard, gói mua gắn với email tài khoản",
      "đăng nhập bằng mã dùng một lần gửi tới email — không cần nhớ mật khẩu",
      "cài trên iOS (IPA), Android (APK, kèm bản riêng cho Android 7.x), macOS (.dmg), Windows 10/11",
      "gói mua một lần, không tự động gia hạn; gần hết hạn sẽ có email nhắc",
    ],
    links: {
      buy: "https://meetflowai.site/buy",
      windows: "https://meetflowai.site/dl/VPNFlow-Setup-latest.exe",
      macos: "https://meetflowai.site/install/mac",
      ios: "https://meetflowai.site/install/ios",
      android: "https://meetflowai.site/v1/downloads/android",
    },
  },
  {
    id: "harness",
    name: "FlowTech Harness",
    kind: "bộ công cụ agent",
    summary: "bộ harness agent chạy trên máy của mình, mở được từ xa",
    facts: [
      "bộ harness agent của FlowTech: chạy trợ lý trên máy của mình và mở nó từ xa",
      "cài bằng một lệnh trên macOS, kèm bộ cài Windows trong cùng gói",
      "phần VPS là tuỳ chọn: tên miền HTTPS có cổng đăng nhập đặt trước máy của mình",
      "mã nguồn và script cài nằm trong kho của dự án",
    ],
    links: { guide: "https://api.meetflowai.site/guide" },
  },
  {
    id: "supermom",
    name: "SuperMom AI",
    kind: "trợ lý học tập cho cha mẹ",
    summary: "trợ lý học tập cho cha mẹ Việt có con lớp 1–9",
    facts: [
      "dành cho phụ huynh Việt có con học lớp 1–9, giao diện tiếng Việt viết cho cha mẹ",
      "chụp ảnh bài toán để nhận lời giải từng bước, viết để phụ huynh hiểu chứ không chỉ cho con",
      "kiểm tra lại bài con đã làm xem sai ở đâu, giải bài tiếng Anh, ghi chú lịch học kèm nhắc nhở",
      "có trên App Store cho iPhone và iPad (id6768231353)",
    ],
    links: { ios: "https://apps.apple.com/app/id6768231353" },
  },
];

/**
 * Chưa công bố: chỉ tên + trạng thái — KHÔNG mô tả tính năng, KHÔNG hứa ngày ra mắt,
 * KHÔNG đưa link vì chưa có trang chính thức. Muốn công bố thì chuyển mục này lên
 * PUBLISHED_APPS kèm dữ kiện lấy từ trang sản phẩm.
 */
export const COMING_SOON_APPS = [
  { id: "culi", name: "Culi" },
  { id: "golf", name: "Golf Assistant" },
  { id: "agentnews", name: "AgentNews Studio" },
];

/**
 * Câu hỏi có đang nói về app/công ty không.
 *
 * Khối định danh luôn có mặt, nên danh mục chi tiết chỉ cần ghép khi câu hỏi chạm
 * tới sản phẩm, công ty, nền tảng, giá hay việc tải/cài. Cố ý KHÔNG bắt các từ chỉ
 * việc thường ngày ("dịch", "tóm tắt", "viết") để lượt làm việc bình thường không
 * phải trả thêm token.
 */
const APP_QUESTION_PATTERN =
  /\b(app|apps|ứng dụng|sản phẩm|hệ sinh thái|sinh thái|công ty|doanh nghiệp|nền tảng|flowtech|meetflow|vpnflow|fbuddy|f-buddy|supermom|harness|culi|golf|agentnews)\b|bên (mình|em|anh|chị)|tải (về|app)|cài (app|đặt)|phiên bản|gói (nào|gì|bao nhiêu)|bảng giá|giá (bao nhiêu|nào|thế nào)|đăng ký|mua (ở|thêm|gói)|android|iphone|ipad|\bios\b|macos|windows|điện thoại|máy tính/i;

/** Câu hỏi có chạm tới expert/skill/connector không. */
const EXPERT_SKILL_CONNECTOR_PATTERN =
  /\b(expert|chuyên gia|skill|kỹ năng|chợ kỹ năng|prompt.pack|connector|agent.bus|agent bus|harness|multi.agent|đa.agent|giao việc|phân chia|phân công)\b/i;

/** true = ghép cả danh mục app cho lượt này. */
export function appsQuestionLikely(message) {
  if (APPS_KNOWLEDGE_ALWAYS) return true;
  return APP_QUESTION_PATTERN.test(String(message ?? ""));
}

/** true = ghép cả danh mục expert/skill/connector cho lượt này. */
export function expertSkillQuestionLikely(message) {
  if (APPS_KNOWLEDGE_ALWAYS) return true;
  return EXPERT_SKILL_CONNECTOR_PATTERN.test(String(message ?? ""));
}

/**
 * Khối định danh — luôn ghép. Đủ để trả lời đúng câu hỏi kiểu "MeetFlow AI là gì,
 * có phải em không?" và đủ để chặn bịa khi danh mục chi tiết không có mặt.
 */
const CORE = [
  "## Hệ sinh thái FlowTech (định danh — luôn đúng)",
  FLOWTECH.brand +
    " là công ty/hệ sinh thái phần mềm, web " +
    FLOWTECH.site +
    " (" +
    FLOWTECH.team +
    " cùng phát triển). fBuddy — chính là bạn — và MeetFlow AI là HAI SẢN PHẨM KHÁC NHAU:",
  "• fBuddy: " + PUBLISHED_APPS[0].summary + ".",
  "• MeetFlow AI: " + PUBLISHED_APPS[1].summary + ".",
  "• Cùng hệ sinh thái còn có: VPNFlow (VPN riêng tư), FlowTech Harness (bộ harness agent), SuperMom AI (trợ lý học tập cho cha mẹ).",
  "“MeetFlow AI” là tên MỘT SẢN PHẨM, không phải tên công ty — dù miền web của công ty là meetflowai.site. Công ty là FlowTech.",
  "TUYỆT ĐỐI KHÔNG nói MeetFlow AI là fBuddy, là bản mobile/phiên bản khác của fBuddy, hay là công ty mẹ của fBuddy. Người dùng nhầm thì sửa lại một câu ngắn rồi trả lời đúng trọng tâm.",
  "Chi tiết từng app chỉ nói khi lượt này có mục “DANH MỤC APP”; nếu không có mà vẫn bị hỏi chi tiết, trả lời phần chắc chắn rồi mời xem " +
    FLOWTECH.site +
    " — KHÔNG bịa tính năng, giá, ngày ra mắt hay đường link.",
].join("\n");

/** Quy tắc chống bịa — chỉ ghép kèm danh mục chi tiết. */
const APP_RULES = [
  "QUY TẮC VỀ APP (bắt buộc):",
  "• Chỉ dùng đúng dữ kiện trong danh sách trên. KHÔNG bịa tính năng, giá, ngày ra mắt, số người dùng, giải thưởng hay đường link.",
  "• Nói về công ty/app vẫn giữ đúng cặp xưng hô của hội thoại (em–anh, mình–bạn…): KHÔNG chuyển sang “chúng tôi” hay “công ty chúng tôi”.",
  "• Hỏi giá/khuyến mãi cụ thể: nói gói mua trên web và mời xem trang mua; không tự đọc ra con số.",
  "• App trong mục “đang phát triển”: chỉ xác nhận là đang làm và chưa công bố, không mô tả tính năng và không hứa ngày ra mắt.",
  "• Không chắc, hoặc hỏi về sản phẩm không có trong danh sách: nói thẳng là chưa có thông tin và mời liên hệ hỗ trợ — tuyệt đối không đoán.",
].join("\n");

/** Danh mục chi tiết từng app + quy tắc. */
export function buildAppsCatalogue() {
  const lines = ["## DANH MỤC APP (dữ kiện thật — dùng khi được hỏi về công ty và các app của mình)"];
  for (const app of PUBLISHED_APPS) {
    lines.push("- " + app.name + " — " + app.kind + (app.isSelf ? "" : "."));
    for (const fact of app.facts) lines.push("  • " + fact);
  }
  if (COMING_SOON_APPS.length) {
    lines.push(
      "- Đang phát triển, CHƯA công bố (chỉ có tên, chưa có tính năng hay trang chính thức): " +
        COMING_SOON_APPS.map((app) => app.name).join(", ") +
        ".",
    );
  }
  lines.push(
    "- Dùng chung cả hệ sinh thái: mua bằng QR ngân hàng (VietQR) hoặc MoMo trên web; gói mua một lần, KHÔNG tự động gia hạn; hoá đơn và xác nhận kích hoạt gửi qua email; một tài khoản dùng tối đa 3 thiết bị đang hoạt động; hỗ trợ qua " +
      FLOWTECH.supportEmail +
      ".",
    "",
    APP_RULES,
  );
  return lines.join("\n");
}

/**
 * Khối kiến thức ghép vào system prompt.
 *
 * @param {{ message?: string, full?: boolean }} [options]
 *   message: câu người dùng vừa gửi, để quyết định có ghép danh mục chi tiết.
 *   full: ép ghép danh mục (dùng cho test/kiểm tra thủ công).
 */
export function buildAppsKnowledge({ message = "", full = false } = {}) {
  const withCatalogue = full || appsQuestionLikely(message);
  const withExperts = full || expertSkillQuestionLikely(message);
  const blocks = [CORE];
  if (withCatalogue) blocks.push(buildAppsCatalogue());
  if (withExperts) blocks.push(buildExpertSkillConnectorCatalogue());
  return blocks.join("\n\n");
}

/**
 * === KIẾN THỨC BỔ SUNG: EXPERTS, SKILLS, CONNECTOR ===
 * Ghép vào danh mục khi câu hỏi chạm tới expert/skill/connector.
 */

/** Các chuyên gia (Expert) mà fBuddy có thể đóng vai hoặc giới thiệu từ Chợ kỹ năng. */
export const EXPERTS_CATALOGUE = [
  {
    category: "Giáo dục",
    items: [
      "ket-prep-expert: Luyện thi KET",
      "vocab-craft-expert: Huấn luyện từ vựng ngoại ngữ",
      "liuxue-yanxue-expert: Du học & trải nghiệm học tập",
      "ncre-expert: Luyện thi chứng chỉ máy tính",
      "family-education-ma: Giáo dục gia đình / nuôi dạy con",
      "academic-tutor: Gia sư các môn học",
      "math-whiz-expert: Giải toán nâng cao",
      "science-guide-expert: Khoa học / thực nghiệm",
    ],
  },
  {
    category: "Chuyên gia VN/ĐNA (14 chuyên gia)",
    items: [
      "vietnam-finance-tax-expert: Tài chính & thuế Việt Nam",
      "vietnam-legal-expert: Pháp lý doanh nghiệp Việt Nam",
      "vietnam-marketing-expert: Marketing số tại Việt Nam",
      "vietnam-hr-expert: Nhân sự & tuyển dụng",
      "vietnam-startup-expert: Khởi nghiệp & gọi vốn",
      "vietnam-export-expert: Xuất khẩu & logistics",
      "vietnam-realestate-expert: Bất động sản",
      "vietnam-ecommerce-expert: Thương mại điện tử",
      "vietnam-crypto-expert: Crypto & blockchain",
      "vietnam-ai-expert: Ứng dụng AI trong doanh nghiệp",
      "vietnam-content-expert: Content & SEO",
      "vietnam-design-expert: Thiết kế & thương hiệu",
      "vietnam-sales-expert: Kỹ năng bán hàng & đàm phán",
      "vietnam-productivity-expert: Năng suất & quản trị thời gian",
    ],
  },
];

/** Skill (Kỹ năng) có sẵn trong fBuddy. */
export const SKILLS_CATALOGUE = {
  builtin: [
    {
      id: "ppt",
      name: "Làm PowerPoint",
      summary: "Tạo file .pptx thật: 6-10 slide, mỗi slide 1 ý + 3-5 bullet, ghi chú trình bày. Phải xác nhận dàn ý trước.",
    },
    {
      id: "excel",
      name: "Làm Excel",
      summary: "Tạo file .xlsx thật: nhiều sheet, freeze header, autofilter, định dạng số, dòng TỔNG (SUM). Phải xác nhận kế hoạch trước.",
    },
    {
      id: "data",
      name: "Phân tích dữ liệu",
      summary: "Parse CSV/Excel → thống kê mô tả (describe), value_counts, group_by, timeseries, correlation, chart spec. Tự trả về bảng + spec biểu đồ.",
    },
    {
      id: "image",
      name: "Sửa ảnh",
      summary: "Gọi model ảnh (Gemini/OpenAI) để sửa nội dung ảnh. Cắt/xoay/filter/chèn chữ thì dùng Image Studio (miễn phí, không tốn credit).",
    },
  ],
  hub: {
    categories: ["Chuyên gia", "Bán hàng", "Văn phòng", "Dữ liệu", "Nội dung", "Giáo dục", "Khác"],
    description: "Chợ kỹ năng — mua prompt-pack bằng credit. Mỗi skill là một prompt pack: tên, icon, giá, instructions. Các nhóm: Chuyên gia, Bán hàng, Văn phòng, Dữ liệu, Nội dung, Giáo dục, Khác.",
    buying: "Mua bằng credit trong Chợ kỹ năng (bên trái). Giá bằng VND, trả một lần. Admin duyệt hoặc tự phục vụ.",
    expertSkill: "Kỹ năng loại 'Expert' = prompt pack cho fBuddy đóng vai chuyên gia (ví dụ: vietnam-finance-tax-expert). Khi bật expert, fBuddy nói theo phong cách chuyên gia đó.",
  },
};

/** Connector (Agent Bus) — cầu nối fBuddy với harness/agent bus trên VPS. */
export const CONNECTOR_KNOWLEDGE = {
  endpoint: "https://fbuddy.meetflowai.site/agent-bus",
  description: "Cầu nối máy-máy giữa fBuddy (trên VPS node-2) và harness/agent bus trên máy Windows/Mac. Dùng TLS (Caddy), token trong `/etc/agent-bus.env`. Telegram chỉ để alert người.",
  capabilities: [
    "Giao việc (task) cho agent khác trên harness (Mac/Win) — theo giao thức `TASK-PROTOCOL.md`.",
    "Nhận kết quả hoàn thành (done) từ agent kia, gửi alert Telegram cho người dùng.",
    "Hỗ trợ giao việc giữa Mac ↔ Windows qua VPS (connector chạy trên node-2, port 7799).",
    "Không dùng để chat thường — chỉ cho tác vụ phức tạp, đa agent, cần đồng bộ giữa máy.",
  ],
  whenToUse: "Khi user yêu cầu tác vụ phức tạp cần nhiều agent (ví dụ: 'viết blog + tạo hình + đăng Facebook'), fBuddy có thể dùng connector để phân chia việc cho agent khác trên harness, rồi tổng hợp kết quả.",
};

/** Khối kiến thức experts/skills/connector. */
export function buildExpertSkillConnectorCatalogue() {
  const lines = ["## EXPERTS, SKILLS & CONNECTOR (dữ kiện thật — dùng khi được hỏi về chuyên gia, kỹ năng, connector)"];
  
  lines.push("- **Experts (Chuyên gia):** fBuddy có thể đóng vai chuyên gia hoặc giới thiệu từ Chợ kỹ năng.");
  lines.push("  Nhóm **Giáo dục**: " + EXPERTS_CATALOGUE[0].items.join(", ") + ".");
  lines.push("  Nhóm **Chuyên gia VN/ĐNA (14 chuyên gia):** " + EXPERTS_CATALOGUE[1].items.join(", ") + ".");
  lines.push("  Khi user cần chuyên môn sâu: gợi ý bật expert phù hợp trong Chợ kỹ năng (mua bằng credit).");
  
  lines.push("- **Skills (Kỹ năng built-in):**");
  for (const s of SKILLS_CATALOGUE.builtin) {
    lines.push(`  • ${s.name} (${s.id}): ${s.summary}`);
  }
  lines.push("- **Chợ kỹ năng (Skill Hub):** " + SKILLS_CATALOGUE.hub.description);
  lines.push("  Các nhóm: " + SKILLS_CATALOGUE.hub.categories.join(", ") + ".");
  lines.push("  Mua bằng credit trong Chợ kỹ năng (bên trái). Giá bằng VND, trả một lần. Expert skill = prompt pack để fBuddy đóng vai chuyên gia.");
  
  lines.push("- **Connector (Agent Bus):** " + CONNECTOR_KNOWLEDGE.endpoint);
  lines.push("  " + CONNECTOR_KNOWLEDGE.description);
  lines.push("  Khả năng: " + CONNECTOR_KNOWLEDGE.capabilities.join("; "));
  lines.push("  Khi dùng: " + CONNECTOR_KNOWLEDGE.whenToUse);
  lines.push("  KHÔNG dùng connector cho chat thường — chỉ cho tác vụ phức tạp, đa agent, cần đồng bộ máy.");
  
  lines.push("", APP_RULES);
  return lines.join("\n");
}
