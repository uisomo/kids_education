// いま つけている ✨キラキラ（そうび）と、稽古中に画面へ出すかどうか。
//
// **キラキラは1つだけ。** アイテムタブで選んだものが、
//   - 稽古のあいだ 画面に出て、
//   - 保存した動画にも 同じものが入る。
// 「稽古中のキラキラ」と「動画のキラキラ」が別々にあると、どっちが出るのか
// 誰にも分からなくなる（実際そうなっていた）。
//
// つけているキラキラは **人ごと**（集めるものなので、きょうだいで別）。
// 稽古中に画面へ出すかどうかは **家じゅう共通**（カメラと電池のはなしで、
// 集めものとは関係がない）。

const KEY = "karate.equippedSparkle";
/// 旧: 家じゅう共通の「稽古中のキラキラ」。人ごとの置き場所に引っ越す。
const OLD_KEY = "karate.liveEffects";
const LIVE_KEY = "karate.liveOn";

/// つけているキラキラの id。何もつけていなければ ""。
/// `household` を渡すと、まだ引っ越していない古い設定を1回だけ拾う。
export function loadEquippedSparkle(storage: Storage = localStorage, household?: Storage): string {
  try {
    const mine = storage.getItem(KEY);
    if (mine !== null) return mine;
    const old = household?.getItem(OLD_KEY) ?? null;
    return old ?? "";
  } catch {
    return "";
  }
}

export function setEquippedSparkle(presetId: string, storage: Storage = localStorage): void {
  try {
    // "" も保存する（「わざと外した」と「まだ選んでいない」を分けるため。
    // 外したのに 古い設定が生き返ると、消したはずのキラキラが動画に入る）。
    storage.setItem(KEY, presetId);
  } catch {
    /* ignore storage errors */
  }
}

/// 稽古のあいだ、画面にもキラキラを出すか。既定はオン
/// （つけたキラキラは 稽古中にも見えるもの、という約束）。
/// 重いと感じた親は 家族タブでオフにできる。動画のほうは変わらない。
export function loadLiveOn(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(LIVE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setLiveOn(on: boolean, storage: Storage = localStorage): void {
  try {
    storage.setItem(LIVE_KEY, on ? "1" : "0");
  } catch {
    /* ignore storage errors */
  }
}
