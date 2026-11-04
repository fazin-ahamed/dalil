import type { DiagramScene } from "@/lib/contracts";
import { drawOrder } from "@/lib/diagram-geometry";

/** A sentence ends with a full stop unless it already ends with punctuation. Empty text stays empty. */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * The words a screen reader gets for a note: the title, then each item in draw order, then the footnote.
 * Pure, so it runs anywhere the note does.
 */
export function describeDiagram(scene: DiagramScene): string {
  const names = new Map<string, string>();
  for (const item of scene.items) {
    if (item.kind === "box" || item.kind === "text") names.set(item.id, item.text);
  }
  const name = (id: string) => names.get(id) ?? id;

  const parts = [sentence(scene.title)];
  for (const item of drawOrder(scene)) {
    switch (item.kind) {
      case "box":
        parts.push(sentence(item.caption ? `${item.caption}: ${item.text}` : item.text));
        break;
      case "text":
        parts.push(sentence(item.text));
        break;
      case "arrow":
        parts.push(sentence(`Arrow from ${name(item.from)} to ${name(item.to)}${item.label ? `, ${item.label}` : ""}`));
        break;
      case "line":
      case "angle":
        parts.push(sentence(`${item.kind === "angle" ? "Angle" : "Line"}${item.label ? `: ${item.label}` : ""}`));
        break;
      case "highlight":
        parts.push(sentence(`Highlighted: ${name(item.target)}`));
        break;
    }
  }
  if (scene.footnote) parts.push(sentence(scene.footnote));
  return parts.filter(Boolean).join(" ");
}
