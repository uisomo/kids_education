// アランの シリーズの 課金（正本）。プラン・お店の 設定・RevenueCat・アプリを またぐ スイート。SERIES_GUIDE 5.8・5.8b。
//
// ここを 変えたら：
//   node packages/billing/gen-setup.mjs   → REVENUECAT.md・revenuecat-setup.json を 作りなおす
//   python3 brand/sync_brand.py           → アプリへ コピー（アプリの コピーは 手で 直さない）
//   node packages/billing/test.mjs        → テスト
//
// しくみ（くわしくは packages/billing/README.md）：
//   - RevenueCat は シリーズで 1つの プロジェクト。アプリは その中の iOS アプリ
//   - どの アプリも おなじ App User ID（キーチェーンの 共有：AlanSharedAccount.swift）で RevenueCat に つなぐ
//     → 1つの アプリで スイートを 買うと、ほかの アプリでも entitlement `alan_suite` が 見える
//   - プレミアム・ファミリーは その アプリだけ（商品IDの 前ぶんで 見わける。ほかの アプリの ものは 数えない）

/** プラン。ならびは 下から 上（rank）。 */
export const PLAN_ORDER = ["free", "premium", "family", "suite"];

/** プランごとの なまえ・人数・ねだん（お店から 読めない ときの 表示。App Store Connect と あわせる）。 */
export const PLANS = {
  free:    { label: "フリー",           members: 1, rank: 0, monthly: null,     yearly: null },
  premium: { label: "プレミアム",       members: 1, rank: 1, monthly: "¥1,000", yearly: "¥10,000" },
  family:  { label: "ファミリー",       members: 5, rank: 2, monthly: "¥1,500", yearly: "¥15,000" },
  // ✅ ¥5,000/月（2026-09-28 uk）。🟡 年額 ¥50,000 は ほかの プランと おなじ 10か月ぶん（uk の 確認まち）
  suite:   { label: "アランのスイート", members: 5, rank: 3, monthly: "¥5,000", yearly: "¥50,000" },
};

/** 無料の おためし（はじめての 人だけ。Apple が サブスクの グループごとに 1回 きめる）。
 *  🟡 すべての 有料プランに 1週間（はじめて ひらいた 日から 売れる ように）。tools/asc-trial.py と あわせる */
export const TRIAL = { period: "P1W", label: "1週間" };

/** スイートの ひとこと（プランの カードに 出す）。 */
export const SUITE_PITCH = "いちばん おとく";

/** スイートの entitlement（RevenueCat。シリーズで 1つ）。 */
export const SUITE_ENTITLEMENT = "alan_suite";

/** シリーズの アプリ。key は 商品IDと 保存キーの 前ぶん。
 *  prefix：お店の 商品IDの 前ぶん（App Store Connect の 商品IDは Apple アカウントで 1つだけ なので アプリごとに かえる）。
 *          空手だけ むかしから 前ぶん なし（premium_monthly）。スイートは どの アプリも `<key>_suite_<period>`
 *  sells：この アプリで 売る プラン（スイートは どの アプリでも 売る）
 *  brand：アプリの 色（SERIES_GUIDE 5.2f）
 *  released：App Store に 出ている（スイートの カードの「〇つ」「べつべつだと ¥」は 出ている アプリだけで 数える。
 *            まだ 出ていない アプリを 数えると 宣伝が うそに なる ＝ 審査 3.1.2）。出したら true に */
