import { useState } from "react";
import type {
  AnswerItem,
  AnswerValue,
  PendingQuestion,
  PlanQuestion,
  UserChoiceStatus,
} from "../../types";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InterruptCard } from "./InterruptCard";

interface Props {
  pending: PendingQuestion;
  disabled: boolean;
  onSubmit: (answers: Record<string, AnswerValue>) => void;
  /** Embed in chat history flow (no outer horizontal margin). */
  embedded?: boolean;
  status?: UserChoiceStatus;
  resolved?: AnswerItem[];
}

const CUSTOM = "__custom__";

/** Single-select replaces the selection; multi-select toggles one option. */
export function toggleOption(selected: string[], optionId: string, multiple: boolean): string[] {
  if (!multiple) return [optionId];
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
}

export function isAnswered(question: PlanQuestion, selected: string[], customText: string): boolean {
  const text = customText.trim();
  if ((question.options ?? []).length === 0) return text.length > 0;
  // "其他" only counts once it has text, unless another option carries the answer.
  if (selected.includes(CUSTOM)) return text.length > 0 || selected.length > 1;
  return selected.length > 0;
}

export function answerFor(
  question: PlanQuestion,
  selected: string[],
  customText: string,
): AnswerValue {
  const text = customText.trim();
  if ((question.options ?? []).length === 0) return text;
  const values = selected.map((id) => (id === CUSTOM ? text : id)).filter((v) => v.length > 0);
  return question.allow_multiple ? values : (values[0] ?? "");
}

function QuestionBlock({
  question,
  selected,
  customText,
  onToggle,
  onCustomChange,
  onEnter,
}: {
  question: PlanQuestion;
  selected: string[];
  customText: string;
  onToggle: (optionId: string) => void;
  onCustomChange: (v: string) => void;
  onEnter?: () => void;
}) {
  const options = question.options ?? [];
  const multiple = !!question.allow_multiple;
  const useCustom = selected.includes(CUSTOM);

  const pill = (on: boolean) =>
    cn(
      "rounded-md px-2.5 py-1.5 text-[14px] transition-colors duration-150",
      on
        ? "bg-primary/12 text-foreground ring-1 ring-primary/40"
        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="px-3 py-3">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[15px] font-medium leading-snug">{question.prompt}</span>
        {multiple && options.length > 0 ? (
          <span className="shrink-0 text-[12px] text-muted-foreground">可多选</span>
        ) : null}
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected.includes(opt.id)}
              className={pill(selected.includes(opt.id))}
              onClick={() => onToggle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={useCustom}
            className={pill(useCustom)}
            onClick={() => onToggle(CUSTOM)}
          >
            其他…
          </button>
        </div>
      )}
      {(options.length === 0 || useCustom) && (
        <Input
          className="mt-2"
          type="text"
          placeholder="输入你的回答…"
          value={customText}
          onChange={(e) => onCustomChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
        />
      )}
    </div>
  );
}

function StepDots({
  total,
  current,
  reachable,
  onJump,
}: {
  total: number;
  current: number;
  reachable: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`第 ${i + 1} 题`}
          disabled={i > reachable}
          onClick={() => onJump(i)}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            i === current
              ? "w-4 bg-primary"
              : i <= reachable
                ? "w-1.5 bg-primary/40 hover:bg-primary/70"
                : "w-1.5 cursor-default bg-muted-foreground/25",
          )}
        />
      ))}
      <span className="ml-1 text-[12px] tabular-nums text-muted-foreground">
        {current + 1} / {total}
      </span>
    </div>
  );
}

export function QuestionPanel({
  pending,
  disabled,
  onSubmit,
  embedded,
  status = "pending",
  resolved,
}: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const total = pending.questions.length;
  const index = Math.min(step, Math.max(total - 1, 0));
  const current = pending.questions[index];
  const isLast = index === total - 1;

  const answered = (q: PlanQuestion) => isAnswered(q, selected[q.id] ?? [], custom[q.id] ?? "");

  const toggle = (q: PlanQuestion, optionId: string) => {
    setSelected((prev) => ({
      ...prev,
      [q.id]: toggleOption(prev[q.id] ?? [], optionId, !!q.allow_multiple),
    }));
  };

  const setCustomAnswer = (q: PlanQuestion, val: string) => {
    setCustom((prev) => ({ ...prev, [q.id]: val }));
    setSelected((prev) => {
      const cur = prev[q.id] ?? [];
      if (cur.includes(CUSTOM)) return prev;
      return { ...prev, [q.id]: q.allow_multiple ? [...cur, CUSTOM] : [CUSTOM] };
    });
  };

  const ready = !!current && answered(current);

  // A step is reachable once every question before it has an answer.
  const reachable = pending.questions.reduce(
    (acc, q, i) => (i === acc && answered(q) ? acc + 1 : acc),
    0,
  );

  const goTo = (next: number) => {
    if (next < 0 || next >= total || next === index) return;
    setDirection(next > index ? "forward" : "backward");
    setStep(next);
  };

  const submit = () => {
    const out: Record<string, AnswerValue> = {};
    for (const q of pending.questions) {
      out[q.id] = answerFor(q, selected[q.id] ?? [], custom[q.id] ?? "");
    }
    onSubmit(out);
  };

  const advance = () => {
    if (disabled || !ready) return;
    if (isLast) submit();
    else goTo(index + 1);
  };

  const frozen = status !== "pending";
  const intro = (pending.message || "").trim();
  const subtitle =
    status === "dismissed"
      ? "已用输入框继续"
      : intro
        ? undefined
        : "选择下方选项，或点「其他」自定义。";

  return (
    <div className="flex flex-col gap-2">
      {intro && status !== "dismissed" ? (
        <div className="text-[16px] leading-relaxed text-foreground">{intro}</div>
      ) : null}
      <InterruptCard
        embedded={embedded}
        title="User Choice"
        subtitle={subtitle}
        footer={
          frozen ? undefined : (
            <div className="flex w-full items-center justify-between gap-2">
              {total > 1 ? (
                <StepDots total={total} current={index} reachable={reachable} onJump={goTo} />
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {index > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => goTo(index - 1)}
                  >
                    上一题
                  </Button>
                ) : null}
                <Button size="sm" disabled={disabled || !ready} onClick={advance}>
                  {isLast ? "提交回答" : "下一个"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {frozen ? (
          <div className="divide-y divide-border/40">
            {(resolved && resolved.length
              ? resolved
              : pending.questions.map((q) => ({ prompt: q.prompt, answer: "—" }))
            ).map((item, i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="text-[14px] text-muted-foreground">{item.prompt}</div>
                <div className="mt-0.5 text-[15px] font-medium">{item.answer}</div>
              </div>
            ))}
          </div>
        ) : current ? (
          <div
            key={current.id}
            className={cn(
              total > 1 && "min-h-[92px]",
              total > 1 &&
                (direction === "forward" ? "choice-step-forward" : "choice-step-backward"),
            )}
          >
            <QuestionBlock
              question={current}
              selected={selected[current.id] ?? []}
              customText={custom[current.id] ?? ""}
              onToggle={(optionId) => toggle(current, optionId)}
              onCustomChange={(v) => setCustomAnswer(current, v)}
              onEnter={advance}
            />
          </div>
        ) : null}
      </InterruptCard>
    </div>
  );
}
