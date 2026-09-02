import type {
  AnswerItem,
  AnswerValue,
  PendingQuestion,
  PendingSuggestMode,
  UserChoicePart,
} from "../../types";
import { isPendingQuestion, isPendingSuggestMode } from "../../types";
import { QuestionPanel } from "./QuestionPanel";
import { SuggestModePanel } from "./SuggestModePanel";

export interface UserChoiceHandlers {
  onSubmitAnswers: (answers: Record<string, AnswerValue>, pending: PendingQuestion) => void;
  onAcceptSuggestMode: (pending: PendingSuggestMode) => void;
  onDismissSuggestMode: () => void;
}

interface Props {
  part: UserChoicePart;
  handlers?: UserChoiceHandlers;
}

export function UserChoiceInline({ part, handlers }: Props) {
  const interactive = part.status === "pending" && !!handlers;
  const pending = part.pending;
  const answers = part.answers;

  if (isPendingQuestion(pending)) {
    return (
      <QuestionPanel
        embedded
        pending={pending}
        disabled={!interactive}
        status={part.status}
        resolved={answers}
        onSubmit={(answers) => handlers?.onSubmitAnswers(answers, pending)}
      />
    );
  }
  if (isPendingSuggestMode(pending)) {
    return (
      <SuggestModePanel
        embedded
        pending={pending}
        disabled={!interactive}
        status={part.status}
        answers={answers}
        onSwitch={() => handlers?.onAcceptSuggestMode(pending)}
        onDismiss={handlers?.onDismissSuggestMode ?? (() => {})}
      />
    );
  }
  return null;
}

export function choiceAnswersFromRecord(
  questions: { id: string; prompt: string; options?: { id: string; label: string }[] }[],
  answers: Record<string, AnswerValue>,
): AnswerItem[] {
  return questions.map((q) => {
    const raw = answers[q.id] ?? "";
    const values = Array.isArray(raw) ? raw : [raw];
    const answer = values
      .filter((v) => v.length > 0)
      .map((v) => (q.options ?? []).find((o) => o.id === v)?.label ?? v)
      .join("、");
    return { prompt: q.prompt, answer };
  });
}