export const APPS = {
  karate:  { name: "アランの空手",     bundleId: "com.alan.karate",       prefix: "",         brand: "#ffd166", sells: ["premium", "family", "suite"], released: false },
  piano:   { name: "アランのピアノ",   bundleId: "com.alan.piano",        prefix: "piano_",   brand: "#ff7aa8", sells: ["premium", "family", "suite"], released: false },
  kimochi: { name: "アランのきもち",   bundleId: "com.alan.kimochi",      prefix: "kimochi_", brand: "#e5243b", sells: ["premium", "family", "suite"], released: false },
  okane:   { name: "アランのおかね",   bundleId: "com.alan.okane",        prefix: "okane_",   brand: "#58cc02", sells: ["premium", "family", "suite"], released: false },
  eigo:    { name: "アランの英語",     bundleId: "com.alan.eigo",         prefix: "eigo_",    brand: "#14a89c", sells: ["premium", "family", "suite"], released: false },
  voice:   { name: "アランのボイス",   bundleId: "com.alan.voice",        prefix: "voice_",   brand: "#ff8a3d", sells: ["premium", "family", "suite"], released: false },
  dotoku:  { name: "アランの道徳",     bundleId: "com.alan.dotoku",       prefix: "dotoku_",  brand: "#6c4ee0", sells: ["premium", "family", "suite"], released: false },
  kioku:   { name: "アランの記憶",     bundleId: "com.alan.kioku",        prefix: "kioku_",   brand: "#b04fd6", sells: ["premium", "family", "suite"], released: false },
  kaiketsu: { name: "アランの解決",    bundleId: "com.alan.kaiketsu",     prefix: "kaiketsu_", brand: "#1fad42", sells: ["premium", "family", "suite"], released: false },
  debate:  { name: "アランのディベート", bundleId: "com.alan.debate",     prefix: "debate_",  brand: "#d345bc", sells: ["premium", "family", "suite"], released: false },
  // ことばクラッシュは まだ 子どもごとに 分けていない（5.12 ⬜）→ ファミリーは 分けてから
  kotoba:  { name: "ことばクラッシュ", bundleId: "com.uk.kotobacrash",    prefix: "kotoba_",  brand: "#3f8fd6", sells: ["premium", "suite"], released: false },
};

export const PERIODS = ["monthly", "yearly"];

// ---------- プランの はしご（SERIES_GUIDE 5.8c） ----------
// フリーは「毎日 かえってくる」ため、有料は「もっと・みんなで・ぜんぶの アプリで」。
//   フリー     子ども 1人・1日1回・はじめの お題だけ。ろくが・ほぞん・ごほうび・つづけた日は ぜんぶ つかえる
//   プレミアム 1日 なんかいでも・ぜんぶの お題・きろく
//   ファミリー プレミアムを 子ども 5人まで（ひとりずつ きろく）
//   スイート   ファミリーを アランの アプリ ぜんぶで（あたらしい アプリも）
// お題の 数など アプリごとの 行は アプリが わたす（content）。

/**
 * プランの カードに ならべる 行。
 *   content.free  フリーで つかえる もの（例：["10この お題"]）
 *   content.paid  有料で ふえる もの（例：["ぜんぶの お題（60）", "くわしい きろく"]）
 *   content.daily false なら「1日1回」の 行を 出さない（回数で なく 数で かぎる アプリ：空手の メニュー）
 *   content.recording false なら「ろくが・ほぞん OK」を 出さない（まだ 録画の ない アプリ）
 */
export function planFeatures(app, plan, content = {}) {
  const free = content.free ?? ["はじめの お題"];
  const paid = content.paid ?? ["ぜんぶの お題"];
  const n = PLANS.family.members;
  switch (plan) {
    case "free": return ["子ども 1人", ...(content.daily === false ? [] : ["1日1回"]), ...free, ...(content.recording === false ? [] : ["ろくが・ほぞん OK"])];
    case "premium": return ["子ども 1人", ...(content.daily === false ? [] : ["1日 なんかいでも"]), ...paid];
    case "family": return [`子ども ${n}人まで`, "ひとりずつ プレミアムと おなじ"];
    case "suite": {
      const k = releasedApps().length;
      return [k >= 2 ? `アランの アプリ ${k}つ ぜんぶ` : "アランの アプリ ぜんぶ", `家族 ${n}人まで`];
    }
    default: return [];
  }
}

/** App Store に 出ている アプリ。 */
export const releasedApps = () => Object.keys(APPS).filter((k) => APPS[k].released);

/** スイートの おとくさ：「ぜんぶ べつべつだと ¥4,500/月」。出ている アプリで スイートより 高く なる ときだけ（ほかは ""）。
 *  ファミリーを 売らない アプリは 数えない（おなじ 5人で くらべる）。 */
