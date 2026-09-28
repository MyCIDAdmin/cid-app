/**
 * Formulaire créer/modifier un membre (mockup #pg-admin-nouveau-membre),
 * partagé entre /membres/nouveau, /membres/:id/modifier et /mon-profil —
 * le mode est déduit de la présence d'un :id dans l'URL, ou du chemin
 * /mon-profil (voir modeProfil ci-dessous).
 *
 * /membres/nouveau reste gated RH+ par RequireRole (App.tsx). En édition,
 * un Membre peut désormais accéder à ce formulaire pour sa propre fiche
 * (AHM-51) : les champs administratifs (statut, date d'adhésion) sont
 * masqués pour lui — le backend les ignorerait de toute façon en écriture
 * (MembreSerializer._CHAMPS_ADMINISTRATIFS), mais les cacher évite de
 * laisser croire qu'ils sont modifiables. La validation finale reste dans
 * tous les cas côté serveur.
 *
 * /mon-profil (ajouté le 2026-09-28, bouton "Mein Profil" du menu utilisateur — voir
 * UserMenu.tsx) réutilise ce même formulaire pour l'auto-service, via useMembreMoi/
 * useUpdateMembreMoi plutôt que useMembre/useUpdateMembre (qui ont besoin d'un :id absent de
 * cette route) : la section administrative reste masquée MÊME pour un compte RH+ (on édite ici
 * "son" profil, jamais une fiche de gestion), et ce mode ajoute le téléversement de photo de
 * profil (retour utilisateur : "zu dem Profile darf der User sein Bild hochladen").
 */
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import {
  useCreateMembre,
  useMembre,
  useMembreMoi,
  useTeleverserPhotoMembreMoi,
  useUpdateMembre,
  useUpdateMembreMoi,
} from "../../hooks/useMembres";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { BUNDESLANDER, PAYS_ALLEMAGNE, PAYS_MEMBRE, STATUTS_MEMBRE } from "../../types/membre";
import type { Pays } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

function initialesProfil(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

const PAYS_VALEURS = PAYS_MEMBRE.map((p) => p.value) as [Pays, ...Pays[]];

const membreSchema = z
  .object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    date_naissance: z.string().min(1),
    sexe: z.enum(["homme", "femme", "non_renseigne"]),
    email: z.string().min(1).email(),
    telephone: z.string().min(1),
    cin: z.string().optional(),
    passeport: z.string().optional(),
    pays: z.enum(PAYS_VALEURS),
    adresse_de: z.string().optional(),
    code_postal_de: z.string().optional(),
    ville_de: z.string().optional(),
    land_de: z.string().optional(),
    ville_origine_tn: z.string().optional(),
    gouvernorat_tn: z.string().optional(),
    statut: z.enum(["actif", "en_attente", "inactif"]),
    date_adhesion: z.string().min(1),
  })
  // adresse_de/ville_de ne sont requis que pour un membre résidant en Allemagne
  // (voir MembreSerializer.validate côté backend, qui applique la même règle).
  .superRefine((values, ctx) => {
    if (values.pays === PAYS_ALLEMAGNE) {
      if (!values.adresse_de?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adresse_de"], message: "requis" });
      }
      if (!values.ville_de?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ville_de"], message: "requis" });
      }
    }
    // Même règle "CIN ou passeport" que RegisterPage.tsx (retour utilisateur du 2026-09-28,
    // point 5) — cette fiche partage le même modèle Membre, la même contrainte s'applique donc
    // ici aussi pour la cohérence (et est de toute façon vérifiée côté serveur, voir
    // MembreSerializer.validate).
    if (!values.cin?.trim() && !values.passeport?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cin"],
        message: "cin_ou_passeport_requis",
      });
    }
  });

type FormValues = z.infer<typeof membreSchema>;

const VALEURS_PAR_DEFAUT: FormValues = {
  prenom: "",
  nom: "",
  date_naissance: "",
  sexe: "non_renseigne",
  email: "",
  telephone: "",
  cin: "",
  passeport: "",
  pays: PAYS_ALLEMAGNE,
  adresse_de: "",
  code_postal_de: "",
  ville_de: "",
  land_de: "",
  ville_origine_tn: "",
  gouvernorat_tn: "",
  statut: "en_attente",
  date_adhesion: new Date().toISOString().slice(0, 10),
};

