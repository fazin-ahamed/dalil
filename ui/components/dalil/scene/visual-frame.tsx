"use client";

import "./teaching.css";

import type { ReactNode, PointerEventHandler, KeyboardEventHandler } from "react";
import { RiCloseLine, RiDragMove2Line, RiRestartLine } from "@remixicon/react";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/** Small close control; the teaching content carries the hierarchy. */
export function CloseDot({label,onClose,className}:{label:string;onClose:()=>void;className?:string}) {
  return <IconButton icon={RiCloseLine} size="small" aria-label={label} onClick={onClose}
    className={cx("border-transparent bg-transparent text-text-secondary shadow-none hover:bg-background-secondary-default active:scale-95",className)}/>;
}

/** A quiet, movable frame; only its title and direct controls sit above the visual. */
export function VisualFrame({
  title,
  onClose,
  children,
  className,
  onMoveStart,
  onMoveKey,
  onReplay,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  onMoveStart?: PointerEventHandler<HTMLButtonElement>;
  onMoveKey?: KeyboardEventHandler<HTMLButtonElement>;
  onReplay?:()=>void;
}) {
  return (
    <section
      aria-label={title}
      className={cx("dalil-teaching-frame pointer-events-auto overflow-hidden rounded-2xl border border-rule bg-paper shadow-card", className)}
    >
      <header className="dalil-teaching-toolbar relative flex h-10 items-center gap-1 px-2">
        {onMoveStart ? <Button variant="ghost" size="small" leadingIcon={RiDragMove2Line}
          aria-label={`Move ${title}; use arrow keys to reposition`} onPointerDown={(event)=>{event.currentTarget.focus({preventScroll:true});onMoveStart(event);}} onKeyDown={onMoveKey}
          className="h-full min-w-0 flex-1 cursor-grab touch-none justify-start rounded-lg bg-transparent text-caption-1-medium text-text-secondary hover:bg-transparent active:bg-transparent active:cursor-grabbing">
          <span className="truncate">{title}</span>
        </Button> : <span className="min-w-0 flex-1 truncate px-2 text-caption-1-medium text-text-secondary">{title}</span>}
        {onReplay && <IconButton icon={RiRestartLine} size="small" aria-label="Replay explanation" onClick={onReplay} className="border-transparent bg-transparent text-text-secondary shadow-none hover:bg-background-secondary-default active:scale-95"/>}
        <CloseDot label={`Close ${title}`} onClose={onClose}/>
      </header>
      {children}
    </section>
  );
}
