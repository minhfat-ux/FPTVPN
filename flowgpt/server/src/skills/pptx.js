import PptxGenJS from "pptxgenjs";
import { saveBuffer, publicArtifact } from "../files.js";
import { badRequest } from "../util.js";

const THEMES = {
  flow: { bg: "FFFFFF", accent: "1D4ED8", title: "0F172A", body: "334155", subtle: "F1F5F9" },
  dark: { bg: "0B1220", accent: "38BDF8", title: "FFFFFF", body: "CBD5E1", subtle: "111C33" },
  warm: { bg: "FFFBF5", accent: "EA580C", title: "1C1917", body: "44403C", subtle: "FEF3C7" },
  mint: { bg: "F7FFFB", accent: "059669", title: "052E1B", body: "374151", subtle: "D1FAE5" },
};

function normalizeSlides(input) {
  if (!Array.isArray(input) || !input.length) {
    throw badRequest("generate_pptx cần `slides` là mảng có ít nhất 1 phần tử");
  }
  return input.slice(0, 60).map((slide, index) => {
    if (typeof slide === "string") return { title: slide, bullets: [] };
    const bullets = Array.isArray(slide?.bullets)
      ? slide.bullets.map((b) => (typeof b === "string" ? b : b?.text ?? "")).filter(Boolean)
      : [];
    return {
      title: String(slide?.title ?? `Slide ${index + 1}`).slice(0, 200),
      subtitle: slide?.subtitle ? String(slide.subtitle).slice(0, 300) : null,
      bullets: bullets.slice(0, 12).map((b) => String(b).slice(0, 400)),
      notes: slide?.notes ? String(slide.notes).slice(0, 2000) : null,
      layout: slide?.layout === "title" || index === 0 ? "title" : "content",
    };
  });
}

/** Builds a .pptx deck and stores it as a downloadable artifact. */
export async function generatePptx(args, ctx) {
  const theme = THEMES[args?.theme] ?? THEMES.flow;
  const slides = normalizeSlides(args?.slides);
  const deckTitle = String(args?.title ?? "Bộ slide").slice(0, 200);
  const subtitle = args?.subtitle ? String(args.subtitle).slice(0, 300) : null;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "FlowGpt";
  pptx.company = "MeetFlow AI";
  pptx.title = deckTitle;

  for (const [index, slide] of slides.entries()) {
    const s = pptx.addSlide();
    s.background = { color: theme.bg };

    if (slide.layout === "title") {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 5.63, fill: { color: theme.accent } });
      s.addText(slide.title, {
        x: 0.9,
        y: 1.7,
        w: 8.2,
        h: 1.6,
        fontSize: 40,
        bold: true,
        color: theme.title,
        fontFace: "Segoe UI",
      });
      const sub = slide.subtitle ?? (index === 0 ? subtitle : null);
      if (sub) {
        s.addText(sub, { x: 0.95, y: 3.35, w: 8.2, h: 0.9, fontSize: 18, color: theme.body, fontFace: "Segoe UI" });
      }
      if (slide.bullets.length) {
        s.addText(slide.bullets.map((text) => ({ text, options: { bullet: true } })), {
          x: 0.95,
          y: 4.3,
          w: 8.2,
          h: 1.1,
          fontSize: 13,
          color: theme.body,
        });
      }
    } else {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: theme.accent } });
      s.addText(slide.title, {
        x: 0.6,
        y: 0.45,
        w: 8.8,
        h: 0.95,
        fontSize: 28,
        bold: true,
        color: theme.title,
        fontFace: "Segoe UI",
      });
      const bodyTop = slide.subtitle ? 1.85 : 1.55;
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: 0.65, y: 1.4, w: 8.7, h: 0.45, fontSize: 15, italic: true, color: theme.body });
      }
      if (slide.bullets.length) {
        s.addText(
          slide.bullets.map((text) => ({
            text,
            options: { bullet: { code: "25CF" }, breakLine: true },
          })),
          { x: 0.75, y: bodyTop, w: 8.6, h: 3.1, fontSize: 16, color: theme.body, lineSpacingMultiple: 1.25 },
        );
      }
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.35, w: 10, h: 0.28, fill: { color: theme.subtle } });
      s.addText(`${deckTitle}  •  ${index + 1}/${slides.length}`, {
        x: 0.6,
        y: 5.36,
        w: 8.8,
        h: 0.26,
        fontSize: 10,
        color: theme.body,
      });
    }

    if (slide.notes) s.addNotes(slide.notes);
  }

  const buffer = await writeDeck(pptx, deckTitle);
  const row = await saveBuffer({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    name: `${safeName(deckTitle)}.pptx`,
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer,
    kind: "pptx",
    origin: "artifact",
    meta: { slideCount: slides.length, theme: args?.theme ?? "flow", tool: "generate_pptx" },
  });
  const artifact = publicArtifact(row);
  return {
    ok: true,
    summary: `Đã tạo ${slides.length} slide: ${artifact.name}`,
    data: { slideCount: slides.length, title: deckTitle },
    artifacts: [artifact],
    modelText: `Đã tạo tệp PowerPoint "${artifact.name}" gồm ${slides.length} slide (id: ${artifact.id}).`,
  };
}

async function writeDeck(pptx, title) {
  try {
    return await pptx.write({ outputType: "nodebuffer" });
  } catch {
    return pptx.write("nodebuffer");
  }
}

function safeName(name) {
  return (
    String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "flowgpt-slides"
  );
}
