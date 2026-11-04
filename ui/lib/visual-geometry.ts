import type { Angle3D, Part } from "./contracts";

type Vec = [number, number, number];
const length = (v: Vec) => Math.hypot(...v);
const unit = (v: Vec): Vec => { const n = length(v); return v.map((x) => x / n) as Vec; };
const cross = (a: Vec, b: Vec): Vec => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

/** The arc and its true angle, computed from the three points rather than a model's claimed value. */
export function angleArc(angle: Angle3D): { points: Vec[]; label: Vec; degrees: number } | null {
  const a = angle.from.map((v, i) => v - angle.vertex[i]) as Vec;
  const b = angle.to.map((v, i) => v - angle.vertex[i]) as Vec;
  if (![...a, ...b].every(Number.isFinite) || length(a) < 1e-6 || length(b) < 1e-6) return null;
  const u = unit(a), v = unit(b);
  const radians = Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, x, i) => sum + x*v[i], 0))));
  if (radians < 1e-6) return null;
  let normal = cross(u, v);
  if (length(normal) < 1e-6) normal = cross(u, Math.abs(u[1]) < 0.8 ? [0,1,0] : [1,0,0]);
  const w = unit(cross(unit(normal), u));
  const radius = Math.max(0.05, Math.min(angle.radius ?? Math.min(length(a),length(b))*0.42, Math.min(length(a),length(b))*0.85));
  const at = (t: number, scale = 1): Vec => angle.vertex.map((x,i) => x + radius*scale*(u[i]*Math.cos(t) + w[i]*Math.sin(t))) as Vec;
  return { points: Array.from({length:33},(_,i)=>at(radians*i/32)), label: at(radians/2,1.3), degrees: Math.round(radians*180/Math.PI*10)/10 };
}

/** Endpoint-defined bonds avoid guessed cylinder rotations in molecular models. */
export function bondPart(id: string, from: Vec, to: Vec, radius: number): Extract<Part, {shape:"cylinder"}> | null {
  const d = to.map((x,i)=>x-from[i]) as Vec;
  const size = length(d);
  if (!Number.isFinite(size) || size < 0.02) return null;
  return {id, shape:"cylinder", pos:from.map((x,i)=>(x+to[i])/2) as Vec, length:size, radiusTop:radius,
    rot:[0,Math.atan2(-d[2],d[0]),Math.asin(d[1]/size)]};
}


/** Keep measured angle values readable beside atoms and other degree labels. */
export function placeAngleLabels(anchors: {x:number;y:number}[], atoms:{x:number;y:number;radius:number}[], size:{width:number;height:number}) {
  const placed:{x:number;y:number}[]=[];
  const offsets=[[0,0],[0,-30],[0,30],[-48,0],[48,0],[-48,-30],[48,30],[0,-60],[0,60]];
  for(const anchor of anchors) {
    const candidates=offsets.map(([x,y])=>({x:Math.max(30,Math.min(size.width-30,anchor.x+x)),y:Math.max(18,Math.min(size.height-18,anchor.y+y))}));
    const at=candidates.find(p=>!placed.some(q=>Math.abs(p.x-q.x)<48&&Math.abs(p.y-q.y)<26)&&!atoms.some(a=>Math.hypot(p.x-a.x,p.y-a.y)<a.radius+17))??candidates.at(-1)!;
    placed.push(at);
  }
  return placed;
}
