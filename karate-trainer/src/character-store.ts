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
  /** Transparent (green-screen removed) cheer clip, VP9+alpha WebM. */
  cheerVideo: string;
  quotes: string[];
}

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
    cheerVideo: "/characters/alan_cheer.webm",
    quotes: [
      "オス！最高の気合だ！",
      "ファイト！その調子で突こう！",
      "カッコいいぞ！腰を入れて！",
      "ナイス蹴り！キレがあるね！",
      "最後まで諦めないぞ！",
    ],
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
    cheerVideo: "/characters/leo_cheer.webm",
    quotes: [
      "ナイスフォーム！完璧だね！",
      "冷静に、素早く構えよう！",
      "キレてきたね！素晴らしい！",
      "その集中力、さすがだ！",
      "素晴らしいスピードだ！",
    ],
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
    cheerVideo: "/characters/izzy_cheer.webm",
    quotes: [
      "わーい！すっごく上手！",
      "イジーと一緒にエイエイオー！",
      "ぴかぴかスマイルでエイッ！",
      "カッコ良すぎてドッキドキ！",
      "スター級の演武だね！",
    ],
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
