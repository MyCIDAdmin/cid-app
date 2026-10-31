/** Symbole der Vorteile (Inline-SVG, ein Pfad je Schlüssel aus `vorteile.ts`). */
import { istSymbol, type VorteilSymbolName } from "./vorteile";

const PFADE: Record<VorteilSymbolName, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  card: "M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18",
  vote: "M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zM8 12l3 3 5-6",
  bag: "M5 8h14l-1 12H6zM9 8a3 3 0 016 0",
  ticket: "M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4zM14 7v10",
  car: "M5 17v2m14-2v2M3 13l2-6h14l2 6v4H3zM7.5 14h.01M16.5 14h.01",
  gift: "M3 8h18v4H3zM12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5",
  star: "M12 3l2.8 6 6.2.8-4.5 4.4 1.2 6.8-5.7-3.2-5.7 3.2 1.2-6.8L3 9.8 9.2 9z",
  users:
    "M9 5a3 3 0 100 6 3 3 0 000-6zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 6.5a2.3 2.3 0 110 4.6M17 14c2.5 0 4 2 4 5",
  calendar:
    "M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2zM4 10h16M9 3v4M15 3v4",
  heart: "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z",
  camera:
    "M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z",
  chat: "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z",
  trophy: "M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6",
};

export default function VorteilSymbol({
  name,
  className = "h-5 w-5",
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const d = PFADE[istSymbol(name) ? name : "check"];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
