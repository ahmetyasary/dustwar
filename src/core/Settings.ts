export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  ticEnabled: boolean;
}

const KEY = 'tiricies.settings';
const DEFAULTS: Settings = { volume: 0.8, muted: false, ticEnabled: true };

/** Oyuncu ayarları tarayıcıda saklanır; depolama kapalıysa varsayılanlar kullanılır. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* gizli pencere vb. */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* yok say */
  }
}
