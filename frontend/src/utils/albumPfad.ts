import type { Album } from "../types/communaute";

/** Pfad eines Albums: `oeffentlich = true` liefert die Adresse auf der öffentlichen Startseite
 * (`/?onglet=galerie&album=<id>`, funktioniert ohne Anmeldung), sonst die Mitglieder-Route. */
export function albumPfad(album: Pick<Album, "id">, oeffentlich: boolean): string {
  return oeffentlich ? `/?onglet=galerie&album=${album.id}` : `/albums/${album.id}`;
}
