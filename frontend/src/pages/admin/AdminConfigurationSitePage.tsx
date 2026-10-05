/**
 * Vidéo de fond du hero de la page d'accueil publique (demande utilisateur du 2026-09-27,
 * Phase 5 "Startseite Hero-Video" : "ein video im hero bereich"). Réservée au Bureau Admin+ via
 * `minRoleLevel` (RequireRole, App.tsx), volontairement hors matrice apps.rbac — voir docstring
 * de ConfigurationSitePublicPermission côté backend et le commentaire sur ce nav item dans
 * Sidebar.tsx.
 *
 * Même structure que ParametresNotificationPage.tsx (GET/PATCH d'un singleton), mais avec un
 * upload de fichier (voir GalerieProduitManager.tsx pour le même motif input file caché +
 * bouton) plutôt que des interrupteurs.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useArrierePlansModules,
  useConfigurationSitePublic,
  useEnregistrerArrierePlanModule,
  useModifierConfigurationSitePublic,
  useModifierKachelHero,
  useSupprimerArrierePlanModule,
} from "../../hooks/useCommunaute";
import {
  MODULES_AVEC_ARRIERE_PLAN,
  type ConfigurationSitePublic,
  type LargeurKachel,
} from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function AdminConfigurationSitePage() {
  const { t } = useTranslation("public");
  const { data, isLoading, isError } = useConfigurationSitePublic();
  const modifierMutation = useModifierConfigurationSitePublic();
  const inputFichier = useRef<HTMLInputElement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function handleFichierChoisi(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    modifierMutation.mutate(fichier, {
      onError: (err) => setErreur(extractApiErrorMessage(err, t("admin_hero_video.erreur"))),
    });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("admin_hero_video.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("admin_hero_video.description")}</p>

      {isLoading && (
        <p className="text-sm text-text-tertiary">{t("admin_hero_video.chargement")}</p>
      )}
      {isError && (
        <p className="text-sm text-status-dangerText">{t("admin_hero_video.erreur_chargement")}</p>
      )}
      {erreur && <p className="mb-3 text-sm text-status-dangerText">{erreur}</p>}

      {data && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          {data.video_hero ? (
            <video
              key={data.video_hero}
              src={data.video_hero}
              controls
              muted
              className="mb-4 max-h-64 w-full rounded-cid bg-black object-contain"
            />
          ) : (
            <p className="mb-4 text-sm text-text-tertiary">{t("admin_hero_video.aucune_video")}</p>
          )}

          <input
            type="file"
            accept="video/mp4"
            ref={inputFichier}
            onChange={handleFichierChoisi}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputFichier.current?.click()}
            disabled={modifierMutation.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {modifierMutation.isPending
              ? t("admin_hero_video.televersement_en_cours")
              : t("admin_hero_video.televerser")}
          </button>
        </div>
      )}

      {data && <KachelnHeroSection config={data} />}
      <ArrierePlansModulesSection />
    </div>
  );
}

/**
 * Images de fond par module (demande utilisateur du 2026-09-29 : "Im Modul 'Hero Video' es
 * soll möglich sein Hintergrund Bilder pro Modul (außer in der Kategorie Verwaltung)
 * hochzuladen. Die Hochladene Bilder sollen skaliert als Hintergrund für die Seite des
 * Moduls dargestellt werden") — une carte par module de `MODULES_AVEC_ARRIERE_PLAN` (7,
 * liste fixe partagée avec le backend, voir docstring communaute/models.py), toujours
 * affichées TOUTES les 7 (même sans image existante) pour que l'Admin sache d'emblée quels
 * modules restent à configurer, plutôt qu'une liste qui ne grandit qu'au fil des uploads.
 * Rendu effectif sur la page du module via ModuleBackground.tsx (voir AppLayout.tsx).
 */
