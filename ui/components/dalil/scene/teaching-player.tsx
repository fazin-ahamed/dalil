"use client";
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from "react";
import {AnimatePresence,motion,useReducedMotion} from "motion/react";
import {RiPauseLine,RiPlayLine,RiCloseLine} from "@remixicon/react";
import {IconButton} from "@/components/base/buttons/icon-button";
import type {TeachingBeat} from "@/lib/contracts";
import {beatAtOffset,captionDuration} from "@/lib/teaching";
import {speak,type Speech} from "@/lib/voice";

export function TeachingPlayer({beats,ready,onStep,onFinish,onDismiss,controlsRef,onLayout}:{
  beats:TeachingBeat[];ready:boolean;onStep:(index:number,beat:TeachingBeat)=>void;onFinish:()=>void;onDismiss:()=>void;
  controlsRef:RefObject<HTMLDivElement|null>;onLayout:()=>void;
}) {
  const [index,setIndex]=useState(0),[mode,setMode]=useState<"waiting"|"voice"|"captions"|"done">("waiting");
  const [paused,setPaused]=useState(false),reduced=useReducedMotion();
  const callbacks=useRef({onStep,onFinish});
  useEffect(()=>{callbacks.current={onStep,onFinish};},[onStep,onFinish]);
  useEffect(()=>{
    if(!ready||!beats.length)return;
    let active=true,voice:Speech|null=null,started=false;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    void speak(beats.map(beat=>beat.text).join(" "),{
      onStart:()=>{if(active){started=true;clearTimeout(deadline);setMode("voice");}},
      onProgress:offset=>{if(active)setIndex(previous=>Math.max(previous,beatAtOffset(beats,offset)));},
    }).then(value=>{
      if(!active){value.stop();return;}voice=value;
      deadline=setTimeout(()=>{if(!started)value.stop();},8000);
      void value.audible.then(heard=>{if(active&&!heard)setMode("captions");});
      void value.done.then(complete=>{
        clearTimeout(deadline);if(!active)return;
        if(complete){setMode("done");callbacks.current.onFinish();}else setMode("captions");
      });
    }).catch(()=>{if(active)setMode("captions");});
    return()=>{active=false;clearTimeout(deadline);voice?.stop();};
  },[beats,ready]);
  useEffect(()=>{if(ready&&beats[index])callbacks.current.onStep(index,beats[index]);},[index,beats,ready]);
  useEffect(()=>{
    if(mode!=="captions"||paused||!beats[index])return;
    const timer=setTimeout(()=>{
      if(index+1<beats.length)setIndex(index+1);else{setMode("done");callbacks.current.onFinish();}
    },captionDuration(beats[index].text));
    return()=>clearTimeout(timer);
  },[mode,paused,index,beats]);
  useLayoutEffect(onLayout,[mode,index,paused,onLayout]);
  const show=mode==="captions"&&!!beats[index];
  return <div className="dalil-caption-position pointer-events-none absolute inset-x-6 z-100 flex items-end justify-center gap-2">
    <AnimatePresence initial={false}>
      {show&&<motion.div key="captions" initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:6}} transition={{duration:0.16}}
        className="dalil-lesson-captions max-w-168 rounded-xl px-5 py-3" role="status" aria-live={paused?"off":"polite"} aria-atomic="true">
        <p dir="auto" className="text-title-3-medium">{beats[index].text}</p>
      </motion.div>}
    </AnimatePresence>
    {show&&<div ref={controlsRef} className="dalil-caption-controls pointer-events-auto flex shrink-0 rounded-xl p-1">
      <IconButton icon={paused?RiPlayLine:RiPauseLine} size="small" aria-label={paused?"Resume captions":"Pause captions"} onClick={()=>setPaused(!paused)} className="border-transparent bg-transparent text-text-white shadow-none hover:bg-notch-raised-2 active:scale-95"/>
      <IconButton icon={RiCloseLine} size="small" aria-label="Dismiss captions" onClick={onDismiss} className="border-transparent bg-transparent text-text-white shadow-none hover:bg-notch-raised-2 active:scale-95"/>
    </div>}
  </div>;
}
