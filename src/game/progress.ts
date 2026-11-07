export type MomentProgress = {
  best: number;
  attempts: number;
  passed: boolean;
};

export type ProgressStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const PASS_SCORE = 70;
const STORAGE_KEY = "koronline-progress-v1";

export function readProgress(store?: ProgressStore | null): Record<string, MomentProgress> {
  if (!store) {
    return {};
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, MomentProgress>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function recordAttempt(
  id: string,
  score: number,
  store?: ProgressStore | null,
): Record<string, MomentProgress> {
  const current = readProgress(store);
  const previous = current[id];
  const best = Math.max(previous?.best ?? 0, score);
  const next = {
    ...current,
    [id]: {
      best,
      attempts: (previous?.attempts ?? 0) + 1,
      passed: best >= PASS_SCORE,
    },
  };
  store?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function browserProgressStore(): ProgressStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
