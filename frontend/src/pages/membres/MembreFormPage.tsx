/**
 * Formulaire créer/modifier un membre (mockup #pg-admin-nouveau-membre),
 * partagé entre /membres/nouveau et /membres/:id/modifier — le mode est
 * déduit de la présence d'un :id dans l'URL.
 *
 * /membres/nouveau reste gated RH+ par RequireRole (App.tsx). En édition,
 * un Membre peut désormais accéder à ce formulaire pour sa propre fiche
 * (AHM-51) : les champs administratifs (statut, date d'adhésion) sont
 * masqués pour lui — le backend les ignorerait de toute façon en écriture
 * (MembreSerializer._CHAMPS_ADMINISTRATIFS), mais les cacher évite de
 * laisser croire qu'ils sont modifiables. La validation finale reste dans
 * tous les cas côté serveur.
 */
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useCreateMembre, useMembre, useUpdateMembre } from "../../hooks/useMembres";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { BUNDESLANDER, PAYS_ALLEMAGNE, PAYS_MEMBRE, STATUTS_MEMBRE } from "../../types/membre";
import type { Pays } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

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
  const navigate = useNavigate();
  const modeEdition = Boolean(id);
  const utilisateur = useAuthStore((s) => s.user);
  const gestionComplete = hasRoleAtLeast(utilisateur, ROLE_LEVELS.rh);

  const {
    data: membre,
    isLoading: chargementMembre,
    isError: erreurChargementMembre,
  } = useMembre(id);
  const createMutation = useCreateMembre();
  const updateMutation = useUpdateMembre(id ?? "");

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
      if (modeEdition && id) {
        const misAJour = await updateMutation.mutateAsync(values);
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

  // Fiche introuvable ou inaccessible (ex. un Membre qui tente de modifier
  // la fiche d'un autre — le backend renvoie 404, cf MembreViewSet).
  if (modeEdition && (erreurChargementMembre || !membre)) {
    return <p className="text-status-dangerText">{t("fiche.erreur_chargement")}</p>;
  }

  return (
    <div>
      <Link
        to={modeEdition && id ? `/membres/${id}` : "/membres"}
        className="mb-4 inline-block text-sm text-text-secondary hover:underline"
      >
        ← {t("fiche.retour")}
      </Link>

      <h1 className="mb-4 text-xl font-bold text-text-primary">
        {modeEdition ? t("formulaire.titre_modifier") : t("formulaire.titre_creer")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            to={modeEdition && id ? `/membres/${id}` : "/membres"}
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
