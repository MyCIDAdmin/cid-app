/**
 * Öffentliche Seite „Hilfe gesucht“ (/hilfe-oeffentlich, auch ohne Anmeldung) : Kopf plus der
 * gemeinsame Inhalt. Angemeldet liegt „Hilfe gesucht“ als Tab auf der Projektseite (/projets).
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import HilfeGesuchtInhalt from "../../components/hilfe/HilfeGesuchtInhalt";
import { useAuthStore } from "../../store/authStore";

export default function HilfeGesuchtPage({ oeffentlich = false }: { oeffentlich?: boolean }) {
  const { t } = useTranslation("projets");
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-testid="hilfe-gesucht-seite-kopf">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-text-primary">{t("hilfe.seite_titel")}</h1>
        <p className="text-sm text-text-secondary">{t("hilfe.seite_einleitung")}</p>
        {oeffentlich && !angemeldet && (
          <p className="text-sm text-text-secondary">
            <Link to="/login" className="font-medium text-ca underline">
              {t("hilfe.oeffentlich_login")}
            </Link>
          </p>
        )}
      </header>
      <HilfeGesuchtInhalt oeffentlich={oeffentlich} />
    </div>
  );
}
