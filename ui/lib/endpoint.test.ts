import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as endpoint from "./endpoint.ts";

const {
  normalizeBase,
  candidateModelUrls,
  isLocalHost,
  buildHeaders,
  parseModels,
  classifyError,
  fetchModels,
  sendTestMessage,
  chatUrl,
  mockFetch,
  sampleFetch,
  SAMPLE_ENDPOINTS,
  SAMPLE_TABLE,
} = endpoint;

const KEY = "sk-live-SECRET-9f8e7d6c";

const list = (ids: string[]) => ({ data: ids.map((id) => ({ id })) });

describe("isLocalHost", () => {
  it("accepts loopback, LAN, link-local and .local hosts", () => {
    for (const host of [
      "localhost",
      "localhost:11434",
      "LOCALHOST",
      "app.localhost",
      "127.0.0.1",
      "127.0.0.1:8080",
      "127.5.5.5",
      "[::1]",
      "[::1]:8080",
      "::1",
      "printer.local",
      "10.0.0.5",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.20",
      "169.254.10.10",
      "fd12:3456::1",
      "[fe80::1]:3000",
    ]) {
      assert.equal(isLocalHost(host), true, host);
    }
  });

  it("rejects public hosts and look-alikes", () => {
    for (const host of [
      "api.example.com",
      "172.15.0.1",
      "172.32.0.1",
      "192.169.1.1",
      "8.8.8.8",
      "11.0.0.1",
      "999.1.1.1",
      "notlocalhost",
      "localhost.example.com",
      "mylocal",
      "",
    ]) {
      assert.equal(isLocalHost(host), false, host);
    }
  });
});

describe("normalizeBase", () => {
  it("adds https for public hosts", () => {
    const n = normalizeBase("api.example.com/v1");
    assert.deepEqual(n, { base: "https://api.example.com/v1", host: "api.example.com", local: false, insecure: false });
  });

  it("adds http for localhost, 127.0.0.1, [::1], *.local and private IPv4", () => {
    const cases: [string, string, string][] = [
      ["localhost:11434", "http://localhost:11434", "localhost:11434"],
      ["127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1", "127.0.0.1:8080"],
      ["[::1]:8000", "http://[::1]:8000", "[::1]:8000"],
      ["studio.local/v1", "http://studio.local/v1", "studio.local"],
      ["10.0.0.5:9000", "http://10.0.0.5:9000", "10.0.0.5:9000"],
      ["172.20.1.2", "http://172.20.1.2", "172.20.1.2"],
      ["192.168.1.20:1234/v1", "http://192.168.1.20:1234/v1", "192.168.1.20:1234"],
    ];
    for (const [input, base, host] of cases) {
      const n = normalizeBase(input);
      assert.equal(n.error, undefined, input);
      assert.equal(n.base, base, input);
      assert.equal(n.host, host, input);
      assert.equal(n.local, true, input);
      assert.equal(n.insecure, false, input);
    }
  });

  it("uses https for a public IPv4 and for 172.32.x, which is outside the private range", () => {
    assert.equal(normalizeBase("8.8.8.8").base, "https://8.8.8.8");
    assert.equal(normalizeBase("172.32.0.1").base, "https://172.32.0.1");
  });

  it("trims, strips trailing slashes and pasted endpoint paths", () => {
    assert.equal(normalizeBase("  https://api.example.com/v1/  ").base, "https://api.example.com/v1");
    assert.equal(normalizeBase("https://api.example.com/v1/chat/completions").base, "https://api.example.com/v1");
    assert.equal(normalizeBase("https://api.example.com/v1/chat/completions/").base, "https://api.example.com/v1");
    assert.equal(normalizeBase("https://api.example.com/v1/models").base, "https://api.example.com/v1");
    assert.equal(normalizeBase("https://api.example.com/models").base, "https://api.example.com");
    assert.equal(normalizeBase("https://api.example.com///").base, "https://api.example.com");
    assert.equal(normalizeBase("https://api.example.com/openai/v1/chat/completions").base, "https://api.example.com/openai/v1");
  });

  it("drops query and fragment", () => {
    assert.equal(normalizeBase("https://api.example.com/v1?api-version=1#top").base, "https://api.example.com/v1");
  });

  it("lower-cases the host and keeps an explicit scheme", () => {
    assert.equal(normalizeBase("HTTPS://API.Example.com/V1").base, "https://api.example.com/V1");
    const plain = normalizeBase("http://api.example.com/v1");
    assert.equal(plain.base, "http://api.example.com/v1");
    assert.equal(plain.insecure, true);
    assert.equal(normalizeBase("//api.example.com").base, "https://api.example.com");
  });

  it("reports errors", () => {
    assert.equal(normalizeBase("").error, "empty");
    assert.equal(normalizeBase("   ").error, "empty");
    assert.equal(normalizeBase("ftp://example.com").error, "unsupported-scheme");
    assert.equal(normalizeBase("https://user:pass@example.com").error, "invalid-url");
    assert.equal(normalizeBase("https://exa mple.com").error, "invalid-url");
    assert.equal(normalizeBase("https://").error, "invalid-url");
    assert.equal(normalizeBase("http://localhost:99999").error, "invalid-url");
    assert.equal(normalizeBase("bad").error, undefined);
  });

  it("is idempotent", () => {
    for (const input of ["api.example.com/v1/models", "localhost:11434", "[::1]:3000/v1/"]) {
      const once = normalizeBase(input);
      assert.equal(normalizeBase(once.base).base, once.base);
    }
  });
});

