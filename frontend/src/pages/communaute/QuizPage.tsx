/**
 * Page "Quiz" — liste (mockup #pg-quiz, Release Plan §3.2 "Quiz histoire du CA avec score et
 * classement", troisième lot Phase 4B). Lecture ouverte à tout authentifié ; la création de
 * quiz/questions n'a aucune UI côté membre standard (Bureau Admin+ uniquement côté API, voir
 * QuizPermission/GestionQuizPermission — gérée hors application pour l'instant, comme la
 * gestion des campagnes d'adhésion l'est via l'admin Django avant sa page dédiée). Le détail
 * (jouer, score, classement) vit dans QuizDetailPage.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useQuizListe } from "../../hooks/useCommunaute";

export default function QuizPage() {
  const { t } = useTranslation("communaute");
  const quizQuery = useQuizListe();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("quiz.titre")}</h1>

      {quizQuery.isLoading && <p className="text-sm text-text-tertiary">{t("quiz.chargement")}</p>}
      {quizQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("quiz.erreur_chargement")}</p>
      )}
      {quizQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("quiz.aucun_quiz")}</p>
      )}

      <div className="space-y-2">
        {quizQuery.data?.results.map((quiz) => (
          <Link
            key={quiz.id}
            to={`/quiz/${quiz.id}`}
            className="block rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text-primary">{quiz.titre}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  quiz.est_actif ? "bg-cal text-cad" : "bg-bg-secondary text-text-tertiary"
                }`}
              >
                {t(quiz.est_actif ? "quiz.actif_badge" : "quiz.inactif_badge")}
              </span>
            </div>
            {quiz.description && <p className="text-xs text-text-tertiary">{quiz.description}</p>}
            <div className="mt-1 text-[10px] text-text-tertiary">
              {t("quiz.nombre_questions", { count: quiz.nombre_questions })}
              {quiz.ma_participation?.terminee_le &&
                ` · ${t("quiz.score_final", { score: quiz.ma_participation.score })}`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