export function suiteSaving() {
  const yen = (s) => Number(String(s).replace(/[^0-9]/g, ""));
  const each = releasedApps().filter((k) => APPS[k].sells.includes("family")).reduce((sum) => sum + yen(PLANS.family.monthly), 0);
  if (each <= yen(PLANS.suite.monthly)) return "";
  return `ぜんぶ べつべつだと ¥${each.toLocaleString("ja-JP")}/月`;
}

/** つぎの プランへの ひとこと（カードの 上・上限に あたった とき）。plan = いまの プラン。noun = アプリの お題の よびかた（まよい・おはなし）。
 *  opts.daily false：1日の 回数で かぎらない アプリ（空手）。 */
export function upgradeHint(app, plan, noun = "お題", opts = {}) {
  const sells = APPS[app].sells;
  if (plan === "free") {
    if (!sells.includes("premium")) return "";
    return opts.daily === false ? `もっと たくさんの ${noun}に` : `1日 なんかいでも・ぜんぶの ${noun}に`;
  }
  if (plan === "premium" && sells.includes("family")) return "あと ¥500/月で きょうだいも（5人まで）";
  if (plan === "premium" || plan === "family") {
    const saving = suiteSaving();
    return `アランの アプリ ぜんぶなら スイート${saving ? `（${saving}）` : ""}`;
  }
  return "";
}

/** アプリの中の 商品の 名前（premium_monthly など）。RevenueCat の offering の package の 名前も これ。 */
export const productId = (plan, period) => `${plan}_${period}`;

/** お店の 商品ID。karate の スイートは karate_suite_monthly（前ぶん なしの suite_monthly に しない）。 */
export function storeProductId(app, plan, period) {
  if (plan === "suite") return `${app}_suite_${period}`;
  return `${APPS[app].prefix}${plan}_${period}`;
}

/** その アプリの entitlement（プレミアム・ファミリー）。スイートは SUITE_ENTITLEMENT。 */
export const appEntitlement = (app) => `${app}_pro`;

const SUITE_RE = /^([a-z]+)_suite_(monthly|yearly)$/;

/** お店の 商品ID → { app, plan, period }。シリーズの ものでなければ null。
 *  前ぶんが ぴったりの ものだけ（kimochi の 中で 空手の premium_monthly を きもちの ものと まちがえない）。 */
export function parseStoreId(storeId) {
  const s = SUITE_RE.exec(storeId);
  if (s && APPS[s[1]]) return { app: s[1], plan: "suite", period: s[2] };
  // 前ぶんの ながい アプリから（空手の "" は さいご）
  const apps = Object.entries(APPS).sort((a, b) => b[1].prefix.length - a[1].prefix.length);
  for (const [app, cfg] of apps) {
    if (!storeId.startsWith(cfg.prefix)) continue;
    const m = /^(premium|family)_(monthly|yearly)$/.exec(storeId.slice(cfg.prefix.length));
    if (m) return { app, plan: m[1], period: m[2] };
  }
  return null;
}

/** この アプリの 中の 商品の 名前（premium_monthly … suite_yearly）。売らない プランは 入れない。 */
export const productIdsFor = (app) =>
  APPS[app].sells.flatMap((plan) => PERIODS.map((period) => productId(plan, period)));

/** お店から 値段が 読めない ときの 表示。 */
export function fallbackPrice(id) {
  const [plan, period] = id.split("_");
  return PLANS[plan]?.[period] ?? null;
}

export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/** 「2026/10/15 に自動更新」／「2026/10/15 まで（自動更新オフ）」。フリーは ""。 */
export function renewalText(info) {
  if (!info || info.plan === "free" || !info.expiresAt) return "";
  const d = new Date(info.expiresAt);
  if (Number.isNaN(d.getTime())) return "";
  const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return info.willRenew ? `${date} に自動更新` : `${date} まで（自動更新オフ）`;
}

/** お店の おためし期間（"WEEK", 1）→「1週間」。 */
export function trialLength(unit, count) {
  const n = Math.max(1, count);
  switch (unit) {
    case "DAY": return n % 7 === 0 ? `${n / 7}週間` : `${n}日間`;
    case "WEEK": return `${n}週間`;
    case "MONTH": return `${n}か月`;
    case "YEAR": return `${n}年`;
    default: return "";
  }
}

