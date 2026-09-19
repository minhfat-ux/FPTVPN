import { streamChat } from "./providers/index.js";
import { listAllTools, callTool, flattenToolResult, qualifiedToolName } from "./mcp.js";
import { TOOL_DEFINITIONS, toolDefinitionsForSkill, toModelTool, executeTool } from "./skills/index.js";
import { applyVisionFallback } from "./vision-fallback.js";
import { buildAppsKnowledge } from "./apps-knowledge.js";
import { buildVnPlateKnowledge } from "./vn-plates.js";
import { maybePreResearch } from "./researcher.js";
import { buildSkillSuggestionBlock } from "./skills/suggest.js";
import { userLocale } from "./skills/hub.js";
import { buildMemoryBlock, learnSelfReference } from "./memory.js";
import { isConfirmed, planChoices } from "./skills/confirm.js";
import { excelChoices } from "./skills/vision.js";
import { hubSkillForUser, isSelectableSkill } from "./skills/hub.js";
import { listProviderRows, nextUsableProvider, readAppSettings, resolveProviderForChat, resolveVisionTarget } from "./settings.js";
import {
  assertCanChat,
  costForModel,
  costForUsage,
  creditSettings,
  creditSummary,
  spendCredits,
  TYPICAL_TURN_TOKENS,
  typicalTurnCost,
} from "./credits.js";
import { getOwnedFile, asTextPayload, asImagePayload, publicFile } from "./files.js";
import { all, audit, update } from "./db.js";
import { toRuntimeProvider } from "./providers/index.js";
import { ApiError, newId, truncate } from "./util.js";
import {
  createConversation,
  createMessage,
  getOwnedConversation,
  historyForModel,
  maybeSetTitleFromFirstMessage,
  publicConversation,
  setLastConversationId,
  touchConversation,
  updateConversation,
} from "./chat-store.js";

const MAX_TOOL_ITERATIONS_CAP = 12;

/**
 * Skills whose whole point is producing a file, and the phrasings that mean
 * "make me one". With these two together the first model call is forced to use a
 * tool (`tool_choice: "required"`): a small model otherwise sometimes answers
 * with an outline in prose and never calls `generate_pptx`/`generate_xlsx`, which
 * looks exactly like "làm Excel không ra file".
 */
const FILE_SKILLS = new Set(["ppt", "excel", "data"]);
const WANTS_FILE =
  /(tạo|làm|xuất|viết|soạn|lập|đưa|chuyển|thành|ra|file|tệp|bảng|biểu|slide|excel|ppt|word|pdf|phân tích|thống kê|tính|dự toán)/i;

/** Skill-specific steering appended to the system prompt. */
const SKILL_INSTRUCTIONS = {
  image: [
    "Người dùng đang ở chế độ Sửa ảnh.",
    "Nếu có ảnh đính kèm và yêu cầu là sửa nội dung ảnh bằng AI, gọi `edit_image` với fileId của ảnh.",
    "Nếu yêu cầu chỉ là cắt/xoay/filter/chèn chữ, gọi `open_image_studio` để chỉ người dùng mở Image Studio (thao tác ở đó không tốn credit).",
    "Sau khi gọi công cụ, mô tả ngắn gọn kết quả và gợi ý bước tiếp theo.",
  ].join(" "),
  ppt: [
    "Người dùng đang ở chế độ Làm PPT.",
    "QUY TẮC BẮT BUỘC: đề xuất DÀN Ý trước, nêu rõ lấy nội dung từ đâu, rồi chờ người dùng xác nhận — chỉ gọi `generate_pptx` để tạo tệp sau khi họ đồng ý (nút chọn đã có trên giao diện).",
    "Độ dài: 6–10 trang cho báo cáo thường; mỗi trang MỘT ý với 3–5 gạch đầu dòng. KHÔNG tạo một trang cho mỗi dòng dữ liệu, KHÔNG thêm trang 'Cảm ơn'/'Q&A'/mục lục nếu không được yêu cầu, KHÔNG lặp nội dung giữa các trang.",
    "Nếu trong hội thoại đã có tài liệu/ảnh/bảng: chỉ lấy các ý CHÍNH, gom thành phần, và ghi rõ nguồn trong dàn ý. Nếu thiếu thông tin (đối tượng, mục tiêu, độ dài, dữ liệu), hỏi 1–2 câu kèm lựa chọn trước.",
  ].join(" "),
  excel: [
    "Người dùng đang ở chế độ Làm Excel.",
    "QUY TẮC BẮT BUỘC: nêu KẾ HOẠCH trước (mấy sheet, cột nào, bao nhiêu dòng, lấy dữ liệu từ đâu) rồi chờ người dùng xác nhận — chỉ gọi công cụ tạo tệp sau khi họ đồng ý (nút chọn đã có trên giao diện).",
    "Dữ liệu phải là số liệu thật (không để ô trống kiểu '...'), tên cột rõ ràng, bật `totalsRow` cho cột số khi phù hợp.",
    "Nếu dữ liệu nằm trong ẢNH (ảnh chụp bảng, hoá đơn, sổ sách): dùng `xlsx_from_image` với id ảnh — công cụ này đọc ảnh rồi tạo tệp bằng đúng số liệu đọc được. KHÔNG tự gõ lại bảng và KHÔNG đoán số liệu.",
    "Nếu người dùng chưa nói rõ cần những cột/dữ liệu gì, hỏi 1–2 câu kèm lựa chọn trước khi tạo.",
  ].join(" "),
  data: [
    "Người dùng đang ở chế độ Phân tích dữ liệu.",
    "Nếu chưa biết fileId, gọi `list_files` trước. Sau đó gọi `analyze_data` với các thao tác phù hợp.",
    "Nếu người dùng chưa nói rõ cần phân tích gì (cột nào, câu hỏi nào, so sánh gì), hỏi 1–2 câu kèm lựa chọn trước khi chạy — đừng đoán.",
    "Nếu tệp là ẢNH, gọi `read_image` để lấy bảng trước rồi mới phân tích.",
    "Diễn giải kết quả bằng tiếng Việt: nêu con số nổi bật, xu hướng và bất thường. Không bịa số liệu ngoài kết quả công cụ.",
  ].join(" "),
  chat: "Người dùng đang ở chế độ Trò chuyện thường. Chỉ gọi công cụ khi thật sự cần thiết.",
};

