/** Shared shapes for the tutor, memory and context features. Other files import from here; do not redefine them. */

/** One thing Dalil remembers about the person. Stored locally, listed and deletable in the Memory panel. */
export interface Lesson {
  id: string;
  /** Short subject, e.g. "Figma auto layout". Lowercase-insensitive match key. */
  topic: string;
  /** What the person learned or got wrong, one or two sentences, plain English. */
  note: string;
  /** "learned" = they did it right, "struggled" = they needed correction, "asked" = they only asked. */
  kind: "learned" | "struggled" | "asked";
  /** App the lesson happened in, if known (from ContextSnapshot.app). */
  app?: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** How many times this topic came up again. Starts at 1. */
  seen: number;
  /** The project this lesson belongs to. Missing = global, shown in every project. */
  projectId?: string;
  /** The labelled points of the explanation, so it can be replayed on screen later. */
  marks?: Mark[];
}

/** A folder or piece of work the person is learning in. Lessons and context are saved per project. */
export interface Project {
  id: string;
  name: string;
  /** Absolute folder path, if the project is tied to one. Optional and only ever shown, never read. */
  folder?: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * A numbered label Dalil puts on a point of the screen ("3 Combustor"). x and y are 0 to 1000 across
 * the captured screen (left to right, top to bottom), so they survive any display scale.
 */
export interface Mark {
  /** 1-based order. The pointer visits marks in this order. */
  n: number;
  /** One to three words. */
  label: string;
  x: number;
  y: number;
  /** One short sentence said or shown when the pointer arrives. */
  note?: string;
}

/** One captured screen, already shrunk for a vision model. */
export interface ScreenShot {
  /** `data:image/jpeg;base64,...` */
  dataUrl: string;
  /** Pixel size of the image in `dataUrl`. */
  width: number;
  height: number;
  /** Desktop coordinates of the captured display, before the image was resized. */
  screen?: ScreenBounds;
}

export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

/** One observable action per model turn. No shell commands or arbitrary code. */
export type AgentAction =
  | { type: "search"; query: string }
  | { type: "click"; x: number; y: number; button?: "left" | "right"; double?: boolean }
  | { type: "type"; text: string }
  | { type: "key"; keys: string[] }
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "look" };

export interface AgentActivity {
  label: string;
  status: "running" | "done" | "error";
}

export interface AgentTask {
  id: string;
  question: string;
  status: "running" | "done" | "error" | "stopped";
  computer: boolean;
  activities: AgentActivity[];
}

/* ------------------------------------------------------------------ generated visuals */

/** Soft highlighter tones. They map to the design tokens (blue, rose, mint, sand, lilac) and plain ink. */
export type Tone = "blue" | "rose" | "mint" | "sand" | "lilac" | "ink";

/**
 * Items of a hand-drawn note. Positions are 0 to 100 across the note's width and height, measured
 * from the top-left corner of the paper (the paper is 5 wide to 3 tall). Boxes are centred on (x, y).
 */
export type DiagramItem =
  | { id: string; kind: "box"; x: number; y: number; w: number; h: number; text: string; tone?: Tone; caption?: string }
  | { id: string; kind: "text"; x: number; y: number; text: string; size?: "title" | "body" | "note" }
  /** An arrow from one box or text item to another, by id. */
  | { id: string; kind: "arrow"; from: string; to: string; label?: string }
  /** A marker-pen ring or underline drawn round an existing item, by id. */
  | { id: string; kind: "highlight"; target: string };

/** A hand-drawn note: a few boxes, arrows and words that appear one by one as Dalil explains. */
export interface DiagramScene {
  type: "diagram";
  title: string;
  items: DiagramItem[];
  /** Ids in the order they are drawn. Items not listed are drawn last, in array order. */
  order?: string[];
  /** One short line along the bottom ("Both can be tensors"). */
  footnote?: string;
}

/**
 * Parts of a 3D model, built from a few primitives. Units are arbitrary but keep the whole model
 * within about 10 units of the origin. The model's long axis is x, up is y, z points at the viewer.
 */