describe("candidateModelUrls", () => {
  it("uses only /models when the base ends in /v1", () => {
    assert.deepEqual(candidateModelUrls("https://api.example.com/v1"), ["https://api.example.com/v1/models"]);
    assert.deepEqual(candidateModelUrls("https://api.example.com/openai/v1"), ["https://api.example.com/openai/v1/models"]);
  });

  it("tries /v1/models then /models otherwise", () => {
    assert.deepEqual(candidateModelUrls("https://api.example.com"), [
      "https://api.example.com/v1/models",
      "https://api.example.com/models",
    ]);
    assert.deepEqual(candidateModelUrls("http://localhost:11434"), [
      "http://localhost:11434/v1/models",
      "http://localhost:11434/models",
    ]);
    assert.deepEqual(candidateModelUrls("https://api.example.com/proxy"), [
      "https://api.example.com/proxy/v1/models",
      "https://api.example.com/proxy/models",
    ]);
  });

  it("does not treat /v10 or /api-v1 as /v1", () => {
    assert.equal(candidateModelUrls("https://api.example.com/v10").length, 2);
    assert.equal(candidateModelUrls("https://api.example.com/api-v1").length, 2);
  });
});

describe("chatUrl", () => {
  it("derives the chat URL from the model list URL that worked", () => {
    assert.equal(chatUrl("https://a.com", "https://a.com/v1/models"), "https://a.com/v1/chat/completions");
    assert.equal(chatUrl("https://a.com/v1", "https://a.com/v1/models"), "https://a.com/v1/chat/completions");
    assert.equal(chatUrl("https://a.com", "https://a.com/models"), "https://a.com/chat/completions");
  });
  it("falls back to the base when there is no model list URL", () => {
    assert.equal(chatUrl("https://a.com"), "https://a.com/v1/chat/completions");
    assert.equal(chatUrl("https://a.com/v1"), "https://a.com/v1/chat/completions");
  });
});

describe("buildHeaders", () => {
  it("sends Accept only when there is no key", () => {
    assert.deepEqual(buildHeaders({}), { Accept: "application/json" });
    assert.deepEqual(buildHeaders({ key: "   " }), { Accept: "application/json" });
  });
  it("defaults to Authorization: Bearer", () => {
    assert.deepEqual(buildHeaders({ key: "abc" }), { Accept: "application/json", Authorization: "Bearer abc" });
  });
  it("honours a header name and the None scheme", () => {
    assert.deepEqual(buildHeaders({ key: "abc", headerName: "x-api-key", scheme: "None" }), {
      Accept: "application/json",
      "x-api-key": "abc",
    });
    assert.deepEqual(buildHeaders({ key: "abc", scheme: "" }), { Accept: "application/json", Authorization: "abc" });
    assert.deepEqual(buildHeaders({ key: "abc", scheme: "Token" }), { Accept: "application/json", Authorization: "Token abc" });
  });
  it("strips line breaks from a pasted key and ignores an invalid header name", () => {
    assert.equal(buildHeaders({ key: "ab\r\ncd\n" }).Authorization, "Bearer abcd");
    assert.equal(buildHeaders({ key: "abc", headerName: "bad header" }).Authorization, "Bearer abc");
  });
});

