export type CharacterId = "alan" | "leo" | "izzy";

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  subtitle: string;
  badgeEmoji: string;
  themeColor: string;
  themeGradient: string;
  avatarNormal: string;
  avatarCheer: string;
  /**
   * One clip per spoken phrase: transparent HEVC (.mov) with the character's
   * own voice, cut from the green-screen originals so mouth and words match.
   * HEVC alpha is decoded in hardware on iPhone; the old VP9+alpha WebM lost its
   * transparency in WebKit and showed the green background.
   */
  cheerClips: CheerClip[];
}

/** One cheer clip and the words spoken in it, shown in the speech bubble. */
export interface CheerClip {
  src: string;    // transparent HEVC animation, played muted
  audio: string;  // the same phrase's voice as .m4a, played by the native engine
  text: string;
}

// Phrases transcribed from each clip with on-device Japanese recognition, in
// clip order: phrase N is /characters/cheer/<id>-N.mov.
const cheerClips = (id: CharacterId, phrases: string[]): CheerClip[] =>
  phrases.map((text, i) => ({
    src: `/characters/cheer/${id}-${i + 1}.mov`,
    audio: `/characters/cheer/${id}-${i + 1}.m4a`,
    text,
  }));

/** All companion ids, for picking a random cheerleader during training. */
export const CHARACTER_IDS: CharacterId[] = ["alan", "leo", "izzy"];

export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  alan: {
    id: "alan",
    name: "アラン",
    subtitle: "熱血！きつね先生",
    badgeEmoji: "🦊",
    themeColor: "#FF5733",
    themeGradient: "linear-gradient(135deg, #FF6B4A 0%, #C8402F 100%)",
    avatarNormal: "/characters/alan.jpg",
    avatarCheer: "/characters/alan_cheer.jpg",
    cheerClips: cheerClips("alan", [
      "応援するよ", "がんばれー", "君ならできる", "ファイト",
      "応援してるからね", "最高だよ", "その調子", "ずっと応援してるよ",
    ]),
  },
  leo: {
    id: "leo",
    name: "レオ",
    subtitle: "クール！ねこ先輩",
    badgeEmoji: "🐱",
    themeColor: "#3B82F6",
    themeGradient: "linear-gradient(135deg, #60A5FA 0%, #1D4ED8 100%)",
    avatarNormal: "/characters/leo.jpg",
    avatarCheer: "/characters/leo_cheer.jpg",
    cheerClips: cheerClips("leo", ["応援するよ", "頑張って", "君ならできる", "信じてるからね"]),
  },
  izzy: {
    id: "izzy",
    name: "イジー",
    subtitle: "元気！きいろ猫",
    badgeEmoji: "🐱✨",
    themeColor: "#EAB308",
    themeGradient: "linear-gradient(135deg, #FDE047 0%, #CA8A04 100%)",
    avatarNormal: "/characters/izzy.jpg",
    avatarCheer: "/characters/izzy_cheer.jpg",
    // izzy-7.mov is not listed: it has no speech, only a trailing sound.
    cheerClips: cheerClips("izzy", [
      "応援するよ", "どんな時も味方だよ", "一緒に頑張ろう", "君ならできる", "信じてるからね", "ファイト",
    ]),
  },
};

export interface BeltRank {
  name: string;
  kanji: string;
  color: string;
  bgHex: string;
  minXp: number;
  icon: string;
}

export const BELT_RANKS: BeltRank[] = [
  { name: "White Belt", kanji: "白帯", color: "#FFFFFF", bgHex: "#F3F4F6", minXp: 0, icon: "🥋" },
  { name: "Yellow Belt", kanji: "黄帯", color: "#FACC15", bgHex: "#FEF08A", minXp: 100, icon: "⚡" },
  { name: "Green Belt", kanji: "緑帯", color: "#22C55E", bgHex: "#86EFAC", minXp: 250, icon: "🍃" },
  { name: "Brown Belt", kanji: "茶帯", color: "#A16207", bgHex: "#FDE047", minXp: 500, icon: "🪵" },
  { name: "Black Belt", kanji: "黒帯", color: "#111827", bgHex: "#1F2937", minXp: 1000, icon: "👑" },
];

export interface CharacterState {
  selectedId: CharacterId;
  totalXp: number;
  completedCount: number;
}

const STORAGE_KEY = "karate_toybox_character_state";

export function loadCharacterState(storage: Storage = window.localStorage): CharacterState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CharacterState>;
      return {
        selectedId: parsed.selectedId && CHARACTERS[parsed.selectedId] ? parsed.selectedId : "alan",
        totalXp: typeof parsed.totalXp === "number" ? parsed.totalXp : 0,
        completedCount: typeof parsed.completedCount === "number" ? parsed.completedCount : 0,
      };
    }
  } catch {
    /* fallback to default */
  }
  return { selectedId: "alan", totalXp: 0, completedCount: 0 };
}

export function saveCharacterState(state: CharacterState, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
  }
}

export function getCurrentBelt(xp: number): { current: BeltRank; next: BeltRank | null; progress: number } {
  let currentRank = BELT_RANKS[0];
  let nextRank: BeltRank | null = BELT_RANKS[1];

  for (let i = 0; i < BELT_RANKS.length; i++) {
    if (xp >= BELT_RANKS[i].minXp) {
      currentRank = BELT_RANKS[i];
      nextRank = BELT_RANKS[i + 1] ?? null;
    }
  }

  let progress = 100;
  if (nextRank) {
    const range = nextRank.minXp - currentRank.minXp;
    const currentProgress = xp - currentRank.minXp;
    progress = Math.min(100, Math.max(0, Math.floor((currentProgress / range) * 100)));
  }

  return { current: currentRank, next: nextRank, progress };
}
