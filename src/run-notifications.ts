/** Merge presentation notifications, never the underlying versioned events.
 * The timer keeps hidden/occluded windows moving when rAF is suspended. */
export function createRunNotifications<T extends { id: string }>(options: {
  deliver(value: T): void;
  sizeOf(value: T): number;
  frame?(callback: () => void): number;
  cancelFrame?(id: number): void;
  timer?(callback: () => void): ReturnType<typeof setTimeout>;
  cancelTimer?(id: ReturnType<typeof setTimeout>): void;
  maxEntries?: number;
  maxBytes?: number;
}) {
  const pending = new Map<string, { value: T; bytes: number }>();
  let bytes = 0;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (frame !== undefined) (options.cancelFrame || cancelAnimationFrame)(frame);
    if (timer !== undefined) (options.cancelTimer || clearTimeout)(timer);
    frame = undefined; timer = undefined;
  };
  const flush = () => {
    cancel();
    const values = [...pending.values()]; pending.clear(); bytes = 0;
    for (const entry of values) options.deliver(entry.value);
  };
  return {
    push(value: T, immediate = false) {
      const size = options.sizeOf(value), previous = pending.get(value.id);
      if (pending.size >= (options.maxEntries ?? 64) && !previous ||
          bytes - (previous?.bytes || 0) + size > (options.maxBytes ?? 16 * 1024 * 1024)) flush();
      const old = pending.get(value.id); bytes -= old?.bytes || 0;
      pending.set(value.id, { value, bytes: size }); bytes += size;
      if (immediate || size > (options.maxBytes ?? 16 * 1024 * 1024)) { flush(); return; }
      if (frame === undefined) frame = (options.frame || requestAnimationFrame)(flush);
      if (timer === undefined) timer = (options.timer || (callback => setTimeout(callback, 50)))(flush);
    },
    clear() { cancel(); pending.clear(); bytes = 0; },
    flush,
    stats: () => ({ entries: pending.size, bytes }),
  };
}
