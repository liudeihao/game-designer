import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { LiveTurn, MessagePart, RuntimeEvent, TracePart } from "../../types";
import { columnItemsFromEvents, orderLiveBlocksForDisplay } from "../lib/eventsColumn";
import { describeLiveWorkingStatus, emptyLiveTurn } from "../streamUtils";
import {
  filterVisibleTraces,
  loadShowInternalToolTraces,
  subscribeShowInternalToolTraces,
} from "../traceVisibility";
import { FileRefsBar } from "./FileRefsBar";
import { ReasoningBlock } from "./ReasoningBlock";
import { TraceCard } from "./TraceCard";
import { RuleProposalCard, type RuleProposalHandlers } from "./RuleProposalCard";
import { UserChoiceInline, type UserChoiceHandlers } from "./UserChoiceInline";
import { PermissionPanel, type PermissionHandlers } from "./PermissionPanel";

function WorkingStatus({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 text-[14px] text-muted-foreground"
      aria-live="polite"
    >
      <span className="ws-spin" />
      <span>{label}</span>
    </div>
  );
}

interface Props {
  parts?: MessagePart[];
  events?: RuntimeEvent[];
  reasoning?: string;
  liveTurn?: LiveTurn | null;
  streaming?: boolean;
  fallbackContent?: string;
  onOpenFile?: (path: string) => void;
  choiceHandlers?: UserChoiceHandlers;
  ruleHandlers?: RuleProposalHandlers;
  permissionHandlers?: PermissionHandlers;
}

function MarkdownBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={`ws-prose ${streaming ? "opacity-90" : ""}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 6, fontSize: "0.8rem" }}
                >
                  {code}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function useShowInternalToolTraces(): boolean {
  const [show, setShow] = useState(loadShowInternalToolTraces);
  useEffect(() => subscribeShowInternalToolTraces(() => setShow(loadShowInternalToolTraces())), []);
  return show;
}

function hasLiveBody(turn: LiveTurn | null | undefined): boolean {
  if (!turn) return false;
  return Boolean(
    turn.reasoning ||
      turn.text ||
      turn.traces.length ||
      turn.blocks?.length ||
      turn.choices?.length ||
      turn.ruleProposals?.length ||
      turn.permissions?.length ||
      turn.fileRefs?.length,
  );
}

export function MessageContent({
  parts,
  events,
  reasoning,
  liveTurn,
  streaming,
  fallbackContent,
  onOpenFile,
  choiceHandlers,
  ruleHandlers,
  permissionHandlers,
}: Props) {
  const showInternal = useShowInternalToolTraces();
  const showEvents = !!events?.length;
  const showParts = !showEvents && !!parts?.length;
  const showLive = hasLiveBody(liveTurn);
  // A turn in flight always reports what it is doing, even when the bubble
  // already carries settled events or parts from an earlier round.
  const workingLabel = streaming
    ? describeLiveWorkingStatus(liveTurn ?? emptyLiveTurn())
    : null;

  const renderParts = (list: MessagePart[]) => {
    const rawTraces = list.filter((p): p is TracePart => p.type === "trace");
    const visibleTraces = filterVisibleTraces(rawTraces, showInternal);
    const visibleById = new Map(visibleTraces.map((t) => [t.id, t]));
    const renderedTraceIds = new Set<string>();
    return (
      <>
        {list.map((p, i) => {
          if (p.type === "reasoning") {
            return (
              <ReasoningBlock
                key={`r-${i}`}
                content={p.content}
                defaultCollapsed={p.collapsed ?? true}
              />
            );
          }
          if (p.type === "user_choice") {
            return (
              <div key={p.id || `c-${i}`} className="my-2">
                <UserChoiceInline part={p} handlers={choiceHandlers} />
              </div>
            );
          }
          if (p.type === "rule_proposal") {
            return (
              <div key={p.id || `rp-${i}`} className="my-2">
                <RuleProposalCard part={p} handlers={ruleHandlers} />
              </div>
            );
          }
          if (p.type === "tool_permission") {
            return (
              <div key={p.id || `perm-${i}`} className="my-2">
                <PermissionPanel part={p} handlers={permissionHandlers} />
              </div>
            );
          }
          if (p.type === "trace") {
            const visible = visibleById.get(p.id);
            if (!visible || renderedTraceIds.has(visible.id)) return null;
            renderedTraceIds.add(visible.id);
            return <TraceCard key={visible.id || i} trace={visible} onOpenFile={onOpenFile} />;
          }
          if (p.type === "file_refs") {
            return (
              <FileRefsBar key={`f-${i}`} files={p.files || []} onOpenFile={onOpenFile} />
            );
          }
          return <MarkdownBlock key={`t-${i}`} content={p.content} />;
        })}
        {visibleTraces
          .filter((t) => !renderedTraceIds.has(t.id))
          .map((t) => (
            <TraceCard key={t.id} trace={t} onOpenFile={onOpenFile} />
          ))}
      </>
    );
  };

  const renderLive = (turn: LiveTurn) => {
    const traces = filterVisibleTraces(turn.traces, showInternal);
    const byId = new Map(traces.map((t) => [t.id, t]));
    const choiceById = new Map((turn.choices || []).map((c) => [c.id, c]));
    const ruleById = new Map((turn.ruleProposals || []).map((p) => [p.id, p]));
    const blocks = orderLiveBlocksForDisplay(turn.blocks || []);
    const hasIntro = blocks.some((b) => b.type === "text" && b.content.trim()) || !!turn.text.trim();
    const hideRuleUntilIntro = !!streaming && !hasIntro;
    const renderedTraceIds = new Set<string>();
    const renderedChoiceIds = new Set<string>();
    const renderedRuleIds = new Set<string>();
    const renderedPermIds = new Set<string>();

    const timeline =
      blocks.length > 0 ? (
        <>
          {blocks.map((block, i) => {
            if (block.type === "text") {
              if (!block.content) return null;
              const isLastText = !blocks.slice(i + 1).some((b) => b.type === "text");
              return (
                <MarkdownBlock
                  key={`lt-${i}`}
                  content={block.content}
                  streaming={streaming && isLastText}
                />
              );
            }
            if (block.type === "user_choice") {
              const choice = choiceById.get(block.id);
              if (!choice) return null;
              renderedChoiceIds.add(choice.id);
              return (
                <div key={choice.id} className="my-2">
                  <UserChoiceInline part={choice} handlers={choiceHandlers} />
                </div>
              );
            }
            if (block.type === "rule_proposal") {
              if (hideRuleUntilIntro) return null;
              const proposal = ruleById.get(block.id);
              if (!proposal) return null;
              renderedRuleIds.add(proposal.id);
              return (
                <div key={proposal.id} className="my-2">
                  <RuleProposalCard part={proposal} handlers={ruleHandlers} />
                </div>
              );
            }
            if (block.type === "tool_permission") {
              const perm = (turn.permissions || []).find((item) => item.id === block.id);
              if (!perm) return null;
              renderedPermIds.add(perm.id);
              return (
                <div key={perm.id} className="my-2">
                  <PermissionPanel part={perm} handlers={permissionHandlers} />
                </div>
              );
            }
            const visible = byId.get(block.id);
            if (!visible) return null;
            renderedTraceIds.add(visible.id);
            return <TraceCard key={visible.id} trace={visible} onOpenFile={onOpenFile} />;
          })}
          {(turn.choices || [])
            .filter((c) => !renderedChoiceIds.has(c.id))
            .map((c) => (
              <div key={c.id} className="my-2">
                <UserChoiceInline part={c} handlers={choiceHandlers} />
              </div>
            ))}
          {(turn.ruleProposals || [])
            .filter((p) => !hideRuleUntilIntro && !renderedRuleIds.has(p.id))
            .map((p) => (
              <div key={p.id} className="my-2">
                <RuleProposalCard part={p} handlers={ruleHandlers} />
              </div>
            ))}
          {(turn.permissions || [])
            .filter((p) => !renderedPermIds.has(p.id))
            .map((p) => (
              <div key={p.id} className="my-2">
                <PermissionPanel part={p} handlers={permissionHandlers} />
              </div>
            ))}
          {traces
            .filter((t) => !renderedTraceIds.has(t.id))
            .map((t) => (
              <TraceCard key={t.id} trace={t} onOpenFile={onOpenFile} />
            ))}
        </>
      ) : (
        <>
          {turn.text && <MarkdownBlock content={turn.text} streaming={streaming} />}
          {(turn.choices || []).map((c) => (
            <div key={c.id} className="my-2">
              <UserChoiceInline part={c} handlers={choiceHandlers} />
            </div>
          ))}
          {(turn.ruleProposals || [])
            .filter((p) => !hideRuleUntilIntro)
            .map((p) => (
            <div key={p.id} className="my-2">
              <RuleProposalCard part={p} handlers={ruleHandlers} />
            </div>
          ))}
          {(turn.permissions || []).map((p) => (
            <div key={p.id} className="my-2">
              <PermissionPanel part={p} handlers={permissionHandlers} />
            </div>
          ))}
          {traces.map((t) => (
            <TraceCard key={t.id} trace={t} onOpenFile={onOpenFile} />
          ))}
        </>
      );

    return (
      <>
        {(turn.reasoning || (streaming && !turn.text && !workingLabel && !showParts)) && (
          <ReasoningBlock
            content={turn.reasoning}
            streaming={streaming && !turn.reasoningDone && !turn.text}
          />
        )}
        {timeline}
        {!!turn.fileRefs?.length && <FileRefsBar files={turn.fileRefs} onOpenFile={onOpenFile} />}
      </>
    );
  };

  const renderPreamble = () =>
    fallbackContent ? <MarkdownBlock content={fallbackContent} streaming={streaming} /> : null;

  const renderEvents = (list: RuntimeEvent[]) => {
    const items = columnItemsFromEvents(list, !!fallbackContent);
    const visibleTraceIds = new Set(
      filterVisibleTraces(
        items.filter((c): c is TracePart => c.type === "trace"),
        showInternal,
      ).map((t) => t.id),
    );
    return (
      <>
        {items.map((card, i) => {
          if (card.type === "preamble") {
            return <div key={`preamble-${i}`}>{renderPreamble()}</div>;
          }
          if (card.type === "trace") {
            if (!visibleTraceIds.has(card.id)) return null;
            return <TraceCard key={`t-${card.id}`} trace={card} onOpenFile={onOpenFile} />;
          }
          if (card.type === "user_choice") {
            return (
              <div key={`c-${card.id}`} className="my-2">
                <UserChoiceInline part={card} handlers={choiceHandlers} />
              </div>
            );
          }
          if (card.type === "tool_permission") {
            return (
              <div key={`perm-${card.id}`} className="my-2">
                <PermissionPanel part={card} handlers={permissionHandlers} />
              </div>
            );
          }
          return (
            <div key={`rp-${card.id}`} className="my-2">
              <RuleProposalCard part={card} handlers={ruleHandlers} />
            </div>
          );
        })}
      </>
    );
  };

  if (showEvents || showParts || showLive || reasoning) {
    return (
      <div className="flex flex-col gap-0.5">
        {reasoning && !showLive ? (
          <ReasoningBlock content={reasoning} defaultCollapsed />
        ) : null}
        {showEvents ? renderEvents(events!) : null}
        {showParts ? renderParts(parts!) : null}
        {showLive ? renderLive(liveTurn!) : null}
        {/* No choice card: the reply still lands after traces / reasoning. */}
        {fallbackContent && !showEvents && reasoning ? (
          <MarkdownBlock content={fallbackContent} streaming={streaming} />
        ) : null}
        {workingLabel && <WorkingStatus label={workingLabel} />}
      </div>
    );
  }

  if (workingLabel) {
    return (
      <div className="flex flex-col gap-0.5">
        <WorkingStatus label={workingLabel} />
      </div>
    );
  }

  if (fallbackContent) {
    return (
      <div className="flex flex-col gap-0.5">
        <MarkdownBlock content={fallbackContent} streaming={streaming} />
      </div>
    );
  }

  return null;
}
