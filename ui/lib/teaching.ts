import type {Scene,TeachingBeat} from "./contracts";
// @ts-expect-error node strip-types needs the extension
import {angleArc} from "./visual-geometry.ts";

/** Spoken captions contain no Markdown or code; full formatted answers remain in chat. */
export function plainSpeech(text:string):string {
  return text.replace(/```[\s\S]*?(?:```|$)/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/(\d)\s*\*\s*(?=\d)/g,"$1 times ").replace(/×/g," times ").replace(/^[#>*-]+\s*/gm,"").replace(/[*_`]/g,"").replace(/\s+/g," ").trim();
}
const ids=(scene?:Scene|null)=>new Set(scene?.type==="model3d"?[...scene.parts.map(p=>p.id),...(scene.angles??[]).map(a=>a.id)]:scene?.items.map(i=>i.id)??[]);
function phrases(text:string):string[] {
  const words=plainSpeech(text).split(/\s+/).filter(Boolean).map(word=>word.length>120?word.slice(0,119)+"…":word),out:string[]=[];
  let line:string[]=[];
  for(const word of words) {
    if(line.length && (line.length>=22 || [...line,word].join(" ").length>120)) {out.push(line.join(" "));line=[];}
    line.push(word);
    if(line.length>=6 && /[.!?]$/.test(word)){out.push(line.join(" "));line=[];}
  }
  if(line.length)out.push(line.join(" "));return out;
}
/** Models can name existing targets only. Captions stay short enough for two lines. */
export function readLesson(value:unknown,scene?:Scene|null):TeachingBeat[] {
  if(!Array.isArray(value))return [];
  const targets=ids(scene);
  return value.slice(0,32).flatMap((raw):TeachingBeat[]=>{
    if(!raw||typeof raw!=="object"||typeof raw.text!=="string")return [];
    const text=plainSpeech(raw.text).slice(0,1200);if(!text)return [];
    const target=typeof raw.target==="string"&&targets.has(raw.target)?raw.target:undefined;
    return phrases(text).map(text=>({text,...(target?{target}:{})}));
  }).slice(0,48);
}

/** A legacy endpoint can still teach from its short model captions or the answer's spoken sentences. */
export function lessonFor(text:string,scene?:Scene|null,provided?:TeachingBeat[]):TeachingBeat[] {
  const explicit=readLesson(provided,scene);if(explicit.length)return explicit;
  if(scene?.type==="model3d" && scene.labels.some(label=>label.caption)) {
    return readLesson([
      ...(scene.intro?[{text:scene.intro}]:[]),
      ...scene.labels.filter(label=>label.caption).map(label=>({text:label.caption,target:typeof label.target==="string"?label.target:undefined})),
      ...(scene.angles??[]).flatMap(angle=>{const arc=angleArc(angle);return arc?[{text:`The angle between these bonds is ${arc.degrees} degrees.`,target:angle.id}]:[]}),
    ],scene);
  }
  const targets=scene?.type==="diagram"?scene.items.filter(item=>item.kind==="box"||item.kind==="text").map(item=>item.id):[];
  return phrases(text).slice(0,48).map((text,i)=>({text,...(targets.length?{target:targets[Math.min(i,targets.length-1)]}:{})}));
}
export function captionDuration(text:string):number{return Math.max(2400,Math.min(7500,text.split(/\s+/).length*340+500));}
export function beatAtOffset(beats:TeachingBeat[],offset:number):number {
  let end=0;for(let i=0;i<beats.length;i++){end+=beats[i].text.length+1;if(offset<end)return i;}return Math.max(0,beats.length-1);
}

/** Teaching uses the overlay pointer; desktop actions require an actual request to operate an app. */
export function allowsDesktopActions(question:string):boolean {
  const teaching=/^(?:please\s+|can you\s+|could you\s+)?(?:explain|teach|what\b|why\b|how\b|draw\b|show me (?:a |the )?(?:model|diagram))/i.test(question.trim());
  const action=/(?:^|\b(?:and|then|also|please|can you|could you)\s+)(?:open|launch|click|type|fill|scroll|select|navigate|switch|close|move|use)\b/i.test(question.trim());
  return !teaching||action;
}