// ---------- アプリの 中 ----------

/**
 * アプリの 課金を つくる。
 *   app       APPS の key（"kimochi" など）
 *   apiKey    RevenueCat の 公開キー（appl_… 本番 / test_… Test Store）。"" なら 売らない（未設定）。iPhone の 中 でなければ つかわない
 *   testBuild テスト版：お店に つながず、プランは スイート（ぜんぶ ためせる）
 *   loadSdk   RevenueCat の Purchases を かえす（Vite：() => import("@revenuecat/purchases-capacitor").then(m => m.Purchases)）
 *             わたさなければ window.Capacitor の プラグイン（バンドラーの ない おかね）
 *   aliases   お店の 商品ID → アプリの中の 名前（空手の RevenueCat Test Store の monthly など）
 *   planKey   さいごに わかった プランを おぼえる 保存キー（家族で 1つ。頭に m:<id>: を つけない）
 */
export function createSeriesBilling({ app, apiKey = "", testBuild = false, loadSdk, aliases = {}, planKey = `${app}.plan` }) {
  if (!APPS[app]) throw new Error(`unknown app: ${app}`);
  const ids = productIdsFor(app);
  const sells = PLAN_ORDER.filter((p) => p === "free" || APPS[app].sells.includes(p));

  // ---- プランの キャッシュ（オフラインでも 制限は そのまま） ----
  const planListeners = new Set();
  const isPlan = (v) => PLAN_ORDER.includes(v);
  const loadPlan = () => {
    let saved = null;
    try { saved = localStorage.getItem(planKey); } catch { /* ignore */ }
    if (isPlan(saved)) return saved;
    return testBuild ? "suite" : "free";
  };
  const setPlan = (plan) => {
    try { localStorage.setItem(planKey, plan); } catch { /* ignore */ }
    planListeners.forEach((fn) => fn(plan));
  };

  /** お店の 商品ID → アプリの中の 名前。この アプリの もの と、どの アプリの スイート。 */
  const toProductId = (storeId) => {
    if (aliases[storeId]) return aliases[storeId];
    const p = parseStoreId(storeId);
    if (!p) return null;
    if (p.plan === "suite" || p.app === app) return productId(p.plan, p.period);
    return null;
  };

  /** RevenueCat の CustomerInfo → いちばん上の プラン。
   *  スイート（entitlement alan_suite か、どこかの アプリの *_suite_*）＞ この アプリの ファミリー ＞ プレミアム。
   *  ほかの アプリの プレミアム・ファミリーは 数えない。 */
  const infoFromCustomer = (customer) => {
    let best = { plan: "free", productId: null, expiresAt: null, willRenew: false, fromApp: null };
    const active = Object.entries(customer?.entitlements?.active ?? {});
    // entitlement が 1つも ない ＝ フリー（activeSubscriptions だけでは 数えない。むかしの 空手と おなじ）
    if (!active.length) return best;
    const offer = (plan, rest) => { if (PLANS[plan].rank > PLANS[best.plan].rank) best = { plan, ...rest }; };
    const fromOf = (storeId) => parseStoreId(storeId)?.app ?? app;

    const storeIds = new Set([...(customer?.activeSubscriptions ?? []), ...active.map(([, e]) => e.productIdentifier)]);
    for (const storeId of storeIds) {
      const id = toProductId(storeId);
      if (!id) continue;
      const ent = active.find(([, e]) => e.productIdentifier === storeId)?.[1];
      const sub = customer.subscriptionsByProductIdentifier?.[storeId];
      offer(id.split("_")[0], {
        productId: id,
        expiresAt: sub?.expiresDate ?? ent?.expirationDate ?? null,
        willRenew: ent ? ent.willRenew : !!sub && sub.unsubscribeDetectedAt == null && sub.billingIssuesDetectedAt == null,
        fromApp: fromOf(storeId),
      });
    }
    for (const [name, ent] of active) {
      const id = toProductId(ent.productIdentifier);
      let plan = id ? id.split("_")[0] : null;
      if (name === SUITE_ENTITLEMENT) plan = "suite";
      // むかしの 1アプリだけの プロジェクト（entitlement premium / family）。ほかの アプリの 商品なら 数えない
      else if (!plan && !parseStoreId(ent.productIdentifier) && (name === "premium" || name === "family")) plan = name;
      if (!plan) continue;
      offer(plan, {
        productId: id ?? ent.productIdentifier,
        expiresAt: ent.expirationDate ?? null,
        willRenew: !!ent.willRenew,
        fromApp: fromOf(ent.productIdentifier),
      });
    }
    return best;
  };

  // iPhone の アプリの 中 だけ（ブラウザ・テストでは キーが あっても お店に つながない）
  const native = !!globalThis.Capacitor?.isNativePlatform?.();
  // スイートを どの アプリで 買ったか も おぼえる（オフライン・お店の 返事の 前でも「〇〇で 入っています」に して 2重に 買わせない）
  const fromKey = `${planKey}.from`;
  const remember = (info) => {
    try { localStorage.setItem(fromKey, info.plan === "suite" && info.fromApp ? info.fromApp : ""); } catch { /* ignore */ }
    return info;
  };
  /** スイートを ほかの アプリで 買って いる とき その アプリ（APPS の key）。ほかは null。 */
  const suiteFrom = () => {
    if (loadPlan() !== "suite") return null;
    let from = null;
    try { from = localStorage.getItem(fromKey); } catch { /* ignore */ }
    return from && from !== app && APPS[from] ? from : null;
  };

  const billing = apiKey && !testBuild && native
    ? revenueCat({ app, apiKey, loadSdk, ids, toProductId, infoFromCustomer: (c) => remember(infoFromCustomer(c)), suiteFrom, isFree: () => loadPlan() === "free" })
    : null;

  return {
    app,
    appName: APPS[app].name,
    sells,
    productIds: ids,
    loadPlan,
    setPlan,
    /** プレミアムの きのうが つかえるか（ファミリー・スイートも ふくむ）。 */
    isPaid: () => loadPlan() !== "free",
    onPlanChange: (fn) => { planListeners.add(fn); return () => planListeners.delete(fn); },
    /** プランで つかえる 子どもの 数。こえた 子は けさずに 🔒。 */
    members: (plan = loadPlan()) => PLANS[plan].members,
    toProductId,
    infoFromCustomer,
    suiteFrom,
    billing,
  };
}

