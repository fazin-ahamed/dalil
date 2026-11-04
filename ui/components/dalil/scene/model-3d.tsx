"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RiRestartLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import type { Model3DScene, Part, Tone } from "@/lib/contracts";
import {
  assembleStart,
  type Bounds,
  BLADE_CHORD,
  boundsCentre,
  boundsRadius,
  cameraDistance,
  DEFAULT_TWIST,
  orbitPosition,
  placeLabels,
  sceneBounds,
  spinRate,
  TONES,
  toneToken,
  type Vec3,
} from "@/lib/model-3d-layout";
import { angleArc, placeAngleLabels } from "@/lib/visual-geometry";
import { cx } from "@/utils/cx";

const FOV_DEG = 30;
/** Camera orbit: a three-quarter view from the front left, a little above. */
const VIEW_AZIMUTH = -35;
const VIEW_ELEVATION = 18;
const ASSEMBLE_MS = 900;
const PART_MS = 480;
const REVEAL_GAP_MS = 350;
/** Light colours, read from the same tokens as the parts. */
const LIGHT = { sky: "--color-paper-2", ground: "--color-rule-strong", key: "--color-text-white", rim: "--color-accent-200" };

export interface Model3DViewProps {
  scene: Model3DScene;
  className?: string;
  /** How many labels show. Undefined reveals them one by one, 350 ms apart, after the model has assembled. */
  revealedLabels?: number;
  activeLabel?:number|null;
  revealedAngles?:string[];
  /** Called once the model is on screen, or straight away when WebGL is not available. */
  onReady?: () => void;
}

type Colours = Map<string, THREE.Color>;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const colourOf = (colours: Colours, name: string) => colours.get(name) ?? new THREE.Color();

let probe: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (hex, lab, oklch...) as a three.js colour. The canvas parses every CSS colour syntax. */
function toColour(css: string): THREE.Color | null {
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d");
  if (!probe || !css) return null;
  probe.fillStyle = "transparent"; // an unparseable value leaves this in place, so it reads as no colour
  probe.fillStyle = css;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return a === 0 ? null : new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

/** Colours of every tone and light token, read from the view's own element. */
function readColours(host: HTMLElement): Colours {
  const style = getComputedStyle(host);
  const colours: Colours = new Map();
  for (const name of [...TONES.map(toneToken), ...Object.values(LIGHT)]) {
    const colour = toColour(style.getPropertyValue(name).trim());
    if (colour) colours.set(name, colour);
  }
  return colours;
}

function makeMaterial(colours: Colours, tone: Tone, opacity: number, double: boolean, clip: THREE.Plane | null) {
  const ink = tone === "ink";
  return new THREE.MeshStandardMaterial({
    color: colourOf(colours, toneToken(tone)),
    roughness: ink ? 0.45 : 0.7,
    metalness: ink ? 0.35 : 0,
    opacity,
    transparent: opacity < 1,
    side: double ? THREE.DoubleSide : THREE.FrontSide,
    clippingPlanes: clip ? [clip] : [],
  });
}

function geometryOf(part: Exclude<Part, { shape: "blades" }>): THREE.BufferGeometry {
  switch (part.shape) {
    case "box":
      return new THREE.BoxGeometry(...part.size);
    case "sphere":
      return new THREE.SphereGeometry(part.radius, 48, 32);
    case "cylinder":
      // Built along y, then turned to run along x, with radiusTop at the +x end.
      return new THREE.CylinderGeometry(
        part.radiusTop,
        part.radiusBottom ?? part.radiusTop,
        part.length,
        48,
        1,
        part.open === true,
      ).rotateZ(-Math.PI / 2);
    case "torus":
      // Built in the xy plane, then turned so the ring's axis runs along x.
      return new THREE.TorusGeometry(part.radius, part.tube, 24, 96).rotateY(Math.PI / 2);
  }
}

/** Blades as one instanced mesh: each blade is a thin box, radial, pitched by its twist, round the x axis. */
function bladesOf(part: Extract<Part, { shape: "blades" }>, material: THREE.Material): THREE.InstancedMesh {
  const count = Math.max(1, Math.round(part.count));
  const length = part.outerRadius - part.innerRadius;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(length, length * BLADE_CHORD, part.thickness),
    material,
    count,
  );
  const twist = part.twist ?? DEFAULT_TWIST;
  const mid = (part.innerRadius + part.outerRadius) / 2;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const radial = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
    const chord = new THREE.Vector3(0, -Math.sin(a), Math.cos(a))
      .multiplyScalar(Math.cos(twist))
      .add(new THREE.Vector3(Math.sin(twist), 0, 0));
    const normal = new THREE.Vector3().crossVectors(radial, chord);
    matrix.makeBasis(radial, chord, normal).setPosition(radial.clone().multiplyScalar(mid));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

interface Built {
  node: THREE.Group;
  material: THREE.MeshStandardMaterial;
  opacity: number;
}

/** One part as a group at its pos, so the assemble scales it about its own centre. */
function buildPart(part: Part, colours: Colours, clip: THREE.Plane | null): Built {
  const node = new THREE.Group();
  node.position.set(...part.pos);
  const opacity = "opacity" in part && part.opacity !== undefined ? part.opacity : 1;
  const open = part.shape === "cylinder" && part.open === true;
  const material = makeMaterial(colours, part.tone ?? "blue", opacity, clip !== null || open, clip);
  if (part.shape === "blades") {
    node.add(bladesOf(part, material));
  } else {
    const mesh = new THREE.Mesh(geometryOf(part), material);
    if ("rot" in part && part.rot) mesh.rotation.set(...part.rot);
    node.add(mesh);
  }
  return { node, material, opacity };
}

function boxCorners(b: Bounds): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

/** Set once a renderer fails, so later views on this page skip straight to the fallback. */
let webglFailed = false;

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  if (webglFailed) return null;
  try {
    return new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    webglFailed = true;
    return null;
  }
}

