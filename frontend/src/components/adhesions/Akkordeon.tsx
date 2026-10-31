/**
 * Einklappbarer Bereich auf „Meine Mitgliedschaft“ (Release 2026.11) : ein natives <details>, also
 * ohne eigenen Zustand und per Tastatur bedienbar. Der Inhalt bleibt auch eingeklappt im DOM.
 */
import type { ReactNode } from "react";

export default function Akkordeon({
  titel,
  hinweis,
  offen = false,
  id,
  children,
}: {
  titel: string;
  hinweis?: string;
  offen?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details id={id} open={offen} className="group mt-4 rounded-cid-lg bg-bg-primary shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-cid-lg px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-ca">
        <span className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">
          {titel}
        </span>
        {hinweis && <span className="text-xs text-text-tertiary">{hinweis}</span>}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="ml-auto h-5 w-5 shrink-0 text-text-tertiary transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
