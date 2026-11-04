"use client";

import { useState, type ReactNode } from "react";
import { isTauri, openWebUrl } from "@/lib/native-bridge";

export function ExternalLink({ href, title, className, children }: { href: string; title?: string; className?: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return <><a href={href} title={title} target="_blank" rel="noreferrer" className={className} onClick={(event) => {
    if (!isTauri()) return;
    event.preventDefault();
    void openWebUrl(href).then(() => setFailed(false)).catch(() => setFailed(true));
  }}>{children}</a>{failed && <span role="alert" className="text-caption-1-medium text-notch-error">Could not open this link.</span>}</>;
}

/** Small, HTML-free Markdown subset. Model text is always rendered as escaped React text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="text-body-medium text-notch-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} dir="ltr" className="rounded bg-notch-raised-2 px-1 font-mono text-caption-1-medium text-notch-accent">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (!url.username && !url.password) return <ExternalLink key={i} href={url.href} className="text-notch-accent underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-border-focus-ring">{link[1]}</ExternalLink>;
      } catch { /* An invalid URL stays ordinary text. */ }
    }
    return part;
  });
}

export function MessageText({ text }: { text: string }) {
  return (
    <div dir="auto" className="flex min-w-0 flex-col gap-3 text-body-regular text-notch-ink-2 [overflow-wrap:anywhere]">
      {text.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g).filter(Boolean).flatMap((section, i) => {
        if (section.startsWith("```")) {
          const newline = section.indexOf("\n");
          const language = section.slice(3, newline).trim();
          const code = section.slice(newline + 1).replace(/```$/, "").replace(/\n$/, "");
          return <div key={`code-${i}`} className="min-w-0 overflow-hidden rounded-xl border border-notch-rule bg-notch-raised">
            {language && <p className="border-b border-notch-rule px-3 py-1.5 text-caption-1-medium text-notch-muted">{language}</p>}
            <pre dir="ltr" className="overflow-x-auto p-3 font-mono text-caption-1-medium"><code>{code}</code></pre>
          </div>;
        }
        return section.trim().split(/\n{2,}/).filter(Boolean).map((block, j) => {
          const lines = block.split("\n");
          const list = lines.every((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line));
          if (list) {
            const content = lines.map((line, n) => <li key={n}>{inline(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))}</li>);
            return /^\s*\d/.test(block)
              ? <ol key={`${i}-${j}`} className="flex list-decimal flex-col gap-1.5 ps-5 marker:text-notch-muted">{content}</ol>
              : <ul key={`${i}-${j}`} className="flex list-disc flex-col gap-1.5 ps-5 marker:text-notch-muted">{content}</ul>;
          }
          if (/^#{1,3}\s/.test(block)) return <p key={`${i}-${j}`} className="text-headline-medium text-notch-ink">{inline(block.replace(/^#{1,3}\s+/, ""))}</p>;
          return <p key={`${i}-${j}`} className="whitespace-pre-wrap">{inline(block)}</p>;
        });
      })}
    </div>
  );
}