describe("parseModels", () => {
  it("reads the OpenAI shape", () => {
    assert.deepEqual(parseModels({ object: "list", data: [{ id: "b" }, { id: "a" }] }), [{ id: "a" }, { id: "b" }]);
  });
  it("reads { models: [{ id | name }] }", () => {
    assert.deepEqual(parseModels({ models: [{ name: "llama3:8b" }, { id: "mistral" }] }), [{ id: "llama3:8b" }, { id: "mistral" }]);
  });
  it("reads a bare array of strings", () => {
    assert.deepEqual(parseModels(["zeta", "alpha"]), [{ id: "alpha" }, { id: "zeta" }]);
  });
  it("reads a bare array of objects", () => {
    assert.deepEqual(parseModels([{ id: "m2" }, { name: "m1" }]), [{ id: "m1" }, { id: "m2" }]);
  });
  it("sorts naturally, ignoring case, and removes duplicates and blanks", () => {
    const ids = parseModels(["gpt-10", "GPT-2", "gpt-2", "", "  ", "gpt-1", { id: "gpt-1" }, null, 4]).map((m: { id: string }) => m.id);
    assert.deepEqual(ids, ["gpt-1", "GPT-2", "gpt-2", "gpt-10"]);
  });
  it("returns an empty list for anything else", () => {
    for (const value of [null, undefined, 42, "text", {}, { data: "no" }, { models: {} }, { data: [] }, [], [null, {}]]) {
      assert.deepEqual(parseModels(value), []);
    }
  });
});

describe("classifyError", () => {
  it("maps each failure to one reason", () => {
    assert.equal(classifyError({ type: "http", status: 401 }), "key-rejected");
    assert.equal(classifyError({ type: "http", status: 403 }), "key-rejected");
    assert.equal(classifyError({ type: "http", status: 404 }), "no-model-list");
    assert.equal(classifyError({ type: "http", status: 500 }), "bad-response");
    assert.equal(classifyError({ type: "http", status: 429 }), "bad-response");
    assert.equal(classifyError({ type: "network" }), "unreachable");
    assert.equal(classifyError({ type: "network", corsLikely: true }), "cors-blocked");
    assert.equal(classifyError({ type: "timeout" }), "timeout");
    assert.equal(classifyError({ type: "unparseable" }), "bad-response");
    assert.equal(classifyError({ type: "redirect" }), "bad-response");
  });
});

describe("fetchModels success", () => {
  it("returns sorted models and the URL used, with the right request", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "https://api.example.com/v1/models": { json: list(["b", "a"]) } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    const result = await fetchModels({ base: "api.example.com/v1/", key: KEY, fetchImpl, env: "node" });
    assert.deepEqual(result, { ok: true, models: [{ id: "a" }, { id: "b" }], urlUsed: "https://api.example.com/v1/models" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[0].headers.Accept, "application/json");
    assert.equal(calls[0].redirect, "manual");
    assert.equal(calls[0].credentials, "omit");
    assert.equal(calls[0].url.includes(KEY), false);
  });

  it("falls back to /models when /v1/models has no list, trying each URL once", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch(
      { "https://x.example.com/v1/models": { status: 404 }, "https://x.example.com/models": { json: ["m"] } },
      { onCall: (c: endpoint.MockCall) => calls.push(c) },
    );
    const result = await fetchModels({ base: "https://x.example.com", fetchImpl, env: "node" });
    assert.deepEqual(result, { ok: true, models: [{ id: "m" }], urlUsed: "https://x.example.com/models" });
    assert.deepEqual(calls.map((c) => c.url), ["https://x.example.com/v1/models", "https://x.example.com/models"]);
  });

  it("sends no Authorization header without a key", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "http://localhost:11434/v1/models": { json: list(["llama3"]) } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    const result = await fetchModels({ base: "localhost:11434", fetchImpl, env: "node" });
    assert.equal(result.ok, true);
    assert.equal("Authorization" in calls[0].headers, false);
  });

  it("sends the key in the header and scheme the user chose", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "https://a.example.com/v1/models": { json: ["m"] } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    await fetchModels({ base: "https://a.example.com/v1", key: "k", headerName: "api-key", scheme: "None", fetchImpl, env: "node" });
    assert.equal(calls[0].headers["api-key"], "k");
    assert.equal("Authorization" in calls[0].headers, false);
  });
});

