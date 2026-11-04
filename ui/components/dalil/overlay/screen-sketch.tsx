"use client";
import {motion,useReducedMotion} from "motion/react";
import type {ScreenAnnotation} from "@/lib/contracts";
const ink={blue:"var(--color-accent-600)",rose:"var(--color-tone-rose-edge)",mint:"var(--color-tone-mint-edge)",sand:"var(--color-tone-sand-edge)",lilac:"var(--color-tone-lilac-edge)",ink:"var(--color-ink)"};
export function ScreenSketch({annotations}:{annotations:ScreenAnnotation[]}) {
  const reduced=useReducedMotion();
  return <><svg role="img" aria-label="Dalil screen annotations" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
    {annotations.map((a,i)=>{
      const paint={stroke:ink[a.tone??"blue"],strokeWidth:3,fill:"none",vectorEffect:"non-scaling-stroke" as const,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
      if(a.kind==="text")return null;
      if(a.kind==="ellipse")return <motion.ellipse key={i} cx={a.x+a.w/2} cy={a.y+a.h/2} rx={a.w/2} ry={a.h/2} {...paint} initial={{pathLength:reduced?1:0}} animate={{pathLength:1}} transition={{duration:reduced?0:0.45}}/>;
      if(a.kind==="rect")return <rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} rx={5} {...paint}/>;
      if(a.kind==="pen")return <motion.path key={i} d={a.points.map(([x,y],n)=>`${n?"L":"M"}${x},${y}`).join(" ")} {...paint} initial={{pathLength:reduced?1:0}} animate={{pathLength:1}} transition={{duration:reduced?0:0.45}}/>;
      if(a.kind!=="arrow")return null;
      const [x,y]=a.to, [sx,sy]=a.from,angle=Math.atan2(y-sy,x-sx);
      const wing=(offset:number)=>`${x-12*Math.cos(angle+offset)},${y-12*Math.sin(angle+offset)}`;
      return <path key={i} d={`M${sx},${sy} L${x},${y} M${wing(0.5)} L${x},${y} L${wing(-0.5)}`} {...paint}/>;
    })}
  </svg>{annotations.map((a,i)=>a.kind==="text"?<span key={i} dir="auto" className="pointer-events-none absolute max-w-64 rounded-md bg-paper/90 px-2 py-0.5 font-ink text-[22px] leading-7 font-bold" style={{left:`${a.x/10}%`,top:`${a.y/10}%`,maxWidth:`${100-a.x/10}%`,color:ink[a.tone??"ink"]}}>{a.text}</span>:null)}</>;
}
