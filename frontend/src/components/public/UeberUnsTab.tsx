/**
 * Onglet "Über uns" de la page d'accueil publique (Phase D, mycid.org/about, demande
 * utilisateur du 2026-09-26 : "Inhalt nachbauen" — reconstruire le CONTENU comme sa propre page
 * dans my-cid.com, pas seulement un lien externe). Composant entièrement statique (aucun appel
 * réseau) : historique de CID depuis 2019, historique du Club Africain (trois kacheln
 * chiffrées : 14 titres de champion, 13 coupes, 1 Ligue des Champions CAF), quatre cartes de
 * valeurs (Leidenschaft/Gemeinschaft/Kultur/Exzellenz) et une section contact — texte rédigé en
 * formulation propre à CID, jamais copié mot pour mot de mycid.org (voir plan §D).
 *
 * Hero avec les deux logos (CID + Club Africain) ajouté le 2026-09-28 (retour utilisateur :
 * "die von mir hochgeladene Logos von Club Africain und CID sind in der Seite nicht sichtbar")
 * — la première version de ce composant (2026-09-26) ne reprenait que les sections texte,
 * sans jamais avoir été câblée aux fichiers logo malgré leur envoi par l'utilisateur ce jour-là.
 * Fichiers recadrés/redimensionnés depuis les originaux transmis dans le chat (voir
 * public/brand/logo-cid-about.png et logo-club-africain.png).
 */
import { useTranslation } from "react-i18next";

const VALEURS = ["leidenschaft", "gemeinschaft", "kultur", "exzellenz"] as const;
const KENNZAHLEN = ["meistertitel", "pokalsiege", "caf"] as const;

export default function UeberUnsTab() {
  const { t } = useTranslation("public");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-6 flex items-center justify-center gap-6 sm:gap-10">
          <img
            src="/brand/logo-cid-about.png"
            alt="Clubistes in Deutschland"
            className="h-24 w-auto sm:h-32"
          />
          <span className="text-2xl text-text-tertiary" aria-hidden="true">
            ×
          </span>
          <img
            src="/brand/logo-club-africain.png"
            alt="Club Africain"
            className="h-24 w-auto sm:h-32"
          />
        </div>
        <h1 className="text-2xl font-bold text-text-primary">{t("apropos.titre")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("apropos.intro")}</p>
      </div>

      {/* Historique CID depuis 2019 */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-bold text-text-primary">{t("apropos.geschichte_titre")}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("apropos.geschichte_text")}</p>
      </section>

      {/* Historique Club Africain + 3 kacheln chiffrées */}
      <section className="mb-10">
        <h2 className="mb-2 text-lg font-bold text-text-primary">{t("apropos.club_titre")}</h2>
        <p className="mb-4 text-sm leading-relaxed text-text-secondary">{t("apropos.club_text")}</p>
        <div className="grid grid-cols-3 gap-3">
          {KENNZAHLEN.map((cle) => (
            <div
              key={cle}
              className="rounded-cid-lg bg-bg-primary p-4 text-center shadow-sm"
            >
              <div className="text-2xl font-extrabold text-ca">
                {t(`apropos.kennzahl_${cle}_valeur`)}
              </div>
              <div className="mt-1 text-xs text-text-tertiary">
                {t(`apropos.kennzahl_${cle}_label`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 cartes de valeurs */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-text-primary">{t("apropos.werte_titre")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {VALEURS.map((cle) => (
            <div key={cle} className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <div className="mb-1 text-sm font-bold text-ca">
                {t(`apropos.wert_${cle}_titre`)}
              </div>
              <p className="text-xs leading-relaxed text-text-tertiary">
                {t(`apropos.wert_${cle}_text`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-cid-lg bg-bg-primary p-5 text-center shadow-sm">
        <h2 className="mb-2 text-base font-bold text-text-primary">{t("apropos.kontakt_titre")}</h2>
        <p className="text-sm text-text-secondary">{t("apropos.kontakt_text")}</p>
      </section>
    </div>
  );
}
