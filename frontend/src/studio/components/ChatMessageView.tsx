import type { AnswerItem, ChatMessage, LiveTurn } from "../../types";
import { cn } from "@/lib/utils";
import { MessageContent } from "./MessageContent";
import type { RuleProposalHandlers } from "./RuleProposalCard";
import type { UserChoiceHandlers } from "./UserChoiceInline";
import type { PermissionHandlers } from "./PermissionPanel";

interface Props {
  message?: ChatMessage;
  liveTurn?: LiveTurn | null;
  streaming?: boolean;
  onOpenFile?: (path: string) => void;
  choiceHandlers?: UserChoiceHandlers;
  ruleHandlers?: RuleProposalHandlers;
  permissionHandlers?: PermissionHandlers;
}

function parseAnswersFromContent(content: string): AnswerItem[] {
  const lines = content.replace(/^【用户回答】\s*/m, "").trim().split("\n");
  const items: AnswerItem[] = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s*(.+?):\s*(.+)\s*$/);
    if (m) items.push({ prompt: m[1].trim(), answer: m[2].trim() });
  }
  return items;
}

function AnswersCard({
  items,
  title = "你的选择",
}: {
  items: AnswerItem[];
  title?: string;
}) {
  return (
    <div className="w-full max-w-[min(100%,36rem)] overflow-hidden rounded-xl bg-primary/8 ring-1 ring-primary/20">
      <div className="border-b border-primary/15 px-3.5 py-2 text-[14px] font-semibold text-primary">
        {title}
      </div>
      <ul className="divide-y divide-primary/10">
        {items.map((it, i) => (
          <li key={i} className="px-3.5 py-2.5">
            <div className="text-[14px] text-muted-foreground">{it.prompt}</div>
            <div className="mt-0.5 text-[16px] font-medium text-foreground">{it.answer}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function parseStageFromContent(content: string): AnswerItem[] {
  const lines = content.replace(/^【内容确认】\s*/m, "").trim().split("\n");
  const items: AnswerItem[] = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s*(.+?):\s*(.+)\s*$/);
    if (m) items.push({ prompt: m[1].trim(), answer: m[2].trim() });
  }
  return items;
}

export function ChatMessageView({
  message,
  liveTurn,
  streaming,
  onOpenFile,
  choiceHandlers,
  ruleHandlers,
  permissionHandlers,
}: Props) {
  const role = message?.role ?? "ai";
  const isHuman = role === "human";
  const isAnswers =
    message?.kind === "answers" ||
    (isHuman && !!message?.content?.trim().startsWith("【用户回答】"));
  const isUserChoiceReply =
    message?.kind === "user_choice" ||
    (isHuman && !!message?.content?.trim().startsWith("【内容确认】"));

  if (isAnswers && message) {
    const items =
      message.answers && message.answers.length > 0
        ? message.answers
        : parseAnswersFromContent(message.content || "");
    if (items.length > 0) {
      return (
        <div className="flex flex-col items-stretch gap-1.5">
          <AnswersCard items={items} />
        </div>
      );
    }
  }

  if (isUserChoiceReply && message) {
    const items =
      message.answers && message.answers.length > 0
        ? message.answers
        : parseStageFromContent(message.content || "");
    if (items.length > 0) {
      return (
        <div className="flex flex-col items-stretch gap-1.5">
          <AnswersCard items={items} title="内容确认" />
        </div>
      );
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", isHuman ? "items-end" : "items-start")}>
      <div className="px-0.5 text-[14px] font-medium text-muted-foreground">
        {isHuman ? "你" : "AI"}
      </div>
      <div
        className={cn(
          "max-w-[min(100%,36rem)] text-[16px] leading-relaxed",
          isHuman
            ? "rounded-xl bg-muted/70 px-3.5 py-2.5 text-foreground"
            : "w-full text-foreground",
          streaming && "opacity-95",
        )}
      >
        {isHuman ? (
          <div className="whitespace-pre-wrap break-words">{message?.content}</div>
        ) : (
          <MessageContent
            parts={message?.parts}
            events={message?.events}
            reasoning={message?.reasoning}
            liveTurn={liveTurn}
            streaming={streaming}
            fallbackContent={message?.content}
            onOpenFile={onOpenFile}
            choiceHandlers={choiceHandlers}
            ruleHandlers={ruleHandlers}
            permissionHandlers={permissionHandlers}
          />
        )}
      </div>
    </div>
  );
}
