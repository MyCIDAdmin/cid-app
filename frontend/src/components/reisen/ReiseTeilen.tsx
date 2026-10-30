/** Teilen-Button im Kopf der Reise (2026-10-30) ; die Zieladresse bestimmt `teilenZiel`. */
import type { ReiseDetail } from "../../types/reisen";
import { apercuTexteDepuisHtml } from "../../utils/html";
import { teilenZiel } from "../../utils/reisenTeilen";
import ShareButton from "../ui/ShareButton";

export default function ReiseTeilen({
  reise,
  variant,
}: {
  reise: ReiseDetail;
  variant?: "default" | "inverse";
}) {
  const ziel = teilenZiel(reise);
  if (!ziel) return null;
  return (
    <ShareButton
      path={ziel.path}
      url={ziel.url}
      titre={reise.titel}
      variant={variant}
      texte={apercuTexteDepuisHtml(reise.beschreibung) || undefined}
    />
  );
}
