"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, Wordmark } from "@/components/dalil/brand-mark";
import copy from "@/lib/copy.json";
import { cx } from "@/utils/cx";

const links = [
  { href: "/", label: "Stage" },
  { href: "/foundations", label: "Foundations" },
  { href: "/notch", label: "Notch" },
  { href: "/cards", label: "Guide cards" },
  { href: "/visuals", label: "Visuals" },
  { href: "/setup", label: "Setup" },
  { href: "/receipts", label: "Receipts" },
  { href: "/memory", label: copy.memory.nav },
  { href: "/projects", label: copy.projects.nav },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-separator-border bg-background-full/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-15 w-full max-w-300 items-center justify-between gap-6 px-6 md:px-12">
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          <BrandMark />
          <Wordmark />
        </Link>
        <nav aria-label="Design system" className="flex min-w-0 gap-1 overflow-x-auto pe-6 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] md:pe-0 md:[mask-image:none]">
          {links.map((l) => {
            const current = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "flex min-h-11 shrink-0 items-center rounded-xl px-3 text-body-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  current
                    ? "bg-background-secondary-default text-text-primary"
                    : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
