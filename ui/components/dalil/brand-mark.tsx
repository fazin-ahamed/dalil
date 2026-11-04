import { cx } from "@/utils/cx";

/** The Dalil mark: a hand-inked D with the pointer dot in its bowl. The D follows currentColor. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cx("size-6 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M9.6 6.4c-.3 4.9-.2 14.2.1 19.4M9.5 6.9c8.1-1.5 15.8 2.5 15.5 9.3-.3 6.1-7.1 10.1-15.2 9.1"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.2" cy="16.2" r="5.6" stroke="var(--color-signal)" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="17.2" cy="16.2" r="3" fill="var(--color-signal)" />
    </svg>
  );
}

/** Wordmark in the card hand. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cx("font-ink text-[1.625rem] font-bold leading-none", className)}>Dalil</span>;
}
