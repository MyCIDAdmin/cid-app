/** Öffentliche Vorschau einer Reise (ohne Anmeldung) : nie Namen, nur Anzahl der Interessierten. */
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { teilenUrlDerReise } from "../../api/reisen";
import FormatierterText from "../../components/regionen/FormatierterText";
import ShareButton from "../../components/ui/ShareButton";
import { useReiseOeffentlich } from "../../hooks/useReisen";
import { useAuthStore } from "../../store/authStore";
import { apercuTexteDepuisHtml } from "../../utils/html";
import { zeitraum } from "../../utils/reisen";

export default function ReiseOeffentlichPage() {
  const { t, i18n } = useTranslation("reisen");
  const { id } = useParams<{ id: string }>();
  const q = useReiseOeffentlich(id);
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const r = q.data;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" className="text-sm font-semibold text-ca">
          Clubistes in Deutschland
        </Link>
        {!angemeldet && (
          <Link to="/login" className="text-sm text-ca underline">
            {t("oeffentlich.anmelden")}
          </Link>
        )}
      </header>
      {q.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {q.isError && (
        <p
          className="rounded-cid-lg bg-bg-tertiary p-4 text-sm"
          data-testid="reise-oeffentlich-nicht-gefunden"
        >
          {t("oeffentlich.nicht_gefunden")}
        </p>
      )}
      {r && (
        <article className="space-y-3 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold">{r.titel}</h1>
            <ShareButton
              path={`/reise/${r.id}`}
              url={teilenUrlDerReise(r.id)}
              titre={r.titel}
              texte={apercuTexteDepuisHtml(r.beschreibung) || undefined}
            />
          </div>
          <p className="text-sm text-text-secondary">
            {[r.ziel_ort, r.land].filter(Boolean).join(", ")}
            {r.start ? ` · ${zeitraum(r.start, r.ende, i18n.language)}` : ""}
          </p>
          {r.beschreibung && <FormatierterText text={r.beschreibung} />}
          <p className="text-sm" data-testid="interessiert-zahl">
            {t("oeffentlich.interessiert", { count: r.interessiert })}
          </p>
          <Link
            to={`/reisen/${r.id}`}
            className="inline-block rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {angemeldet ? t("oeffentlich.zur_reise") : t("oeffentlich.anmelden_mitmachen")}
          </Link>
          <p className="text-[11px] text-text-tertiary">{t("haftung")}</p>
        </article>
      )}
    </main>
  );
}
