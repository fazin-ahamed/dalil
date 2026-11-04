import type { ScreenAnnotation, Tone } from "./contracts";
const tones: Tone[] = ["blue","rose","mint","sand","lilac","ink"];
const coord = (x: unknown) => typeof x === "number" && Number.isFinite(x) ? Math.max(0,Math.min(1000,x)) : null;
const point = (x: unknown): [number,number] | null => {
  if (!Array.isArray(x) || x.length !== 2) return null;
  const [a,b]=x.map(coord); return a===null || b===null ? null : [a,b];
};
/** Bounded drawing primitives only; never SVG, HTML, script or arbitrary paths supplied by a model. */
export function readAnnotations(value: unknown): ScreenAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0,24).flatMap((raw): ScreenAnnotation[] => {
    if (!raw || typeof raw !== "object") return [];
    const paint = tones.includes(raw.tone) ? {tone:raw.tone as Tone} : {};
    if (raw.kind === "pen") {
      if (!Array.isArray(raw.points)) return [];
      const points=raw.points.slice(0,160).map(point).filter((p: [number,number] | null): p is [number,number]=>p!==null);
      return points.length<2 ? [] : [{kind:"pen",points,...paint}];
    }
    if (raw.kind === "arrow") {
      const from=point(raw.from), to=point(raw.to);
      return from && to ? [{kind:"arrow",from,to,...paint}] : [];
    }
    const x=coord(raw.x), y=coord(raw.y);
    if (x===null || y===null) return [];
    if (raw.kind === "text" && typeof raw.text === "string" && raw.text.trim()) return [{kind:"text",x,y,text:raw.text.trim().slice(0,100),...paint}];
    const w=coord(raw.w), h=coord(raw.h);
    if ((raw.kind === "ellipse" || raw.kind === "rect") && w!==null && h!==null && w>0 && h>0) return [{kind:raw.kind,x,y,w:Math.min(w,1000-x),h:Math.min(h,1000-y),...paint}];
    return [];
  });
}