describe("fetchModels errors", () => {
  const run = (table: endpoint.MockTable, extra: Partial<endpoint.FetchModelsOptions> = {}) =>
    fetchModels({ base: "https://svc.example.com/v1", key: KEY, fetchImpl: mockFetch(table), env: "node", ...extra });

  it("401 and 403 are key-rejected and stop at the first URL", async () => {
    for (const status of [401, 403]) {
      const calls: endpoint.MockCall[] = [];
      const fetchImpl = mockFetch({ "https://svc.example.com/*": { status } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
      const result = await fetchModels({ base: "https://svc.example.com", key: KEY, fetchImpl, env: "node" });
      assert.deepEqual(result, { ok: false, reason: "key-rejected", message: "The endpoint rejected this key.", status });
      assert.equal(calls.length, 1);
    }
  });

  it("404 on every candidate is no-model-list", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "https://svc.example.com/*": { status: 404 } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    const result = await fetchModels({ base: "https://svc.example.com", fetchImpl, env: "node" });
    assert.deepEqual(result, { ok: false, reason: "no-model-list", message: "This server has no model list.", status: 404 });
    assert.equal(calls.length, 2);
  });

  it("a refused connection is unreachable and names the host", async () => {
    const result = await run({ "https://svc.example.com/*": { networkError: true } });
    assert.deepEqual(result, { ok: false, reason: "unreachable", message: "Can't reach svc.example.com." });
  });

  it("an unknown host is unreachable", async () => {
    const result = await run({});
    assert.equal(result.ok === false && result.reason, "unreachable");
  });

  it("a slow server times out once and says how long", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "https://svc.example.com/*": { hang: true } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    const started = Date.now();
    const result = await fetchModels({ base: "https://svc.example.com", fetchImpl, env: "node", timeoutMs: 40 });
    assert.equal(result.ok === false && result.reason, "timeout");
    assert.equal(result.ok === false && result.message, "No answer after 1 second.");
    assert.equal(calls.length, 1);
    assert.ok(Date.now() - started < 1000);
  });

  it("the timeout message follows the configured seconds", async () => {
    const result = await fetchModels({
      base: "https://svc.example.com/v1",
      fetchImpl: mockFetch({ "https://svc.example.com/*": { hang: true } }),
      env: "node",
      timeoutMs: 2000,
    });
    assert.equal(result.ok === false && result.message, "No answer after 2 seconds.");
  });

  it("HTML, plain text and invalid JSON are bad-response", async () => {
    for (const route of [
      { contentType: "text/html", text: "<html></html>" },
      { text: "ok" },
      { text: "{not json" },
    ]) {
      const result = await run({ "https://svc.example.com/*": route });
      assert.deepEqual(result, {
        ok: false,
        reason: "bad-response",
        message: "The server answered, but not with a model list.",
        status: 200,
      });
    }
  });

  it("an empty or wrongly shaped list is bad-response", async () => {
    for (const json of [{ data: [] }, [], {}, { error: "no" }, 7]) {
      const result = await run({ "https://svc.example.com/*": { json } });
      assert.equal(result.ok === false && result.reason, "bad-response");
    }
  });

  it("a 500 is bad-response", async () => {
    const result = await run({ "https://svc.example.com/*": { status: 500 } });
    assert.equal(result.ok === false && result.reason, "bad-response");
  });

  it("an HTML answer at /v1/models still tries /models", async () => {
    const fetchImpl = mockFetch({
      "https://svc.example.com/v1/models": { text: "<html></html>", contentType: "text/html" },
      "https://svc.example.com/models": { json: ["m"] },
    });
    const result = await fetchModels({ base: "https://svc.example.com", fetchImpl, env: "node" });
    assert.equal(result.ok, true);
  });

  it("a rejected key wins over an earlier 404", async () => {
    const fetchImpl = mockFetch({
      "https://svc.example.com/v1/models": { status: 404 },
      "https://svc.example.com/models": { status: 401 },
    });
    const result = await fetchModels({ base: "https://svc.example.com", fetchImpl, env: "node" });
    assert.equal(result.ok === false && result.reason, "key-rejected");
  });

  it("an invalid base is reported without any request", async () => {
    let called = false;
    const result = await fetchModels({
      base: "",
      fetchImpl: async () => {
        called = true;
        throw new Error("no");
      },
      env: "node",
    });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  });
});

