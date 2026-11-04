/**
 * Endpoint logic for Dalil's single custom AI endpoint (brief section 7).
 *
 * Pure TypeScript with no dependencies. It runs in the browser (the design system page) and in
 * Node (the unit tests). The desktop app has no CORS limit, so `cors-blocked` can only ever be
 * produced when `env` is "browser".
 *
 * Rules this file enforces:
 * - The key is sent only to the host the user typed, never in a URL, never in a message we return.
 * - Redirects are followed by hand, and only inside the same host over a same or safer scheme.
 * - Every returned message is written here from a fixed template. Raw error text from fetch is
 *   never copied into a result, so a key that leaks into an exception cannot leak into the UI.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ErrorReason =
  | "key-rejected"
  | "no-model-list"
  | "unreachable"
  | "timeout"
  | "bad-response"
  | "cors-blocked";

export interface NormalizedBase {
  /** Origin plus path, no trailing slash, no /chat/completions or /models. Empty on error. */
  base: string;
  /** Host with port when one was typed, for display. Empty on error. */
  host: string;
  /** Loopback, LAN, *.local or link-local: the request stays on this computer or network. */
  local: boolean;
  /** True when the URL is plain http to a host that is not local. */
  insecure: boolean;
  error?: "empty" | "invalid-url" | "unsupported-scheme";
}

export interface ModelEntry {
  id: string;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  redirect?: "manual" | "follow" | "error";
  credentials?: "omit" | "same-origin" | "include";
  cache?: "no-store";
  mode?: "cors" | "no-cors" | "same-origin";
}

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  type?: string;
  url?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponseLike>;

export type FetchEnv = "browser" | "node";

export type FetchModelsResult =
  | { ok: true; models: ModelEntry[]; urlUsed: string }
  | { ok: false; reason: ErrorReason; message: string; status?: number };

export type TestMessageResult =
  | { ok: true }
  | { ok: false; reason: ErrorReason; message: string; status?: number };

/** What went wrong on one request, before it is turned into an ErrorReason. */
export type Failure =
  | { type: "http"; status: number }
  | { type: "network"; corsLikely?: boolean }
  | { type: "timeout" }
  | { type: "unparseable" }
  | { type: "redirect" };

export interface AuthOptions {
  key?: string;
  headerName?: string;
  /** "Bearer" (default), any other word, or "None" / "" to send the key as it is. */
  scheme?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Hosts and URLs                                                             */
/* -------------------------------------------------------------------------- */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function hostnameOnly(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    h = end > 0 ? h.slice(1, end) : h.slice(1);
  } else if (h.split(":").length === 2) {
    h = h.split(":")[0];
  }
  return h.replace(/\.$/, "");
}

/** Loopback, LAN, link-local, *.local and *.localhost. Accepts a host with or without a port. */
export function isLocalHost(host: string): boolean {
  const h = hostnameOnly(host);
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;

  const v4 = IPV4.exec(h);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return false;
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // unique local fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // link local fe80::/10
  }
  return false;
}

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

function failBase(error: NonNullable<NormalizedBase["error"]>): NormalizedBase {
  return { base: "", host: "", local: false, insecure: false, error };
}

/**
 * Turn whatever the user typed into a clean base URL.
 * Adds https:// unless the host is local (then http://), strips trailing slashes and a pasted
 * /chat/completions or /models, drops any query or fragment.
 */
