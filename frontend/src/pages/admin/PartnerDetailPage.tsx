/** Business Partner — Detail: Stammdaten, Logo, Ansprechpersonen, Dokumente,
 * Verknüpfungen (Projekte/Veranstaltungen/Produkte), Bewertungen und Archivieren/Reaktivieren. */
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import BewertungenPanel from "../../components/partner/BewertungenPanel";
import DokumentePanel from "../../components/partner/DokumentePanel";
import KontaktePanel from "../../components/partner/KontaktePanel";
import PartnerForm from "../../components/partner/PartnerForm";
import PartnerLogoPanel from "../../components/partner/PartnerLogoPanel";
import { Sterne } from "../../components/partner/Sterne";
import VerknuepfungenPanel from "../../components/partner/VerknuepfungenPanel";
import {
  useAendernPartner,
  usePartner,
  usePartnerKategorien,
  useSetzeArchiv,
} from "../../hooks/usePartner";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function PartnerDetailPage() {
  const { t } = useTranslation("partner");
  const { id } = useParams<{ id: string }>();
  const schreibbar = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.bureau_admin,
  );
  const { data: partner, isLoading, isError } = usePartner(id);
  const kategorien = usePartnerKategorien();
  const aendern = useAendernPartner(id ?? "");
  const archiv = useSetzeArchiv(id ?? "");

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("laedt")}</p>;
  if (isError || !partner) {
    return <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>;
  }
  const archiviert = partner.statut === "archiviert";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/partner" className="text-sm text-ca hover:underline">
          ← {t("zurueck")}
        </Link>
        <h1 className="text-xl font-bold text-text-primary">{partner.nom}</h1>
        {archiviert && (
          <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-tertiary">
            {t("status_archiviert")}
          </span>
        )}
        <Sterne wert={partner.bewertung_schnitt} />
        {schreibbar && (
          <button
            type="button"
            disabled={archiv.isPending}
            onClick={() => archiv.mutate(!archiviert)}
            className="ml-auto rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {archiviert ? t("reaktivieren") : t("archivieren")}
          </button>
        )}
      </div>
      {archiv.isError && (
        <p className="text-xs text-status-dangerText">
          {extractApiErrorMessage(archiv.error, t("fehler_aktion"))}
        </p>
      )}
      {!schreibbar && (
        <p className="rounded-cid-lg bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
          {t("nur_lesen")}
        </p>
      )}

      <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("stammdaten")}</h2>
        <PartnerForm
          // Formular neu aufbauen, wenn der Server neue Werte liefert (z. B. nach dem Speichern)
          key={partner.updated_at}
          partner={partner}
          kategorien={kategorien.data ?? []}
          readOnly={!schreibbar}
          pending={aendern.isPending}
          fehler={
            aendern.isError ? extractApiErrorMessage(aendern.error, t("fehler_aktion")) : null
          }
          onSubmit={(daten) => aendern.mutate(daten)}
        />
      </section>

      <PartnerLogoPanel
        partnerId={partner.id}
        nom={partner.nom}
        logoUrl={partner.logo_url}
        schreibbar={schreibbar}
      />
      <KontaktePanel partnerId={partner.id} kontakte={partner.kontakte} schreibbar={schreibbar} />
      <DokumentePanel
        partnerId={partner.id}
        dokumente={partner.dokumente}
        schreibbar={schreibbar}
      />
      <VerknuepfungenPanel
        partnerId={partner.id}
        verknuepfungen={partner.verknuepfungen}
        schreibbar={schreibbar}
      />
      <BewertungenPanel
        partnerId={partner.id}
        verknuepfungen={partner.verknuepfungen}
        schreibbar={schreibbar}
      />
    </div>
  );
}