function Champ({
  label,
  htmlFor,
  requis,
  erreur,
  children,
}: {
  label: string;
  htmlFor: string;
  requis?: boolean;
  erreur?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
        {requis && <span className="text-status-dangerText"> *</span>}
      </label>
      {children}
      {erreur && <p className="mt-1 text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}

const champClasses =
  "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm focus:border-ca focus:outline-none";

export default function MembreFormPage() {
  const { t } = useTranslation("membres");
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  // /mon-profil (sans :id) réutilise ce formulaire en mode auto-service — voir docstring de
  // tête. Les deux routes ne rendent jamais le même montage de ce composant (chemins distincts
  // dans App.tsx), donc modeProfil ne change jamais au cours de la vie d'une instance : les deux
  // paires de hooks ci-dessous (useMembre/useMembreMoi, useUpdateMembre/useUpdateMembreMoi)
  // restent malgré tout toutes les deux appelées sans condition (règles des Hooks React), seule
  // leur activation/utilisation varie selon modeProfil.
  const modeProfil = location.pathname === "/mon-profil";
  const modeEdition = Boolean(id) || modeProfil;
  const utilisateur = useAuthStore((s) => s.user);
  // En mode profil, la section administrative reste masquée même pour un compte RH+ : on édite
  // ici "son" profil personnel, jamais une fiche de gestion (voir docstring de tête).
  const gestionComplete = !modeProfil && hasRoleAtLeast(utilisateur, ROLE_LEVELS.rh);

  const requeteMembreId = useMembre(modeProfil ? undefined : id);
  const requeteMembreMoi = useMembreMoi({ enabled: modeProfil });
  const {
    data: membre,
    isLoading: chargementMembre,
    isError: erreurChargementMembre,
  } = modeProfil ? requeteMembreMoi : requeteMembreId;
  const createMutation = useCreateMembre();
  const updateIdMutation = useUpdateMembre(id ?? "");
  const updateMoiMutation = useUpdateMembreMoi();
  const televerserPhotoMutation = useTeleverserPhotoMembreMoi();

  // Téléversement de la photo de profil (mode profil uniquement) — même principe
  // "aperçu + confirmation/annulation" que AdminEventsPage.tsx (imageEnAttente), en plus simple
  // ici (une seule fiche éditée à la fois, pas de map par id nécessaire).
  const [photoEnAttente, setPhotoEnAttente] = useState<{ fichier: File; previewUrl: string } | null>(
    null,
  );
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [photoErreur, setPhotoErreur] = useState("");
  const inputFichierPhoto = useRef<HTMLInputElement>(null);

  function handlePhotoChoisie(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setPhotoErreur("");
    setPhotoEnAttente((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.previewUrl);
      return { fichier, previewUrl: URL.createObjectURL(fichier) };
    });
  }

  function annulerPhotoEnAttente() {
    setPhotoEnAttente((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.previewUrl);
      return null;
    });
  }

  function confirmerPhotoEnAttente() {
    if (!photoEnAttente) return;
    const { fichier, previewUrl } = photoEnAttente;
    setPhotoEnCours(true);
    setPhotoErreur("");
    televerserPhotoMutation.mutate(fichier, {
      onError: (err) => setPhotoErreur(extractApiErrorMessage(err, t("profil.photo_erreur"))),
      onSettled: () => {
        setPhotoEnCours(false);
        URL.revokeObjectURL(previewUrl);
        setPhotoEnAttente(null);
      },
    });
  }

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(membreSchema),
    defaultValues: VALEURS_PAR_DEFAUT,
  });

  const paysSelectionne = useWatch({ control, name: "pays" });
  const resideEnAllemagne = paysSelectionne === PAYS_ALLEMAGNE;

  useEffect(() => {
    if (modeEdition && membre) {
      reset({
        prenom: membre.prenom,
        nom: membre.nom,
        date_naissance: membre.date_naissance,
        sexe: membre.sexe,
        email: membre.email,
        telephone: membre.telephone,
        cin: membre.cin ?? "",
        passeport: membre.passeport ?? "",
        pays: membre.pays,
        adresse_de: membre.adresse_de,
        code_postal_de: membre.code_postal_de,
        ville_de: membre.ville_de,
        land_de: membre.land_de,
        ville_origine_tn: membre.ville_origine_tn,
        gouvernorat_tn: membre.gouvernorat_tn,
        statut: membre.statut,
        date_adhesion: membre.date_adhesion,
      });
    }
  }, [modeEdition, membre, reset]);

  async function onSubmit(values: FormValues) {
    try {
      if (modeProfil) {
        await updateMoiMutation.mutateAsync(values);
        navigate("/dashboard");
      } else if (modeEdition && id) {
        const misAJour = await updateIdMutation.mutateAsync(values);
        navigate(`/membres/${misAJour.id}`);
      } else {
        const cree = await createMutation.mutateAsync(values);
        navigate(`/membres/${cree.id}`);
      }
    } catch (error) {
      setError("root", { message: extractApiErrorMessage(error, t("formulaire.erreur_soumission")) });
    }
  }

  if (modeEdition && chargementMembre) {
    return <p className="text-text-tertiary">{t("liste.chargement")}</p>;
  }

  // Fiche introuvable ou inaccessible (ex. un Membre qui tente de modifier la fiche d'un autre —
  // le backend renvoie 404, cf MembreViewSet) ; en mode profil, un 404 signifie plutôt qu'aucune
  // fiche Membre n'est liée à ce compte (voir MembreViewSet.moi côté backend).
  if (modeEdition && (erreurChargementMembre || !membre)) {
    return (
      <p className="text-status-dangerText">
        {modeProfil ? t("profil.aucune_fiche") : t("fiche.erreur_chargement")}
      </p>
    );
  }

  return (
    <div>
      <Link
        to={modeProfil ? "/dashboard" : modeEdition && id ? `/membres/${id}` : "/membres"}
        className="mb-4 inline-block text-sm text-text-secondary hover:underline"
      >
        ← {modeProfil ? t("profil.retour") : t("fiche.retour")}
      </Link>

      <h1 className="mb-4 text-xl font-bold text-text-primary">
        {modeProfil
          ? t("profil.titre")
          : modeEdition
            ? t("formulaire.titre_modifier")
            : t("formulaire.titre_creer")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {modeProfil && membre && (
          <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              {t("profil.section_photo")}
            </h2>
            <div className="flex items-center gap-4">
              {membre.photo ? (
                <img
                  src={membre.photo}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cal text-lg font-semibold text-ca">
                  {initialesProfil(membre.prenom, membre.nom)}
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  ref={inputFichierPhoto}
                  onChange={handlePhotoChoisie}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputFichierPhoto.current?.click()}
                  disabled={photoEnCours}
                  className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
                >
                  {membre.photo ? t("profil.photo_changer") : t("profil.photo_televerser")}
                </button>
              </div>
            </div>
            {photoEnAttente && (
              <div className="mt-3 flex items-center gap-3 rounded-cid border border-text-tertiary/20 bg-bg-secondary p-2">
                <img
                  src={photoEnAttente.previewUrl}
                  alt={t("profil.photo_apercu_alt") ?? ""}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
                <p className="flex-1 truncate text-xs text-text-secondary">
                  {photoEnAttente.fichier.name}
                </p>
                <button
                  type="button"
                  onClick={annulerPhotoEnAttente}
                  disabled={photoEnCours}
                  className="rounded-cid px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                >
                  {t("profil.photo_annuler")}
                </button>
                <button
                  type="button"
                  onClick={confirmerPhotoEnAttente}
                  disabled={photoEnCours}
                  className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                >
                  {photoEnCours ? t("profil.photo_en_cours") : t("profil.photo_confirmer")}
                </button>
              </div>
            )}
            {photoErreur && <p className="mt-2 text-xs text-status-dangerText">{photoErreur}</p>}
          </section>
        )}

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("fiche.section_personnelles")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ
              label={t("champ.prenom")}
              htmlFor="prenom"
              requis
              erreur={errors.prenom && t("formulaire.champ_requis")}
            >
              <input id="prenom" {...register("prenom")} className={champClasses} />
            </Champ>
            <Champ
              label={t("champ.nom")}
              htmlFor="nom"
              requis
              erreur={errors.nom && t("formulaire.champ_requis")}
            >
              <input id="nom" {...register("nom")} className={champClasses} />
            </Champ>
            <Champ
              label={t("champ.date_naissance")}
              htmlFor="date_naissance"
              requis
              erreur={errors.date_naissance && t("formulaire.champ_requis")}
            >
              <input
                id="date_naissance"
                type="date"
                {...register("date_naissance")}
                className={champClasses}
              />
            </Champ>
            <Champ label={t("champ.sexe")} htmlFor="sexe">
              <select id="sexe" {...register("sexe")} className={champClasses}>
                <option value="non_renseigne">{t("sexe.non_renseigne")}</option>
                <option value="homme">{t("sexe.homme")}</option>
                <option value="femme">{t("sexe.femme")}</option>
              </select>
            </Champ>
            <Champ
              label={t("champ.email")}
              htmlFor="email"
              requis
              erreur={errors.email && t("formulaire.erreur_email")}
            >
              <input id="email" type="email" {...register("email")} className={champClasses} />
            </Champ>
            <Champ
              label={t("champ.telephone")}
              htmlFor="telephone"
              requis
              erreur={errors.telephone && t("formulaire.champ_requis")}
            >
              <input id="telephone" {...register("telephone")} className={champClasses} />
            </Champ>
            <Champ
              label={t("champ.cin")}
              htmlFor="cin"
              erreur={
                errors.cin &&
                (errors.cin.message === "cin_ou_passeport_requis"
                  ? t("formulaire.erreur_cin_ou_passeport")
                  : t("formulaire.champ_requis"))
              }
            >
              <input id="cin" {...register("cin")} className={champClasses} />
            </Champ>
            <Champ label={t("champ.passeport")} htmlFor="passeport">
              <input id="passeport" {...register("passeport")} className={champClasses} />
            </Champ>
          </div>
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("fiche.section_adresse")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ label={t("champ.pays")} htmlFor="pays" requis>
              <select id="pays" {...register("pays")} className={champClasses}>
                {PAYS_MEMBRE.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.labelKey)}
                  </option>
                ))}
              </select>
            </Champ>
            {/* Le reste de la section n'a de sens que pour un membre résidant en Allemagne :
                l'adresse allemande détaillée (rue, ville, Bundesland) n'est pas pertinente
                pour un membre résidant ailleurs, où seul le pays compte (voir MembreSerializer
                côté backend, qui applique la même règle de requis conditionnel). */}
            {resideEnAllemagne && (
              <>
                <Champ
                  label={t("champ.adresse_de")}
                  htmlFor="adresse_de"
                  requis
                  erreur={errors.adresse_de && t("formulaire.champ_requis")}
                >
                  <input id="adresse_de" {...register("adresse_de")} className={champClasses} />
                </Champ>
                <Champ label={t("champ.code_postal_de")} htmlFor="code_postal_de">
                  <input
                    id="code_postal_de"
                    {...register("code_postal_de")}
                    className={champClasses}
                  />
                </Champ>
                <Champ
                  label={t("champ.ville_de")}
                  htmlFor="ville_de"
                  requis
                  erreur={errors.ville_de && t("formulaire.champ_requis")}
                >
                  <input id="ville_de" {...register("ville_de")} className={champClasses} />
                </Champ>
                <Champ label={t("champ.land_de")} htmlFor="land_de">
                  <select id="land_de" {...register("land_de")} className={champClasses}>
                    <option value="">—</option>
                    {BUNDESLANDER.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Champ>
              </>
            )}
            <Champ label={t("champ.ville_origine_tn")} htmlFor="ville_origine_tn">
              <input id="ville_origine_tn" {...register("ville_origine_tn")} className={champClasses} />
            </Champ>
            <Champ label={t("champ.gouvernorat_tn")} htmlFor="gouvernorat_tn">
              <input id="gouvernorat_tn" {...register("gouvernorat_tn")} className={champClasses} />
            </Champ>
          </div>
        </section>

        {/* Statut et date d'adhésion sont des champs administratifs (AHM-51) :
            le backend les ignore en écriture pour un Membre (voir
            MembreSerializer._CHAMPS_ADMINISTRATIFS) — on ne les affiche donc
            que pour RH+, pour ne pas laisser croire qu'ils sont modifiables.
            Leurs valeurs restent dans le formulaire (chargées par reset() au
            montage) et sont réenvoyées telles quelles à la soumission. */}
        {gestionComplete && (
          <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              {t("fiche.section_associatives")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Champ label={t("champ.statut")} htmlFor="statut" requis>
                <select id="statut" {...register("statut")} className={champClasses}>
                  {STATUTS_MEMBRE.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ
                label={t("champ.date_adhesion")}
                htmlFor="date_adhesion"
                requis
                erreur={errors.date_adhesion && t("formulaire.champ_requis")}
              >
                <input
                  id="date_adhesion"
                  type="date"
                  {...register("date_adhesion")}
                  className={champClasses}
                />
              </Champ>
            </div>
          </section>
        )}

        {errors.root && <p className="text-sm text-status-dangerText">{errors.root.message}</p>}

        <div className="flex justify-end gap-2">
          <Link
            to={modeProfil ? "/dashboard" : modeEdition && id ? `/membres/${id}` : "/membres"}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("formulaire.annuler")}
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("formulaire.enregistrer")}
          </button>
        </div>
      </form>
    </div>
  );
}