export function normalizeBase(input: string): NormalizedBase {
  let text = (input ?? "").trim();
  if (!text) return failBase("empty");

  let scheme: string | null = null;
  const match = SCHEME.exec(text);
  if (match) {
    scheme = match[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") return failBase("unsupported-scheme");
    text = text.slice(match[0].length);
  } else if (text.startsWith("//")) {
    text = text.slice(2);
  }

  const authority = text.split(/[/?#]/, 1)[0];
  if (!authority || authority.includes("@")) return failBase("invalid-url");
  if (/\s/.test(authority)) return failBase("invalid-url");

  const chosen = scheme ?? (isLocalHost(authority) ? "http" : "https");
  let url: URL;
  try {
    url = new URL(`${chosen}://${text}`);
  } catch {
    return failBase("invalid-url");
  }
  if (!url.hostname || url.username || url.password) return failBase("invalid-url");

  let path = url.pathname.replace(/\/+$/, "");
  for (;;) {
    const next = path.replace(/\/(chat\/completions|models)$/i, "").replace(/\/+$/, "");
    if (next === path) break;
    path = next;
  }

  const local = isLocalHost(url.hostname);
  return {
    base: `${url.protocol}//${url.host}${path}`,
    host: url.host,
    local,
    insecure: url.protocol === "http:" && !local,
  };
}

/** Model list URLs to try, in order. */
export function candidateModelUrls(base: string): string[] {
  const clean = base.replace(/\/+$/, "");
  const path = safePathname(clean);
  if (/\/v1$/i.test(path)) return [`${clean}/models`];
  return [`${clean}/v1/models`, `${clean}/models`];
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return url.replace(/^[a-z]+:\/\/[^/]*/i, "");
  }
}

/** The chat completions URL for the same server, derived from the model list URL when known. */
export function chatUrl(base: string, urlUsed?: string): string {
  if (urlUsed && /\/models$/i.test(urlUsed)) return urlUsed.replace(/\/models$/i, "/chat/completions");
  const clean = base.replace(/\/+$/, "");
  return /\/v1$/i.test(safePathname(clean)) ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

/* -------------------------------------------------------------------------- */
/*  Headers                                                                    */
/* -------------------------------------------------------------------------- */

const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(name: string): boolean {
  return HEADER_TOKEN.test(name.trim());
}

/** Request headers. The key goes in the chosen header, never anywhere else. */
export function buildHeaders({ key, headerName = "Authorization", scheme = "Bearer" }: AuthOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const secret = (key ?? "").replace(/[\r\n\0]/g, "").trim();
  if (!secret) return headers;
  const name = isValidHeaderName(headerName) ? headerName.trim() : "Authorization";
  const word = (scheme ?? "").trim();
  headers[name] = word && word.toLowerCase() !== "none" ? `${word} ${secret}` : secret;
  return headers;
}

/* -------------------------------------------------------------------------- */
/*  Parsing                                                                    */
/* -------------------------------------------------------------------------- */

function idOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    for (const field of ["id", "name", "model"]) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Accepts { data: [{ id }] }, { models: [{ id | name }] }, a bare array of strings, or a bare
 * array of objects. Returns unique ids sorted alphabetically, or an empty list when the shape is
 * not a model list.
 */
export function parseModels(json: unknown): ModelEntry[] {
  let list: unknown = null;
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.data)) list = record.data;
    else if (Array.isArray(record.models)) list = record.models;
  }
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  for (const entry of list) {
    const id = idOf(entry);
    if (id) seen.add(id);
  }
  return [...seen].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)).map((id) => ({ id }));
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** One request failure to one of the six reasons. A browser CORS block is a network failure the probe confirms. */
export function classifyError(failure: Failure): ErrorReason {
  switch (failure.type) {
    case "http":
      if (failure.status === 401 || failure.status === 403) return "key-rejected";
      if (failure.status === 404) return "no-model-list";
      return "bad-response";
    case "network":
      return failure.corsLikely ? "cors-blocked" : "unreachable";
    case "timeout":
      return "timeout";
    case "unparseable":
    case "redirect":
      return "bad-response";
  }
}

