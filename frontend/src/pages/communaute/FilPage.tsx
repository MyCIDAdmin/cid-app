/**
 * Page "Fil d'actualité" / Neuigkeiten (mockup #pg-fil, Release Plan §3.2 — Phase 4A), umgebaut
 * zum Social-Feed (Neuigkeiten A, 2026-11) :
 *  - einklappbares Beitragsfeld nur für Bureau Admin+ (BeitragComposer),
 *  - Filter-Chips Alle / Wichtig / Fotos (`?filter=` in der URL, bookmarkbar wie `?hashtag=`),
 *  - Hashtag-Filter wie bisher (`?hashtag=`),
 *  - Emoji-Reaktionen statt Herz, Kommentar-Vorschau (siehe PublicationCarte),
 *  - Trennlinie „Neu seit deinem Besuch“ : der Zeitpunkt des letzten Besuchs liegt nur in diesem
 *    Browser (localStorage) – nichts davon geht an den Server.
 */
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import BeitragComposer from "../../components/communaute/BeitragComposer";
import PublicationCarte from "../../components/communaute/PublicationCarte";
import { usePublications } from "../../hooks/useCommunaute";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";

type FilFilter = "alle" | "wichtig" | "fotos";
const FILTER: FilFilter[] = ["alle", "wichtig", "fotos"];

function besuchLesen(schluessel: string): number {
  try {
    return Number(window.localStorage.getItem(schluessel)) || 0;
  } catch {
    return 0;
  }
}

export default function FilPage() {
  const { t } = useTranslation("communaute");
  // Rôle requis pour PUBLIER une Neuigkeit (retour utilisateur du 2026-09-29, point 3.1) — même
  // seuil que la modération de ce module (apps.communaute.permissions.PublicationPermission).
  const user = useAuthStore((s) => s.user);
  const peutPublier = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const [searchParams, setSearchParams] = useSearchParams();
  const hashtagFiltre = searchParams.get("hashtag");
  const roh = searchParams.get("filter");
  const filter: FilFilter = FILTER.includes(roh as FilFilter) ? (roh as FilFilter) : "alle";

  function setzeFilter(neu: FilFilter) {
    const next = new URLSearchParams(searchParams);
    if (neu === "alle") next.delete("filter");
    else next.set("filter", neu);
    next.delete("publication"); // un changement de filtre n'est plus le suivi d'une notification
    setSearchParams(next);
  }

  function filtrerParHashtag(hashtag: string) {
    const next = new URLSearchParams(searchParams);
    next.set("hashtag", hashtag);
    next.delete("publication");
    setSearchParams(next);
  }

  function retirerFiltreHashtag() {
    const next = new URLSearchParams(searchParams);
    next.delete("hashtag");
    setSearchParams(next);
  }

  const publicationsQuery = usePublications({
    hashtag: hashtagFiltre ?? undefined,
    wichtig: filter === "wichtig" ? true : undefined,
    mit_bild: filter === "fotos" ? true : undefined,
  });
  const { refCible } = useDeepLinkCible("publication");

  // „Neu seit deinem Besuch“ : beim Öffnen den letzten Besuch lesen, dann sofort „jetzt“ merken.
  const schluessel = `fil:besuch:${user?.id ?? "anonym"}`;
  const [letzterBesuch] = useState(() => besuchLesen(schluessel));
  useEffect(() => {
    try {
      window.localStorage.setItem(schluessel, String(Date.now()));
    } catch {
      /* Speicher gesperrt : dann gibt es beim nächsten Mal keine Trennlinie. */
    }
  }, [schluessel]);

  const publikationen = publicationsQuery.data?.results ?? [];
  const istNeu = (iso: string) => letzterBesuch > 0 && new Date(iso).getTime() > letzterBesuch;
  const anzahlNeu = publikationen.filter((p) => istNeu(p.created_at)).length;
  const ersteAlte = publikationen.findIndex((p) => !istNeu(p.created_at));

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("fil.titre")}</h1>

      {peutPublier && <BeitragComposer />}

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("fil.filter_label")}>
        {FILTER.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setzeFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === f ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
            }`}
          >
            {t(`fil.filter_${f}`)}
          </button>
        ))}
      </div>

      {hashtagFiltre && (
        <div className="mb-3 flex items-center gap-2 rounded-cid bg-bg-secondary px-3 py-2 text-xs text-text-secondary">
          <span>{t("fil.filtre_hashtag", { hashtag: hashtagFiltre })}</span>
          <button
            type="button"
            onClick={retirerFiltreHashtag}
            className="font-medium text-ca hover:underline"
          >
            {t("fil.retirer_filtre")}
          </button>
        </div>
      )}

      {publicationsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("fil.chargement")}</p>
      )}
      {publicationsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("fil.erreur_chargement")}</p>
      )}
      {publicationsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">
          {hashtagFiltre
            ? t("fil.aucune_publication_hashtag")
            : filter !== "alle"
              ? t("fil.aucune_publication_filtre")
              : t("fil.aucune_publication")}
        </p>
      )}

      <div className="space-y-3">
        {publikationen.map((publication, index) => (
          <Fragment key={publication.id}>
            {index === 0 && anzahlNeu > 0 && (
              <div
                role="separator"
                data-testid="neu-trenner"
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ca"
              >
                <span className="h-px flex-1 bg-ca/30" />
                {t("fil.neu_seit_besuch", { count: anzahlNeu })}
                <span className="h-px flex-1 bg-ca/30" />
              </div>
            )}
            {index === ersteAlte && index > 0 && (
              <div
                role="separator"
                data-testid="frueher-trenner"
                className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary"
              >
                <span className="h-px flex-1 bg-text-tertiary/20" />
                {t("fil.frueher")}
                <span className="h-px flex-1 bg-text-tertiary/20" />
              </div>
            )}
            <PublicationCarte
              publication={publication}
              cardRef={refCible(publication.id)}
              onHashtagClick={filtrerParHashtag}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