/**
 * A labelled 3D model over the screen: a clay render on a transparent canvas, turning slowly,
 * with numbered pills pinned to its parts. The pills and leaders are DOM and SVG, placed every frame.
 */
export function Model3DView({ scene, className, revealedLabels, onReady, activeLabel=null, revealedAngles }: Model3DViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const partAnchorRefs=useRef<(SVGCircleElement|null)[]>([]);
  const arcRefs=useRef<(SVGPathElement|null)[]>([]);
  const angleLeaderRefs=useRef<(SVGLineElement|null)[]>([]);
  const angleRefs=useRef<(SVGTextElement|null)[]>([]);
  const arcs=useMemo(()=>(scene.angles??[]).flatMap(a=>{const arc=angleArc(a);return arc?[{...arc,id:a.id}]:[];}),[scene]);
  const pillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const readyRef = useRef(onReady);
  const [unsupported, setUnsupported] = useState(false);
  const [timed, setTimed] = useState<{ scene: Model3DScene; count: number } | null>(null);
  /** The tour: null is the overview, otherwise the index of the label being taught. */
  const step=activeLabel;
  const [touched, setTouched] = useState(false);
  const focusRef = useRef<string | null>(null);
  const resetRef = useRef<() => void>(() => {});

  const ordered = useMemo(() => [...scene.labels].sort((a, b) => a.n - b.n), [scene.labels]);
  const ariaLabel = `${scene.title}. ${ordered.map((label) => `${label.n} ${label.text}`).join(", ")}. ${arcs.map(arc=>`${arc.degrees} degrees`).join(", ")}`;

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  // Labels reveal one at a time once the model has assembled, unless the caller sets how many show.
  useEffect(() => {
    if (revealedLabels !== undefined) return;
    let count = 0;
    let timer = 0;
    const reveal = () => {
      count += 1;
      setTimed({ scene, count });
      if (count < ordered.length) timer = window.setTimeout(reveal, REVEAL_GAP_MS);
    };
    timer = window.setTimeout(reveal, ASSEMBLE_MS);
    return () => window.clearTimeout(timer);
  }, [revealedLabels, scene, ordered.length]);

  /* The part of the label being taught stays bright and the rest fade back. */
  useEffect(() => {
    const target = step === null ? undefined : ordered[step]?.target;
    focusRef.current = typeof target === "string" ? target : null;
  }, [step, ordered]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 block size-full";
    const renderer = createRenderer(canvas);
    if (!renderer) {
      // Deferred so the fallback is set outside this effect's own commit.
      window.setTimeout(() => setUnsupported(true));
      readyRef.current?.();
      return;
    }
    host.appendChild(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.NeutralToneMapping;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colours = readColours(host);
    const stage = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 200);
    // spin turns the model about its centre; offset moves the centre of the parts onto the origin.
    const spin = new THREE.Group();
    const offset = new THREE.Group();
    spin.add(offset);
    stage.add(spin);

    const bounds = sceneBounds(scene.parts);
    const centre = boundsCentre(bounds);
    offset.position.set(-centre[0], -centre[1], -centre[2]);

    stage.add(new THREE.HemisphereLight(colourOf(colours, LIGHT.sky), colourOf(colours, LIGHT.ground), 1.8));
    const key = new THREE.DirectionalLight(colourOf(colours, LIGHT.key), 2.2);
    key.position.set(-6, 9, 10);
    const rim = new THREE.DirectionalLight(colourOf(colours, LIGHT.rim), 0.8);
    rim.position.set(7, 4, -9);
    stage.add(key, rim);

    // The cutaway plane is kept in the model's frame and re-expressed in world space every frame.
    const clipLocal = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const clipWorld = new THREE.Plane();
    const clip = scene.cutaway === true ? clipWorld : null;

    const nodes = new Map<string, THREE.Group>();
    const anims = scene.parts.map((part, i) => {
      const built = buildPart(part, colours, clip);
      offset.add(built.node);
      nodes.set(part.id, built.node);
      return { ...built, start: assembleStart(i, scene.parts.length, ASSEMBLE_MS, PART_MS) };
    });
    let assembling = !reduced;
    if (assembling) {
      for (const a of anims) {
        a.node.scale.setScalar(0.95);
        a.material.opacity = 0;
        a.material.transparent = true;
      }
    }
    const assemble = (elapsed: number) => {
      for (const a of anims) {
        const t = easeOut(clamp01((elapsed - a.start) / PART_MS));
        a.node.scale.setScalar(1 - 0.05 * (1 - t));
        a.material.opacity = a.opacity * t;
        a.material.transparent = t < 1 || a.opacity < 1;
      }
      if (elapsed >= ASSEMBLE_MS) assembling = false;
    };

    const size = { width: 1, height: 1 };
    /* What the person has changed by hand: tilt, zoom and a turn that stops the slow spin. */
    const view = { elevation: VIEW_ELEVATION, zoom: 1, driven: false };
    const placeCamera = () => {
      const distance = cameraDistance(boundsRadius(bounds) * 0.9, FOV_DEG, camera.aspect) * view.zoom;
      camera.position.set(...orbitPosition(distance, VIEW_AZIMUTH, view.elevation));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      size.width = Math.max(1, host.clientWidth);
      size.height = Math.max(1, host.clientHeight);
      renderer.setSize(size.width, size.height, false);
      camera.aspect = size.width / size.height;
      placeCamera();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const targets = ordered.map((label) => {
      const p: Vec3 = typeof label.target === "string" ? [0, 0, 0] : label.target;
      return {
        node: typeof label.target === "string" ? nodes.get(label.target) : undefined,
        point: new THREE.Vector3(...p),
      };
    });
    const corners = boxCorners(bounds);
    const v = new THREE.Vector3();
    const toScreen = (p: THREE.Vector3) => {
      p.project(camera);
      return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height };
    };
    const overlay = () => {
      scene.parts.forEach((part,i)=>{
        const node=nodes.get(part.id);if(!node)return;node.getWorldPosition(v);
        const at=toScreen(v);partAnchorRefs.current[i]?.setAttribute("cx",String(at.x));partAnchorRefs.current[i]?.setAttribute("cy",String(at.y));
      });
      const atomObstacles=scene.parts.filter(p=>p.shape==="sphere").map(part=>{
        const at=toScreen(v.set(...part.pos).applyMatrix4(offset.matrixWorld));
        const radius=part.shape==="sphere"?part.radius:0;
        const edge=toScreen(v.set(part.pos[0]+radius,part.pos[1],part.pos[2]).applyMatrix4(offset.matrixWorld));
        return {...at,radius:Math.max(10,Math.hypot(edge.x-at.x,edge.y-at.y))};
      });
      const angleSlots=placeAngleLabels(arcs.map(arc=>toScreen(v.set(...arc.label).applyMatrix4(offset.matrixWorld))),atomObstacles,size);
      arcs.forEach((arc,i)=>{
        const points=arc.points.map(p=>toScreen(v.set(...p).applyMatrix4(offset.matrixWorld)));
        arcRefs.current[i]?.setAttribute("d",points.map((p,n)=>`${n?"L":"M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));
        const at=angleSlots[i],middle=points[Math.floor(points.length/2)];
        angleRefs.current[i]?.setAttribute("x",String(at.x));angleRefs.current[i]?.setAttribute("y",String(at.y));
        const line=angleLeaderRefs.current[i];
        line?.setAttribute("x1",String(middle.x));line?.setAttribute("y1",String(middle.y));
        line?.setAttribute("x2",String(at.x));line?.setAttribute("y2",String(at.y));
      });
      const box = corners.map((c) => toScreen(v.copy(c).applyMatrix4(offset.matrixWorld)));
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      const model = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      const anchors = targets.map(({ node, point }, i) => {
        if (node) node.getWorldPosition(v);
        else v.copy(point).applyMatrix4(offset.matrixWorld);
        const at = toScreen(v);
        const pill = pillRefs.current[i];
        return { x: at.x, y: at.y, width: pill?.offsetWidth ?? 0, height: pill?.offsetHeight ?? 0 };
      });
      placeLabels(anchors, model, size).forEach((slot, i) => {
        const pill = pillRefs.current[i];
        if (pill) pill.style.transform = `translate3d(${slot.left}px, ${slot.top}px, 0)`;
        const at = anchors[i];
        const line = lineRefs.current[i];
        line?.setAttribute("x1", String(slot.lineX));
        line?.setAttribute("y1", String(slot.lineY));
        line?.setAttribute("x2", String(at.x));
        line?.setAttribute("y2", String(at.y));
        const dot = dotRefs.current[i];
        dot?.setAttribute("cx", String(at.x));
        dot?.setAttribute("cy", String(at.y));
      });
    };

    const spinning = scene.spin !== false && !reduced;
    const started = performance.now();
    let last = started;
    let angle = 0;

    /* Drag turns and tilts the model, the wheel zooms, a double click puts the view back. */
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      view.driven = true;
      setTouched(true);
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      angle += (e.clientX - drag.x) * 0.012;
      view.elevation = Math.min(80, Math.max(-60, view.elevation + (e.clientY - drag.y) * 0.3));
      drag = { x: e.clientX, y: e.clientY };
      placeCamera();
    };
    const onUp = () => {
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.zoom = Math.min(2.2, Math.max(0.45, view.zoom * (e.deltaY > 0 ? 1.08 : 0.92)));
      view.driven = true;
      setTouched(true);
      placeCamera();
    };
    const reset = () => {
      view.elevation = VIEW_ELEVATION;
      view.zoom = 1;
      view.driven = false;
      setTouched(false);
      placeCamera();
    };
    resetRef.current = reset;
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("dblclick", reset);

    const byId = new Map(scene.parts.map((part, i) => [part.id, anims[i]]));
    let applied: string | null | undefined;
    const applyFocus = () => {
      if (assembling || applied === focusRef.current) return;
      applied = focusRef.current;
      for (const [id, a] of byId) {
        const dim = applied !== null && id !== applied;
        const opacity = dim ? Math.min(a.opacity, 0.18) : a.opacity;
        a.material.opacity = opacity;
        a.material.transparent = opacity < 1;
      }
    };
    let frame = 0;
    let ready = false;
    const tick = (now: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      const elapsed = now - started;
      if (spinning && !view.driven) angle += spinRate(elapsed) * Math.min((now - last) / 1000, 0.1);
      last = now;
      spin.rotation.y = angle;
      spin.updateMatrixWorld(true);
      if (assembling) assemble(elapsed);
      else applyFocus();
      if (clip) clipWorld.copy(clipLocal).applyMatrix4(offset.matrixWorld);
      renderer.render(stage, camera);
      overlay();
      if (!ready) {
        ready = true;
        readyRef.current?.();
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("dblclick", reset);
      observer.disconnect();
      stage.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [scene, ordered, arcs]);

  const shown = revealedLabels ?? (timed?.scene === scene ? timed.count : 0);

  return (
    <div
      role={unsupported ? undefined : "img"}
      aria-label={unsupported ? undefined : ariaLabel}
      className={cx("relative isolate w-full min-h-64", className)}
    >
      <div ref={hostRef} className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" />
      {unsupported ? (
        <div className="relative flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-body-regular text-text-secondary">3D view not available on this display</p>
          <ul className="flex flex-col gap-1 font-ink text-[20px] leading-7 text-ink">
            {arcs.map(arc=><li key={arc.id}>{arc.degrees}°</li>)}
            {ordered.map((label) => (
              <li key={label.n}>{`${label.n} · ${label.text}`}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
            {scene.parts.map((part,i)=><circle key={part.id} data-teach-target={part.id} ref={el=>{partAnchorRefs.current[i]=el;}} r={2} className="opacity-0"/>)}
            {arcs.map((arc,i)=><g key={arc.id} className={cx("transition-opacity duration-200 motion-reduce:transition-none",revealedAngles&&!revealedAngles.includes(arc.id)?"opacity-0":"opacity-100")}>
              <path ref={el=>{arcRefs.current[i]=el;}} fill="none" strokeWidth={2.5} strokeLinecap="round" className="stroke-accent-600"/>
              <line ref={el=>{angleLeaderRefs.current[i]=el;}} strokeWidth={1} className="stroke-accent-600"/>
              <text data-teach-target={arc.id} ref={el=>{angleRefs.current[i]=el;}} textAnchor="middle" dominantBaseline="middle" strokeWidth={5} paintOrder="stroke" className="stroke-paper fill-ink font-ink text-[23px] font-bold">{arc.degrees}°</text>
            </g>)}
            {ordered.map((label, i) => (
              <g
                key={label.n}
                className={cx(
                  "transition-opacity duration-240 ease-dalil-out motion-reduce:duration-0",
                  i >= shown ? "opacity-0" : step === null || step === i ? "opacity-100" : "opacity-40",
                )}
              >
                <line
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  style={{ stroke: "var(--color-ink)" }}
                />
                <circle
                  ref={(el) => {
                    dotRefs.current[i] = el;
                  }}
                  data-teach-target={typeof label.target === "string" ? label.target : undefined}
                  r={4}
                  strokeWidth={2}
                  style={{ fill: "var(--color-text-white)", stroke: "var(--color-ink)" }}
                />
              </g>
            ))}
          </svg>
          {ordered.map((label, i) => (
            <div
              key={label.n}
              ref={(el) => {
                pillRefs.current[i] = el;
              }}
              className="pointer-events-none absolute top-0 left-0 will-change-transform"
            >
              <span
                className={cx(
                  "inline-flex items-center rounded-full border border-rule bg-paper-2/95 px-2.5 py-1 text-caption-1-medium whitespace-nowrap text-ink transition-opacity duration-200 ease-dalil-out motion-reduce:duration-0",
                  i < shown ? "opacity-100" : "opacity-0",
                )}
              >
                <span>{label.text}</span>
              </span>
            </div>
          ))}
          {touched && <Button iconOnly size="small" variant="secondary" leadingIcon={RiRestartLine} aria-label="Reset the view" onClick={()=>resetRef.current()} className="absolute end-3 top-3"/>}
        </>
      )}
    </div>
  );
}
