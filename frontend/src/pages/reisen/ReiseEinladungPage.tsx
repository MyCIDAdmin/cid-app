/** Einladungslink einer Reise : löst das Token ein und führt in den Raum. */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { perLink } from "../../api/reisen";

export default function ReiseEinladungPage() {
  const { t } = useTranslation("reisen");
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    if (!token) return;
    perLink(token)
      .then((r) => navigate(`/reisen/${r.id}`, { replace: true }))
      .catch(() => setFehler(true));
  }, [token, navigate]);

  if (fehler)
    return (
      <div className="space-y-2" data-testid="einladung-ungueltig">
        <p className="text-sm">{t("einladung.ungueltig")}</p>
        <Link to="/reisen" className="text-sm text-ca underline">
          {t("zurueck")}
        </Link>
      </div>
    );
  return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
}
