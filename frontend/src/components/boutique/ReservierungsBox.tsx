/**
 * Reservierungs-Hinweis und -Formular eines Produkts (Release 4, 2026-10-12).
 *
 * Zeigt Frist, Restmenge, Limit pro Mitglied und was das Mitglied schon hat. Bei Modus
 * "nur_reservieren" folgt das Formular (Variante, Menge, „Reservieren"); bei "reservieren_und_bezahlen"
 * bleibt der normale Warenkorb-Button der Karte zuständig (Frist/Limits prüft der Server bei der
 * Bestellung). Alle Zahlen kommen fertig vom Server (ProduitSerializer), nichts wird hier gerechnet.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useErstelleReservierung } from "../../hooks/useBoutique";
import { useAuthStore } from "../../store/authStore";
import type { Produit } from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { reservierungGeschlossen } from "../../utils/reservierung";

export default function ReservierungsBox({ produit }: { produit: Produit }) {
  const { t } = useTranslation("boutique");
  const navigate = useNavigate();
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const erstellen = useErstelleReservierung();
  const [menge, setMenge] = useState(1);
  const [variante, setVariante] = useState(produit.variantes[0]?.id ?? "");
  const [erfolg, setErfolg] = useState(false);

  if (produit.reservierung_modus === "aus") return null;

  const nurReservieren = produit.reservierung_modus === "nur_reservieren";
  const geschlossen = reservierungGeschlossen(produit);
  const frist = produit.reservierung_frist
    ? new Date(produit.reservierung_frist).toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

  function reservieren() {
    if (!angemeldet) {
      navigate("/login");
      return;
    }
    setErfolg(false);
    erstellen.mutate(
      {
        produit: produit.id,
        variante: produit.variantes.length > 1 ? variante : (produit.variantes[0]?.id ?? null),
        quantite: menge,
      },
      { onSuccess: () => setErfolg(true) },
    );
  }

  return (
    <div className="mb-2 rounded-cid bg-bg-secondary p-2 text-[11px] text-text-secondary">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {frist && <span>🗓 {t("reservierung.info_frist", { datum: frist })}</span>}
        {produit.reservierung_verfuegbar !== null && (
          <span>
            {t("reservierung.info_verfuegbar", { anzahl: produit.reservierung_verfuegbar })}
          </span>
        )}
        {produit.reservierung_max_pro_mitglied !== null && (
          <span>
            {t("reservierung.info_max_pro_mitglied", {
              anzahl: produit.reservierung_max_pro_mitglied,
            })}
          </span>
        )}
        {produit.reservierung_meine_menge > 0 && (
          <span className="font-medium text-text-primary">
            {t("reservierung.info_meine", { anzahl: produit.reservierung_meine_menge })}
          </span>
        )}
      </div>

      {geschlossen && (
        <p className="mt-1 font-medium text-status-dangerText">
          {produit.reservierung_verfuegbar === 0
            ? t("reservierung.ausgebucht")
            : t("reservierung.geschlossen")}
        </p>
      )}

      {nurReservieren && !geschlossen && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {produit.variantes.length > 1 && (
            <select
              aria-label={t("catalogue.variante_label")}
              value={variante}
              onChange={(e) => setVariante(e.target.value)}
              className="rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
            >
              {produit.variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.taille, v.couleur].filter(Boolean).join(" / ") || "—"}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            min={1}
            value={menge}
            aria-label={t("reservierung.menge")}
            onChange={(e) => setMenge(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs"
          />
          <button
            type="button"
            onClick={reservieren}
            disabled={erstellen.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("reservierung.reservieren")}
          </button>
        </div>
      )}
      {erfolg && <p className="mt-1 text-status-successText">{t("reservierung.erfolg")}</p>}
      {erstellen.isError && (
        <p className="mt-1 text-status-dangerText">
          {extractApiErrorMessage(erstellen.error, t("reservierung.fehler"))}
        </p>
      )}
    </div>
  );
}
