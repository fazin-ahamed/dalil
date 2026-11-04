import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/** A Foundations section with an anchor. The first one has no top rule. */
export function Section({
  id,
  title,
  intro,
  children,
  first = false,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cx("flex scroll-mt-28 flex-col gap-8", !first && "border-t border-separator-border pt-12")}
    >
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 id={`${id}-title`} className="text-title-2-medium text-text-primary">
          {title}
        </h2>
        <p className="text-body-regular text-text-secondary">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/** A titled block inside a section: a heading, an optional note, then a table or list. */
export function Block({
  title,
  note,
  children,
  id,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3" id={id}>
      <div className="flex max-w-2xl flex-col gap-0.5">
        <h3 className="text-headline-semibold text-text-primary">{title}</h3>
        {note && <p className="text-body-regular text-text-secondary">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/** Mono token or value text. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("font-mono text-body-2-regular text-text-primary", className)}>{children}</code>;
}
