/**
 * Ein Menüpunkt, zwei Reiter (Welle 2e): „Abstimmungen“ (/votes) und „Wahlen“ (/wahlen) teilen
 * sich den Seitenleisten-Eintrag „Abstimmungen & Wahlen“. Diese Leiste sitzt oben auf beiden
 * Listenseiten; die Detailseite einer Wahl hat ihre eigenen Reiter.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type AbstimmungenReiterId = "abstimmungen" | "wahlen";

interface Props {
  aktiv: AbstimmungenReiterId;
}

const REITER: { id: AbstimmungenReiterId; to: string }[] = [
  { id: "abstimmungen", to: "/votes" },
  { id: "wahlen", to: "/wahlen" },
];

export default function AbstimmungenReiter({ aktiv }: Props) {
  const { t } = useTranslation("common");
  return (
    <nav
      aria-label={t("abstimmungen_reiter.label")}
      className="mb-4 flex gap-1 border-b border-text-tertiary/20"
    >
      {REITER.map((reiter) => {
        const ausgewaehlt = reiter.id === aktiv;
        return (
          <Link
            key={reiter.id}
            to={reiter.to}
            aria-current={ausgewaehlt ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              ausgewaehlt
                ? "border-ca font-semibold text-ca"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`abstimmungen_reiter.${reiter.id}`)}
          </Link>
        );
      })}
    </nav>
  );
}