describe("cors-blocked (browser only)", () => {
  const table = { "https://svc.example.com/*": { cors: true } };

  it("is reported in a browser when the server answers but the read is blocked", async () => {
    const result = await fetchModels({ base: "https://svc.example.com/v1", fetchImpl: mockFetch(table), env: "browser" });
    assert.deepEqual(result, { ok: false, reason: "cors-blocked", message: "This browser blocked the request." });
  });

  it("is never reported outside a browser", async () => {
    const result = await fetchModels({ base: "https://svc.example.com/v1", fetchImpl: mockFetch(table), env: "node" });
    assert.equal(result.ok === false && result.reason, "unreachable");
  });

  it("is unreachable in a browser when the probe cannot connect either", async () => {
    const result = await fetchModels({
      base: "https://svc.example.com/v1",
      fetchImpl: mockFetch({ "https://svc.example.com/*": { networkError: true } }),
      env: "browser",
    });
    assert.equal(result.ok === false && result.reason, "unreachable");
  });

  it("the probe carries no key and no custom headers", async () => {
    const calls: endpoint.MockCall[] = [];
    await fetchModels({ base: "https://svc.example.com/v1", key: KEY, fetchImpl: mockFetch(table, { onCall: (c: endpoint.MockCall) => calls.push(c) }), env: "browser" });
    const probe = calls.find((c) => c.mode === "no-cors");
    assert.ok(probe);
    assert.deepEqual(probe.headers, {});
    assert.equal(probe.url.includes(KEY), false);
  });
});

describe("redirects", () => {
  it("refuses a redirect to another host and never sends the key there", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch(
      {
        "https://api.example.com/v1/models": { status: 302, headers: { Location: "https://evil.example.net/v1/models" } },
        "https://evil.example.net/*": { json: ["stolen"] },
      },
      { onCall: (c: endpoint.MockCall) => calls.push(c) },
    );
    const result = await fetchModels({ base: "https://api.example.com/v1", key: KEY, fetchImpl, env: "node" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "bad-response");
    assert.match(result.ok === false ? result.message : "", /redirected to another address/);
    assert.deepEqual(calls.map((c) => new URL(c.url).host), ["api.example.com"]);
  });

  it("refuses a redirect to a subdomain or an https to http downgrade", async () => {
    for (const location of ["https://cdn.api.example.com/v1/models", "http://api.example.com/v1/models"]) {
      const calls: endpoint.MockCall[] = [];
      const fetchImpl = mockFetch(
        { "https://api.example.com/v1/models": { status: 301, headers: { location } }, "*": { json: ["x"] } },
        { onCall: (c: endpoint.MockCall) => calls.push(c) },
      );
      const result = await fetchModels({ base: "https://api.example.com/v1", key: KEY, fetchImpl, env: "node" });
      assert.equal(result.ok, false, location);
      assert.equal(calls.length, 1, location);
    }
  });

  it("refuses an opaque redirect, which hides its target", async () => {
    const fetchImpl = async () => ({
      status: 0,
      ok: false,
      type: "opaqueredirect",
      headers: { get: () => null },
      text: async () => "",
    });
    const result = await fetchModels({ base: "https://api.example.com/v1", key: KEY, fetchImpl, env: "node" });
    assert.equal(result.ok === false && result.reason, "bad-response");
  });

  it("follows a redirect inside the same host", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch(
      {
        "https://api.example.com/v1/models": { status: 308, headers: { Location: "/api/v1/models" } },
        "https://api.example.com/api/v1/models": { json: ["m"] },
      },
      { onCall: (c: endpoint.MockCall) => calls.push(c) },
    );
    const result = await fetchModels({ base: "https://api.example.com/v1", key: KEY, fetchImpl, env: "node" });
    assert.equal(result.ok, true);
    assert.equal(calls[1].headers.Authorization, `Bearer ${KEY}`);
  });

  it("follows an http to https upgrade on the same host", async () => {
    const fetchImpl = mockFetch({
      "http://studio.local/v1/models": { status: 301, headers: { location: "https://studio.local/v1/models" } },
      "https://studio.local/v1/models": { json: ["m"] },
    });
    const result = await fetchModels({ base: "http://studio.local/v1", fetchImpl, env: "node" });
    assert.equal(result.ok, true);
  });

  it("gives up on a redirect loop", async () => {
    const fetchImpl = mockFetch({ "https://api.example.com/v1/models": { status: 302, headers: { location: "/v1/models" } } });
    const result = await fetchModels({ base: "https://api.example.com/v1", fetchImpl, env: "node" });
    assert.equal(result.ok === false && result.reason, "bad-response");
  });
});

