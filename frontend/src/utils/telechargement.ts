/** Déclenche le téléchargement d'un blob côté navigateur (même pattern que
 * GestionCommandesTab). */
export function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}