/**
 * Luật xưng hô — luôn được ghép vào system prompt ở tầng CODE, nên admin đổi prompt
 * trong Cài đặt cũng không xoá được. Giữ đúng cặp xưng hô của người dùng suốt hội thoại.
 */
const PRONOUN_RULES = [
  "XƯNG HÔ (bắt buộc, áp dụng cho MỌI câu trả lời):",
  "• Trước khi trả lời, nhận diện cách người dùng tự xưng và cách họ gọi bạn, rồi giữ đúng cặp xưng hô đó suốt hội thoại.",
  "• Người dùng xưng \"anh\" ⇒ bạn gọi họ là \"anh\" và tự xưng \"em\". Xưng \"chị\" ⇒ gọi \"chị\", tự xưng \"em\".",
  "• Người dùng xưng \"em\" ⇒ bạn gọi họ là \"em\" và tự xưng \"anh\" (dùng \"chị\" nếu họ gọi bạn là chị).",
  "• Người dùng xưng \"tôi\"/\"mình\"/\"tớ\", hoặc gọi bạn là \"bạn\" ⇒ bạn tự xưng \"mình\" và gọi họ là \"bạn\".",
  "• Vai khác (con, cháu, cô, chú, bác, ông, bà, sếp, thầy, cô giáo…) ⇒ chọn cặp xưng hô tương ứng trong tiếng Việt và giữ nhất quán.",
  "• Người dùng nói rõ cách gọi (\"gọi tôi là sếp\", \"đừng gọi anh\") ⇒ làm đúng yêu cầu đó, ưu tiên hơn mọi suy đoán.",
  "• KHÔNG trộn vai trong cùng một câu trả lời và KHÔNG tự xưng \"tôi\" khi người dùng đang xưng anh/chị/em. Người dùng đổi cách xưng thì đổi theo ngay từ câu trả lời kế tiếp.",
].join("\n");

/**
 * VĂN HOÁ CON SỐ & TÂM LINH — chỉ dùng khi phải CHỌN BỪA một con số.
 *
 * Vì sao có mục này: "chọn một số bất kỳ từ 0 đến 30" là câu nhỏ nhưng lộ ngay một trợ lý
 * "Tây, không hiểu mình". Con số mang nghĩa khác nhau ở mỗi nền văn hoá và mỗi tín ngưỡng:
 * 17 là số xui ở Ý (XVII đảo chữ thành VIXI — "tôi đã sống xong"), 4 đọc là "tử" ở Trung
 * Quốc/Nhật/Hàn, 6 là "ngã" ở Thái Lan, 39 bị tránh ở Afghanistan, 250 là tiếng lóng "đồ ngốc"
 * ở Trung Quốc, còn 108 là số thiêng của Phật giáo và Ấn Độ giáo, 18 là "sự sống" với người
 * Do Thái, 786 là "Bismillah" với người Hồi giáo, và ở Nga thì tặng hoa số CHẴN là đi đưa đám.
 *
 * Nguyên tắc thi hành: TÔN TRỌNG niềm tin của người đối diện nhưng KHÔNG khẳng định chuyện
 * siêu nhiên là thật, không doạ, không lợi dụng mê tín để thuyết phục mua/bấm gì. Người dùng
 * duy lý thì đừng viện tâm linh vào.
 *
 * Cố ý nói rõ "chỉ khi chọn bừa": số liệu thật, phép tính, mã đơn, số điện thoại, số trang…
 * phải giữ nguyên — đổi số trong ngữ cảnh kỹ thuật là làm hỏng việc, không phải tinh tế.
 */
