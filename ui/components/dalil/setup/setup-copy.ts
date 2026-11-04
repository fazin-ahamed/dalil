import copyJson from "@/lib/copy.json";

/** Strings from lib/copy.json that the setup flow reads. */
export const copy = {
  notch: copyJson.notch,
  setup: copyJson.setup,
  aria: copyJson.aria,
};

/** Strings the shared copy file does not have yet. Listed in the task report. */
export const local = {
  leadEdit: "Change the URL, key or model.",
  urlEmpty: "Enter a base URL first.",
  urlInvalid: "That doesn't look like a web address.",
  using: "Using",
  keyHint: "Stored in your keychain, never in a file.",
  pressEnterBefore: "Press",
  pressEnterAfter: "to fetch models.",
  insecure: "This address is not encrypted.",
  corsNote:
    "The desktop app has no such limit. A browser only reads answers from servers that allow this page.",
  sampleUnknownHost:
    "Sample mode only answers the sample hosts. Switch to Live request to try a real server.",
  closes: "closes",
  headerNameInvalid: "Use letters, digits and hyphens only.",
  sampleName: "FSquare",
  endpointSaved: "Endpoint saved.",
  homeLabel: "Home",
  typeModelHint: "No list needed. Dalil sends this ID with each request.",
};

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}
