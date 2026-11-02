/** Erklär-Ebene der Finanzseiten: bindet die gemeinsamen Bausteine (`components/ui/Erklaerung`)
 * an den Namensraum `finances`. Alle Texte stehen in `finances.json` unter `glossar`. */
import {
  EinfachSchalter as GemeinsamerSchalter,
  Fachwort as GemeinsamesFachwort,
  HilfeHinweis as GemeinsamerHinweis,
} from "../ui/Erklaerung";

export type Begriff =
  | "vier"
  | "abschluss"
  | "probelauf"
  | "ergebnis"
  | "budget"
  | "beleg"
  | "pruefung"
  | "entlastung"
  | "kosten";

export function EinfachSchalter() {
  return <GemeinsamerSchalter ns="finances" />;
}

export function HilfeHinweis({ children }: { children: React.ReactNode }) {
  return <GemeinsamerHinweis ns="finances">{children}</GemeinsamerHinweis>;
}

export function Fachwort({ begriff }: { begriff: Begriff }) {
  return <GemeinsamesFachwort ns="finances" begriff={begriff} />;
}
