export type EventBus = {
  emit: (key: string) => void;
  subscribe: (fn: (key: string) => void) => () => void;
};

export function createEventBus(): EventBus {
  const subs = new Set<(key: string) => void>();
  return {
    emit(key: string) {
      for (const fn of subs) fn(key);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
