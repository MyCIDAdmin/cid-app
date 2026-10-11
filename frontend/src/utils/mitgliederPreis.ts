/** True, wenn der Mitgliederpreis gesetzt und echt niedriger als der aktuell gezeigte Preis ist
 * (Zahlenvergleich, nicht Zeichenkette). Nur für die Anzeige des Werbehinweises. */
export function mitgliederPreisIstGuenstiger(
  mitgliederPreis: string | number | null | undefined,
  aktuellerPreis: string | number,
): boolean {
  if (mitgliederPreis === null || mitgliederPreis === undefined || mitgliederPreis === "") {
    return false;
  }
  return Number(mitgliederPreis) < Number(aktuellerPreis);
}
