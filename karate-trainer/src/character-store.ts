import type { Lang } from "./i18n";

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
  /** The English cast: same characters, their own English recordings. */
  nameEn: string;
  cheerClipsEn: CheerClip[];
}

/** One cheer clip and the words spoken in it, shown in the speech bubble. */
export interface CheerClip {
  src: string;    // transparent HEVC animation, played muted
  audio: string;  // the same phrase's voice as .m4a, played by the native engine
  text: string;
}

// Phrases transcribed from each clip with on-device Japanese recognition, in
// clip order: phrase N is /characters/cheer/<id>-N.mov. English clips live in
// /characters/cheer/en/, cut by tools/make-cheer.swift; their text is the
// script the recordings were made from.
const cheerClips = (id: CharacterId, phrases: string[], dir = "/characters/cheer"): CheerClip[] =>
  phrases.map((text, i) => ({
    src: `${dir}/${id}-${i + 1}.mov`,
    audio: `${dir}/${id}-${i + 1}.m4a`,
    text,
  }));
const EN = "/characters/cheer/en";

/** The clips (and so the voice) for the app's language. */
export function cheerClipsFor(info: CharacterInfo, lang: Lang): CheerClip[] {
  return lang === "en" && info.cheerClipsEn.length > 0 ? info.cheerClipsEn : info.cheerClips;
}

export function characterName(info: CharacterInfo, lang: Lang): string {
  return lang === "en" ? info.nameEn : info.name;
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
    cheerClips: cheerClips("alan", [
      "応援するよ", "がんばれー", "君ならできる", "ファイト",
      "応援してるからね", "最高だよ", "その調子", "ずっと応援してるよ",
    ]),
    nameEn: "Alan",
    cheerClipsEn: cheerClips("alan", [
      "Yeah!", "Let's go!", "Woo-hoo! You're the best!", "Come on, everybody, cheer with me!",
      "Yeah, we did it!", "Keep going!", "Hooray!", "You're all amazing!", "Yippee, what a victory!",
    ], EN),
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
    nameEn: "Leo",
    cheerClipsEn: cheerClips("leo", [
      "You can do it!", "I believe in you!", "Keep on going!", "You're doing great!",
      "Don't give up!", "You got this!", "I'm cheering for you!",
    ], EN),
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
    nameEn: "Izzy",
    cheerClipsEn: cheerClips("izzy", [
      "Yay!", "Let's cheer!", "Woo-hoo!", "You're awesome!", "Go for it!", "Hooray!", "Yeah!", "Keep it up!",
    ], EN),
  },
};

// Belts live in belt-store.ts. totalXp is no longer earned; it is kept so
// belt-store can carry an old XP belt over the first time it loads.
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