export function messageFor(reason: ErrorReason, ctx: { host: string; timeoutMs: number }): string {
  switch (reason) {
    case "key-rejected":
      return "The endpoint rejected this key.";
    case "no-model-list":
      return "This server has no model list.";
    case "unreachable":
      return `Can't reach ${ctx.host}.`;
    case "timeout": {
      const seconds = Math.max(1, Math.round(ctx.timeoutMs / 1000));
      return `No answer after ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
    }
    case "bad-response":
      return "The server answered, but not with a model list.";
    case "cors-blocked":
      return "This browser blocked the request.";
  }
}

function redirectMessage(host: string): string {
  return `${host} redirected to another address, so Dalil stopped. It never sends your key to a different host.`;
}

/* -------------------------------------------------------------------------- */
/*  Requests                                                                   */
/* -------------------------------------------------------------------------- */

const MAX_REDIRECTS = 3;
const MAX_BODY_CHARS = 4_000_000;

type RawResult =
  | { kind: "response"; status: number; text: string }
  | { kind: "failure"; failure: Failure };

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export function defaultEnv(): FetchEnv {
  return typeof window !== "undefined" && typeof document !== "undefined" ? "browser" : "node";
}

function defaultFetch(): FetchLike {
  return (url, init) => globalThis.fetch(url, init);
}

/** A credential-free, header-free reachability probe. In a browser, an opaque answer means CORS blocked the read. */
async function probeReachable(fetchImpl: FetchLike, url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetchImpl(url, { method: "GET", mode: "no-cors", credentials: "omit", cache: "no-store", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface RequestOptions {
  fetchImpl: FetchLike;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  env: FetchEnv;
}

async function request(url: string, opts: RequestOptions): Promise<RawResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const refuse: RawResult = { kind: "failure", failure: { type: "redirect" } };
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await opts.fetchImpl(current, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
      });

      // A browser hides where an opaque redirect goes, so it cannot be checked and is refused.
      if (response.type === "opaqueredirect") return refuse;

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return refuse;
        let next: URL;
        let from: URL;
        try {
          from = new URL(current);
          next = new URL(location, current);
        } catch {
          return refuse;
        }
        const sameHost = next.hostname.toLowerCase() === from.hostname.toLowerCase();
        const downgrade = from.protocol === "https:" && next.protocol !== "https:";
        if (!sameHost || downgrade) return refuse;
        current = next.toString();
        continue;
      }

      const text = await response.text();
      if (text.length > MAX_BODY_CHARS) return { kind: "failure", failure: { type: "unparseable" } };
      return { kind: "response", status: response.status, text };
    }
    return refuse;
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) return { kind: "failure", failure: { type: "timeout" } };
    if (opts.env === "browser") {
      const reachable = await probeReachable(opts.fetchImpl, url);
      return { kind: "failure", failure: { type: "network", corsLikely: reachable } };
    }
    return { kind: "failure", failure: { type: "network" } };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/* -------------------------------------------------------------------------- */
/*  fetchModels                                                                */
/* -------------------------------------------------------------------------- */

export interface FetchModelsOptions extends AuthOptions {
  base: string;
  fetchImpl?: FetchLike;
  /** Per request. A timeout ends the whole fetch: a slow server will not answer the next URL faster. */
  timeoutMs?: number;
  env?: FetchEnv;
}

const TERMINAL: ErrorReason[] = ["key-rejected", "timeout", "unreachable", "cors-blocked"];
const PRIORITY: ErrorReason[] = ["key-rejected", "timeout", "cors-blocked", "unreachable", "bad-response", "no-model-list"];

/**
 * GET each candidate once with Accept: application/json and the key header. Stops at the first
 * model list. Stops early on a rejected key, a timeout, a CORS block or an unreachable host,
 * because the next candidate is on the same host and would fail the same way.
 */
export async function fetchModels(options: FetchModelsOptions): Promise<FetchModelsResult> {
  const { key, headerName, scheme, timeoutMs = 8000 } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const env = options.env ?? defaultEnv();

  const normalized = normalizeBase(options.base);
  if (normalized.error) {
    return { ok: false, reason: "unreachable", message: "That is not a web address Dalil can reach." };
  }

  const headers = buildHeaders({ key, headerName, scheme });
  const failures: { reason: ErrorReason; status?: number; redirect?: boolean }[] = [];

  for (const url of candidateModelUrls(normalized.base)) {
    const raw = await request(url, { fetchImpl, method: "GET", headers, timeoutMs, env });

    if (raw.kind === "failure") {
      failures.push({ reason: classifyError(raw.failure), redirect: raw.failure.type === "redirect" });
    } else if (raw.status >= 200 && raw.status < 300) {
      const parsed = parseJson(raw.text);
      const models = parsed.ok ? parseModels(parsed.value) : [];
      if (models.length > 0) return { ok: true, models, urlUsed: url };
      failures.push({ reason: classifyError({ type: "unparseable" }), status: raw.status });
    } else {
      failures.push({ reason: classifyError({ type: "http", status: raw.status }), status: raw.status });
    }

    if (TERMINAL.includes(failures[failures.length - 1].reason)) break;
  }

  const reason = PRIORITY.find((candidate) => failures.some((f) => f.reason === candidate)) ?? "unreachable";
  const picked = failures.find((f) => f.reason === reason);
  const message =
    picked?.redirect && reason === "bad-response"
      ? redirectMessage(normalized.host)
      : messageFor(reason, { host: normalized.host, timeoutMs });
  return { ok: false, reason, message, ...(picked?.status !== undefined ? { status: picked.status } : {}) };
}

/* -------------------------------------------------------------------------- */
/*  sendTestMessage                                                            */
/* -------------------------------------------------------------------------- */

export interface TestMessageOptions extends AuthOptions {
  base: string;
  model: string;
  /** The model list URL that worked, when there was one. */
  urlUsed?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  env?: FetchEnv;
}

/** One short chat completion with a one token cap. Pass or fail, never the model's text. */
export async function sendTestMessage(options: TestMessageOptions): Promise<TestMessageResult> {
  const { key, headerName, scheme, model, timeoutMs = 15000 } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const env = options.env ?? defaultEnv();

  const normalized = normalizeBase(options.base);
  if (normalized.error) {
    return { ok: false, reason: "unreachable", message: "That is not a web address Dalil can reach." };
  }
  if (!model.trim()) return { ok: false, reason: "bad-response", message: "Choose a model first." };

  const headers = { ...buildHeaders({ key, headerName, scheme }), "Content-Type": "application/json" };
  const body = JSON.stringify({
    model: model.trim(),
    messages: [{ role: "user", content: "Reply with one word." }],
    max_tokens: 1,
    stream: false,
  });

  const raw = await request(chatUrl(normalized.base, options.urlUsed), { fetchImpl, method: "POST", headers, body, timeoutMs, env });

  if (raw.kind === "failure") {
    const reason = classifyError(raw.failure);
    const message = raw.failure.type === "redirect" ? redirectMessage(normalized.host) : messageFor(reason, { host: normalized.host, timeoutMs });
    return { ok: false, reason, message };
  }
  if (raw.status >= 200 && raw.status < 300) {
    const parsed = parseJson(raw.text);
    if (parsed.ok && parsed.value && typeof parsed.value === "object") return { ok: true };
    return { ok: false, reason: "bad-response", message: "The server answered, but not like a chat endpoint.", status: raw.status };
  }
  const reason = classifyError({ type: "http", status: raw.status });
  const message =
    reason === "key-rejected"
      ? messageFor(reason, { host: normalized.host, timeoutMs })
      : reason === "no-model-list"
        ? "This server has no chat endpoint at that address."
        : `The server answered with status ${raw.status}.`;
  return { ok: false, reason, message, status: raw.status };
}

/* -------------------------------------------------------------------------- */
/*  mockFetch and the sample scenarios                                         */
/* -------------------------------------------------------------------------- */

export interface MockRoute {
  status?: number;
  json?: unknown;
  text?: string;
  contentType?: string;
  headers?: Record<string, string>;
  /** Milliseconds before answering. Aborting during the wait rejects with an AbortError. */
  delayMs?: number;
  /** Never answers until aborted. */
  hang?: boolean;
  /** Rejects like a refused connection or a TLS failure, including for the no-cors probe. */
  networkError?: boolean;
  /** Rejects normal requests like a CORS block, and answers a no-cors probe with an opaque response. */
  cors?: boolean;
}

/**
 * Keys are checked in this order: "METHOD https://host/path", "https://host/path",
 * "METHOD https://host/*", "https://host/*", "*". An unmatched URL behaves like an unknown host.
 */
export type MockTable = Record<string, MockRoute>;

export interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  mode?: string;
  redirect?: string;
  credentials?: string;
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function lookupRoute(table: MockTable, method: string, url: string): MockRoute | undefined {
  let origin = "";
  let bare = url;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    bare = `${parsed.origin}${parsed.pathname}`;
  } catch {
    // fall through with the raw string
  }
  const keys = [`${method} ${bare}`, bare, `${method} ${origin}/*`, `${origin}/*`, "*"];
  for (const key of keys) if (key in table) return table[key];
  return undefined;
}

export function mockFetch(table: MockTable, options: { onCall?: (call: MockCall) => void } = {}): FetchLike {
  return async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    options.onCall?.({
      url,
      method,
      headers: { ...(init.headers ?? {}) },
      mode: init.mode,
      redirect: init.redirect,
      credentials: init.credentials,
    });

    const route = lookupRoute(table, method, url) ?? { networkError: true };
    const signal = init.signal;
    if (signal?.aborted) throw abortError();

    if (route.hang) {
      await new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    }
    if (route.delayMs) await wait(route.delayMs, signal);
    if (route.networkError) throw new TypeError("fetch failed");

    if (route.cors) {
      if (init.mode === "no-cors") {
        return { status: 0, ok: false, type: "opaque", url, headers: { get: () => null }, text: async () => "" };
      }
      throw new TypeError("Failed to fetch");
    }

    const status = route.status ?? 200;
    const body = route.json !== undefined ? JSON.stringify(route.json) : (route.text ?? "");
    const contentType = route.contentType ?? (route.json !== undefined ? "application/json" : "text/plain");
    const headers: Record<string, string> = { "content-type": contentType };
    for (const [name, value] of Object.entries(route.headers ?? {})) headers[name.toLowerCase()] = value;

    return {
      status,
      ok: status >= 200 && status < 300,
      type: "basic",
      url,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => body,
    };
  };
}

export interface SampleEndpoint {
  url: string;
  /** Chip label. */
  label: string;
  /** What this host does, for the title and tests. */
  outcome: string;
  /** Host as normalizeBase reports it, including any port. */
  host: string;
}

/** The demo gives up after two seconds so the timeout state is reachable without a wait. */
export const SAMPLE_TIMEOUT_MS = 2000;

const SAMPLE_IDS = [
  "sample-reasoning-1",
  "sample-chat-small",
  "sample-chat-large",
  "sample-vision-1",
  "sample-chat-medium",
  "sample-fast-1",
  "sample-long-context-1",
];

const SAMPLE_MANY_IDS = [
  "sample-alpha-1",
  "sample-alpha-2",
  "sample-bravo-1",
  "sample-bravo-2",
  "sample-chat-large",
  "sample-chat-medium",
  "sample-chat-small",
  "sample-delta-1",
  "sample-echo-1",
  "sample-fast-1",
  "sample-fast-2",
  "sample-long-context-1",
  "sample-reasoning-1",
  "sample-vision-1",
];

const LATENCY = 700;
const chatOk = { status: 200, delayMs: 900, json: { choices: [{ message: { role: "assistant", content: "Ok" } }] } };

export const SAMPLE_ENDPOINTS: SampleEndpoint[] = [
  { url: "https://api.example.com/v1", label: "api.example.com/v1", host: "api.example.com", outcome: "7 models" },
  { url: "https://models.example.com", label: "models.example.com", host: "models.example.com", outcome: "models at /v1/models" },
  { url: "https://many.example.com/v1", label: "many.example.com/v1", host: "many.example.com", outcome: "14 models, test fails" },
  { url: "http://localhost:11434", label: "localhost:11434", host: "localhost:11434", outcome: "local list, no key" },
  { url: "https://badkey.example.com/v1", label: "badkey.example.com", host: "badkey.example.com", outcome: "key rejected" },
  { url: "https://nolist.example.com/v1", label: "nolist.example.com", host: "nolist.example.com", outcome: "no model list" },
  { url: "https://down.example.com/v1", label: "down.example.com", host: "down.example.com", outcome: "unreachable" },
  { url: "https://slow.example.com/v1", label: "slow.example.com", host: "slow.example.com", outcome: "times out" },
  { url: "https://html.example.com/v1", label: "html.example.com", host: "html.example.com", outcome: "answers with HTML" },
  { url: "https://cors.example.com/v1", label: "cors.example.com", host: "cors.example.com", outcome: "blocked by CORS" },
];

export const SAMPLE_TABLE: MockTable = {
  "https://api.example.com/v1/models": { delayMs: LATENCY, json: { object: "list", data: SAMPLE_IDS.map((id) => ({ id, object: "model" })) } },
  "POST https://api.example.com/v1/chat/completions": chatOk,

  "https://models.example.com/v1/models": { delayMs: LATENCY, json: { models: ["sample-chat-small", "sample-chat-large", "sample-embed-1"].map((name) => ({ name })) } },
  "https://models.example.com/*": { delayMs: 300, status: 404, json: { error: "Not found" } },
  "POST https://models.example.com/v1/chat/completions": chatOk,

  "https://many.example.com/v1/models": { delayMs: LATENCY, json: { data: [...SAMPLE_MANY_IDS].reverse().map((id) => ({ id })) } },
  "POST https://many.example.com/v1/chat/completions": { status: 500, delayMs: 700, json: { error: "Model is not loaded" } },

  "http://localhost:11434/v1/models": {
    delayMs: 350,
    json: {
      object: "list",
      data: ["llama3.2:3b", "mistral:7b", "qwen2.5-coder:7b", "gemma2:9b"].map((id) => ({ id, object: "model", owned_by: "library" })),
    },
  },
  "POST http://localhost:11434/v1/chat/completions": { ...chatOk, delayMs: 500 },

  "https://badkey.example.com/*": { delayMs: 450, status: 401, json: { error: { message: "Invalid API key" } } },
  "https://nolist.example.com/*": { delayMs: 450, status: 404, json: { error: "Not found" } },
  "https://down.example.com/*": { delayMs: 500, networkError: true },
  "https://slow.example.com/*": { hang: true },
  "https://html.example.com/*": { delayMs: 450, status: 200, contentType: "text/html", text: "<!doctype html><html><head><title>Welcome</title></head><body>Hello</body></html>" },
  "https://cors.example.com/*": { delayMs: 450, cors: true },
};

export function sampleFetch(options?: { onCall?: (call: MockCall) => void }): FetchLike {
  return mockFetch(SAMPLE_TABLE, options);
}

/** True when the sample table knows this host, so the UI can say when a host is not a sample. */
export function isSampleHost(host: string): boolean {
  return SAMPLE_ENDPOINTS.some((sample) => sample.host === host.toLowerCase());
}
