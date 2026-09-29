/**
 * Utilitaires pour le contenu HTML produit par RichTextEditor (TipTap) — ajouté le 2026-09-29
 * (retour utilisateur, module "Neuigkeiten" — remplacement de l'éditeur texte brut par un
 * éditeur type Word, voir FilPage.tsx). Le contenu stocké (Publication.contenu) devient du
 * HTML ; certains affichages compacts (aperçu du tableau de bord, partage externe) ont besoin
 * d'un texte brut plutôt que du rendu HTML complet (que ProjetCard/EvenementCarte affichent
 * directement via dangerouslySetInnerHTML, sans ce problème car ce ne sont pas des aperçus
 * tronqués en ligne).
 */

/**
 * Extrait le texte brut d'une chaîne HTML (balises retirées, entités décodées) via le DOM —
 * suffisant et sûr ici : le résultat n'est jamais réinjecté comme HTML (seulement affiché
 * comme texte ou passé à `navigator.share`/un lien `mailto:`, voir ShareButton).
 */
export function texteBrutDepuisHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Comme `texteBrutDepuisHtml`, tronqué à `longueur` caractères (+ "…" si coupé). */
export function apercuTexteDepuisHtml(html: string, longueur = 120): string {
  const texte = texteBrutDepuisHtml(html);
  return texte.length > longueur ? `${texte.slice(0, longueur).trimEnd()}…` : texte;
}
