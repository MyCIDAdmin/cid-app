/**
 * Page "Quiz — Administration" (mockup #pg-quiz, Release Plan §3.2 "Quiz histoire du CA avec
 * score et classement", Bureau Admin+ — voir GestionQuizPermission côté backend). Cette UI
 * n'existait pas jusqu'ici (voir QuizPage : "gérée hors application pour l'instant, comme la
 * gestion des campagnes d'adhésion l'est via l'admin Django avant sa page dédiée") ; elle
 * corrige le bug remonté en test manuel Phase 4 ("beim Quiz ist es nicht möglich Quiz
 * anzulegen").
 *
 * Création en 3 étapes distinctes côté API (QuizSerializer.questions et
 * QuestionQuizSerializer.choix sont read_only=True — pas de création imbriquée) : créer le
 * quiz, puis sélectionner un quiz pour lui ajouter des questions, puis chaque question pour lui
 * ajouter des choix (dont un marqué correct). Le détail imbriqué (questions + choix, avec
 * est_correct visible) vient de `useQuiz(id)` — GestionQuizPermission autorise déjà la lecture
 * complète à Bureau Admin+, inutile de refaire des appels séparés vers quiz-questions/quiz-choix
 * pour l'affichage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreerChoixQuestion,
  useCreerQuestionQuiz,
  useCreerQuiz,
  useModifierQuiz,
  useQuiz,
  useQuizListe,
  useSupprimerChoixQuestion,
  useSupprimerQuestionQuiz,
  useSupprimerQuiz,
} from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";

function NouveauQuizForm() {
  const { t } = useTranslation("communaute");
  const creerQuiz = useCreerQuiz();
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [erreur, setErreur] = useState("");

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    creerQuiz.mutate(
      { titre, description },
      {
        onSuccess: () => {
          setTitre("");
          setDescription("");
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("admin_quiz.erreur_creation"))),
      },
    );
  }

  return (
    <form
      onSubmit={soumettre}
      className="mb-5 space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
    >
      <h2 className="text-sm font-bold text-text-primary">{t("admin_quiz.nouveau_quiz")}</h2>
      <input
        type="text"
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder={t("admin_quiz.titre_placeholder")}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("admin_quiz.description_placeholder")}
        rows={2}
        className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
      />
      <button
        type="submit"
        disabled={creerQuiz.isPending}
        className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
      >
        {t("admin_quiz.creer")}
      </button>
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
    </form>
  );
}

function NouvelleQuestionForm({ quizId }: { quizId: string }) {
  const { t } = useTranslation("communaute");
  const creerQuestion = useCreerQuestionQuiz();
  const [texte, setTexte] = useState("");
  const [points, setPoints] = useState(10);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    creerQuestion.mutate(
      { quiz: quizId, texte, points },
      { onSuccess: () => setTexte("") },
    );
  }

  return (
    <form onSubmit={soumettre} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder={t("admin_quiz.question_placeholder")}
        className="min-w-[12rem] flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        min={1}
        value={points}
        onChange={(e) => setPoints(Number(e.target.value))}
        className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={creerQuestion.isPending}
        className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
      >
        {t("admin_quiz.ajouter_question")}
      </button>
    </form>
  );
}

function NouveauChoixForm({ questionId, quizId }: { questionId: string; quizId: string }) {
  const { t } = useTranslation("communaute");
  const creerChoix = useCreerChoixQuestion();
  const [texte, setTexte] = useState("");
  const [estCorrect, setEstCorrect] = useState(false);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    creerChoix.mutate(
      { payload: { question: questionId, texte, est_correct: estCorrect }, quizId },
      {
        onSuccess: () => {
          setTexte("");
          setEstCorrect(false);
        },
      },
    );
  }

  return (
    <form onSubmit={soumettre} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder={t("admin_quiz.choix_placeholder")}
        className="min-w-[10rem] flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
      />
      <label className="flex items-center gap-1 text-[10px] text-text-tertiary">
        <input
          type="checkbox"
          checked={estCorrect}
          onChange={(e) => setEstCorrect(e.target.checked)}
        />
        {t("admin_quiz.est_correct")}
      </label>
      <button
        type="submit"
        disabled={creerChoix.isPending}
        className="rounded-cid bg-bg-secondary px-2 py-1 text-[10px] font-medium text-text-primary hover:bg-text-tertiary/20 disabled:opacity-50"
      >
        {t("admin_quiz.ajouter_choix")}
      </button>
    </form>
  );
}

function DetailQuiz({ quizId }: { quizId: string }) {
  const { t } = useTranslation("communaute");
  const quizQuery = useQuiz(quizId);
  const supprimerQuestion = useSupprimerQuestionQuiz();
  const supprimerChoix = useSupprimerChoixQuestion();

  if (quizQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("admin_quiz.chargement")}</p>;
  }
  if (quizQuery.isError || !quizQuery.data) {
    return <p className="text-sm text-status-dangerText">{t("admin_quiz.erreur_chargement")}</p>;
  }

  const quiz = quizQuery.data;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-text-primary">{quiz.titre}</h3>
        {quiz.description && <p className="text-xs text-text-tertiary">{quiz.description}</p>}
      </div>

      <div className="space-y-2">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="rounded-cid border border-text-tertiary/20 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">
                {t("admin_quiz.question_numero", { n: index + 1 })} — {question.texte}
              </span>
              <button
                type="button"
                onClick={() =>
                  supprimerQuestion.mutate({ id: question.id, quizId })
                }
                className="text-[10px] font-medium text-status-dangerText hover:underline"
              >
                {t("admin_quiz.supprimer")}
              </button>
            </div>

            <ul className="mb-2 space-y-1">
              {question.choix.map((choix) => (
                <li
                  key={choix.id}
                  className="flex items-center justify-between rounded bg-bg-secondary px-2 py-1 text-xs"
                >
                  <span className={choix.est_correct ? "font-bold text-status-successText" : ""}>
                    {choix.texte}
                    {choix.est_correct && ` (${t("admin_quiz.est_correct")})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => supprimerChoix.mutate({ id: choix.id, quizId })}
                    className="text-[10px] font-medium text-status-dangerText hover:underline"
                  >
                    {t("admin_quiz.supprimer")}
                  </button>
                </li>
              ))}
              {question.choix.length === 0 && (
                <li className="text-[10px] text-text-tertiary">{t("admin_quiz.aucun_choix")}</li>
              )}
            </ul>

            <NouveauChoixForm questionId={question.id} quizId={quizId} />
          </div>
        ))}
        {quiz.questions.length === 0 && (
          <p className="text-xs text-text-tertiary">{t("admin_quiz.aucune_question")}</p>
        )}
      </div>

      <div className="rounded-cid border border-dashed border-text-tertiary/30 p-2">
        <NouvelleQuestionForm quizId={quizId} />
      </div>
    </div>
  );
}

export default function AdminQuizPage() {
  const { t } = useTranslation("communaute");
  const quizListeQuery = useQuizListe();
  const modifierQuiz = useModifierQuiz();
  const supprimerQuiz = useSupprimerQuiz();
  const [quizSelectionne, setQuizSelectionne] = useState<string | null>(null);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("admin_quiz.titre")}</h1>

      <NouveauQuizForm />

      {quizListeQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("admin_quiz.chargement")}</p>
      )}
      {quizListeQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("admin_quiz.erreur_chargement")}</p>
      )}
      {quizListeQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("admin_quiz.aucun_quiz")}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          {quizListeQuery.data?.results.map((quiz) => (
            <div
              key={quiz.id}
              className={`rounded-cid-lg bg-bg-primary p-3 shadow-sm ${
                quizSelectionne === quiz.id ? "ring-2 ring-ca" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setQuizSelectionne(quiz.id)}
                className="block w-full text-left"
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
                <div className="mt-1 text-[10px] text-text-tertiary">
                  {t("quiz.nombre_questions", { count: quiz.nombre_questions })}
                </div>
              </button>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    modifierQuiz.mutate({ id: quiz.id, payload: { est_actif: !quiz.est_actif } })
                  }
                  className="rounded-cid bg-bg-secondary px-2 py-1 text-[10px] font-medium text-text-primary hover:bg-text-tertiary/20"
                >
                  {t(quiz.est_actif ? "admin_quiz.desactiver" : "admin_quiz.activer")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    supprimerQuiz.mutate(quiz.id);
                    if (quizSelectionne === quiz.id) setQuizSelectionne(null);
                  }}
                  className="rounded-cid bg-bg-secondary px-2 py-1 text-[10px] font-medium text-status-dangerText hover:bg-text-tertiary/20"
                >
                  {t("admin_quiz.supprimer")}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          {quizSelectionne ? (
            <DetailQuiz quizId={quizSelectionne} />
          ) : (
            <p className="text-sm text-text-tertiary">{t("admin_quiz.selectionner_quiz")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
