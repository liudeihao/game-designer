const listeners = new Set<() => void>();

export function notifyIllustrationsChanged(): void {
  for (const fn of listeners) fn();
}

export function subscribeIllustrationsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
