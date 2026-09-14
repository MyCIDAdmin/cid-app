/**
 * Page "Quiz" — détail et déroulé de jeu (mockup #pg-quiz, troisième lot Phase 4B).
 *
 * `est_correct` n'est JAMAIS exposé sur `quiz.questions[].choix` pour un membre standard
 * (voir ChoixQuestionSerializer.to_representation côté backend) — la correction de chaque
 * réponse n'est donc connue qu'au retour de `repondreQuiz` (useRepondreQuiz), jamais déduite
 * côté client. Une question à la fois, dans l'ordre ; la participation se termine
 * automatiquement côté serveur une fois toutes les questions répondues (voir
 * ParticipationQuiz.verifier_completion), ce qui fait naturellement basculer cette page vers
 * l'écran de fin au prochain rafraîchissement de `useQuiz` (invalidation dans
 * useRepondreQuiz).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import {
  useClassementQuiz,
  useDemarrerQuiz,
  useQuiz,
  useRepondreQuiz,
} from "../../hooks/useCommunaute";
import type { ReponseQuiz } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function QuizDetailPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();

  const quizQuery = useQuiz(id);
  const demarrer = useDemarrerQuiz();
  const repondre = useRepondreQuiz();

  const [index, setIndex] = useState(0);
  const [choixSelectionne, setChoixSelectionne] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<ReponseQuiz | null>(null);
  const [erreur, setErreur] = useState("");

  const quiz = quizQuery.data;
  const participation = quiz?.ma_participation ?? null;
  const quizTermine = !!participation?.terminee_le;

  const questions = useMemo(
    () => [...(quiz?.questions ?? [])].sort((a, b) => a.ordre - b.ordre),
    [quiz?.questions],
  );
  const classementQuery = useClassementQuiz(quizTermine ? id : undefined);

  const question = questions[index];

  function soumettreReponse(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !question || !choixSelectionne) return;
    repondre.mutate(
      { quizId: id, question: question.id, choix: choixSelectionne },
      {
        onSuccess: (reponse) => {
          setFeedback(reponse);
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("quiz.erreur_reponse"))),
      },
    );
  }

  function questionSuivante() {
    setFeedback(null);
    setChoixSelectionne(undefined);
    setIndex((i) => i + 1);
  }

  if (quizQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("quiz.chargement")}</p>;
  }
  if (quizQuery.isError || !quiz) {
    return <p className="text-sm text-status-dangerText">{t("quiz.erreur_chargement")}</p>;
  }

  return (
    <div>
      <Link to="/quiz" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("quiz.retour_liste")}
      </Link>

      <h1 className="mb-1 text-lg font-bold text-text-primary">{quiz.titre}</h1>
      {quiz.description && <p className="mb-4 text-sm text-text-tertiary">{quiz.description}</p>}

      {!participation && (
        <div className="rounded-cid-lg bg-bg-primary p-4 text-center shadow-sm">
          <p className="mb-3 text-sm text-text-secondary">
            {t("quiz.nombre_questions", { count: quiz.nombre_questions })}
          </p>
          <button
            type="button"
            onClick={() => id && demarrer.mutate(id)}
            disabled={demarrer.isPending || !quiz.est_actif}
            className="rounded-cid bg-ca px-5 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("quiz.demarrer")}
          </button>
        </div>
      )}

      {participation && !quizTermine && question && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-text-tertiary">
            {t("quiz.question_sur", { n: index + 1, total: questions.length })}
          </p>
          <p className="mb-3 text-sm font-bold text-text-primary">{question.texte}</p>

          <form onSubmit={soumettreReponse} className="space-y-2">
            {question.choix.map((choix) => (
              <label
                key={choix.id}
                className={`flex cursor-pointer items-center gap-2 rounded-cid border px-3 py-2 text-sm ${
                  choixSelectionne === choix.id
                    ? "border-ca bg-cal"
                    : "border-text-tertiary/30 hover:bg-bg-secondary"
                }`}
              >
                <input
                  type="radio"
                  name="choix"
                  checked={choixSelectionne === choix.id}
                  onChange={() => setChoixSelectionne(choix.id)}
                  disabled={!!feedback}
                />
                {choix.texte}
              </label>
            ))}

            {!feedback ? (
              <button
                type="submit"
                disabled={!choixSelectionne || repondre.isPending}
                className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("quiz.valider_reponse")}
              </button>
            ) : (
              <div>
                <p
                  className={`mb-2 text-sm font-bold ${
                    feedback.est_correct ? "text-status-successText" : "text-status-dangerText"
                  }`}
                >
                  {t(feedback.est_correct ? "quiz.bonne_reponse" : "quiz.mauvaise_reponse")}
                  {feedback.est_correct && ` ${t("quiz.points_obtenus", { points: feedback.points_obtenus })}`}
                </p>
                {index + 1 < questions.length && (
                  <button
                    type="button"
                    onClick={questionSuivante}
                    className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
                  >
                    {t("quiz.question_suivante")}
                  </button>
                )}
              </div>
            )}
            {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
          </form>
        </div>
      )}

      {participation && quizTermine && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <p className="mb-1 text-lg font-bold text-text-primary">{t("quiz.quiz_termine")}</p>
          <p className="mb-4 text-sm text-text-secondary">
            {t("quiz.score_final", { score: participation.score })}
          </p>

          <h2 className="mb-2 text-sm font-bold text-text-primary">{t("quiz.classement")}</h2>
          {classementQuery.isLoading && (
            <p className="text-xs text-text-tertiary">{t("quiz.chargement_classement")}</p>
          )}
          <div className="space-y-1">
            {classementQuery.data?.classement.map((ligne, i) => (
              <div
                key={ligne.id}
                className={`flex items-center justify-between rounded-cid px-2 py-1 text-sm ${
                  ligne.id === participation.id ? "bg-cal font-bold text-cad" : "text-text-secondary"
                }`}
              >
                <span>
                  #{i + 1} {ligne.membre.prenom} {ligne.membre.nom}
                </span>
                <span>{ligne.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
