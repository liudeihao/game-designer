import { ListTodo } from "lucide-react";
import type { AnswerItem, PendingSuggestMode, UserChoiceStatus } from "../../types";
import { suggestedModeLabel } from "../../types";
import { Button } from "../../components/ui/button";
import { InterruptCard } from "./InterruptCard";

interface Props {
  pending: PendingSuggestMode;
  disabled: boolean;
  onSwitch: () => void;
  onDismiss: () => void;
  embedded?: boolean;
  status?: UserChoiceStatus;
  answers?: AnswerItem[];
}

export function SuggestModePanel({
  pending,
  disabled,
  onSwitch,
  onDismiss,
  embedded,
  status = "pending",
  answers,
}: Props) {
  const frozen = status !== "pending";
  const label = suggestedModeLabel(pending.mode);
  const subtitle =
    status === "dismissed"
      ? answers?.[0]?.answer || "已关闭"
      : pending.message;

  return (
    <InterruptCard
      embedded={embedded}
      title={
        <span className="inline-flex items-center gap-2">
          <ListTodo className="size-3.5 text-primary" />
          Suggest Mode
        </span>
      }
      subtitle={subtitle}
      footer={
        frozen ? undefined : (
          <>
            <Button variant="outline" size="sm" disabled={disabled} onClick={onDismiss}>
              保持当前模式
            </Button>
            <Button size="sm" disabled={disabled} onClick={onSwitch}>
              切换到 {label}
            </Button>
          </>
        )
      }
    >
      {pending.reason ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground/80">{pending.reason}</p>
      ) : null}
    </InterruptCard>
  );
}
