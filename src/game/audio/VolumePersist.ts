export interface Volumes {
  master: number;
  sfx: number;
  music: number;
}

const LS_KEY = "rift9_volumes";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function loadVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Volumes>;
      return {
        master: clamp01(p.master ?? 0.8),
        sfx: clamp01(p.sfx ?? 0.8),
        music: clamp01(p.music ?? 0.55),
      };
    }
  } catch {
    /* ignore */
  }
  return { master: 0.8, sfx: 0.8, music: 0.55 };
}

export function saveVolumes(volumes: Volumes): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(volumes));
  } catch {
    /* ignore */
  }
}
