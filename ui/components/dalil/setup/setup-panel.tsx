"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  RiCheckLine,
  RiChatSmile3Line,
  RiCloseCircleLine,
  RiComputerLine,
  RiEyeLine,
  RiEyeOffLine,
  RiGlobalLine,
  RiKey2Line,
  RiLinkM,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Accordion, AccordionItem } from "@/components/base/accordion/accordion";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { HintText } from "@/components/base/input/hint-text";
import { InputBase, TextField } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Kbd } from "@/components/base/kbd/kbd";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Spinner } from "@/components/base/spinner/spinner";
import { Switch } from "@/components/base/switch/switch";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import { isSampleHost, isValidHeaderName, normalizeBase } from "@/lib/endpoint";
import { cx } from "@/utils/cx";
import { ErrorRow } from "./error-row";
import { HintTrigger } from "./hint-trigger";
import { ModelEmpty, ModelList, ModelSkeleton } from "./model-list";
import { copy, fill, local } from "./setup-copy";
import { chosenModel, type Scheme, type SetupActions, type SetupModel } from "./setup-types";

/** Focus ring offset that matches the notch ground instead of BoardUI's white. */
const RING = "ring-offset-background-full";

export interface SetupPanelProps {
  model: SetupModel;
  actions: SetupActions;
  /** True while the page is in sample mode, which adds a hint for hosts that are not samples. */
  sampleMode?: boolean;
}

/**
 * The Setup face of the notch: the whole provider story in one form. It draws whatever the model
 * says, so the live flow and the static states gallery share it. Keys: Tab moves, Enter fetches,
 * arrows move in the list, Enter or Space picks, Esc closes.
 */