/** ほかの アランの アプリと おなじ App User ID（キーチェーンの 共有。AlanSuitePlugin.swift）。
 *  プラグインが ない（ブラウザ・古い ビルド・entitlement なし）ときは null → RevenueCat の 匿名 ID。 */
export async function sharedUserId() {
  try {
    const cap = globalThis.Capacitor;
    if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.("AlanSuite")) return null;
    const plugin = cap.registerPlugin("AlanSuite");
    const { id } = await plugin.sharedUserId();
    return typeof id === "string" && id ? id : null;
  } catch { return null; }
}

function errorCode(e) {
  return e && typeof e === "object" && "code" in e ? String(e.code) : "";
}

export function openExternal(url) {
  // Capacitor は target=_blank を iOS に わたす（App Store の サブスクの ページ か Safari）
  window.open(url, "_blank");
}

function revenueCat({ app, apiKey, loadSdk, ids, toProductId, infoFromCustomer, suiteFrom, isFree }) {
  const load = loadSdk ?? (async () => globalThis.Capacitor.registerPlugin("Purchases"));
  let sdkPromise = null;
  const sdk = () => {
    sdkPromise ??= (async () => {
      const Purchases = await load();
      if (apiKey.startsWith("test_")) await Purchases.setLogLevel({ level: "DEBUG" }).catch(() => {});
      const appUserID = await sharedUserId();
      await Purchases.configure(appUserID ? { apiKey, appUserID } : { apiKey });
      // はじめて 共有の ID に した とき 1回：この アプリで 買った ものを その ID へ（匿名の ころの 購入を なくさない）。
      // しっぱい（オフライン など）したら しるしを つけず、つぎに ひらいた とき もう一度
      if (appUserID) {
        const key = `alan.suite.synced.${app}`;
        let done = null;
        try { done = localStorage.getItem(key); } catch { /* ignore */ }
        if (done !== appUserID) {
          try {
            await Purchases.syncPurchases();
            try { localStorage.setItem(key, appUserID); } catch { /* ignore */ }
          } catch { /* つぎに */ }
        }
      }
      return Purchases;
    })().catch((e) => { sdkPromise = null; throw e; }); // つぎの よびだしで やりなおす
    return sdkPromise;
  };

  let packages = null;
  const loadPackages = async () => {
    const Purchases = await sdk();
    const offerings = await Purchases.getOfferings();
    const map = new Map();
    for (const pkg of offerings.current?.availablePackages ?? []) {
      // package の 名前（premium_monthly …）が 正本。なければ 商品IDから
      const id = ids.includes(pkg.identifier) ? pkg.identifier : toProductId(pkg.product.identifier);
      if (id && ids.includes(id)) map.set(id, pkg);
    }
    packages = map;
    return map;
  };

  const listeners = [];
  let listening = false;
  const listen = async () => {
    if (listening) return;
    listening = true;
    try {
      const Purchases = await sdk();
      await Purchases.addCustomerInfoUpdateListener((c) => {
        const info = infoFromCustomer(c);
        listeners.forEach((fn) => fn(info));
      });
    } catch { listening = false; }
  };

  return {
    async refresh() {
      try { return infoFromCustomer((await (await sdk()).getCustomerInfo()).customerInfo); }
      catch { return null; }
    },
    async prices() {
      const out = {};
      try {
        const map = await loadPackages();
        for (const id of ids) { const p = map.get(id); if (p) out[id] = p.product.priceString; }
      } catch { /* オフライン・未設定 */ }
      return out;
    },
    // 無料の おためし。Apple が「この 人は もらえる」と 言った 商品だけ（もらえない 人に「1週間 無料」と 出すと うそ）。
    // フリーの ときだけ（有料プランの 人は おなじ グループで もう つかっている）
    async trials() {
      const out = {};
      if (!isFree()) return out;
      try {
        const map = await loadPackages();
        const Purchases = await sdk();
        const withIntro = ids.filter((id) => { const i = map.get(id)?.product.introPrice; return i && i.price === 0; });
        if (!withIntro.length) return out;
        const storeIds = withIntro.map((id) => map.get(id).product.identifier);
        const elig = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: storeIds });
        for (const id of withIntro) {
          const p = map.get(id).product;
          const st = elig?.[p.identifier]?.status;
          if (st !== 2 && st !== "INTRO_ELIGIBILITY_STATUS_ELIGIBLE") continue; // 2 = ELIGIBLE
          const intro = p.introPrice;
          const len = trialLength(intro.periodUnit, intro.periodNumberOfUnits * Math.max(1, intro.cycles));
          if (len) out[id] = len;
        }
      } catch { /* オフライン・わからない → 出さない */ }
      return out;
    },
    async purchase(id) {
      const from = suiteFrom();
      if (from) return { status: "error", message: `${APPS[from].name}で スイートに 入っています（ここで 買う ひつようは ありません）` };
      try {
        const map = packages?.has(id) ? packages : await loadPackages();
        const pkg = map.get(id);
        if (!pkg) return { status: "error", message: "いまは購入できません" };
        const Purchases = await sdk();
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
        return { status: "purchased", info: infoFromCustomer(customerInfo) };
      } catch (e) {
        const code = errorCode(e);
        if (code === "1") return { status: "cancelled" };
        if (code === "20") return { status: "pending" }; // 承認と購入のリクエスト（ファミリー共有）待ち
        return { status: "error", message: e instanceof Error ? e.message : String(e) };
      }
    },
    async restore() {
      try { return infoFromCustomer((await (await sdk()).restorePurchases()).customerInfo); }
      catch { return null; }
    },
    async manage() {
      let url = MANAGE_URL;
      try { url = (await (await sdk()).getCustomerInfo()).customerInfo.managementURL ?? MANAGE_URL; }
      catch { /* Apple の ページへ */ }
      openExternal(url);
    },
    onChange(cb) {
      listeners.push(cb);
      void listen();
    },
  };
}
