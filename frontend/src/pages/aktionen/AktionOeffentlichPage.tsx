/**
 * Öffentliche Aktionsseite (ohne Anmeldung) : Ziel der geteilten Links einer Beitragsaktion.
 * Zeigt Titel, Beschreibung, Frist und Fortschritt (Summe und Anzahl, nie Namen). Bezahlen geht
 * erst nach der Anmeldung — der Button führt zum Bezahlvorgang mit vorgewählter Aktion.
 */
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { teilenUrlDerAktion } from "../../api/aktionen";
import AktionStatus from "../../components/aktionen/AktionStatus";
import FormatierterText from "../../components/regionen/FormatierterText";
import ShareButton from "../../components/ui/ShareButton";
import { useAktionOeffentlich } from "../../hooks/useAktionen";
import { useAuthStore } from "../../store/authStore";

export default function AktionOeffentlichPage() {
  const { t, i18n } = useTranslation("cotisations");
  const { id } = useParams<{ id: string }>();
  const aktion = useAktionOeffentlich(id);
  const angemeldet = useAuthStore((s) => s.isAuthenticated);

  const betrag = aktion.data
    ? new Intl.NumberFormat(i18n.language.startsWith("fr") ? "fr-FR" : "de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(Number(aktion.data.betrag))
    : "";

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" className="text-sm font-semibold text-ca">
          Clubistes in Deutschland
        </Link>
        {!angemeldet && (
          <Link to="/login" className="text-sm text-ca underline">
            {t("aktion.oeffentlich.anmelden")}
          </Link>
        )}
      </header>

      {aktion.isLoading && (
        <p className="text-sm text-text-tertiary">{t("aktion.oeffentlich.laden")}</p>
      )}
      {aktion.isError && (
        <p
          className="rounded-cid-lg bg-bg-tertiary p-4 text-sm text-text-secondary"
          data-testid="aktion-nicht-gefunden"
        >
          {t("aktion.oeffentlich.nicht_gefunden")}
        </p>
      )}

      {aktion.data && (
        <article className="space-y-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-text-primary">{aktion.data.titel}</h1>
            <ShareButton
              path={`/aktion/${aktion.data.id}`}
              url={teilenUrlDerAktion(aktion.data.id)}
              titre={aktion.data.titel}
            />
          </div>

          <AktionStatus aktion={aktion.data} />

          {aktion.data.beschreibung && <FormatierterText text={aktion.data.beschreibung} />}

          {aktion.data.abgelaufen ? (
            <p className="rounded-cid bg-bg-tertiary px-3 py-2 text-sm text-text-secondary">
              {t("aktion.oeffentlich.beendet")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/cotisation?aktion=${aktion.data.id}`}
                className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {t("aktion.oeffentlich.beitragen", { betrag })}
              </Link>
              {!angemeldet && (
                <span className="text-xs text-text-tertiary">
                  {t("aktion.oeffentlich.login_hinweis")}
                </span>
              )}
            </div>
          )}
        </article>
      )}
    </main>
  );
}
