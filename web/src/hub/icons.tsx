import {
  BarChart3,
  Shield,
  Terminal,
  Brain,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Languages,
  Mail,
  Megaphone,
  Plug,
  Presentation,
  Scale,
  Sparkles,
  Table2,
} from "lucide-react";
import type { ReactElement } from "react";

/**
 * Icon names a hub skill may store. The public page and the admin form share
 * this table, so a new skill always renders the same icon in both places.
 */
export const HUB_ICON_NAMES = [
  "chat",
  "image",
  "ppt",
  "excel",
  "word",
  "data",
  "mcp",
  "document",
  "translate",
  "org",
  "megaphone",
  "clipboard",
  "scale",
  "graduation",
  "chart",
  "mail",
  "shield",
  "terminal",
  "sparkles",
] as const;

/** Hub icon name → lucide icon (unknown names fall back to a sparkle). */
export function hubIcon(icon: string | null | undefined, size = 16): ReactElement {
  switch ((icon ?? "").trim().toLowerCase()) {
    case "shield":
      return <Shield size={size} />;
    case "terminal":
      return <Terminal size={size} />;
    case "chat":
      return <Brain size={size} />;
    case "image":
      return <ImageIcon size={size} />;
    case "ppt":
      return <Presentation size={size} />;
    case "excel":
      return <FileSpreadsheet size={size} />;
    case "word":
      return <FileText size={size} />;
    case "data":
      return <Table2 size={size} />;
    case "mcp":
      return <Plug size={size} />;
    case "document":
      return <FileText size={size} />;
    case "translate":
      return <Languages size={size} />;
    case "org":
      return <GraduationCap size={size} />;
    case "megaphone":
      return <Megaphone size={size} />;
    case "clipboard":
      return <ClipboardList size={size} />;
    case "scale":
      return <Scale size={size} />;
    case "graduation":
      return <GraduationCap size={size} />;
    case "chart":
      return <BarChart3 size={size} />;
    case "mail":
      return <Mail size={size} />;
    default:
      return <Sparkles size={size} />;
  }
}
