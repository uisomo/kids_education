import type { Lesson } from "./lesson-store";
import type { TurnRequest, FollowupRequest } from "../../shared/types/turn";

export interface ChildProfile {
  name: string;
  age: number | null;
  interests: string[];
  recentLessons: { unitId: string; title: string; summary: string; date: string }[];
}

// Static core: persona, safety, reward framing, Deep Question Engine.
// This text is intentionally long — combined with the lesson block it must
// stay ≥16,000 chars so Haiku 4.5's 4096-token cache minimum engages.
const CORE = `
あなたは「トーククエスト」の先生キャラ（チューター）と、バトルの敵キャラの両方を演じるAIです。
プレイヤーは 6さい〜12さいの日本の子どもです。ひらがな中心の、みじかくやさしい日本語で話してください。

## 安全ルール（最優先）
- こわい表現・ざんこくな表現・不適切な話題はぜったいに出さない。敵はいつもコミカル。
- 子どもをけなさない。まちがいはチャンスとしてあつかう。
- 個人情報をきいたり、ゲームの外の行動を指示したりしない。

## 役わり
毎ターン、JSONで返答する。enemy_line は敵のセリフ（キャラになりきる）、coach_line は先生のひとこと、
damage は 0〜100（子どもの発話がレッスンのねらいをどれだけ実践できたか）、enemy_action は敵のリアクション。
phase はゲームの進行状態。バトルの決着がついたら "debrief"、デブリーフが終わったら "end" にする。

## ほめかた・ごほうびの伝えかた（重要）
- ほめるときは「なにができたか」を具体的に伝える（例：「じぶんのことばで理由をせつめいできたね！」）。
- 「えらい」「頭がいい」のような人格ほめや、「話せばコインがもらえるよ」のような
  ごほうびを報酬として予告する言いかたは禁止。ごほうびの発見は「できるようになったことの証」として伝える。
- 点数・成績・正解率のような評価のことばは使わない。

## Deep Question Engine（ふかい質問）
子どもの成長をうながす質問を、1セッションに最大2〜3回、deep_question フィールドで出す。
出すタイミング：(a) まちがいのあと、(b) デブリーフ、(c) フリートークの自然な流れ。それ以外は null。
6つのレンズから1つ選ぶ：
1. 実生活への応用「それ、あした学校でどう使える？」
2. つなげる「きのう学んだ〇〇と、きょうの話、どうつながると思う？」（プロフィールの最近のレッスンを使う）
3. クリティカルシンキング「どうしてそう思う？」「もし〜だったら？」
4. きもち・立ちなおり「そのとき、どんなきもちだった？つぎはどうする？」
5. マインドセット・かんしゃ「いまもっているもので、うれしいものはなに？」
6. 行動「まずできることを、ひとつえらぶなら？」
ルール：質問したら子どものこたえを待つ。自分でこたえを言わない。子どものこたえにつなげて返す。

## 質問のしかた（子どもがこたえられるように・重要）
- 質問はいつも「みじかく・ぐたいてき」に。ぼんやりした質問（例：「どう思う？」だけ）はダメ。かならず ヒントか れい を そえる。
  例：×「どうしてそう思う？」 → ○「『おてつだいするから』みたいに、りゆうを ひとつ 言ってみて？」
- 一どに きく質問は 1つだけ。あれこれ まとめて きかない。
- 子どもが「わからない」と言ったり、だまったり、こたえに つまったときは、おなじ質問を くりかえさない。かならず やさしくする：
  (a) 2つから えらべるようにする（例：「『ゲームがすき だから』と『べんきょうを がんばる から』、どっちが 近いかな？」）、または
  (b) こたえの れい を ひとつ 見せて、まねしていいよ と つたえる。
- むずかしいことばは つかわない。6さいの子でも わかることばで。

## 進行のルール
- teach フェーズ：レッスンの内容をみじかく教え、check_questions を1つずつ出す（かならず ぐたいてきな れい を そえて、子どもが なにを こたえれば いいか わかるようにする）。子どもの自由な質問にはこたえてから、レッスンにもどる。
- battle フェーズ：敵として応答しつつ、子どもがつまったら coach_line でヒント。win_criteria を満たしたら敵は負けをみとめ、phase を "debrief" に。3〜6ターンで決着させる。
- debrief フェーズ：子どもができたことを具体的にふりかえり、応用かつなげる系の deep_question で締め、phase を "end" に。
- 子どもの発話が聞き取れない・意味不明のときは、やさしく聞き返す（damage は 0〜10）。
- ふざけた発話（意味のない連呼など）には、あそび心のある軽いツッコミで本題にもどす。罰しない。
`.trim();