export type Part =
  | { id: string; shape: "box"; pos: [number, number, number]; size: [number, number, number]; rot?: [number, number, number]; tone?: Tone; opacity?: number }
  | { id: string; shape: "sphere"; pos: [number, number, number]; radius: number; tone?: Tone; opacity?: number }
  /** A cylinder along the x axis unless `rot` turns it. radiusTop and radiusBottom allow a cone or a funnel. */
  | { id: string; shape: "cylinder"; pos: [number, number, number]; length: number; radiusTop: number; radiusBottom?: number; open?: boolean; rot?: [number, number, number]; tone?: Tone; opacity?: number }
  | { id: string; shape: "torus"; pos: [number, number, number]; radius: number; tube: number; rot?: [number, number, number]; tone?: Tone; opacity?: number }
  /** A ring of flat blades round the x axis, like a fan or turbine stage. */
  | { id: string; shape: "blades"; pos: [number, number, number]; count: number; innerRadius: number; outerRadius: number; thickness: number; twist?: number; tone?: Tone };

/** A numbered label pinned to a part (by id) or to a point in model space. */
export interface Label3D {
  n: number;
  text: string;
  target: string | [number, number, number];
  tone?: Tone;
  /** One or two sentences taught when the person steps to this label: what the part does and why it matters. */
  caption?: string;
}

/** A labelled 3D model, like a jet engine cutaway with "1 Fan, 2 Compressor, 3 Combustor, 4 Turbine". */
export interface Model3DScene {
  type: "model3d";
  title: string;
  parts: Part[];
  labels: Label3D[];
  /** Slice away the front half so the inside shows. */
  cutaway?: boolean;
  /** Turn slowly. Default true. */
  spin?: boolean;
  /** One sentence on what the whole thing does, shown before the tour of labels starts. */
  intro?: string;
}

export type Scene = DiagramScene | Model3DScene;

/** What the notch tells the overlay window to draw. Sent as the payload of the `dalil://overlay` event. */
export type OverlayCommand =
  | { kind: "marks"; marks: Mark[] }
  | { kind: "card"; title: string; lines: string[] }
  /** A drawing: a hand-drawn note or a labelled 3D model. Replaces any scene already showing. */
  | { kind: "scene"; scene: Scene }
  | { kind: "point"; x: number; y: number; label?: string }
  | { kind: "clear" };

/** What Dalil can tell about the moment: the focused app and window title. No screen pixels. */
export interface ContextSnapshot {
  app: string;
  title: string;
  /** Which source produced it: "niri", "hyprland", "sway", "x11", "windows", or "unknown". */
  source: string;
}

/** A piece of a multimodal message, in the OpenAI chat format. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** A plain string, or parts when the message carries a screenshot. */
  content: string | ContentPart[];
}

/** A step-by-step answer. `steps` is empty for a plain explanation. */
export interface TutorReply {
  /** The explanation, with paragraphs, examples and light Markdown when useful. */
  text: string;
  /** Ordered things to do on screen, each one short imperative sentence. */
  steps: string[];
  /** Labelled points on the screen to point at, in order. Empty when nothing on screen is relevant. */
  marks: Mark[];
  /** A drawing to show while explaining: a hand-drawn note or a labelled 3D model. Null for a plain answer. */
  scene?: Scene | null;
  /** A topic name worth remembering, or null. */
  topic: string | null;
  /** What happened, for memory: "learned", "struggled" or "asked". */
  kind: Lesson["kind"];
  /** Present only while the agent needs a tool result before it can finish. */
  action?: AgentAction;
  /** Real search results collected by the runner, never invented by the model. */
  sources?: WebSource[];
}

/** Saved endpoint as the chat client needs it. The key comes from the OS keychain at call time. */
export interface ChatEndpoint {
  base: string;
  model: string;
  headerName: string;
  scheme: "Bearer" | "None";
}