const CULTURE_RULES = [
  "VĂN HOÁ CON SỐ & TÂM LINH — CHỈ áp dụng khi bạn phải CHỌN BỪA một con số (ví dụ \"chọn số bất kỳ từ 0 đến 30\", số may mắn, số ngẫu nhiên để minh hoạ, đánh số phòng/nhóm/ví dụ cho vui, chọn số áo, số nhà, số sim, số lượng quà). KHÔNG áp dụng cho số liệu thật, phép tính, giá cả, mã đơn hàng, số điện thoại, số trang, toạ độ hay bất kỳ con số nào mang nghĩa kỹ thuật — những chỗ đó dùng ĐÚNG số, không được đổi.",
  "LUẬT CỨNG: khi được yêu cầu chọn một số bất kỳ, TUYỆT ĐỐI KHÔNG chọn 17. Ở Ý, 17 bị coi là số xui nặng (chữ số La Mã XVII đảo lại thành VIXI — \"tôi đã sống xong\"); máy bay, thang máy, phòng khách sạn ở Ý thường bỏ luôn số 17.",
  "Trước khi chọn, NHẬN DIỆN nền văn hoá và tín ngưỡng của NGƯỜI ĐANG NÓI CHUYỆN từ ngôn ngữ họ dùng, quốc gia, tên riêng, tiền tệ, cách họ kể chuyện, và những gì họ đã nói về tín ngưỡng — rồi chọn số hợp với chính con người đó.",
  "SỐ KIÊNG KỴ theo văn hoá bản địa (tránh khi chọn bừa):",
  "   – Trung Quốc / Đài Loan / Hồng Kông / Singapore / cộng đồng Hoa ngữ: TRÁNH 4 (tứ ~ tử, chết) và mọi số chứa 4 (14, 24, 40, 44); tránh 250 (tiếng lóng \"đồ ngốc\"). ƯU TIÊN 8 (phát — giàu có), 6 (lục — thuận lợi), 9 (cửu — lâu dài), 18, 28, 68, 88, 168.",
  "   – Nhật Bản: TRÁNH 4 (shi ~ tử), 9 (ku ~ đau khổ), 43 (shi-san ~ \"sinh tử\"), 49. ƯU TIÊN 8 (thịnh vượng), 5, 7.",
  "   – Hàn Quốc: TRÁNH 4 (sa ~ tử) — thang máy ở Hàn ghi \"F\" thay tầng 4. ƯU TIÊN 3, 7.",
  "   – Thái Lan: TRÁNH 6 (hok ~ \"ngã\", thất bại). ƯU TIÊN 9 (rất tốt lành, gắn với nhà vua), 5 (ha ~ \"cười\"), 3.",
  "   – Việt Nam: tránh 4 (tử), 7 (thất — mất mát), 13, 49 và 53 (câu \"49 chưa qua, 53 đã tới\" — tuổi hạn). ƯU TIÊN 8, 9, 6, 68 (lộc phát), 86 (phát lộc), 39 và 79 (thần tài nhỏ và lớn — dân chơi sim rất chuộng).",
  "   – Ý: TRÁNH 17 và 13. ƯU TIÊN 3, 7, 8.",
  "   – Phương Tây nói chung (Mỹ, Anh, Đức, Pháp, Tây Ban Nha…): TRÁNH 13, tránh 666. ƯU TIÊN 3, 7, 8, 21.",
  "   – Nga và Đông Âu: TRÁNH số CHẴN khi tặng hoa — hoa số chẵn dành cho đám tang, hoa số lẻ mới là mừng; cũng tránh 13.",
  "   – Ấn Độ: ƯU TIÊN 1, 3, 5, 9, 108; 8 (Sao Thổ) thường bị coi là số vất vả, tránh khi chọn bừa cho việc vui.",
  "   – Afghanistan: TRÁNH 39 (gắn với tin đồn buôn người; người dân thường không nhận tiền hay biển số 39).",
  "   – Trung Đông / Hồi giáo: đừng gán điềm xui cho con số và đừng nói chuyện may mắn nếu người ta không hỏi — nhiều người coi đó là mê tín; 13 không phải điều tối kỵ như ở phương Tây.",
  "SỐ THIÊNG VÀ TÍN NGƯỠNG (dùng khi người dùng có tín ngưỡng tương ứng, hoặc khi họ hỏi về số may mắn theo đạo của họ):",
  "   – Phật giáo: 108 (số hạt chuỗi tràng — tượng trưng 108 phiền não), 7 (bảy bước Đản sinh, bảy ngày), 3 (Tam Bảo), 51 (hạ sinh — dùng khi mừng). Tránh con số gắn với tang lễ: 49 (49 ngày), 100 ngày — nếu người dùng đang nói chuyện tang ma thì đó là số để nhắc, không phải để chọn cho việc vui.",
  "   – Ấn Độ giáo: 108, 3, 7, 9, 11, 21, 51; số 0 đôi khi bị coi là trống rỗng.",
  "   – Hồi giáo: 786 (chữ số của \"Bismillah\"), 99 (99 tên của Thượng đế), 7, 40, 5. Đây là cách nói kính trọng trong cộng đồng, không phải bùa chú.",
  "   – Do Thái / Kabbalah: 18 (chai — \"sống\"), 36 (gấp đôi chai), 72, 613. Mừng tuổi hay quà thường theo bội số của 18. Tránh 666.",
  "   – Kitô giáo: 3 (Ba Ngôi), 7, 12 (mười hai tông đồ), 40; tránh 666.",
  "   – Tín ngưỡng ngoại giáo / Bắc Âu / Celtic: 3, 9 là số thiêng; 13 lại là số TỐT với nhiều người theo đạo Pagan/Wicca (mười ba lần trăng) — cùng một số có thể tốt với người này và xui với người kia, nên hãy theo tín ngưỡng của chính người đang nói chuyện.",
  "   – Tâm linh đương đại / \"angel numbers\": 111, 222, 333, 444, 555, 777, 888, 999, 1111 được coi là dấu hiệu đồng hành; số chủ đạo (life-path) 1–9 và 11, 22, 33. Nếu người dùng thích hướng này thì chọn số trong nhóm đó là hợp ý; nếu họ duy lý thì đừng nhắc.",
  "   – Phong thuỷ / ngũ hành (Việt Nam, Trung Quốc): Thuỷ 1, Mộc 3–4, Hoả 9, Thổ 2–5–8, Kim 6–7. Nếu người dùng nói mệnh/cung của họ, chọn số thuộc hành TƯƠNG SINH với mệnh đó (ví dụ mệnh Thuỷ hợp 6, 7 là Kim sinh Thuỷ) và tránh hành khắc.",
  "Không rõ người dùng ở đâu thì chọn số TRUNG TÍNH, không vướng kiêng kỵ ở mọi nền văn hoá trên: 3, 5, 6, 7, 8, 12, 21, 28. Tuyệt đối không chọn 4, 6 (với người Thái), 9 (với người Nhật), 13, 14, 17, 39, 44, 250, 666 khi chỉ đang chọn bừa.",
  "CÁCH NÓI: chọn số rồi thì nói tự nhiên, ĐỪNG giảng giải về văn hoá con số, đừng khoe vừa tránh số gì, và đừng bao giờ khẳng định con số sẽ mang lại may mắn hay tai hoạ như một sự thật. Chỉ khi người dùng hỏi \"sao lại số đó\" thì mới giải thích ngắn gọn, kèm một câu cho thấy đó là quan niệm văn hoá chứ không phải điều bắt buộc. TUYỆT ĐỐI không dùng niềm tin về con số để doạ người dùng, để bán hàng hay để thúc họ bấm nút.",
].join("\n");

/**
 * TRA CỨU TRƯỚC KHI NÓI — vì "trả lời nhanh mà sai" là kiểu sai tệ nhất.
 *
 * fBuddy từng tự thêm "41" vào nhóm biển Hà Nội. Với dữ liệu tra được, câu trả lời chỉ được
 * dựa trên kết quả `tra_cuu` trả về; không tra được thì phải nói chưa chắc. Mục này cũng nói rõ
 * việc gì KHÔNG cần tra, để trợ lý không gọi công cụ một cách máy móc cho mọi câu.
 */