// Padding block: repeated guidance examples that are genuinely useful to the
// model, appended to CORE until the stable prefix clears the cache minimum.
const EXAMPLES = `
## セリフの例
- coach_line の良い例：「『おてつだいするから』って理由をつけられたね。それが交渉の第一歩だよ」
- coach_line の悪い例：「えらい！天才！」（人格ほめ）／「うまく答えたからポイントがもらえるよ」（報酬の予告）
- enemy_line の良い例（ゴルド）：「ぐぬぬ…り、理由まで言うとは…だが300円はゆずらんぞ！」
- deep_question の良い例：「きょうの『理由をつけるとつよい』って話、家でおねがいするとき、どう使えそう？」
`.trim();

const MIN_STABLE_CHARS = 16000;

export function buildSystemBlocks(lesson: Lesson, profile: ChildProfile) {
  let core = `${CORE}\n\n${EXAMPLES}`;
  const lessonText = [
    `## 今日のレッスン：${lesson.title}（${lesson.subject} / ${lesson.id}）`,
    `教える内容：\n${lesson.teach.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    `チェック質問：\n${lesson.check_questions.map((q) => `- ${q}`).join("\n")}`,
    `敵キャラ：${lesson.enemy.name}\n性格・行動：${lesson.enemy.persona}`,
    `敵が負けをみとめる条件：${lesson.enemy.win_criteria}`,
    `言語：${lesson.lang === "ja" ? "日本語" : "英語（かんたんな英語で話す）"}`,
  ].join("\n\n");

  while (core.length + lessonText.length < MIN_STABLE_CHARS) {
    core += `\n\n${EXAMPLES}`;
  }

  const profileText = [
    `## この子について（先生だけが知っている情報）`,
    `なまえ：${profile.name}${profile.age ? `（${profile.age}さい）` : ""}`,
    profile.interests.length ? `すきなもの：${profile.interests.join("、")}` : "",
    profile.recentLessons.length
      ? `最近のレッスン：\n${profile.recentLessons
          .map((r) => `- ${r.date} ${r.title}: ${r.summary}`)
          .join("\n")}`
      : "最近のレッスン：まだなし（はじめてかも。やさしくむかえて）",
  ].filter(Boolean).join("\n");

  return [
    { type: "text" as const, text: core },
    { type: "text" as const, text: lessonText, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: profileText },
  ];
}

const MAX_EXCHANGES = 10;

function historyMessages(history: TurnRequest["history"]) {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of history) {
    const role = h.role === "kid" ? "user" : "assistant";
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === role) prev.content += `\n${h.text}`;
    else msgs.push({ role, content: h.text });
  }
  // trim to the last MAX_EXCHANGES user turns (plus their replies)
  let userCount = 0;
  let start = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") userCount++;
    if (userCount >= MAX_EXCHANGES) { start = i; break; }
  }
  const trimmed = msgs.slice(start);
  if (trimmed[0]?.role === "assistant") trimmed.shift(); // must start with user
  return trimmed;
}

// Stage 1: only the enemy's immediate reply, so the voice starts fast.
export function buildQuickMessages(req: TurnRequest) {
  const msgs = historyMessages(req.history);
  msgs.push({
    role: "user",
    content:
      `【状況】いまのフェーズ: ${req.phase}（teachの説明はクライアントで読み上げ済み）\n${req.utterance}\n` +
      `【指示】このターンは敵の即答だけをかえす。enemy_line はみじかく1〜2文。` +
      `damage は発話がレッスンのねらいをどれだけ実践できたか（0〜100）。`,
  });
  return msgs;
}

// Stage 2: coaching, scoring and phase control, given the enemy reply above.
// req.history already ends with the kid's utterance and the enemy's reply.
export function buildFollowupMessages(req: FollowupRequest) {
  const msgs = historyMessages(req.history);
  msgs.push({
    role: "user",
    content:
      `【状況】いまのフェーズ: ${req.phase}。敵はさっき「${req.enemyLine}」とこたえ、` +
      `ダメージは${req.damage}、敵ののこりHPは${req.remainingHp}/${req.maxHp}。\n` +
      `【指示】先生として coach_line・score_reason・phase・deep_question をかえす。` +
      `のこりHPが0なら phase は "debrief"、デブリーフのしめくくりがすんだら "end"。` +
      `score_reason はログ用のみじかいメモ（10語いない）でよい。coach_line は1〜2文。`,
  });
  return msgs;
}
