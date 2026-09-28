// おへや・かめん（SERIES_GUIDE 5.16）の 設定。
// 正本は アランの基盤/packages/family/src/privacy.ts。アプリへは brand/sync_brand.py で コピー（アプリの 中の コピーは 手で 直さない）。
//
// - 子どもの 好み：`m:<id>:<アプリ名>.privacy`（ホームで 子どもが きりかえる）
// - おうちの人：`<アプリ名>.privacy.parent`（家族で 1つ。家族タブ＝ゲートの 奥）。
//   "child"（まかせる）以外に したら、子どもの 好みを 上書きし、ホームの トグルは さわれない
// - ネイティブへは `resolvePrivacy()` の 結果（使う 値）だけを わたす。録画を はじめた ときの 値で 書き出す

export type PrivacyMask = "alan" | "leo" | "izzy";
export type ParentChoice = "child" | "on" | "off";

export interface PrivacySettings {
  /** おへや：人の ほかを 背景の 絵に */
  room: boolean;
  /** かめん：顔 ぜんぶに キャラの かめん（口だけ 見えると 仮面舞踏会に なるので ぜんぶ） */
  face: boolean;
  mask: PrivacyMask;
}

export interface PrivacyParent {
  room: ParentChoice;
  face: ParentChoice;
}

export const PRIVACY_MASKS: { id: PrivacyMask; name: string }[] = [
  { id: "alan", name: "アラン" },
  { id: "leo", name: "レオ" },
  { id: "izzy", name: "イジー" },
];

export const PARENT_CHOICES: { id: ParentChoice; name: string }[] = [
  { id: "child", name: "まかせる" },
  { id: "on", name: "いつも オン" },
  { id: "off", name: "いつも オフ" },
];

const OFF: PrivacySettings = { room: false, face: false, mask: "alan" };
const CHILD: PrivacyParent = { room: "child", face: "child" };

function read<T>(storage: Storage, key: string): Partial<T> | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

const isMask = (v: unknown): v is PrivacyMask => PRIVACY_MASKS.some((m) => m.id === v);
const isChoice = (v: unknown): v is ParentChoice => PARENT_CHOICES.some((c) => c.id === v);

/** 子どもの 好み（`memberStorage()` を わたす）。はじめは ぜんぶ オフ */
export function loadChildPrivacy(app: string, member: Storage): PrivacySettings {
  const s = read<PrivacySettings>(member, `${app}.privacy`);
  return {
    room: s?.room === true,
    face: s?.face === true,
    mask: isMask(s?.mask) ? s.mask : OFF.mask,
  };
}

export function saveChildPrivacy(app: string, settings: PrivacySettings, member: Storage): void {
  write(member, `${app}.privacy`, settings);
}

/** おうちの人の 設定（家族で 1つ。頭に 何も つけない storage を わたす）。はじめは まかせる */
export function loadParentPrivacy(app: string, household: Storage): PrivacyParent {
  const p = read<PrivacyParent>(household, `${app}.privacy.parent`);
  return {
    room: isChoice(p?.room) ? p.room : CHILD.room,
    face: isChoice(p?.face) ? p.face : CHILD.face,
  };
}

export function saveParentPrivacy(app: string, parent: PrivacyParent, household: Storage): void {
  write(household, `${app}.privacy.parent`, parent);
}

/** 使う 値 = おうちの人が まかせるなら 子どもの 好み、それ以外は おうちの人の 値 */
export function resolvePrivacy(child: PrivacySettings, parent: PrivacyParent): PrivacySettings {
  const pick = (p: ParentChoice, c: boolean) => (p === "child" ? c : p === "on");
  return { room: pick(parent.room, child.room), face: pick(parent.face, child.face), mask: child.mask };
}

/** おうちの人が きめていて、子どもが さわれない もの */
export function privacyLocks(parent: PrivacyParent): { room: boolean; face: boolean } {
  return { room: parent.room !== "child", face: parent.face !== "child" };
}