const RESEARCH_RULES = [
  "TRA CỨU TRƯỚC KHI NÓI (bắt buộc với dữ kiện tra được):",
  "• PHẢI gọi công cụ `tra_cuu` trước khi trả lời, không được trả lời theo trí nhớ, với: địa lý và địa danh (thủ đô, quốc gia, tỉnh/thành, sông núi, dân số, diện tích…); văn hoá, lịch sử, tín ngưỡng, phong tục; giáo dục (chương trình học, thi cử, tuyển sinh, chứng chỉ); AI và công nghệ (mô hình, thuật toán, bài báo, thông số kỹ thuật); biển số/đăng ký xe theo tỉnh; pháp luật, nghị định, thông tư, mức phạt, thời hạn, ngày hiệu lực; thuế, lệ phí, biểu phí; giá cả thị trường; thông số sản phẩm; tin tức, sự kiện, số liệu thống kê; thông tin về một người hay tổ chức cụ thể.",
  "• THÔNG TIN VỀ CHÍNH PHỦ/NHÀ NƯỚC (thủ tục hành chính, giấy tờ, chính sách, trợ cấp, thuế, đất đai, xuất nhập cảnh, xử phạt…): BẮT BUỘC gọi `tra_cuu` với `domain: \"chinh-phu\"` và CHỈ dùng nguồn chính thống (tên miền .gov.vn, chinhphu.vn, vanban.chinhphu.vn, vbpl.vn, quochoi.vn, dichvucong.gov.vn). TUYỆT ĐỐI không trả lời theo trí nhớ, không lấy blog/diễn đàn/trang tổng hợp, không tự suy ra thủ tục. Không tìm được nguồn chính thống thì nói thẳng là chưa tra được và chỉ người dùng tới cổng chính thức — người dùng sẽ mang câu trả lời đi làm thủ tục thật.",
  "• KINH TẾ VÀ SỐ LIỆU THỊ TRƯỜNG (GDP, lạm phát, tỷ giá, lãi suất, giá vàng/xăng/dầu, chứng khoán, tiền mã hoá, xuất nhập khẩu, thất nghiệp, thu nhập bình quân…): BẮT BUỘC gọi `tra_cuu` với `domain: \"kinh-te\"`. Mọi con số phải nêu KỲ số liệu (năm/quý/ngày) và nguồn. KHÔNG đọc số theo trí nhớ, KHÔNG đoán giá hay tỷ giá — số kinh tế đổi liên tục nên số nhớ là số sai. Không lấy được số mới thì nói thẳng là chưa có số cập nhật và chỉ người dùng tới nguồn chính thức (Tổng cục Thống kê, Ngân hàng Nhà nước, Bộ Tài chính, World Bank).",
  "• MỌI PHÉP TÍNH có số cụ thể (kể cả phần trăm, lãi suất, chia tiền, đổi đơn vị) PHẢI gọi công cụ `tinh_toan` rồi dùng đúng con số công cụ trả về. KHÔNG tự tính nhẩm. Công cụ nói kết quả là xấp xỉ thì khi trả lời cũng phải nói là xấp xỉ.",
  "• Tra xong: CHỈ nói phần có trong kết quả trả về và nêu nguồn khi người dùng cần độ chính xác. Phần không có trong kết quả thì KHÔNG được thêm vào — kể cả khi bạn \"nhớ\" là đúng. Không tự thêm mã vào một nhóm tỉnh, không tự suy ra số điều luật.",
  "• Nếu kết quả nói KHÔNG tìm thấy, hoặc các nguồn MÂU THUẪN nhau: nói thẳng là chưa chắc, nêu các khả năng, và chỉ người dùng tới nguồn chính thức (cơ quan nhà nước, văn bản gốc, nhà sản xuất). Đừng chọn bừa một bên rồi trả lời như thể chắc chắn.",
  "• Đừng nói \"theo quy định hiện hành\" hay \"theo luật\" khi chưa tra. Không bịa số điều, số nghị định, mã tỉnh, ngày ban hành.",
  "• Việc KHÔNG cần tra thì cứ trả lời bình thường, đừng gọi công cụ cho có: viết lách, dịch, lập trình, tính toán, hướng dẫn cách làm, kiến thức phổ thông ổn định, và mọi việc liên quan tới tệp/hội thoại của chính người dùng.",
  "• Câu vừa cần dữ kiện vừa cần xử lý: TRA trước, rồi mới viết/sửa/tính theo dữ liệu vừa tra.",
].join("\n");

export function sseChannel(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 15000);
  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
    get closed() {
      return closed;
    },
    onClose(fn) {
      res.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        fn();
      });
    },
  };
}

function resolveImageProvider(preferredId = null) {
  const settings = readAppSettings();
  const rows = listProviderRows().filter((row) => Number(row.enabled) === 1);
  const withImages = rows.filter((row) => toRuntimeProvider(row).supportsImages);
  if (!withImages.length) return null;
  const explicit = preferredId && withImages.find((row) => row.id === preferredId);
  if (explicit) return toRuntimeProvider(explicit);
  const byDefault = settings.defaultProviderId && withImages.find((row) => row.id === settings.defaultProviderId);
  if (byDefault) return toRuntimeProvider(byDefault);
  return toRuntimeProvider(withImages[0]);
}

/**
 * Billing facts handed to the model on every turn.
 *
 * The prompt never mentioned credits, so the assistant answered "fBuddy miễn
 * phí" whenever anyone asked about money. Every number here is read fresh so the
 * answer matches what the UI shows.
 */
export function buildCreditKnowledge(user) {
  const settings = creditSettings();
  if (!settings.enabled || !user?.id) return "";
  const summary = creditSummary(user.id);
  const buy = settings.buyUrl
    ? `“Mua thêm token” ở menu tài khoản → trang nạp credit ${settings.buyUrl}`
    : "“Mua thêm token” ở menu tài khoản";
  const vnd = (credits) => `${Math.round(credits * settings.vndPerCredit).toLocaleString("vi-VN")}đ`;
  const perCredit = settings.vndPerCredit % 1 === 0 ? String(settings.vndPerCredit) : settings.vndPerCredit.toFixed(2);
  const typical = typicalTurnCost();
  return [
    "## Credit (số liệu thật, được phép nói với người dùng)",
    `KHÔNG miễn phí: mỗi lượt trừ (token vào + token ra) × ${settings.perToken} credit, làm tròn lên, tối thiểu 1. ` +
      `1 credit = ${perCredit}đ. Một lượt chat thường ~${TYPICAL_TURN_TOKENS.toLocaleString("vi-VN")} token ≈ ${typical} credit ≈ ${vnd(typical)}. ` +
      `Đăng nhập lần đầu được tặng ${settings.signupCredits} credit (≈ ${vnd(settings.signupCredits)}).`,
    `Của người dùng này: ${summary.balance} credit (≈ ${vnd(summary.balance)}), đã dùng ${summary.spent}, ` +
      `trung bình ${summary.averageCostPerTurn}/lượt ≈ ${summary.estimatedTurnsLeft} lượt còn lại.`,
    `Muốn thêm credit: (1) bấm ảnh đại diện (góc trên phải) → “Xin thêm token” để gửi yêu cầu chờ quản trị viên duyệt; (2) ${buy}.`,
    "Kỹ năng và chuyên gia trong mục “Chợ kỹ năng” (thanh bên trái) hiện đang MIỄN PHÍ — bật là dùng được ngay, không tốn credit, không liên quan tới việc trừ credit theo lượt chat.",
    user.role === "admin"
      ? "Người dùng này là quản trị viên: hết credit vẫn chat được nhưng vẫn bị trừ credit."
      : "Được hỏi về credit/token/giá/số dư: trả lời 1–3 câu, luôn nêu công thức trừ credit, quy đổi ra VND, mức credit được tặng khi đăng nhập lần đầu và 2 đường nạp (xin thêm / mua thêm) bằng đúng số liệu trên; không nói fBuddy miễn phí, không bịa giá.",
  ].join("\n");
}

