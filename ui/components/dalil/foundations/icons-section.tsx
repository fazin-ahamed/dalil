"use client";

import type { ComponentType } from "react";
import {
  RiAlertLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiChat1Line,
  RiCheckLine,
  RiCloseLine,
  RiCursorLine,
  RiEyeLine,
  RiEyeOffLine,
  RiHome4Line,
  RiInformationLine,
  RiKey2Line,
  RiLinkM,
  RiLockLine,
  RiMacbookLine,
  RiMicLine,
  RiPlugLine,
  RiReceiptLine,
  RiRefreshLine,
  RiScrollToBottomLine,
  RiSearchLine,
  RiServerLine,
  RiSettings3Line,
  RiTimeLine,
} from "@remixicon/react";
import { Block, Code } from "./section";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const ICONS: { label: string; name: string; Icon: Icon }[] = [
  { label: "Settings", name: "RiSettings3Line", Icon: RiSettings3Line },
  { label: "Receipt", name: "RiReceiptLine", Icon: RiReceiptLine },
  { label: "Microphone", name: "RiMicLine", Icon: RiMicLine },
  { label: "Check", name: "RiCheckLine", Icon: RiCheckLine },
  { label: "Close", name: "RiCloseLine", Icon: RiCloseLine },
  { label: "Arrow right", name: "RiArrowRightLine", Icon: RiArrowRightLine },
  { label: "Arrow left", name: "RiArrowLeftLine", Icon: RiArrowLeftLine },
  { label: "Chevron down", name: "RiArrowDownSLine", Icon: RiArrowDownSLine },
  { label: "Eye", name: "RiEyeLine", Icon: RiEyeLine },
  { label: "Eye off", name: "RiEyeOffLine", Icon: RiEyeOffLine },
  { label: "Search", name: "RiSearchLine", Icon: RiSearchLine },
  { label: "Refresh", name: "RiRefreshLine", Icon: RiRefreshLine },
  { label: "Key", name: "RiKey2Line", Icon: RiKey2Line },
  { label: "Link", name: "RiLinkM", Icon: RiLinkM },
  { label: "Server", name: "RiServerLine", Icon: RiServerLine },
  { label: "Laptop", name: "RiMacbookLine", Icon: RiMacbookLine },
  { label: "Chat bubble", name: "RiChat1Line", Icon: RiChat1Line },
  { label: "Cursor", name: "RiCursorLine", Icon: RiCursorLine },
  { label: "Scroll", name: "RiScrollToBottomLine", Icon: RiScrollToBottomLine },
  { label: "Warning", name: "RiAlertLine", Icon: RiAlertLine },
  { label: "Lock", name: "RiLockLine", Icon: RiLockLine },
  { label: "Home", name: "RiHome4Line", Icon: RiHome4Line },
  { label: "Plug", name: "RiPlugLine", Icon: RiPlugLine },
  { label: "Time", name: "RiTimeLine", Icon: RiTimeLine },
  { label: "Info", name: "RiInformationLine", Icon: RiInformationLine },
];

export function IconsSection() {
  return (
    <Block
      title="Glyph set"
      note="Remix outline, 20px, currentColor. Import from @remixicon/react and pass the component, never a rendered element. Never an emoji."
    >
      <ul className="grid grid-cols-1 border-t border-separator-border sm:grid-cols-2 lg:grid-cols-3">
        {ICONS.map(({ label, name, Icon }) => (
          <li key={name} className="flex min-h-14 items-center gap-4 border-b border-separator-border py-2 pe-4">
            <Icon className="size-5 shrink-0 text-ink" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="text-body-medium text-text-primary">{label}</span>
              <Code className="truncate text-text-secondary">{name}</Code>
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}
