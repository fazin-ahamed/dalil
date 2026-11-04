"use client";

import type { ComponentType, ReactNode } from "react";
import {
  RiErrorWarningLine,
  RiKey2Line,
  RiProhibitedLine,
  RiServerLine,
  RiTimeLine,
  RiWifiOffLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { LinkButton } from "@/components/base/buttons/link-button";
import type { ErrorReason } from "@/lib/endpoint";
import { cx } from "@/utils/cx";
import { copy, local } from "./setup-copy";
import type { SetupFailure } from "./setup-types";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const ICONS: Record<ErrorReason, Icon> = {
  "key-rejected": RiKey2Line,
  "no-model-list": RiServerLine,
  unreachable: RiWifiOffLine,
  timeout: RiTimeLine,
  "bad-response": RiErrorWarningLine,
  "cors-blocked": RiProhibitedLine,
};

/** Focus ring that matches the notch ground instead of BoardUI's white offset. */
const RING = "ring-offset-background-full";

const LINK = "text-notch-accent active:text-notch-ink";

export interface ErrorRowProps {
  failure: SetupFailure;
  /** True when the host is local, which adds the CORS hint for local servers. */
  hostIsLocal: boolean;
  sampleUnknownHost: boolean;
  onEditKey(): void;
  onCheckUrl(): void;
  onRetry(): void;
  onTypeModel(): void;
}

/** One failure: icon, the message from brief section 7, and its actions. */
export function ErrorRow({ failure, hostIsLocal, sampleUnknownHost, onEditKey, onCheckUrl, onRetry, onTypeModel }: ErrorRowProps) {
  const Glyph = ICONS[failure.reason];
  const typeModel = (
    <Button variant="secondary" size="small" className={RING} onClick={onTypeModel}>
      {copy.setup.buttons.type_model_id}
    </Button>
  );
  const retry = (
    <LinkButton size="small" className={cx(LINK, RING)} onClick={onRetry}>
      {copy.setup.buttons.retry}
    </LinkButton>
  );

  let actions: ReactNode;
  switch (failure.reason) {
    case "key-rejected":
      actions = (
        <Button variant="secondary" size="small" className={RING} onClick={onEditKey}>
          {copy.setup.buttons.edit_key}
        </Button>
      );
      break;
    case "no-model-list":
    case "bad-response":
      actions = typeModel;
      break;
    case "unreachable":
      actions = (
        <>
          <Button variant="secondary" size="small" className={RING} onClick={onCheckUrl}>
            {copy.setup.buttons.check_url}
          </Button>
          {retry}
        </>
      );
      break;
    case "timeout":
      actions = retry;
      break;
    case "cors-blocked":
      actions = (
        <>
          {typeModel}
          {retry}
        </>
      );
      break;
  }

  const note =
    failure.reason === "cors-blocked"
      ? [local.corsNote, hostIsLocal ? copy.setup.cors_note : null].filter(Boolean).join(" ")
      : failure.reason === "unreachable" && sampleUnknownHost
        ? local.sampleUnknownHost
        : null;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl bg-background-primary-default p-3">
      <div className="flex items-start gap-2.5">
        <Glyph className="mt-0.5 size-5 shrink-0 text-text-error-primary" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body-medium text-text-primary">{failure.message}</p>
          {note ? <p className="text-caption-1-medium text-text-secondary">{note}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ps-7.5">{actions}</div>
    </div>
  );
}