describe("the key never appears in a result", () => {
  const scenarios: [string, endpoint.FetchLike][] = [
    ["401 echoing the key", mockFetch({ "https://s.example.com/*": { status: 401, json: { error: `bad key ${KEY}` }, headers: { "x-echo": KEY } } })],
    ["network error mentioning the key", async () => { throw new TypeError(`connect failed for Bearer ${KEY}`); }],
    ["abort error mentioning the key", async () => { const e = new Error(`aborted ${KEY}`); e.name = "AbortError"; throw e; }],
    ["bad json echoing the key", mockFetch({ "https://s.example.com/*": { text: `oops ${KEY}` } })],
    ["list echoing the key", mockFetch({ "https://s.example.com/*": { json: { data: [] } } })],
    ["redirect to another host", mockFetch({ "https://s.example.com/*": { status: 302, headers: { location: `https://other.example.net/?k=${KEY}` } } })],
    ["success", mockFetch({ "https://s.example.com/*": { json: ["m"] } })],
  ];

  for (const [name, fetchImpl] of scenarios) {
    for (const env of ["node", "browser"] as const) {
      it(`${name} (${env})`, async () => {
        const result = await fetchModels({ base: "https://s.example.com", key: KEY, fetchImpl, env });
        assert.equal(JSON.stringify(result).includes(KEY), false);
        const test = await sendTestMessage({ base: "https://s.example.com", key: KEY, model: "m", fetchImpl, env });
        assert.equal(JSON.stringify(test).includes(KEY), false);
      });
    }
  }

  it("never puts the key in any requested URL", async () => {
    const calls: endpoint.MockCall[] = [];
    const fetchImpl = mockFetch({ "https://s.example.com/*": { status: 404 } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    await fetchModels({ base: "https://s.example.com", key: KEY, fetchImpl, env: "browser" });
    await sendTestMessage({ base: "https://s.example.com", key: KEY, model: "m", fetchImpl, env: "browser" });
    assert.ok(calls.length > 0);
    for (const call of calls) assert.equal(call.url.includes(KEY), false);
  });
});

describe("sendTestMessage", () => {
  it("passes on a 2xx JSON answer and sends a one token request", async () => {
    const calls: (endpoint.MockCall & { body?: string })[] = [];
    const inner = mockFetch({ "POST https://a.example.com/v1/chat/completions": { json: { choices: [] } } }, { onCall: (c: endpoint.MockCall) => calls.push(c) });
    let body = "";
    const fetchImpl: endpoint.FetchLike = (url, init) => {
      body = init?.body ?? "";
      return inner(url, init);
    };
    const result = await sendTestMessage({ base: "https://a.example.com/v1", urlUsed: "https://a.example.com/v1/models", key: KEY, model: "m1", fetchImpl, env: "node" });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    assert.equal(JSON.parse(body).max_tokens, 1);
    assert.equal(JSON.parse(body).model, "m1");
  });

  it("fails on 401, 404, 500, timeout and an unreachable host", async () => {
    const run = (route: endpoint.MockRoute, timeoutMs?: number) =>
      sendTestMessage({ base: "https://a.example.com/v1", model: "m", fetchImpl: mockFetch({ "https://a.example.com/*": route }), env: "node", timeoutMs });
    const unauthorized = await run({ status: 401 });
    assert.equal(unauthorized.ok === false && unauthorized.reason, "key-rejected");
    const missing = await run({ status: 404 });
    assert.equal(missing.ok === false && missing.reason, "no-model-list");
    const broken = await run({ status: 500 });
    assert.equal(broken.ok === false && broken.reason, "bad-response");
    const slow = await run({ hang: true }, 30);
    assert.equal(slow.ok === false && slow.reason, "timeout");
    const down = await run({ networkError: true });
    assert.equal(down.ok === false && down.reason, "unreachable");
  });

  it("refuses an empty model", async () => {
    const result = await sendTestMessage({ base: "https://a.example.com/v1", model: " ", fetchImpl: mockFetch({}), env: "node" });
    assert.equal(result.ok, false);
  });
});

describe("sample scenarios", () => {
  const expected: Record<string, string> = {
    "api.example.com": "ok:7",
    "models.example.com": "ok:3",
    "many.example.com": "ok:14",
    "localhost:11434": "ok:4",
    "badkey.example.com": "key-rejected",
    "nolist.example.com": "no-model-list",
    "down.example.com": "unreachable",
    "slow.example.com": "timeout",
    "html.example.com": "bad-response",
    "cors.example.com": "cors-blocked",
  };

  for (const sample of SAMPLE_ENDPOINTS) {
    it(`${sample.url}`, async () => {
      const result = await fetchModels({ base: sample.url, key: "", fetchImpl: sampleFetch(), env: "browser", timeoutMs: sample.host === "slow.example.com" ? 100 : 3000 });
      const outcome = result.ok ? `ok:${result.models.length}` : result.reason;
      assert.equal(outcome, expected[sample.host]);
    });
  }

  it("every sample has an expectation and a route", () => {
    assert.deepEqual(SAMPLE_ENDPOINTS.map((s: endpoint.SampleEndpoint) => s.host).sort(), Object.keys(expected).sort());
    assert.ok(Object.keys(SAMPLE_TABLE).length >= SAMPLE_ENDPOINTS.length);
  });

  it("api.example.com returns 7 models and models.example.com answers only at /v1/models", async () => {
    const api = await fetchModels({ base: "https://api.example.com/v1", fetchImpl: sampleFetch(), env: "browser" });
    assert.equal(api.ok && api.models.length, 7);
    const models = await fetchModels({ base: "https://models.example.com", fetchImpl: sampleFetch(), env: "browser" });
    assert.equal(models.ok && models.urlUsed, "https://models.example.com/v1/models");
  });

  it("the Ollama style sample needs no key and the test passes", async () => {
    const fetchImpl = sampleFetch();
    const result = await fetchModels({ base: "http://localhost:11434", fetchImpl, env: "browser" });
    assert.equal(result.ok && result.models[0].id, "gemma2:9b");
    const test = await sendTestMessage({ base: "http://localhost:11434", urlUsed: "http://localhost:11434/v1/models", model: "gemma2:9b", fetchImpl, env: "browser", timeoutMs: 3000 });
    assert.equal(test.ok, true);
  });

  it("many.example.com fails its test message", async () => {
    const test = await sendTestMessage({ base: "https://many.example.com/v1", model: "m", fetchImpl: sampleFetch(), env: "browser", timeoutMs: 3000 });
    assert.equal(test.ok, false);
  });

  it("an unknown host in the samples is unreachable", async () => {
    const result = await fetchModels({ base: "https://not-a-sample.test", fetchImpl: sampleFetch(), env: "browser" });
    assert.equal(result.ok === false && result.reason, "unreachable");
  });
});
