import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { deleteSession } from "@/lib/api";

/**
 * Defer session delete to the next task so React Strict Mode's mount→unmount→remount
 * can cancel the previous timer on remount. Cross-session navigation clears only the
 * matching id via module-level map.
 */
const pendingDiscardTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * On unmount, delete the chat session on the server if isDiscardable() is still true.
 * Used to drop "shell" sessions when the user never sent a message (e.g. left after
 * creating from /library/sessions/new).
 */
export function useDiscardEmptySessionOnLeave(
  sessionId: string,
  isDiscardable: () => boolean
) {
  const qc = useQueryClient();
  const isDiscardableRef = useRef(isDiscardable);
  isDiscardableRef.current = isDiscardable;

  useEffect(() => {
    const prev = pendingDiscardTimers.get(sessionId);
    if (prev !== undefined) {
      clearTimeout(prev);
      pendingDiscardTimers.delete(sessionId);
    }

    return () => {
      const tid = setTimeout(() => {
        pendingDiscardTimers.delete(sessionId);
        if (!isDiscardableRef.current()) return;
        void (async () => {
          try {
            await deleteSession(sessionId);
            qc.removeQueries({ queryKey: ["session", sessionId] });
            void qc.invalidateQueries({ queryKey: ["sessions"] });
            void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
            void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
          } catch {
            // already deleted or 404; list refetch is harmless
          }
        })();
      }, 0);
      pendingDiscardTimers.set(sessionId, tid);
    };
  }, [sessionId, qc]);
}
