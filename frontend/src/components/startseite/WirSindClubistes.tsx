/**
 * „Wir sind Clubistes“ der Startseite nach der Anmeldung (Vorschlag B, 2026-11) : Zahlen zum
 * Verein (nur Summen, keine Personenbezüge) und „Neu dabei“ mit Vorname, Initial und Sektor.
 * „Neu dabei“ zeigt nur Mitglieder, die sich in ihren Einstellungen selbst dafür freigegeben
 * haben ; der Server liefert die Liste nur an aktive Mitglieder und das Büro (Fan-Konten sehen
 * nur die Zahlen).
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useGemeinschaft } from "../../hooks/useStartseite";
import { useAuthStore } from "../../store/authStore";

function Kennzahl({ wert, label }: { wert: string; label: string }) {
  return (
    <div className="rounded-cid-lg bg-bg-secondary px-3 py-2">
      <div className="font-display text-2xl font-bold tabular-nums text-ca">{wert}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
    </div>
  );
}

export default function WirSindClubistes() {
  const { t, i18n } = useTranslation("public");
  const { data } = useGemeinschaft();
  const istFan = useAuthStore((s) => s.user?.ist_fan === true);
  if (!data) return null;

  const zahl = (n: number) => n.toLocaleString(i18n.language);
  const monatsname = new Date(`${data.monat}-01T12:00:00`).toLocaleDateString(i18n.language, {
    month: "long",
  });

  return (
    <section
      aria-labelledby="clubistes-titel"
      className="h-full rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6"
    >
      <h2 id="clubistes-titel" className="font-display text-lg font-bold text-text-primary">
        {t("startseite.zahlen.titel")}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Kennzahl wert={zahl(data.mitglieder)} label={t("startseite.zahlen.mitglieder")} />
        <Kennzahl wert={zahl(data.bundeslaender)} label={t("startseite.zahlen.bundeslaender")} />
        <Kennzahl wert={zahl(data.staedte)} label={t("startseite.zahlen.staedte")} />
        <Kennzahl
          wert={`+${zahl(data.neu_im_monat)}`}
          label={t("startseite.zahlen.im_monat", { monat: monatsname })}
        />
      </div>

      {!istFan && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
            {t("startseite.zahlen.neu_dabei")}
          </h3>
          {data.neu_dabei.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.neu_dabei.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-full bg-bg-secondary py-1 pl-1 pr-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full bg-ca/15 text-xs font-bold text-ca"
                  >
                    {e.vorname.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold leading-tight text-text-primary">
                    {e.vorname} {e.initial}
                    {e.sektor && (
                      <span className="block text-[11px] font-normal text-text-tertiary">
                        {e.sektor}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-tertiary">{t("startseite.zahlen.niemand")}</p>
          )}
          <p className="mt-2 text-xs text-text-tertiary">
            {t("startseite.zahlen.freiwillig")}{" "}
            <Link to="/mon-profil?onglet=einstellungen" className="text-ca hover:underline">
              {t("startseite.zahlen.einstellung")}
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
