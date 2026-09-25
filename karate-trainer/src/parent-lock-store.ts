// おうちの人のロック。家族タブ（購入・メンバー・プラン・LINE送信スイッチ）の
// 前に立つゲートの設定で、端末ごとに一つなのでメンバー別ではなく base に置く。
//
// なぜ暗証番号なのか: iOS には「いま画面の前にいるのが大人か」を判定する仕組みが
// ない。Family Sharing の親/子の役割もアプリからは見えず、Face ID / Touch ID が
// 答えるのは「この端末の持ち主か」まで。子ども自身の iPhone なら登録されている
// 顔も指紋も子どものものなので、生体認証だけでは親ゲートにならない。
// 「親が決めた、子どもが知らない秘密」だけが本当に親だけを通す。
//
// 生体認証は“親の端末だと親が宣言したときだけ”の近道として足す（owner）。
//
// 暗証番号はそのまま保存する。ここは暗号の話ではなく子どもよけで、脅威は
// 「画面の前の子ども」であって localStorage を読める相手ではない（読める相手は
// ハッシュにしても4桁なら総当たりで破れる）。
//
// 暗証番号を設定していない家庭は、今まで通りかけ算ゲートが立つ。

const KEY = "karate.parentLock";

// この iPhone はだれのもの？ 生体認証を近道にしていいかの判断に使う。
export type DeviceOwner = "parent" | "child";

export interface ParentLock {
  // 親が決めた暗証番号（未設定なら null）。設定されていればかけ算の代わりに聞く。
  pin: string | null;
  // 端末の持ち主。未回答なら null（＝生体認証は出さない）。
  owner: DeviceOwner | null;
  // Face ID / Touch ID の近道を使う。owner === "parent" のときだけ有効。
  biometrics: boolean;
}

const EMPTY: ParentLock = { pin: null, owner: null, biometrics: false };

export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;

// 全角数字（日本語 IME）と前後の空白を受ける。
export function normalizePin(input: string): string {
  return input
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
}

// 入力が暗証番号として使えるか（4〜8桁の数字）。ダメな理由を返す。
export function pinProblem(input: string): string | null {
  const pin = normalizePin(input);
  if (!/^\d+$/.test(pin)) return "数字だけで入れてください";
  if (pin.length < PIN_MIN_LEN || pin.length > PIN_MAX_LEN) {
    return `${PIN_MIN_LEN}〜${PIN_MAX_LEN}桁で決めてください`;
  }
  return null;
}

export function getParentLock(storage: Storage = localStorage): ParentLock {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<ParentLock>;
    const pin = typeof v.pin === "string" && /^\d+$/.test(v.pin) ? v.pin : null;
    const owner = v.owner === "parent" || v.owner === "child" ? v.owner : null;
    return {
      pin,
      owner,
      // 近道は暗証番号と「親の端末」の両方がそろって初めて立つ。
      biometrics: v.biometrics === true && pin !== null && owner === "parent",
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(value: ParentLock, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

// 暗証番号を決める / 変える。null で消す（＝かけ算ゲートに戻る）。
// 使えない番号なら理由を返して何もしない。
export function setParentPin(pin: string | null, storage: Storage = localStorage): string | null {
  const cur = getParentLock(storage);
  if (pin === null) {
    // 暗証番号がなくなれば近道も成り立たない。
    save({ ...cur, pin: null, biometrics: false }, storage);
    return null;
  }
  const problem = pinProblem(pin);
  if (problem) return problem;
  save({ ...cur, pin: normalizePin(pin) }, storage);
  return null;
}

export function setDeviceOwner(owner: DeviceOwner, storage: Storage = localStorage): void {
  const cur = getParentLock(storage);
  // 子どもの端末だと答えたら、近道はその場で下ろす。
  save({ ...cur, owner, biometrics: owner === "parent" && cur.biometrics }, storage);
}

export function setParentBiometrics(on: boolean, storage: Storage = localStorage): void {
  const cur = getParentLock(storage);
  if (on && (cur.pin === null || cur.owner !== "parent")) return;
  save({ ...cur, biometrics: on }, storage);
}

export function checkPin(input: string, storage: Storage = localStorage): boolean {
  const pin = getParentLock(storage).pin;
  return pin !== null && normalizePin(input) === pin;
}