/** Vision target for OCR when the chosen chat model cannot see images. */
function resolveVisionProviderFor({ providerId = null, model = null } = {}) {
  try {
    return resolveVisionTarget({ preferProviderId: providerId, preferModel: model });
  } catch {
    return null;
  }
}

export function buildSystemPrompt({ skill, files, settings, hubSkill = null, user = null, planFirst = false, message = "", conversationId = null, autoResearch = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const basePrompt = Array.isArray(settings.systemPrompt) ? settings.systemPrompt.join("\n") : settings.systemPrompt;
  const parts = [
    basePrompt,
    PRONOUN_RULES,
    CULTURE_RULES,
    RESEARCH_RULES,
    // Kết quả tra TRƯỚC (server tự tra, không chờ model gọi công cụ) — đặt ngay sau luật để model
    // đọc luật rồi đọc luôn dữ liệu, tránh trường hợp model trả lời theo trí nhớ.
    autoResearch?.text
      ? `KẾT QUẢ TRA CỨU TRƯỚC (server đã tra cho lượt này bằng researcher "${autoResearch.label}", mức chắc chắn: ${autoResearch.confidence}).\n` +
        "Đây là dữ liệu CHÍNH của lượt này: trả lời dựa trên nó, nêu nguồn khi người dùng cần độ chính xác.\n" +
        "Phần không có trong kết quả tra cứu thì KHÔNG được thêm vào.\n\n" +
        autoResearch.text
      : "",
    buildAppsKnowledge({ message }),
    // Gợi ý kỹnăng/chuyên gia có sẵn trong chợ cho đúng việc người dùng đang hỏi.
    buildSkillSuggestionBlock({ message, userId: user?.id ?? null, lang: user?.id ? userLocale(user.id) : "vi" }),
    // Bảng tra biển số chỉ ghép khi câu hỏi chạm tới biển số/xe — bảng dài, không nhét vào mọi lượt.
    buildVnPlateKnowledge({ message }),
    buildMemoryBlock({ userId: user?.id ?? null, query: message, conversationId, accountName: user?.name ?? null }),
    `Hôm nay là ${today}.`,
    SKILL_INSTRUCTIONS[skill] ?? "",
    planFirst
      ? "LƯỢT NÀY LÀ LƯỢT LẬP KẾ HOẠCH: hãy mô tả NGẮN GỌN kế hoạch sẽ làm (có gì, mấy phần/trang/sheet, cột nào, lấy dữ liệu từ đâu). " +
        "KHÔNG gọi công cụ tạo tệp (generate_pptx/generate_xlsx/xlsx_from_image) trong lượt này — người dùng sẽ bấm nút xác nhận ở dưới. " +
        "Chỉ gọi `list_files`/`read_image` nếu cần xem dữ liệu đã có để lập kế hoạch chính xác."
      : "",
    buildCreditKnowledge(user),
  ];
  if (hubSkill?.instructions) {
    parts.push(`Kỹ năng đang dùng: ${hubSkill.name}\n${hubSkill.instructions}`);
  }
  if (files.length) {
    parts.push(
      "Tệp người dùng đã tải lên trong hội thoại này. Khi gọi công cụ hãy dùng `id` dưới đây (KHÔNG dùng tên tệp làm fileId):\n" +
        files
          .map((f) => {
            const isImage = String(f.mime ?? "").startsWith("image/") || f.kind === "image";
            return `- ${f.name} — id: ${f.id} (${f.kind})${isImage ? " · là ẢNH: muốn đưa vào Excel hãy gọi `xlsx_from_image` với id này; nội dung ảnh được đọc tự động" : ""}`;
          })
          .join("\n"),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Normalises the request, persists the user turn and writes the SSE preamble. */
export async function prepareTurn({ user, body, channel }) {
  const settings = readAppSettings();
  // Built-in ids, free hub skills and hub skills the user owns are all valid;
  // anything else falls back to the configured default skill.
  const requestedSkill = body?.skill;
  const skill = isSelectableSkill({ skillId: requestedSkill, userId: user.id, role: user.role })
    ? requestedSkill
    : settings.defaultSkill ?? "auto";
  /** Prompt-pack skills bought from the Skill Hub (null for built-ins). */
  const hubSkill = hubSkillForUser({ skillId: skill, userId: user.id, role: user.role });
  const content = String(body?.content ?? "").trim();
  const attachmentIds = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
  if (!content && !attachmentIds.length) throw new ApiError(400, "bad_request", "Nội dung trống");

  // Học cách xưng hô từ chính câu người dùng vừa gõ (không tốn lượt AI): lần sau mở
  // hội thoại mới là đã xưng đúng vai, không phải đoán.
  learnSelfReference({ userId: user.id, text: content });

  // TRA TRƯỚC cho câu hỏi thuộc lĩnh vực cần dữ kiện (địa lý, văn hoá, giáo dục, AI, kinh tế,
  // chính phủ, biển số, toán). Không phụ thuộc việc model có chịu gọi `tra_cuu` hay không.
  const autoResearch = await maybePreResearch({ message: content });

  // Credit gate: metering on + no balance + not an admin ⇒ refuse with a clear
  // message (the UI turns this into a "nạp thêm" card).
  const credit = assertCanChat(user);
  if (!credit.allowed) {
    throw new ApiError(402, "insufficient_credits", credit.message, {
      balance: credit.balance,
      buyUrl: creditSettings().buyUrl,
    });
  }

  const { provider, model, fallbackFrom } = resolveProviderForChat({
    providerId: body?.providerId ?? null,
    model: body?.model ?? null,
  });
  // The configured default can be a provider that has no key yet (e.g. OpenRouter
  // before its key is pasted). The turn still runs; the UI explains the swap.
  const notice = fallbackFrom
    ? `Nhà cung cấp mặc định "${fallbackFrom.name}" chưa có API key nên lượt này dùng "${provider.name}". ` +
      "Vào Cài đặt → Nhà cung cấp AI để dán key."
    : null;

  // Force the *right* tool call when the user picked a file skill and asked for the
  // artifact: naming the function is what makes it deterministic on a small model
  // (`tool_choice: {type:"function",function:{name}}`). The exact tool depends on
  // whether an image is attached, so the name is resolved further down.
  // `planFirst` turns the first turn into a planning turn instead (see below).
  const planFirst = FILE_SKILLS.has(skill) && !isConfirmed(content);
  const forceTool = FILE_SKILLS.has(skill) && WANTS_FILE.test(content) && !planFirst;

  let conversation;
  if (body?.conversationId) {
    conversation = getOwnedConversation(body.conversationId, user.id);
    if (body?.providerId || body?.model || body?.skill) {
      updateConversation(conversation.id, {
        providerId: body?.providerId ?? conversation.provider_id,
        model: body?.model ?? conversation.model,
        skill,
      });
      conversation = getOwnedConversation(conversation.id, user.id);
    }
  } else {
    conversation = createConversation({
      userId: user.id,
      skill,
      providerId: provider.id,
      model,
    });
  }

  const attachmentRows = attachmentIds.map((id) => getOwnedFile(id, user.id));
  const attachments = attachmentRows.map((row) => {
    const dto = publicFile(row);
    // Uploads made before the conversation existed are re-homed to it.
    if (!row.conversation_id) update("files", row.id, { conversation_id: conversation.id });
    return dto;
  });

  const userMessage = createMessage({
    conversationId: conversation.id,
    userId: user.id,
    role: "user",
    content,
    attachments,
  });

  // Any turn makes this the account's current thread, so the next device the
  // user opens fBuddy on lands exactly here.
  setLastConversationId(user.id, conversation.id);

  const titled = maybeSetTitleFromFirstMessage(conversation, content || attachments[0]?.name || "Hội thoại mới");
  const updated = touchConversation(conversation.id, {
    preview: truncate(content || "(tệp đính kèm)", 120),
  });

  channel.send("start", {
    conversationId: conversation.id,
    messageId: null,
    userMessageId: userMessage.id,
    userMessage: {
      id: userMessage.id,
      conversationId: conversation.id,
      role: "user",
      content,
      attachments,
      createdAt: userMessage.created_at,
    },
    conversation: updated ?? publicConversation(conversation),
    providerId: provider.id,
    providerName: provider.name,
    model,
    skill,
    ...(notice ? { notice } : {}),
    title: titled?.title ?? (updated ?? conversation).title,
  });

  const files = all("files", "user_id = ? AND (conversation_id = ? OR conversation_id IS NULL)", [
    user.id,
    conversation.id,
  ], { order: "created_at DESC", limit: 50 }).map(publicFile);

  // Which tool the user's request needs, now that the attachments are known.
  const wantsImage = files.some((file) => file.kind === "image" || String(file.mime ?? "").startsWith("image/"));
  const forceToolName = !forceTool
    ? null
    : skill === "ppt"
      ? "generate_pptx"
      : skill === "data"
        ? "analyze_data"
        : wantsImage
          ? "xlsx_from_image"
          : "generate_xlsx";

  return { settings, skill, hubSkill, content, provider, model, conversation, userMessage, files, forceTool, forceToolName, planFirst };
}

/** Turns the stored history + fresh user turn into provider-shaped messages. */
export async function buildModelMessages({ conversationId, systemPrompt, historyLimit = 24 }) {
  const history = historyForModel(conversationId, { maxMessages: historyLimit });
  const messages = [{ role: "system", content: systemPrompt }];

  for (const entry of history) {
    if (entry.role !== "user") {
      messages.push({
        role: entry.role,
        content: entry.content,
        ...(entry.toolCalls?.length ? { toolCalls: entry.toolCalls } : {}),
        ...(entry.toolCallId ? { toolCallId: entry.toolCallId, name: entry.name } : {}),
      });
      continue;
    }
    const images = [];
    const textBits = [];
    for (const attachment of entry.attachments ?? []) {
      const row = all("files", "id = ?", [attachment.id])[0];
      if (!row) continue;
      const image = await asImagePayload(row);
      if (image) {
        // `fileId`/`name` ride along so the fallback OCR path knows which file
        // the pixels belong to (the adapters only read mime/dataBase64).
        images.push({ mime: image.mime, dataBase64: image.dataBase64, fileId: row.id, name: row.name });
        continue;
      }
      const text = await asTextPayload(row, { maxChars: 12000 });
      if (text) textBits.push(`Nội dung tệp ${row.name}:\n${text.text}`);
    }
    messages.push({
      role: "user",
      content: [entry.content, ...textBits].filter(Boolean).join("\n\n"),
      attachments: entry.attachments ?? [],
      ...(images.length ? { images } : {}),
    });
  }
  return messages;
}

/** Provider failures worth retrying elsewhere: no credit, bad key, rate limit. */
export function isProviderCreditError(error) {
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? "");
  if ([401, 402, 403, 429].includes(status)) return true;
  return /余额|欠费|quota|balance|credit|insufficient|billing|rate.?limit|invalid.?api.?key|unauthor/i.test(message);
}

/**
 * The model itself is gone (retired on the gateway, wrong id…). Worth one retry
 * with the provider's own default model before giving up on the provider.
 */
export function isProviderModelError(error) {
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? "");
  return (
    status === 404 ||
    /no endpoints? found|model\b[^.]{0,60}(not found|does not exist|unavailable|deactivated|deprecated|invalid)|unknown model|invalid model|not a valid model/i.test(
      message,
    )
  );
}

/** Replaces the throwing provider with the next usable one (once per turn). */
function switchToFallbackProvider({ failed, attemptedIds }) {
  const settings = readAppSettings();
  const skipped = new Set(attemptedIds);
  for (const row of listProviderRows()) {
    if (Number(row.enabled) !== 1 || skipped.has(row.id) || row.id === failed.id) continue;
    const candidate = nextUsableProvider({ excludeId: null, providerId: row.id });
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Runs the assistant turn: streams text, executes built-in + MCP tool calls and
 * persists one assistant message holding the whole turn.
 */
export async function runChatTurn({ user, turn, channel, signal }) {
  const { settings, skill, conversation, files } = turn;
  const started = Date.now();
  // These two may be swapped below when the configured provider has no credit.
  let provider = turn.provider;
  let model = turn.model;
  const attemptedProviderIds = [provider.id];

  const builtin = toolDefinitionsForSkill(skill);
  // A hub skill may narrow the toolset to the tools it actually needs.
  const offered = turn.hubSkill?.tools?.length
    ? builtin.filter((tool) => turn.hubSkill.tools.includes(tool.name) || tool.name === "list_files")
    : builtin;
  const modelTools = offered.map(toModelTool);
  // Resolution uses the FULL built-in list, not just the offered subset: a real
  // tool name must always execute, and an unknown name gets a useful message.
  const toolIndex = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, { source: "builtin" }]));

  let mcpTools = [];
  if (provider.supportsTools) {
    try {
      mcpTools = await listAllTools();
    } catch {
      mcpTools = [];
    }
    for (const tool of mcpTools) {
      modelTools.push({
        name: tool.qualifiedName,
        description: `[MCP:${tool.serverName}] ${tool.description}`.slice(0, 900),
        inputSchema: tool.inputSchema,
      });
      toolIndex.set(tool.qualifiedName, { source: "mcp", serverId: tool.serverId, rawName: tool.name });
    }
  }

  const systemPrompt = buildSystemPrompt({
    skill,
    files,
    settings,
    hubSkill: turn.hubSkill,
    user,
    planFirst: Boolean(turn.planFirst),
    message: turn.content,
    conversationId: conversation.id,
    autoResearch: turn.autoResearch ?? null,
  });
  const messages = await buildModelMessages({ conversationId: conversation.id, systemPrompt });

  // Gateways hard-fail on an image part the model cannot handle (GLM: "content.type
  // 参数非法"). Instead of dropping the picture, the backend falls back to a vision
  // model: it reads the image, and the extracted text goes into this turn's context
  // so the user's real request ("đưa hết data trong ảnh thành excel") still works.
  const vision = await applyVisionFallback({ messages, provider, model, user, conversationId: conversation.id, signal, channel });
  if (vision.applied && vision.read) {
    if (messages[0]?.role === "system") {
      // The text is already in context — say so, or the model calls read_image again
      // (an extra vision round trip that costs the user time and tokens).
      messages[0].content +=
        `\n\nẢnh trong hội thoại này đã được đọc sẵn bằng ${vision.providerName} và nội dung nằm ngay trong tin nhắn của người dùng — KHÔNG gọi read_image cho ảnh đó nữa.`;
    }
    // Belt and braces: with a small model the prompt hint is not always obeyed, so
    // take the tool away for this turn (its job is already done).
    for (const name of ["read_image", "read_image_content"]) {
      const index = modelTools.findIndex((tool) => tool.name === name);
      if (index >= 0) modelTools.splice(index, 1);
    }
  }

  const toolCalls = [];
  const toolResults = [];
  const artifacts = [];
  let text = "";
  let usage = null;
  let finishReason = "stop";
  const maxIterations = Math.min(
    Number(settings.maxToolIterations) || 6,
    MAX_TOOL_ITERATIONS_CAP,
  );
  const useTools = provider.supportsTools && (turn.toolMode ?? "auto") !== "off";

  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (signal.aborted) break;
      channel.send("status", { stage: iteration === 0 ? "thinking" : "calling_tool" });

      const pendingCalls = [];
      let iterationText = "";

      let streamError = null;
      // First call of a file-skill turn: name the tool the user's request needs so
      // the model cannot answer with prose instead of a file.
      const forcedName =
        iteration === 0 && useTools && turn.forceToolName && modelTools.some((tool) => tool.name === turn.forceToolName)
          ? turn.forceToolName
          : null;
      const toolMode = forcedName ? "required" : turn.toolMode ?? "auto";
      const toolChoice = forcedName ? { type: "function", function: { name: forcedName } } : undefined;
      try {
        for await (const event of streamChat({
          provider,
          model,
          messages,
          tools: useTools ? modelTools : [],
          toolMode,
          toolChoice,
          signal,
        })) {
          if (signal.aborted) break;
          switch (event.type) {
            case "delta":
              iterationText += event.text;
              text += event.text;
              channel.send("delta", { text: event.text });
              break;
            case "reasoning":
              channel.send("reasoning", { text: event.text });
              break;
            case "tool_call":
              pendingCalls.push(event);
              break;
            case "usage":
            case "usage_final":
              usage = { in: event.in ?? usage?.in ?? 0, out: event.out ?? usage?.out ?? 0 };
              break;
            case "done":
              finishReason = event.finishReason ?? "stop";
              break;
            default:
              break;
          }
        }
      } catch (err) {
        streamError = err;
      }

      // The default provider may be out of credit or have a revoked key, and a
      // model may have been retired by the gateway. As long as nothing was
      // streamed yet, recover: first retry the same provider with its own
      // default model, then swap to another ready provider.
      if (streamError) {
        const untouched = iteration === 0 && !text && !iterationText && !pendingCalls.length;
        const modelError = untouched && isProviderModelError(streamError);
        const creditError = untouched && isProviderCreditError(streamError);

        if (modelError && provider.defaultModel && provider.defaultModel !== model) {
          const from = model;
          model = provider.defaultModel;
          channel.send("notice", {
            message:
              `Model "${from}" không còn khả dụng (${truncate(String(streamError.message ?? ""), 120)}). ` +
              `Đã chuyển sang model mặc định của ${provider.name}.`,
          });
          iteration -= 1;
          continue;
        }

        const fallback = creditError || modelError
          ? switchToFallbackProvider({ failed: provider, attemptedIds: attemptedProviderIds })
          : null;
        if (!fallback) throw streamError;
        attemptedProviderIds.push(fallback.provider.id);
        channel.send("notice", {
          message:
            `Nhà cung cấp "${provider.name}" không dùng được (${truncate(String(streamError.message ?? ""), 160)}). ` +
            `Lượt này chuyển sang "${fallback.provider.name}".`,
        });
        provider = fallback.provider;
        model = fallback.model;
        // Retry the same iteration with the replacement provider.
        iteration -= 1;
        continue;
      }

      if (usage) channel.send("usage", usage);

      if (!pendingCalls.length) break;

      // Assistant turn that requested the tools, then the results themselves.
      messages.push({
        role: "assistant",
        content: iterationText,
        toolCalls: pendingCalls.map((call) => ({ id: call.id, name: call.name, args: call.args ?? {} })),
      });

      for (const call of pendingCalls) {
        if (signal.aborted) break;
        const meta = toolIndex.get(call.name);
        const startedAt = Date.now();
        const callRecord = {
          id: call.id,
          name: call.name,
          args: call.args ?? {},
          source: meta?.source ?? "unknown",
          ...(meta?.serverId ? { serverId: meta.serverId } : {}),
        };
        channel.send("tool_call", callRecord);

        let result;
        if (meta?.source === "builtin") {
          result = await executeTool(call.name, call.args ?? {}, {
            userId: user.id,
            conversationId: conversation.id,
            files,
            signal,
            // The current user message: tools read the intent from the user's own
            // words instead of trusting the model's arguments (see skills/vision.js).
            userMessage: turn.content ?? "",
            resolveImageProvider: async (preferred) => resolveImageProvider(preferred),
            resolveVisionTarget: async () => resolveVisionProviderFor({ providerId: provider.id, model }),
          });
        } else if (meta?.source === "mcp") {
          try {
            const { result: raw, durationMs } = await callTool({
              serverId: meta.serverId,
              toolName: meta.rawName ?? call.name,
              args: call.args ?? {},
              signal,
            });
            const flat = flattenToolResult(raw);
            result = {
              ok: !flat.isError,
              summary: truncate(flat.text || "(không có nội dung trả về)", 200),
              data: { text: flat.text },
              artifacts: [],
              modelText: flat.text || "(MCP tool không trả nội dung văn bản)",
              durationMs,
            };
          } catch (err) {
            result = {
              ok: false,
              summary: truncate(err?.message ?? String(err), 200),
              data: {},
              artifacts: [],
              modelText: `LỖI MCP: ${err?.message ?? err}`,
              durationMs: Date.now() - startedAt,
            };
          }
        } else {
          const available = [...toolIndex.keys()].join(", ");
          result = {
            ok: false,
            summary: `Không có công cụ tên "${call.name}"`,
            data: { available: [...toolIndex.keys()] },
            artifacts: [],
            modelText:
              `LỖI: không tồn tại công cụ "${call.name}". ` +
              `Các công cụ đang có: ${available}. Hãy gọi lại bằng tên đúng.`,
            durationMs: 0,
          };
        }

        const resultDto = {
          id: call.id,
          name: call.name,
          ok: Boolean(result.ok),
          summary: result.summary ?? "",
          data: result.data ?? {},
          artifacts: result.artifacts ?? [],
          error: result.error ?? null,
          durationMs: result.durationMs ?? Date.now() - startedAt,
          // Tappable options the tool wants the user to choose from (the web
          // renders them under the message; the value is sent as the next turn).
          ...(result.choices?.length ? { choices: result.choices } : {}),
        };
        toolCalls.push(callRecord);
        toolResults.push(resultDto);
        for (const artifact of result.artifacts ?? []) {
          artifacts.push(artifact);
          channel.send("artifact", artifact);
        }
        channel.send("tool_result", resultDto);

        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.modelText ?? result.summary ?? "",
          isError: !result.ok,
        });
      }

      if (iteration === maxIterations - 1) {
        channel.send("status", { stage: "finishing" });
      }
    }
  } catch (err) {
    const code = err?.code ?? "internal_error";
    const message = err?.message ?? String(err);
    const assistantMessage = createMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: "assistant",
      content: text,
      toolCalls,
      toolResults,
      artifacts,
      providerId: provider.id,
      model,
      usage,
      error: `${code}: ${message}`,
    });
    channel.send("error", { code, message });
    channel.send("done", { messageId: assistantMessage.id, finishReason: "error", iterations: 0 });
    audit(user.id, "chat.error", conversation.id, { code, message: truncate(message, 300) });
    return { messageId: assistantMessage.id, error: message };
  }

  // A planning turn gets its confirmation buttons from the *server*, not from the
  // model: glm-4-flash ignores `tool_choice` whenever the prompt says "propose a
  // plan first", so the buttons are attached here instead. They are persisted with
  // the message, so a reload keeps them.
  const planImage = files.find((file) => file.kind === "image" || String(file.mime ?? "").startsWith("image/"));
  const choices = turn.planFirst && !artifacts.length
    ? skill === "excel" && planImage
      ? // A photo in the request: the useful first question is *what to take from it*.
        excelChoices(planImage.id, planImage.name)
      : planChoices({ kind: skill === "ppt" ? "pptx" : "xlsx", detail: skill === "ppt" ? "theo dàn ý trên" : "theo kế hoạch trên" })
    : [];

  const assistantMessage = createMessage({
    conversationId: conversation.id,
    userId: user.id,
    role: "assistant",
    content: text,
    toolCalls,
    toolResults,
    artifacts,
    providerId: provider.id,
    model,
    usage,
    choices,
  });

  touchConversation(conversation.id, { preview: truncate(text || "(công cụ)", 120), increment: 1 });

  // Meter the turn. Gateways sometimes omit usage → charge the floor of 1.
  let credits = null;
  try {
    const cost = costForModel(model, usage);
    if (cost > 0) {
      credits = { cost, balance: spendCredits({ userId: user.id, amount: cost, ref: assistantMessage.id }) };
    }
  } catch (err) {
    console.warn("[fbuddy] không ghi được credit:", err?.message ?? err);
  }

  channel.send("done", {
    messageId: assistantMessage.id,
    finishReason,
    iterations: toolCalls.length,
    durationMs: Date.now() - started,
    usage,
    artifacts,
    ...(choices.length ? { choices } : {}),
    ...(credits ? { credits } : {}),
  });
  return { messageId: assistantMessage.id };
}

export { resolveImageProvider, qualifiedToolName, TOOL_DEFINITIONS };
export const chatToolNames = TOOL_DEFINITIONS.map((tool) => tool.name);

/** Best-effort conversation-object refresh used by the route layer. */
export function refreshConversation(conversationId) {
  try {
    return publicConversation(all("conversations", "id = ?", [conversationId])[0]);
  } catch {
    return null;
  }
}

export function newTurnId() {
  return newId("turn");
}
