"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ScaledFrameProps {
  /** Natural width of the content in px. */
  width?: number;
  /** Target scale. It shrinks further when the container is narrower than width times scale. */
  scale?: number;
  children: ReactNode;
}

/**
 * Shows a fixed-width block smaller. A transform does not change layout, so the frame measures the
 * block and reserves exactly its scaled width and height. It follows the block when its height
 * changes and the container when its width does.
 */
export function ScaledFrame({ width = 560, scale = 0.72, children }: ScaledFrameProps) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [factor, setFactor] = useState(scale);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const measure = () => {
      setFactor(Math.min(scale, box.clientWidth / width));
      setHeight(content.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scale, width]);

  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto" style={{ width: width * factor, height: height * factor }}>
        <div ref={inner} style={{ width, transform: `scale(${factor})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