export function SetupPanel({ model, actions, sampleMode = false }: SetupPanelProps) {
  const formId = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const modelIdRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const modelsRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);
  const fade = useScrollFade();

  const norm = normalizeBase(model.baseUrl);
  const urlValid = !norm.error;
  const picked = chosenModel(model);
  const headerInvalid = model.headerName.trim() !== "" && !isValidHeaderName(model.headerName);
  const connecting = model.phase === "connecting";
  const canSave = urlValid && picked !== "";

  /* The panel is capped at 520px, so bring new results into view when they arrive. Only the
     panel's own scroller moves, never the page. */
  const reveal = (el: HTMLElement | null) => {
    const scroller = scrollerRef.current;
    if (!scroller || !el) return;
    const bounds = scroller.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const top = bounds.top + 28;
    let delta = 0;
    if (box.bottom > bounds.bottom) delta = box.bottom - bounds.bottom + 4;
    if (box.top - delta < top) delta = box.top - top;
    if (delta === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
  };
  const seenPhase = useRef(model.phase);
  useEffect(() => {
    if (seenPhase.current === model.phase) return;
    seenPhase.current = model.phase;
    if (model.phase !== "idle") reveal(modelsRef.current);
  }, [model.phase]);
  const hasPick = picked !== "";
  const seenPick = useRef(hasPick);
  useEffect(() => {
    if (seenPick.current === hasPick) return;
    seenPick.current = hasPick;
    if (hasPick) reveal(extrasRef.current);
  }, [hasPick]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      actions.close();
    }
  };

  const focusKey = () => {
    keyRef.current?.focus();
    keyRef.current?.select();
  };
  const typeModel = () => {
    actions.setManual(true);
    requestAnimationFrame(() => modelIdRef.current?.focus());
  };

  /* URL hint: the normalised address when it differs from what was typed. */
  const typed = model.baseUrl.trim();
  const urlHint: ReactNode = model.urlError
    ? model.urlError === "empty"
      ? local.urlEmpty
      : local.urlInvalid
    : urlValid && typed !== "" && norm.base !== typed
      ? (
          <>
            {local.using} <span className="break-all font-mono">{norm.base}</span>
          </>
        )
      : copy.setup.fields.base_url.helper;

  /* Disclosure: always visible. */
  const disclosure = !urlValid
    ? { Icon: RiShieldCheckLine, text: copy.setup.intro }
    : norm.local
      ? { Icon: RiComputerLine, text: copy.setup.disclosure.local }
      : {
          Icon: RiGlobalLine,
          text: fill(model.useScreenshots ? copy.setup.disclosure.remote_screenshots_on : copy.setup.disclosure.remote, {
            host: norm.host,
          }),
        };

  return (
    <section
      aria-label={copy.notch.setup.title}
      onKeyDown={onKeyDown}
      className="@container flex max-h-130 min-h-0 flex-col"
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-title-3-semibold text-text-primary">{copy.notch.setup.title}</h2>
          <p className="text-body-regular text-text-secondary">{model.saved ? local.leadEdit : copy.setup.first_run}</p>
        </div>
        <CloseButton aria-label={copy.aria.icon_buttons.close} size="sm" className={RING} onClick={actions.close} />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ScrollFade progress={fade.progress} surfaceClassName="from-background-full" />
        <div ref={scrollerRef} onScroll={fade.onScroll} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5">
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              actions.fetchModels();
            }}
            className="flex flex-col gap-3"
          >
            <div className="grid gap-3 @lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TextField
                value={model.baseUrl}
                onChange={actions.setBaseUrl}
                isInvalid={model.urlError !== null}
                name="base-url"
                type="text"
                inputMode="url"
                autoComplete="off"
              >
                <Label>{copy.setup.fields.base_url.label}</Label>
                <InputBase
                  ref={urlRef}
                  dir="ltr"
                  data-autofocus
                  leadingIcon={RiLinkM}
                  placeholder={copy.setup.fields.base_url.placeholder}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="font-mono"
                />
                <HintText isInvalid={model.urlError !== null}>{urlHint}</HintText>
              </TextField>

              <TextField
                value={model.apiKey}
                onChange={actions.setApiKey}
                name="endpoint-key"
                type={model.showKey ? "text" : "password"}
                autoComplete="off"
              >
                <Label>{copy.setup.fields.api_key.label}</Label>
                <InputBase
                  ref={keyRef}
                  dir="ltr"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  leadingIcon={RiKey2Line}
                  placeholder={copy.setup.fields.api_key.placeholder}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="font-mono"
                  trailingAddon={
                    <HintTrigger label={model.showKey ? copy.aria.icon_buttons.hide_key : copy.aria.icon_buttons.show_key}>
                      <Button
                        variant="ghost"
                        size="xs"
                        iconOnly
                        leadingIcon={model.showKey ? RiEyeOffLine : RiEyeLine}
                        aria-label={model.showKey ? copy.aria.icon_buttons.hide_key : copy.aria.icon_buttons.show_key}
                        aria-pressed={model.showKey}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => actions.setShowKey(!model.showKey)}
                        className={cx("relative bg-transparent text-foreground-icon-secondary hover:bg-background-tertiary-default hover:text-foreground-icon-primary active:bg-background-tertiary-hover after:absolute after:-inset-2.5", RING)}
                      />
                    </HintTrigger>
                  }
                />
                <HintText>{local.keyHint}</HintText>
              </TextField>
            </div>

            <Accordion
              variant="divided"
              expandedKeys={model.advancedOpen ? ["advanced"] : []}
              onExpandedChange={(keys) => actions.setAdvancedOpen(keys.has("advanced"))}
              className="-mx-0.5"
            >
              <AccordionItem
                id="advanced"
                title={copy.setup.advanced.label}
                headingLevel={3}
                className="[&_.text-headline-medium]:text-body-medium [&_.text-headline-medium]:text-text-secondary [&_[slot=trigger]]:py-1.5 [&_[slot=trigger]]:ps-0.5"
              >
                <div className="grid gap-3 px-0.5 pb-1 pt-1 @lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <TextField
                    value={model.headerName}
                    onChange={actions.setHeaderName}
                    isInvalid={headerInvalid}
                    name="header-name"
                    type="text"
                    autoComplete="off"
                  >
                    <Label>{copy.setup.fields.header_name.label}</Label>
                    <InputBase
                      dir="ltr"
                      placeholder={copy.setup.fields.header_name.placeholder}
                      spellCheck={false}
                      autoCapitalize="none"
                      className="font-mono"
                    />
                    <HintText isInvalid={headerInvalid}>
                      {headerInvalid ? local.headerNameInvalid : copy.setup.advanced.helper}
                    </HintText>
                  </TextField>
                  <div className="flex flex-col items-start gap-1">
                    <span id={`${formId}-scheme`} className="text-body-medium text-text-primary">
                      {copy.setup.fields.scheme.label}
                    </span>
                    <SegmentedControl
                      aria-labelledby={`${formId}-scheme`}
                      selectedKeys={[model.scheme]}
                      onSelectionChange={(keys) => {
                        const next = [...keys][0];
                        if (next === "Bearer" || next === "None") actions.setScheme(next as Scheme);
                      }}
                    >
                      {copy.setup.fields.scheme.options.map((option) => (
                        <SegmentedControlItem key={option} id={option}>
                          {option}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  </div>
                </div>
                <div
                  role="group"
                  aria-labelledby={`${formId}-voice`}
                  aria-describedby={`${formId}-voice-help`}
                  className="flex flex-col gap-3 px-0.5 pt-3 pb-1"
                >
                  <div className="flex flex-col gap-0.5">
                    <h4 id={`${formId}-voice`} className="text-caption-1-semibold text-text-secondary">
                      {copy.setup.voice.label}
                    </h4>
                    <p id={`${formId}-voice-help`} className="text-caption-1-medium text-text-secondary">
                      {copy.setup.voice.helper}
                    </p>
                  </div>
                  <div className="grid gap-3 @lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <TextField value={model.sttModel} onChange={actions.setSttModel} name="stt-model" type="text" autoComplete="off">
                      <Label>{copy.setup.fields.stt_model.label}</Label>
                      <InputBase
                        dir="ltr"
                        placeholder={copy.setup.fields.stt_model.placeholder}
                        spellCheck={false}
                        autoCapitalize="none"
                        className="font-mono"
                      />
                    </TextField>
                    <TextField value={model.ttsModel} onChange={actions.setTtsModel} name="tts-model" type="text" autoComplete="off">
                      <Label>{copy.setup.fields.tts_model.label}</Label>
                      <InputBase
                        dir="ltr"
                        placeholder={copy.setup.fields.tts_model.placeholder}
                        spellCheck={false}
                        autoCapitalize="none"
                        className="font-mono"
                      />
                    </TextField>
                    <TextField value={model.ttsVoice} onChange={actions.setTtsVoice} name="tts-voice" type="text" autoComplete="off">
                      <Label>{copy.setup.fields.tts_voice.label}</Label>
                      <InputBase
                        dir="ltr"
                        placeholder={copy.setup.fields.tts_voice.placeholder}
                        spellCheck={false}
                        autoCapitalize="none"
                        className="font-mono"
                      />
                    </TextField>
                  </div>
                </div>
              </AccordionItem>
            </Accordion>
          </form>

          <div ref={modelsRef} className="flex flex-col gap-3">
            {model.phase === "idle" && !model.manual ? <ModelEmpty canFetch={urlValid} /> : null}
            {connecting ? <ModelSkeleton host={norm.host} /> : null}
            {model.phase === "connected" && !model.manual ? (
              <ModelList
                host={norm.host}
                models={model.models}
                selected={model.selected}
                search={model.search}
                onSearch={actions.setSearch}
                onSelect={actions.selectModel}
              />
            ) : null}
            {model.phase === "error" && model.failure ? (
              <ErrorRow
                failure={model.failure}
                hostIsLocal={norm.local}
                sampleUnknownHost={sampleMode && urlValid && !isSampleHost(norm.host)}
                onEditKey={focusKey}
                onCheckUrl={() => urlRef.current?.focus()}
                onRetry={() => actions.fetchModels()}
                onTypeModel={typeModel}
              />
            ) : null}

            {model.manual ? (
              <TextField value={model.manualId} onChange={actions.setManualId} name="model-id" type="text" autoComplete="off">
                <Label>{copy.setup.fields.model_id.label}</Label>
                <InputBase
                  ref={modelIdRef}
                  dir="ltr"
                  placeholder={copy.setup.fields.model_id.placeholder}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="font-mono"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canSave) {
                      event.preventDefault();
                      actions.save();
                    }
                  }}
                />
                <HintText>{copy.setup.fields.model_id.helper}</HintText>
              </TextField>
            ) : null}
          </div>

          {picked ? (
            <div
              ref={extrasRef}
              className="grid gap-x-6 gap-y-4 transition-[opacity,translate] duration-220 ease-dalil-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0 @lg:grid-cols-2"
            >
              <div className="flex flex-col items-start gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={RiChatSmile3Line}
                  className={RING}
                  disabled={model.test === "sending" || !urlValid}
                  onClick={actions.sendTest}
                >
                  {copy.setup.buttons.send_test}
                </Button>
                <div role="status" aria-live="polite" className="flex min-w-0 flex-col gap-0.5">
                  {model.test === "sending" ? (
                    <p className="flex items-center gap-2 text-caption-1-medium text-text-secondary">
                      <Spinner size="sm" aria-hidden />
                      {copy.setup.test.sending}
                    </p>
                  ) : model.test === "pass" ? (
                    <p className="flex items-start gap-2 text-caption-1-medium text-text-primary">
                      <RiCheckLine className="size-4 shrink-0 text-notch-ok" aria-hidden />
                      {copy.setup.test.pass}
                    </p>
                  ) : model.test === "fail" ? (
                    <>
                      <p className="flex items-start gap-2 text-caption-1-medium text-text-primary">
                        <RiCloseCircleLine className="size-4 shrink-0 text-text-error-primary" aria-hidden />
                        {copy.setup.test.fail}
                      </p>
                      {model.testMessage ? <p className="ps-6 text-caption-1-medium text-text-secondary">{model.testMessage}</p> : null}
                    </>
                  ) : (
                    <p className="text-caption-1-medium text-text-secondary">{copy.setup.test.helper}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-start gap-1.5">
                <Switch
                  isSelected={model.useScreenshots}
                  onChange={actions.setUseScreenshots}
                  aria-describedby={`${formId}-shots`}
                >
                  {copy.setup.use_screenshots.label}
                </Switch>
                <p id={`${formId}-shots`} className="ps-12.5 text-caption-1-medium text-text-secondary">
                  {copy.setup.use_screenshots.helper}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-separator-border px-5 py-3">
        <p className="flex items-start gap-2 text-body-regular text-text-secondary">
          <disclosure.Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span>
            {disclosure.text}
            {urlValid && norm.insecure ? ` ${local.insecure}` : ""}
          </span>
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="hidden items-center gap-1.5 text-caption-1-medium text-text-tertiary @lg:flex">
            <Kbd>Esc</Kbd>
            {local.closes}
          </p>
          <div className="ms-auto flex items-center gap-2">
            <Button
              type="submit"
              form={formId}
              variant="secondary"
              className={RING}
              disabled={connecting || headerInvalid}
              aria-busy={connecting || undefined}
            >
              {copy.setup.buttons.fetch_models}
            </Button>
            <Button className={RING} disabled={!canSave} onClick={actions.save}>
              {copy.setup.buttons.save}
            </Button>
          </div>
        </div>
      </footer>
    </section>
  );
}
