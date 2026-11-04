"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SAMPLE_TIMEOUT_MS,
  fetchModels,
  normalizeBase,
  sampleFetch,
  sendTestMessage,
  type FetchLike,
} from "@/lib/endpoint";
import { EMPTY_MODEL, chosenModel, type SetupActions, type SetupModel } from "./setup-types";
import { nativeFetch } from "@/lib/native-bridge";

export type SetupSource = "sample" | "live" | "native";

const LIVE_TIMEOUT_MS = 8000;

/**
 * State and network for the Setup panel. "sample" answers from the page with mockFetch;
 * "live" makes real requests from this browser. The key lives only in this state, goes only to
 * the host in the Base URL field, and is cleared on Save.
 */
export interface SavedSettings {
  base: string;
  host: string;
  local: boolean;
  model: string;
  useScreenshots: boolean;
  headerName: string;
  scheme: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
}

export function useEndpointSetup(
  source: SetupSource,
  initial?: Partial<SetupModel>,
  onSave?: (saved: SavedSettings, key: string) => void,
) {
  const [model, setModel] = useState<SetupModel>({ ...EMPTY_MODEL, ...initial });
  const latest = useRef(model);
  const sourceRef = useRef(source);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    latest.current = model;
    sourceRef.current = source;
    onSaveRef.current = onSave;
  });
  const run = useRef(0);
  const testRun = useRef(0);

  const patch = useCallback((next: Partial<SetupModel>) => setModel((m) => ({ ...m, ...next })), []);

  // Switching between sample and live ends whatever was in flight and starts clean.
  const firstSource = useRef(true);
  useEffect(() => {
    if (firstSource.current) {
      firstSource.current = false;
      return;
    }
    run.current++;
    testRun.current++;
    setModel((m) => ({
      ...m,
      phase: "idle",
      models: [],
      urlUsed: null,
      failure: null,
      urlError: null,
      search: "",
      selected: null,
      manual: false,
      test: "idle",
      testMessage: null,
    }));
  }, [source]);

  useEffect(
    () => () => {
      run.current++;
      testRun.current++;
    },
    [],
  );

  const requestOptions = useCallback((): { fetchImpl?: FetchLike; timeoutMs: number } => {
    if (sourceRef.current === "sample") return { fetchImpl: sampleFetch(), timeoutMs: SAMPLE_TIMEOUT_MS };
    if (sourceRef.current === "native") return { fetchImpl: nativeFetch, timeoutMs: LIVE_TIMEOUT_MS };
    return { timeoutMs: LIVE_TIMEOUT_MS };
  }, []);

  const actions = useMemo<SetupActions>(() => {
    const resetResults: Partial<SetupModel> = {
      phase: "idle",
      models: [],
      urlUsed: null,
      failure: null,
      selected: null,
      manual: false,
      search: "",
      test: "idle",
      testMessage: null,
    };

    return {
      setBaseUrl(value) {
        run.current++;
        testRun.current++;
        patch({ baseUrl: value, urlError: null, ...resetResults });
      },
      setApiKey: (apiKey) => patch({ apiKey }),
      setShowKey: (showKey) => patch({ showKey }),
      setAdvancedOpen: (advancedOpen) => patch({ advancedOpen }),
      setHeaderName: (headerName) => patch({ headerName }),
      setScheme: (scheme) => patch({ scheme }),
      setSttModel: (sttModel) => patch({ sttModel }),
      setTtsModel: (ttsModel) => patch({ ttsModel }),
      setTtsVoice: (ttsVoice) => patch({ ttsVoice }),

      async fetchModels(baseUrl) {
        const m = latest.current;
        const typed = typeof baseUrl === "string" ? baseUrl : m.baseUrl;
        if (m.phase === "connecting" && typed === m.baseUrl) return;
        const normalized = normalizeBase(typed);
        if (normalized.error) {
          patch({ baseUrl: typed, urlError: normalized.error === "empty" ? "empty" : "invalid" });
          return;
        }
        const id = ++run.current;
        testRun.current++;
        patch({ ...resetResults, baseUrl: typed, phase: "connecting", urlError: null });

        const { fetchImpl, timeoutMs } = requestOptions();
        const result = await fetchModels({
          base: normalized.base,
          key: m.apiKey,
          headerName: m.headerName,
          scheme: m.scheme,
          fetchImpl,
          timeoutMs,
          env: sourceRef.current === "native" ? "node" : "browser",
        });
        if (id !== run.current) return;
        if (result.ok) {
          patch({ phase: "connected", models: result.models, urlUsed: result.urlUsed, failure: null });
        } else {
          patch({
            phase: "error",
            failure: { reason: result.reason, message: result.message, status: result.status },
          });
        }
      },

      selectModel: (id) => {
        testRun.current++;
        patch({ selected: id, manual: false, test: "idle", testMessage: null });
      },
      setSearch: (search) => patch({ search }),
      setManual: (manual) => {
        testRun.current++;
        patch({ manual, test: "idle", testMessage: null });
      },
      setManualId: (manualId) => {
        testRun.current++;
        patch({ manualId, test: "idle", testMessage: null });
      },
      setUseScreenshots: (useScreenshots) => patch({ useScreenshots }),

      async sendTest() {
        const m = latest.current;
        const model = chosenModel(m);
        const normalized = normalizeBase(m.baseUrl);
        if (!model || normalized.error || m.test === "sending") return;
        const id = ++testRun.current;
        patch({ test: "sending", testMessage: null });
        const { fetchImpl } = requestOptions();
        const result = await sendTestMessage({
          base: normalized.base,
          urlUsed: m.urlUsed ?? undefined,
          model,
          key: m.apiKey,
          headerName: m.headerName,
          scheme: m.scheme,
          fetchImpl,
          timeoutMs: sourceRef.current === "sample" ? 4000 : 15000,
          env: sourceRef.current === "native" ? "node" : "browser",
        });
        if (id !== testRun.current) return;
        patch({ test: result.ok ? "pass" : "fail", testMessage: result.ok ? null : result.message });
      },

      save() {
        const m = latest.current;
        const model = chosenModel(m);
        const normalized = normalizeBase(m.baseUrl);
        if (!model || normalized.error) return;
        run.current++;
        testRun.current++;
        onSaveRef.current?.(
          {
            base: normalized.base,
            host: normalized.host,
            local: normalized.local,
            model,
            useScreenshots: m.useScreenshots,
            headerName: m.headerName,
            scheme: m.scheme,
            sttModel: m.sttModel.trim(),
            ttsModel: m.ttsModel.trim(),
            ttsVoice: m.ttsVoice.trim(),
          },
          m.apiKey,
        );
        patch({
          screen: "home",
          justSaved: true,
          apiKey: "",
          showKey: false,
          test: "idle",
          testMessage: null,
          saved: {
            base: normalized.base,
            host: normalized.host,
            local: normalized.local,
            model,
            useScreenshots: m.useScreenshots,
          },
        });
      },

      close: () => patch({ screen: "home", justSaved: false }),
      openSetup: () => patch({ screen: "setup", justSaved: false }),
    };
  }, [patch, requestOptions]);

  return { model, actions };
}