function ArrierePlansModulesSection() {
  const { t } = useTranslation("public");
  const { data: arrierePlans, isLoading, isError } = useArrierePlansModules();

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-lg font-bold text-text-primary">
        {t("admin_arriere_plans_modules.titre")}
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        {t("admin_arriere_plans_modules.description")}
      </p>

      {isLoading && (
        <p className="text-sm text-text-tertiary">{t("admin_arriere_plans_modules.chargement")}</p>
      )}
      {isError && (
        <p className="text-sm text-status-dangerText">
          {t("admin_arriere_plans_modules.erreur_chargement")}
        </p>
      )}

      {arrierePlans && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES_AVEC_ARRIERE_PLAN.map((module) => (
            <ArrierePlanModuleCard
              key={module}
              module={module}
              arrierePlan={arrierePlans.find((item) => item.module === module) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArrierePlanModuleCard({
  module,
  arrierePlan,
}: {
  module: string;
  arrierePlan: { id: number; image: string } | null;
}) {
  const { t } = useTranslation("public");
  const enregistrerMutation = useEnregistrerArrierePlanModule();
  const supprimerMutation = useSupprimerArrierePlanModule();
  const inputFichier = useRef<HTMLInputElement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function handleFichierChoisi(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    enregistrerMutation.mutate(
      { module, image: fichier },
      {
        onError: (err) =>
          setErreur(extractApiErrorMessage(err, t("admin_arriere_plans_modules.erreur"))),
      },
    );
  }

  function handleSupprimer() {
    if (!arrierePlan) return;
    setErreur(null);
    supprimerMutation.mutate(arrierePlan.id, {
      onError: (err) =>
        setErreur(extractApiErrorMessage(err, t("admin_arriere_plans_modules.erreur_suppression"))),
    });
  }

  const enCours = enregistrerMutation.isPending || supprimerMutation.isPending;

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-text-primary">
        {t(`admin_arriere_plans_modules.modules.${module}`)}
      </h3>

      {arrierePlan ? (
        <img
          key={arrierePlan.image}
          src={arrierePlan.image}
          alt=""
          className="mb-3 h-32 w-full rounded-cid object-cover"
        />
      ) : (
        <p className="mb-3 text-xs text-text-tertiary">
          {t("admin_arriere_plans_modules.aucune_image")}
        </p>
      )}

      {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}

      <input
        type="file"
        accept="image/*"
        ref={inputFichier}
        onChange={handleFichierChoisi}
        className="hidden"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputFichier.current?.click()}
          disabled={enCours}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {enregistrerMutation.isPending
            ? t("admin_arriere_plans_modules.televersement_en_cours")
            : arrierePlan
              ? t("admin_arriere_plans_modules.remplacer")
              : t("admin_arriere_plans_modules.televerser")}
        </button>
        {arrierePlan && (
          <button
            type="button"
            onClick={handleSupprimer}
            disabled={enCours}
            className="rounded-cid border border-status-dangerText/30 px-3 py-1.5 text-xs font-medium text-status-dangerText hover:bg-status-dangerBg disabled:opacity-50"
          >
            {supprimerMutation.isPending
              ? t("admin_arriere_plans_modules.suppression_en_cours")
              : t("admin_arriere_plans_modules.supprimer")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Gestion des 2 Kacheln sous le hero (demande utilisateur du 2026-10-06, point 11). */
function KachelnHeroSection({ config }: { config: ConfigurationSitePublic }) {
  const { t } = useTranslation("public");
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-base font-bold text-text-primary">{t("admin_kacheln.titre")}</h2>
      <p className="mb-3 text-sm text-text-secondary">{t("admin_kacheln.description")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <KachelHeroCard index={1} config={config} />
        <KachelHeroCard index={2} config={config} />
      </div>
    </section>
  );
}

function KachelHeroCard({ index, config }: { index: 1 | 2; config: ConfigurationSitePublic }) {
  const { t } = useTranslation("public");
  const modifier = useModifierKachelHero();
  const [titre, setTitre] = useState(config[`kachel${index}_titre`]);
  const [texte, setTexte] = useState(config[`kachel${index}_texte`]);
  const [lien, setLien] = useState(config[`kachel${index}_lien`]);
  const [largeur, setLargeur] = useState(config[`kachel${index}_largeur`]);
  const [active, setActive] = useState(config[`kachel${index}_active`]);
  const [media, setMedia] = useState<File | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const mediaActuel = config[`kachel${index}_media`];

  function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(false);
    modifier.mutate(
      { index, valeurs: { active, titre, texte, lien, largeur, media } },
      {
        onSuccess: () => {
          setMedia(undefined);
          setOk(true);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("admin_kacheln.erreur"))),
      },
    );
  }

  const champ = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
  return (
    <form onSubmit={enregistrer} className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary">
          {t("admin_kacheln.kachel", { index })}
        </h3>
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("admin_kacheln.active")}
        </label>
      </div>
      {mediaActuel && (
        <img src={mediaActuel} alt="" className="max-h-32 w-full rounded-cid object-contain" />
      )}
      <label className="block text-xs text-text-secondary">
        {t("admin_kacheln.media")}
        <input
          type="file"
          accept="image/gif,image/png,image/jpeg,image/webp"
          onChange={(e) => setMedia(e.target.files?.[0])}
          className="mt-1 block w-full text-xs"
        />
      </label>
      <label className="block text-xs text-text-secondary">
        {t("admin_kacheln.titre_champ")}
        <input value={titre} onChange={(e) => setTitre(e.target.value)} className={champ} />
      </label>
      <label className="block text-xs text-text-secondary">
        {t("admin_kacheln.texte")}
        <input value={texte} onChange={(e) => setTexte(e.target.value)} className={champ} />
      </label>
      <label className="block text-xs text-text-secondary">
        {t("admin_kacheln.lien")}
        <input
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder="/boutique"
          className={champ}
        />
      </label>
      <label className="block text-xs text-text-secondary">
        {t("admin_kacheln.largeur")}
        <select
          value={largeur}
          onChange={(e) => setLargeur(e.target.value as LargeurKachel)}
          className={champ}
        >
          <option value="demi">{t("admin_kacheln.largeur_demi")}</option>
          <option value="pleine">{t("admin_kacheln.largeur_pleine")}</option>
        </select>
      </label>
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
      {ok && <p className="text-xs text-status-successText">{t("admin_kacheln.enregistre")}</p>}
      <button
        type="submit"
        disabled={modifier.isPending}
        className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:bg-cad disabled:opacity-50"
      >
        {t("admin_kacheln.enregistrer")}
      </button>
    </form>
  );
}
