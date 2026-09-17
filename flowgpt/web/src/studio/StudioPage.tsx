import { useState } from "react";
import { BarChart3, FileSpreadsheet, Image as ImageIcon, Presentation } from "lucide-react";
import { useToast } from "../state/store";
import { DataLab } from "./DataLab";
import { ExcelBuilder } from "./ExcelBuilder";
import { ImageStudio } from "./ImageStudio";
import { PptBuilder } from "./PptBuilder";
import "./studio.css";

type StudioTab = "image" | "ppt" | "excel" | "data";

const TABS: { id: StudioTab; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Sửa ảnh", icon: ImageIcon },
  { id: "ppt", label: "Làm PPT", icon: Presentation },
  { id: "excel", label: "Làm Excel", icon: FileSpreadsheet },
  { id: "data", label: "Phân tích dữ liệu", icon: BarChart3 },
];

/**
 * Studio — nơi dùng trực tiếp bốn kỹ năng mà không cần chat.
 * `onOpenChat` do trang cha truyền vào; nếu không có thì chỉ thông báo cho người dùng.
 */
export function StudioPage({ onOpenChat }: { onOpenChat?: () => void } = {}) {
  const { push } = useToast();
  const [tab, setTab] = useState<StudioTab>("image");

  const openChat = onOpenChat ?? (() => push("Mở khung chat ở thanh bên để xem kết quả đầy đủ", "info"));

  return (
    <div className="page">
      <div className="page-inner">
        <div className="card studio-intro">
          <div className="row gap-3">
            <div className="studio-intro-mark">🎨</div>
            <div className="grow">
              <div className="card-title">Studio FlowGpt</div>
              <div className="card-desc">
                Làm việc trực tiếp với bốn kỹ năng, không cần gõ lệnh chat: sửa ảnh trên canvas, dựng slide
                PowerPoint, tạo bảng tính Excel và phân tích dữ liệu. Kết quả AI tạo ra (ảnh, PPTX, XLSX) sẽ
                xuất hiện ngay trong công cụ và được lưu vào FlowGpt.
              </div>
            </div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`tab ${tab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span className="tab-inner">
                  <Icon size={15} /> {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {tab === "image" && <ImageStudio onOpenChat={openChat} />}
        {tab === "ppt" && <PptBuilder onOpenChat={openChat} />}
        {tab === "excel" && <ExcelBuilder onOpenChat={openChat} />}
        {tab === "data" && <DataLab onOpenChat={openChat} />}
      </div>
    </div>
  );
}
