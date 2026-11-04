"use client";
import {useCallback,useEffect,useState} from "react";
import {RiArrowLeftLine,RiRefreshLine} from "@remixicon/react";
import {Button} from "@/components/base/buttons/button";
import {IconButton} from "@/components/base/buttons/icon-button";
import {ScrollFade,useScrollFade} from "@/components/foundations/scroll-fade/scroll-fade";
import {ProjectSwitcher} from "@/components/dalil/projects/project-switcher";
import {ReceiptsPanel} from "@/components/dalil/receipts/receipts-panel";
import {addProject,deleteProject,listProjects,setActiveProject,type ProjectState} from "@/lib/projects";
import {listReceipts,type RequestReceipt} from "@/lib/receipts";

export function LibraryPanel({kind,onBack,onProjectChanged}:{kind:"projects"|"receipts";onBack:()=>void;onProjectChanged:()=>void}) {
  const [projects,setProjects]=useState<ProjectState>({projects:[],active:null});
  const [receipts,setReceipts]=useState<RequestReceipt[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const fade=useScrollFade();
  const refresh=useCallback(()=>{
    const request=kind==="projects"?listProjects():listReceipts();
    return request.then(value=>{if(kind==="projects")setProjects(value as ProjectState);else setReceipts(value as RequestReceipt[]);})
      .catch(()=>setError(`Could not load ${kind}. Your saved data has not been changed.`))
      .finally(()=>setLoading(false));
  },[kind]);
  useEffect(()=>{void refresh();},[refresh]);
  const change=async(action:()=>Promise<unknown>)=>{
    setError(null);
    try {await action();setProjects(await listProjects());onProjectChanged();}
    catch(caught){setError(String(caught).includes("duplicate")?"A project with that name already exists.":"Could not save this change. Try again.");}
  };
  return <section className="pointer-events-auto flex w-140 flex-col px-4 pb-4 pt-3" aria-label={kind==="projects"?"Projects":"Receipts"}>
    <header className="flex items-center gap-2 border-b border-notch-rule pb-3">
      <Button size="small" variant="ghost" leadingIcon={RiArrowLeftLine} onClick={onBack}>Back</Button>
      <h2 className="flex-1 text-headline-semibold text-notch-ink">{kind==="projects"?"Projects":"Receipts"}</h2>
      <IconButton size="small" icon={RiRefreshLine} aria-label={`Refresh ${kind}`} onClick={()=>{setError(null);setLoading(true);void refresh();}}/>
    </header>
    {error && <p role="alert" className="py-3 text-body-regular text-notch-error">{error}</p>}
    {loading ? <p role="status" className="py-6 text-body-regular text-notch-muted">Loading {kind}…</p> : <div className="relative min-h-0">
      <div onScroll={fade.onScroll} className="max-h-[min(510px,calc(100dvh-7rem))] overflow-y-auto overscroll-contain py-4 pe-1">
        {kind==="projects" ? <>
          <p className="mb-4 text-body-regular text-notch-muted">Keep explanations and remembered lessons with the work they belong to.</p>
          <ProjectSwitcher inline projects={projects.projects} activeId={projects.active}
            onSelect={(id)=>void change(()=>setActiveProject(id))} onAdd={(name,folder)=>void change(()=>addProject(name,folder))}
            onDelete={(id)=>void change(()=>deleteProject(id))}/>
        </> : <ReceiptsPanel sample={false} host={receipts[0]?.host??null} rows={receipts.map(receipt=>({
          id:receipt.id,time:new Date(receipt.createdAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false}),host:receipt.host,
          included:receipt.screenshot?["context","screenshot"]:["context"],sizeKb:receipt.bytes/1024,redactions:{},hash:receipt.hash,createdAt:receipt.createdAt,model:receipt.model,
        }))}/>}
      </div><ScrollFade progress={fade.progress} surfaceClassName="from-notch"/>
    </div>}
  </section>;
}
