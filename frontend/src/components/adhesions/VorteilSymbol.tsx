/** Symbole der Vorteile (Inline-SVG, ein Pfad je Schlüssel aus `vorteile.ts`). */
import { symbolPfad } from "./vorteile";

export default function VorteilSymbol({
  name,
  className = "h-5 w-5",
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const d = symbolPfad(name);
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
