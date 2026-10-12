import { useEffect, useRef, useState } from 'react';

const storageKey = 'atelier.task-recency.v1';
type Recency = Record<string, number>;

function readRecency(): Recency {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, time]) => typeof time === 'number' && Number.isFinite(time) && time > 0));
  } catch { return {}; }
}

// Navigation history stays separate from task content and streaming revisions.
export function useTaskRecency(selected: string | null) {
  const [recency, setRecency] = useState<Recency>(readRecency);
  const recencyRef = useRef(recency);
  useEffect(() => {
    if (!selected) return;
    const next = { ...recencyRef.current };
    for (const [id, time] of Object.entries(readRecency())) next[id] = Math.max(next[id] || 0, time);
    next[selected] = Date.now();
    recencyRef.current = next;
    setRecency(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep navigation usable when storage is unavailable. */ }
  }, [selected]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        recencyRef.current = readRecency();
        setRecency(recencyRef.current);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return recency;
}
