import { useState } from "react";
import { BarChart3, FileSpreadsheet, Image as ImageIcon, Presentation } from "lucide-react";
import { useI18n } from "../i18n";
import { useToast } from "../state/store";
import { DataLab } from "./DataLab";
import { ExcelBuilder } from "./ExcelBuilder";
import { ImageStudio } from "./ImageStudio";
import { PptBuilder } from "./PptBuilder";
import "./studio.css";

type StudioTab = "image" | "ppt" | "excel" | "data";

const TABS: { id: StudioTab; labelKey: string; icon: typeof ImageIcon }[] = [
  { id: "image", labelKey: "studio.tab.image", icon: ImageIcon },
  { id: "ppt", labelKey: "studio.tab.ppt", icon: Presentation },
  { id: "excel", labelKey: "studio.tab.excel", icon: FileSpreadsheet },
  { id: "data", labelKey: "studio.tab.data", icon: BarChart3 },
];

/**
 * Studio — nơi dùng trực tiếp bốn kỹ năng mà không cần chat.
 * `onOpenChat` do trang cha truyền vào; nếu không có thì chỉ thông báo cho người dùng.
 */
export function StudioPage({ onOpenChat }: { onOpenChat?: () => void } = {}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [tab, setTab] = useState<StudioTab>("image");

  const openChat = onOpenChat ?? (() => push(t("studio.openChatHint"), "info"));

  return (
    <div className="page">
      <div className="page-inner">
        <div className="card studio-intro">
          <div className="row gap-3">
            <div className="studio-intro-mark">🎨</div>
            <div className="grow">
              <div className="card-title">{t("studio.title")}</div>
              <div className="card-desc">{t("studio.intro")}</div>
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
                  <Icon size={15} /> {t(item.labelKey)}
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
