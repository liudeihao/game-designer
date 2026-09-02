import { useEffect, useRef } from "react";

interface Props {
  content: string;
  streaming?: boolean;
  defaultCollapsed?: boolean;
}

export function ReasoningBlock({ content, streaming = false, defaultCollapsed = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, streaming]);

  if (!content.trim()) return null;

  if (streaming) {
    return (
      <div
        ref={scrollRef}
        className="my-1.5 max-h-40 overflow-y-auto rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[13px] leading-relaxed text-muted-foreground"
      >
        {content}
      </div>
    );
  }

  return (
    <details className="my-1.5 rounded-md bg-muted/30" open={!defaultCollapsed}>
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        思考过程
      </summary>
      <div className="max-h-48 overflow-y-auto border-t border-border/40 px-2.5 py-2 font-mono text-[13px] leading-relaxed text-muted-foreground">
        {content}
      </div>
    </details>
  );
}
