# Talk Quest v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working end-to-end core loop of the Talk Quest talking-tutor game — one subject (negotiation, 3 units): 3D arena, voice loop, Claude-driven battle, engagement-based surprise rewards, CSV progression.

**Architecture:** Browser game (Vite + TypeScript + Three.js) talks to a local Node/Express backend. Kid's speech → Chrome Web Speech API → `POST /api/turn` → one Claude call (Haiku 4.5) that plays enemy + coach + scorer via structured output → VOICEVOX TTS proxy → WebM sprite enemy reacts in the arena. Rewards accrue from voiced engagement and are delivered as surprise drops (never a visible wage meter). Per-child profile + transcripts on disk; stats/XP in CSV.

**Tech Stack:** Node 18+, TypeScript, Express, `@anthropic-ai/sdk`, zod, vitest, supertest, Vite, Three.js. VOICEVOX engine (external, `localhost:50021`). Spec: `docs/superpowers/specs/2026-07-18-talk-quest-design.md`.

## Global Constraints

- Model: `claude-haiku-4-5`; switchable to `claude-sonnet-5` via `config.json` `"model"` field. Never hardcode model strings outside `src/backend/config.ts`.
- Prompt prefix (system + lesson) must stay ≥ 4096 tokens or Haiku caching silently disables — `buildPrompt` pads to guarantee it.
- Kid-facing UI: **no** visible earning meter, **no** correctness scores/grades/leaderboards. The tutor's reward lines are informational/process-focused (spec §3.5).
- Japanese is the primary language of all kid-facing copy; recognition lang `ja-JP` (per-unit `lang` field may switch to `en-US`).
- All code lives in `kids_education`. `/mnt/c/Projects/book/credit-palace/` is **read-only** (copy assets from it, never modify).
- Every CSV write creates a `.backup.<timestamp>` first and restores it on failure (existing backend README pattern).
- `ANTHROPIC_API_KEY` comes from the environment; never written to disk.
- Enemy sprite actions are exactly the 10 bull actions: `idle(=01_surf placeholder), angry, cry, laugh, shock, excitement, dancing, fighting, flying, sleep`.
- Commit after every task (steps include the commands).

---

### Task 1: Project scaffolding & toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/backend/config.ts`, `config.json`
- Test: `tests/backend/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadConfig(): AppConfig` from `src/backend/config.ts` where `AppConfig = { model: string; port: number; voicevoxUrl: string; dataDir: string; contentDir: string }`. All later backend tasks import this. NPM scripts `test`, `dev:server`, `dev:game`.

- [ ] **Step 1: Init package and install dependencies**

```bash
cd /mnt/c/Projects/kids_education
npm init -y
npm install express @anthropic-ai/sdk zod
npm install -D typescript tsx vitest supertest @types/express @types/supertest @types/node vite three @types/three
```

- [ ] **Step 2: Write config files**

`package.json` — replace the generated `scripts` and add `"type": "module"`:

```json
{
  "name": "talk-quest",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev:server": "tsx watch src/backend/server.ts",
    "dev:game": "vite --config src/game/vite.config.ts"
  }
}
```
(keep the `dependencies`/`devDependencies` npm wrote)

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "noEmit": true, "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

`.gitignore`:

```
node_modules/
dist/
data/children/
*.backup.*
```

`config.json` (repo root — user-editable runtime config):

```json
{
  "model": "claude-haiku-4-5",
  "port": 5179,
  "voicevoxUrl": "http://localhost:50021",
  "dataDir": "data",
  "contentDir": "content"
}
```

- [ ] **Step 3: Write the failing test**

`tests/backend/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/backend/config";

describe("loadConfig", () => {
  it("loads config.json with defaults", () => {
    const c = loadConfig();
    expect(c.model).toBe("claude-haiku-4-5");
    expect(c.port).toBe(5179);
    expect(c.voicevoxUrl).toContain("50021");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/backend/config.test.ts`
Expected: FAIL — cannot find module `../../src/backend/config`

- [ ] **Step 5: Implement `src/backend/config.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  model: string;
  port: number;
  voicevoxUrl: string;
  dataDir: string;
  contentDir: string;
}

const DEFAULTS: AppConfig = {
  model: "claude-haiku-4-5",
  port: 5179,
  voicevoxUrl: "http://localhost:50021",
  dataDir: "data",
  contentDir: "content",
};

export function loadConfig(root = process.cwd()): AppConfig {
  let fileConf: Partial<AppConfig> = {};
  try {
    fileConf = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
  } catch {
    /* missing config.json: use defaults */
  }
  return { ...DEFAULTS, ...fileConf };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/backend/config.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore config.json src/backend/config.ts tests/backend/config.test.ts
git commit -m "chore: scaffold toolchain, runtime config"
```

---

### Task 2: Turn schema & shared types

**Files:**
- Create: `src/shared/types/turn.ts`
- Test: `tests/shared/turn.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all later tasks import from `src/shared/types/turn.ts`):
  - `type EnemyAction = "idle"|"angry"|"cry"|"laugh"|"shock"|"excitement"|"dancing"|"fighting"|"flying"|"sleep"`
  - `type Phase = "teach"|"battle"|"debrief"|"end"`
  - `interface TurnResult { enemy_line: string; enemy_action: EnemyAction; coach_line: string; damage: number; score_reason: string; phase: Phase; deep_question: string | null }`
  - `parseTurnResult(raw: string): TurnResult` — throws `TurnParseError` on invalid input
  - `TURN_RESULT_JSON_SCHEMA` — plain JSON-schema object for Claude structured output
  - `interface TurnRequest { childName: string; unitId: string; utterance: string; phase: Phase; history: { role: "kid"|"enemy"|"coach"; text: string }[] }`

- [ ] **Step 1: Write the failing test**

`tests/shared/turn.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTurnResult, TurnParseError } from "../../src/shared/types/turn";

const good = JSON.stringify({
  enemy_line: "むむ、なかなか言うな…", enemy_action: "shock",
  coach_line: "理由を言えたね！", damage: 40,
  score_reason: "gave a reason", phase: "battle", deep_question: null,
});

describe("parseTurnResult", () => {
  it("parses a valid turn", () => {
    const t = parseTurnResult(good);
    expect(t.damage).toBe(40);
    expect(t.enemy_action).toBe("shock");
  });
  it("clamps damage into 0..100", () => {
    const t = parseTurnResult(good.replace('"damage":40', '"damage":150'));
    expect(t.damage).toBe(100);
  });
  it("throws TurnParseError on bad action", () => {
    expect(() =>
      parseTurnResult(good.replace('"shock"', '"explode"')),
    ).toThrow(TurnParseError);
  });
  it("throws TurnParseError on non-JSON", () => {
    expect(() => parseTurnResult("not json")).toThrow(TurnParseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/turn.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/shared/types/turn.ts`**

```ts
import { z } from "zod";

export const ENEMY_ACTIONS = [
  "idle", "angry", "cry", "laugh", "shock",
  "excitement", "dancing", "fighting", "flying", "sleep",
] as const;
export type EnemyAction = (typeof ENEMY_ACTIONS)[number];

export const PHASES = ["teach", "battle", "debrief", "end"] as const;
export type Phase = (typeof PHASES)[number];

const turnSchema = z.object({
  enemy_line: z.string(),
  enemy_action: z.enum(ENEMY_ACTIONS),
  coach_line: z.string(),
  damage: z.number().transform((n) => Math.max(0, Math.min(100, n))),
  score_reason: z.string(),
  phase: z.enum(PHASES),
  deep_question: z.string().nullable(),
});
export type TurnResult = z.infer<typeof turnSchema>;

export class TurnParseError extends Error {}

export function parseTurnResult(raw: string): TurnResult {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new TurnParseError(`not JSON: ${raw.slice(0, 80)}`);
  }
  const res = turnSchema.safeParse(obj);
  if (!res.success) throw new TurnParseError(res.error.message);
  return res.data;
}

export const TURN_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    enemy_line: { type: "string" },
    enemy_action: { type: "string", enum: [...ENEMY_ACTIONS] },
    coach_line: { type: "string" },
    damage: { type: "integer" },
    score_reason: { type: "string" },
    phase: { type: "string", enum: [...PHASES] },
    deep_question: { type: ["string", "null"] },
  },
  required: ["enemy_line", "enemy_action", "coach_line", "damage",
             "score_reason", "phase", "deep_question"],
  additionalProperties: false,
} as const;

export interface TurnRequest {
  childName: string;
  unitId: string;
  utterance: string;
  phase: Phase;
  history: { role: "kid" | "enemy" | "coach"; text: string }[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/turn.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/turn.ts tests/shared/turn.test.ts
git commit -m "feat: turn result schema, parser, JSON schema for structured output"
```

---

### Task 3: Lesson content — 3 negotiation units + loader

**Files:**
- Create: `content/lessons/negotiation/unit-01.json`, `unit-02.json`, `unit-03.json`, `src/backend/services/lesson-store.ts`
- Test: `tests/backend/lesson-store.test.ts`

**Interfaces:**
- Consumes: `AppConfig.contentDir` (Task 1).
- Produces:
  - `interface Lesson { id: string; subject: string; title: string; teach: string[]; check_questions: string[]; enemy: { name: string; persona: string; voice: number; sprite: string; hp: number; win_criteria: string }; reward: { stat: string; xp: number }; lang: "ja" | "en" }`
  - `loadLesson(contentDir: string, subject: string, unitId: string): Lesson` — throws on missing/invalid
  - `listLessons(contentDir: string, subject: string): { id: string; title: string }[]`

- [ ] **Step 1: Author the three units**

`content/lessons/negotiation/unit-01.json`:

```json
{
  "id": "unit-01", "subject": "negotiation", "title": "りゆうをつけておねがいする",
  "teach": [
    "こうしょうのだいいっぽは『りゆう』だよ。『〜だから、〜してほしい』って言うと、あいてはきいてくれやすくなるんだ。",
    "たとえば『おこづかいアップして！』より『おてつだいをふやすから、おこづかいをアップしてほしい』のほうがつよいよね。",
    "ポイント：じぶんのおねがい＋あいてにとってのいいこと、をセットにすること！"
  ],
  "check_questions": [
    "『ゲームかって！』を、りゆうつきのおねがいに言いかえるとどうなる？",
    "りゆうがあると、どうしてあいてはきいてくれやすくなるんだろう？"
  ],
  "enemy": {
    "name": "ケチな商人ゴルド", "voice": 13, "sprite": "yellow", "hp": 100,
    "persona": "りんごを1こ300円で売ろうとするケチな商人。りゆうのないねびき交渉はぜったいにことわる。子どもがりゆうをつけて交渉したり、おたがいのとくになる提案をしたら、しぶしぶ心を動かされる。こわくない、コミカルなキャラ。",
    "win_criteria": "子どもがりゆうつきのおねがい、またはおたがいがとくする提案を2回以上言えたら負けをみとめる"
  },
  "reward": { "stat": "charisma", "xp": 50 }, "lang": "ja"
}
```

`content/lessons/negotiation/unit-02.json`:

```json
{
  "id": "unit-02", "subject": "negotiation", "title": "あいてのきもちをきく",
  "teach": [
    "じょうずなこうしょうは、まず『きく』ことからはじまるよ。あいてがなにをだいじにしてるかわかれば、いいていあんができるんだ。",
    "『どうしてだめなの？』『なにがしんぱいなの？』ってきいてみよう。あいてのこたえの中に、こうしょうのヒントがかくれてるよ。",
    "ポイント：はんろんするまえに、しつもんをひとつ！"
  ],
  "check_questions": [
    "おかあさんに『ゲームはだめ』と言われたら、まずなんてきく？",
    "あいてのしんぱいがわかると、どんなていあんができる？"
  ],
  "enemy": {
    "name": "がんこなドラゴンのバーン", "voice": 13, "sprite": "red", "hp": 100,
    "persona": "たからばしをわたらせてくれないがんこなドラゴン。ほんとうは『はしがこわれるのがしんぱい』なだけ。子どもが理由をたずねてくれたらうれしくなり、しんぱいにこたえる提案（そっとあるく、1人ずつわたる等）をされると心をひらく。",
    "win_criteria": "子どもがドラゴンのしんぱいをしつもんでききだし、それにこたえるていあんを1つ以上できたら負けをみとめる"
  },
  "reward": { "stat": "charisma", "xp": 50 }, "lang": "ja"
}
```

`content/lessons/negotiation/unit-03.json`:

```json
{
  "id": "unit-03", "subject": "negotiation", "title": "ウィンウィンをつくる",
  "teach": [
    "さいきょうのこうしょうは、じぶんもあいても『かち』になることだよ。これを『ウィンウィン』っていうんだ。",
    "あいてがほしいものと、じぶんがほしいものを、りょうほうかなえるほうほうをさがそう。",
    "ポイント：『どっちがかつか』じゃなくて『りょうほうかつには？』ってかんがえること！"
  ],
  "check_questions": [
    "きょうだいでひとつのケーキをとりあってる。ウィンウィンになるほうほうは？",
    "ウィンウィンだと、つぎのこうしょうもうまくいきやすいのはどうして？"
  ],
  "enemy": {
    "name": "ひとりじめキング", "voice": 13, "sprite": "purple", "hp": 100,
    "persona": "おもちゃもおかしもぜんぶひとりじめしたがる王さま。『はんぶんこ』ではなっとくしないが、じぶんにもとくがあるウィンウィンの提案をされるとよろこんでうけいれる。コミカルでいばりんぼう。",
    "win_criteria": "子どもがりょうしゃにとくのあるていあんを1つ以上ぐたいてきに言えたら負けをみとめる"
  },
  "reward": { "stat": "charisma", "xp": 50 }, "lang": "ja"
}
```

- [ ] **Step 2: Write the failing test**

`tests/backend/lesson-store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadLesson, listLessons } from "../../src/backend/services/lesson-store";

describe("lesson-store", () => {
  it("lists 3 negotiation units", () => {
    const l = listLessons("content", "negotiation");
    expect(l.map((x) => x.id)).toEqual(["unit-01", "unit-02", "unit-03"]);
  });
  it("loads a unit with enemy + reward", () => {
    const u = loadLesson("content", "negotiation", "unit-01");
    expect(u.enemy.hp).toBe(100);
    expect(u.reward.stat).toBe("charisma");
    expect(u.teach.length).toBeGreaterThan(0);
  });
  it("throws on unknown unit", () => {
    expect(() => loadLesson("content", "negotiation", "unit-99")).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/backend/lesson-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/backend/services/lesson-store.ts`**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const lessonSchema = z.object({
  id: z.string(),
  subject: z.string(),
  title: z.string(),
  teach: z.array(z.string()).min(1),
  check_questions: z.array(z.string()),
  enemy: z.object({
    name: z.string(), persona: z.string(), voice: z.number(),
    sprite: z.string(), hp: z.number(), win_criteria: z.string(),
  }),
  reward: z.object({ stat: z.string(), xp: z.number() }),
  lang: z.enum(["ja", "en"]),
});
export type Lesson = z.infer<typeof lessonSchema>;

export function loadLesson(contentDir: string, subject: string, unitId: string): Lesson {
  const path = join(contentDir, "lessons", subject, `${unitId}.json`);
  return lessonSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function listLessons(contentDir: string, subject: string): { id: string; title: string }[] {
  const dir = join(contentDir, "lessons", subject);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const u = loadLesson(contentDir, subject, f.replace(/\.json$/, ""));
      return { id: u.id, title: u.title };
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/backend/lesson-store.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add content/lessons/negotiation src/backend/services/lesson-store.ts tests/backend/lesson-store.test.ts
git commit -m "feat: negotiation lesson units and lesson store"
```

---

### Task 4: Prompt builder (persona + safety + Deep Question Engine + caching layout)

**Files:**
- Create: `src/backend/services/prompt-builder.ts`
- Test: `tests/backend/prompt-builder.test.ts`

**Interfaces:**
- Consumes: `Lesson` (Task 3), `TurnRequest` (Task 2), `ChildProfile` shape (defined here, implemented by Task 6): `{ name: string; age: number | null; interests: string[]; recentLessons: { unitId: string; title: string; summary: string; date: string }[] }`.
- Produces:
  - `buildSystemBlocks(lesson: Lesson, profile: ChildProfile): { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[]` — block 0 = static core (persona/safety/DQE, padded so core+lesson ≥ ~16,000 chars ≈ >4096 tokens) with `cache_control` on the **lesson block** (last stable block); block 1 = lesson; block 2 = profile (volatile, no cache marker).
  - `buildMessages(req: TurnRequest): { role: "user" | "assistant"; content: string }[]` — history trimmed to last 10 exchanges, kid turns as `user`, enemy+coach turns merged as `assistant`.
  - `export interface ChildProfile` (as above).

- [ ] **Step 1: Write the failing test**

`tests/backend/prompt-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSystemBlocks, buildMessages, type ChildProfile } from "../../src/backend/services/prompt-builder";
import { loadLesson } from "../../src/backend/services/lesson-store";

const profile: ChildProfile = {
  name: "ゆうた", age: 8, interests: ["サッカー"],
  recentLessons: [{ unitId: "unit-01", title: "お金のきほん", summary: "おかねは交換のどうぐだと学んだ", date: "2026-07-17" }],
};

describe("buildSystemBlocks", () => {
  const lesson = loadLesson("content", "negotiation", "unit-01");
  const blocks = buildSystemBlocks(lesson, profile);

  it("has 3 blocks: core, lesson (cached), profile", () => {
    expect(blocks).toHaveLength(3);
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[2].cache_control).toBeUndefined();
  });
  it("stable prefix is at least 16000 chars (≈4096 tokens for Haiku caching)", () => {
    expect(blocks[0].text.length + blocks[1].text.length).toBeGreaterThanOrEqual(16000);
  });
  it("core contains safety + deep-question rules; profile block has child data", () => {
    expect(blocks[0].text).toContain("6さい〜12さい");
    expect(blocks[0].text).toMatch(/deep question|ふかい質問/i);
    expect(blocks[2].text).toContain("ゆうた");
    expect(blocks[2].text).toContain("お金のきほん");
  });
  it("core forbids wage-style reward talk", () => {
    expect(blocks[0].text).toContain("ごほうび");
  });
});

describe("buildMessages", () => {
  it("maps kid→user, enemy/coach→assistant and trims to 10 exchanges", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "kid" : "enemy") as "kid" | "enemy",
      text: `t${i}`,
    }));
    const msgs = buildMessages({
      childName: "ゆうた", unitId: "unit-01", utterance: "やすくして！",
      phase: "battle", history,
    });
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "やすくして！" });
    expect(msgs.length).toBeLessThanOrEqual(21);
    expect(msgs[0].role).toBe("user");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/prompt-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/services/prompt-builder.ts`**

```ts
import type { Lesson } from "./lesson-store";
import type { TurnRequest } from "../../shared/types/turn";

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

## 進行のルール
- teach フェーズ：レッスンの内容をみじかく教え、check_questions を1つずつ出す。子どもの自由な質問にはこたえてから、レッスンにもどる。
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

export function buildMessages(req: TurnRequest) {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of req.history) {
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
  trimmed.push({ role: "user", content: req.utterance });
  return trimmed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/prompt-builder.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/prompt-builder.ts tests/backend/prompt-builder.test.ts
git commit -m "feat: prompt builder with cache-friendly layout and deep question engine"
```

---

### Task 5: Claude turn service

**Files:**
- Create: `src/backend/services/claude-turn.ts`
- Test: `tests/backend/claude-turn.test.ts`

**Interfaces:**
- Consumes: `buildSystemBlocks`/`buildMessages` (Task 4), `parseTurnResult`, `TURN_RESULT_JSON_SCHEMA`, `TurnRequest`, `TurnResult` (Task 2), `Lesson` (Task 3), `ChildProfile` (Task 4).
- Produces:
  - `interface ClaudeLike { create(params: Record<string, unknown>): Promise<{ content: { type: string; text?: string }[] }> }` — thin seam over the SDK for testing.
  - `runTurn(client: ClaudeLike, model: string, lesson: Lesson, profile: ChildProfile, req: TurnRequest): Promise<TurnResult>` — one retry on API error; one re-ask on `TurnParseError`; throws `TurnServiceError` after that.
  - `makeRealClient(): ClaudeLike` — wraps `new Anthropic().messages` (reads `ANTHROPIC_API_KEY` from env).
  - `class TurnServiceError extends Error`

- [ ] **Step 1: Write the failing test**

`tests/backend/claude-turn.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runTurn, TurnServiceError, type ClaudeLike } from "../../src/backend/services/claude-turn";
import { loadLesson } from "../../src/backend/services/lesson-store";
import type { ChildProfile } from "../../src/backend/services/prompt-builder";

const lesson = loadLesson("content", "negotiation", "unit-01");
const profile: ChildProfile = { name: "ゆうた", age: 8, interests: [], recentLessons: [] };
const req = { childName: "ゆうた", unitId: "unit-01", utterance: "やすくして！", phase: "battle" as const, history: [] };

const goodJson = JSON.stringify({
  enemy_line: "だめだね！", enemy_action: "laugh", coach_line: "りゆうをつけてみよう",
  damage: 10, score_reason: "no reason given", phase: "battle", deep_question: null,
});
const ok = { content: [{ type: "text", text: goodJson }] };

describe("runTurn", () => {
  it("returns parsed TurnResult and passes model + system blocks", async () => {
    const create = vi.fn().mockResolvedValue(ok);
    const t = await runTurn({ create }, "claude-haiku-4-5", lesson, profile, req);
    expect(t.damage).toBe(10);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(Array.isArray(params.system)).toBe(true);
  });
  it("retries once on API error", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(ok);
    const t = await runTurn({ create }, "m", lesson, profile, req);
    expect(t.enemy_action).toBe("laugh");
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("re-asks once on malformed JSON, then throws TurnServiceError", async () => {
    const bad = { content: [{ type: "text", text: "garbage" }] };
    const create = vi.fn().mockResolvedValue(bad);
    await expect(runTurn({ create }, "m", lesson, profile, req)).rejects.toThrow(TurnServiceError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/claude-turn.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/services/claude-turn.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import {
  parseTurnResult, TurnParseError, TURN_RESULT_JSON_SCHEMA,
  type TurnRequest, type TurnResult,
} from "../../shared/types/turn";
import { buildSystemBlocks, buildMessages, type ChildProfile } from "./prompt-builder";
import type { Lesson } from "./lesson-store";

export interface ClaudeLike {
  create(params: Record<string, unknown>): Promise<{ content: { type: string; text?: string }[] }>;
}

export class TurnServiceError extends Error {}

function textOf(resp: { content: { type: string; text?: string }[] }): string {
  const block = resp.content.find((b) => b.type === "text");
  if (!block?.text) throw new TurnParseError("no text block in response");
  return block.text;
}

export async function runTurn(
  client: ClaudeLike, model: string, lesson: Lesson,
  profile: ChildProfile, req: TurnRequest,
): Promise<TurnResult> {
  const params = {
    model,
    max_tokens: 700,
    system: buildSystemBlocks(lesson, profile),
    messages: buildMessages(req),
    output_config: { format: { type: "json_schema", schema: TURN_RESULT_JSON_SCHEMA } },
  };

  let resp;
  try {
    resp = await client.create(params);
  } catch {
    resp = await client.create(params); // one retry on API error; throws through on 2nd failure
  }

  try {
    return parseTurnResult(textOf(resp));
  } catch (e) {
    if (!(e instanceof TurnParseError)) throw e;
    const again = await client.create(params); // one re-ask on malformed output
    try {
      return parseTurnResult(textOf(again));
    } catch {
      throw new TurnServiceError("Claude returned unparseable turn twice");
    }
  }
}

export function makeRealClient(): ClaudeLike {
  const anthropic = new Anthropic();
  return { create: (params) => anthropic.messages.create(params as never) as never };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/claude-turn.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/claude-turn.ts tests/backend/claude-turn.test.ts
git commit -m "feat: claude turn service with retry and structured output"
```

---

### Task 6: Progression service (CSV stats, unlocks, backup-before-write)

**Files:**
- Create: `src/backend/services/progression.ts`, `data/characters.csv`
- Test: `tests/backend/progression.test.ts`

**Interfaces:**
- Consumes: `AppConfig.dataDir` (Task 1). Reads existing `data/items_progression.csv` (columns incl. `item_category, level, required_stat_level, required_stat_type, japanese_name, unlock_message`).
- Produces:
  - `interface StatRow { child: string; stat: string; points: number }` — `data/characters.csv` header: `child,stat,points`
  - `statLevel(points: number): number` — `Math.floor(points / 50)`
  - `applyReward(dataDir: string, child: string, stat: string, xp: number): { stat: string; points: number; level: number; unlocked: { japanese_name: string; unlock_message: string }[] }` — adds xp, persists CSV (backup-before-write), returns newly crossed unlocks from `items_progression.csv`.
  - `getStats(dataDir: string, child: string): StatRow[]`

- [ ] **Step 1: Create `data/characters.csv`**

```csv
child,stat,points
```

- [ ] **Step 2: Write the failing test**

`tests/backend/progression.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReward, getStats, statLevel } from "../../src/backend/services/progression";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tq-"));
  writeFileSync(join(dir, "characters.csv"), "child,stat,points\n");
  writeFileSync(
    join(dir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n" +
    "accessory,1,/x.png,1,charisma,銀の舌のバッジ,🗣️,desc,こうしょうバッジを手に入れた！\n" +
    "accessory,2,/y.png,3,charisma,金の舌のバッジ,👑,desc,金のバッジ！\n",
  );
});

describe("progression", () => {
  it("statLevel: 50 points per level", () => {
    expect(statLevel(0)).toBe(0);
    expect(statLevel(49)).toBe(0);
    expect(statLevel(50)).toBe(1);
  });
  it("applyReward accumulates and persists", () => {
    applyReward(dir, "yuta", "charisma", 30);
    const r = applyReward(dir, "yuta", "charisma", 30);
    expect(r.points).toBe(60);
    expect(r.level).toBe(1);
    expect(getStats(dir, "yuta")).toEqual([{ child: "yuta", stat: "charisma", points: 60 }]);
  });
  it("returns unlocks only when a threshold is newly crossed", () => {
    const r1 = applyReward(dir, "yuta", "charisma", 60); // level 1 → unlock item lvl 1
    expect(r1.unlocked.map((u) => u.japanese_name)).toEqual(["銀の舌のバッジ"]);
    const r2 = applyReward(dir, "yuta", "charisma", 10); // still level 1 → nothing new
    expect(r2.unlocked).toEqual([]);
  });
  it("creates a backup before writing", () => {
    applyReward(dir, "yuta", "charisma", 10);
    const files = readFileSync(join(dir, "characters.csv"), "utf8");
    expect(files).toContain("yuta,charisma,10");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/backend/progression.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `src/backend/services/progression.ts`**

```ts
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface StatRow { child: string; stat: string; points: number }

export const POINTS_PER_LEVEL = 50;
export function statLevel(points: number): number {
  return Math.floor(points / POINTS_PER_LEVEL);
}

function readCsv(path: string): string[][] {
  return readFileSync(path, "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
}

function readStats(dataDir: string): StatRow[] {
  const [, ...rows] = readCsv(join(dataDir, "characters.csv"));
  return rows.filter((r) => r.length >= 3)
    .map(([child, stat, points]) => ({ child, stat, points: Number(points) }));
}

function writeStats(dataDir: string, rows: StatRow[]): void {
  const path = join(dataDir, "characters.csv");
  const backup = `${path}.backup.${Date.now()}`;
  copyFileSync(path, backup);
  try {
    const body = ["child,stat,points", ...rows.map((r) => `${r.child},${r.stat},${r.points}`)].join("\n") + "\n";
    writeFileSync(path, body);
    unlinkSync(backup);
  } catch (e) {
    copyFileSync(backup, path);
    unlinkSync(backup);
    throw e;
  }
}

interface Item { required_stat_level: number; required_stat_type: string; japanese_name: string; unlock_message: string }

function readItems(dataDir: string): Item[] {
  const path = join(dataDir, "items_progression.csv");
  if (!existsSync(path)) return [];
  const [header, ...rows] = readCsv(path);
  const col = (name: string) => header.indexOf(name);
  return rows.map((r) => ({
    required_stat_level: Number(r[col("required_stat_level")]),
    required_stat_type: r[col("required_stat_type")],
    japanese_name: r[col("japanese_name")],
    unlock_message: r[col("unlock_message")],
  }));
}

export function getStats(dataDir: string, child: string): StatRow[] {
  return readStats(dataDir).filter((r) => r.child === child);
}

export function applyReward(dataDir: string, child: string, stat: string, xp: number) {
  const rows = readStats(dataDir);
  let row = rows.find((r) => r.child === child && r.stat === stat);
  if (!row) { row = { child, stat, points: 0 }; rows.push(row); }
  const oldLevel = statLevel(row.points);
  row.points += xp;
  const level = statLevel(row.points);
  writeStats(dataDir, rows);

  const unlocked = readItems(dataDir).filter(
    (i) => i.required_stat_type === stat &&
      i.required_stat_level > oldLevel &&  // crossed strictly after old level…
      i.required_stat_level <= level,      // …and reachable at new level
  ).map(({ japanese_name, unlock_message }) => ({ japanese_name, unlock_message }));

  return { stat, points: row.points, level, unlocked };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/backend/progression.test.ts`
Expected: PASS (4 tests). If the unlock-threshold test fails on the boundary, the comparison is `i.required_stat_level > oldLevel && i.required_stat_level <= level` — item levels are compared against **stat levels** directly.

- [ ] **Step 6: Commit**

```bash
git add data/characters.csv src/backend/services/progression.ts tests/backend/progression.test.ts
git commit -m "feat: CSV progression with stat levels, unlocks, backup-before-write"
```

---

### Task 7: Profile store & session transcripts

**Files:**
- Create: `src/backend/services/profile-store.ts`
- Test: `tests/backend/profile-store.test.ts`

**Interfaces:**
- Consumes: `ChildProfile` (Task 4), `AppConfig.dataDir` (Task 1).
- Produces:
  - `getProfile(dataDir: string, name: string): ChildProfile` — creates `data/children/<name>/profile.json` with defaults on first call.
  - `saveProfile(dataDir: string, p: ChildProfile): void`
  - `appendTranscript(dataDir: string, name: string, entry: object): void` — appends one JSON line to `data/children/<name>/sessions/<YYYY-MM-DD>.jsonl`.
  - `recordLessonSummary(dataDir: string, name: string, entry: { unitId: string; title: string; summary: string; date: string }): void` — prepends to `recentLessons`, keeps max 10.

- [ ] **Step 1: Write the failing test**

`tests/backend/profile-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProfile, saveProfile, appendTranscript, recordLessonSummary } from "../../src/backend/services/profile-store";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tq-")); });

describe("profile-store", () => {
  it("creates default profile on first read", () => {
    const p = getProfile(dir, "yuta");
    expect(p.name).toBe("yuta");
    expect(p.recentLessons).toEqual([]);
  });
  it("round-trips saves", () => {
    const p = getProfile(dir, "yuta");
    p.interests.push("サッカー");
    saveProfile(dir, p);
    expect(getProfile(dir, "yuta").interests).toEqual(["サッカー"]);
  });
  it("appends transcript lines as jsonl", () => {
    appendTranscript(dir, "yuta", { kind: "kid", text: "こんにちは" });
    appendTranscript(dir, "yuta", { kind: "enemy", text: "ふん！" });
    const day = new Date().toISOString().slice(0, 10);
    const lines = readFileSync(join(dir, "children", "yuta", "sessions", `${day}.jsonl`), "utf8")
      .trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).text).toBe("こんにちは");
  });
  it("keeps only 10 recent lessons, newest first", () => {
    for (let i = 0; i < 12; i++) {
      recordLessonSummary(dir, "yuta", { unitId: `u${i}`, title: `t${i}`, summary: "s", date: "2026-07-18" });
    }
    const p = getProfile(dir, "yuta");
    expect(p.recentLessons).toHaveLength(10);
    expect(p.recentLessons[0].unitId).toBe("u11");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/profile-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/services/profile-store.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ChildProfile } from "./prompt-builder";

function childDir(dataDir: string, name: string): string {
  const dir = join(dataDir, "children", name);
  mkdirSync(join(dir, "sessions"), { recursive: true });
  return dir;
}

export function getProfile(dataDir: string, name: string): ChildProfile {
  const path = join(childDir(dataDir, name), "profile.json");
  if (!existsSync(path)) {
    const fresh: ChildProfile = { name, age: null, interests: [], recentLessons: [] };
    writeFileSync(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function saveProfile(dataDir: string, p: ChildProfile): void {
  writeFileSync(join(childDir(dataDir, p.name), "profile.json"), JSON.stringify(p, null, 2));
}

export function appendTranscript(dataDir: string, name: string, entry: object): void {
  const day = new Date().toISOString().slice(0, 10);
  const path = join(childDir(dataDir, name), "sessions", `${day}.jsonl`);
  appendFileSync(path, JSON.stringify({ ts: Date.now(), ...entry }) + "\n");
}

export function recordLessonSummary(
  dataDir: string, name: string,
  entry: { unitId: string; title: string; summary: string; date: string },
): void {
  const p = getProfile(dataDir, name);
  p.recentLessons = [entry, ...p.recentLessons].slice(0, 10);
  saveProfile(dataDir, p);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/profile-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/profile-store.ts tests/backend/profile-store.test.ts
git commit -m "feat: per-child profile store and session transcripts"
```

---

### Task 8: Reward scheduler (engagement bank + surprise drops)

**Files:**
- Create: `src/backend/services/reward-scheduler.ts`
- Test: `tests/backend/reward-scheduler.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic; RNG injected for testability).
- Produces:
  - `interface Drop { xp: number; kind: "treasure" | "milestone" | "session-end" }`
  - `class EngagementBank { constructor(opts?: { bootstrapMultiplier?: number; rng?: () => number; carriedMs?: number }); addVoicedMs(ms: number): void; get accruedMs(): number; maybeDrop(): Drop | null; endOfSession(): { drops: Drop[]; carryMs: number } }`
  - Semantics: accrual only grows (`addVoicedMs`); `maybeDrop()` is called once per turn — drop probability rises with un-cashed accrual (variable-ratio), consuming accrual into XP (`xp = round(consumedMs / 6000)`, i.e. ~10 XP/min voiced); `endOfSession()` cashes most remaining accrual but randomly carries some to next session ("sometimes next session" surprise); `bootstrapMultiplier` (default 1) scales drop probability for cold-start kids.

- [ ] **Step 1: Write the failing test**

`tests/backend/reward-scheduler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EngagementBank } from "../../src/backend/services/reward-scheduler";

describe("EngagementBank", () => {
  it("accrues voiced ms and never forfeits", () => {
    const b = new EngagementBank({ rng: () => 0.99 }); // rng high → never drops
    b.addVoicedMs(5000);
    b.addVoicedMs(7000);
    expect(b.accruedMs).toBe(12000);
    expect(b.maybeDrop()).toBeNull();
    expect(b.accruedMs).toBe(12000); // no-drop consumes nothing
  });
  it("drops when rng is low, converting accrual to xp (~10xp/min)", () => {
    const b = new EngagementBank({ rng: () => 0.0 });
    b.addVoicedMs(60000); // 1 minute voiced
    const d = b.maybeDrop();
    expect(d).not.toBeNull();
    expect(d!.xp).toBe(10);
    expect(b.accruedMs).toBe(0);
  });
  it("no accrual → no drop even with lucky rng", () => {
    const b = new EngagementBank({ rng: () => 0.0 });
    expect(b.maybeDrop()).toBeNull();
  });
  it("bootstrapMultiplier raises drop chance", () => {
    // p = min(0.5, accrual/120000) * mult ; accrual 30000 → base p 0.25; mult 2 → 0.5
    const bBase = new EngagementBank({ rng: () => 0.3 });
    bBase.addVoicedMs(30000);
    expect(bBase.maybeDrop()).toBeNull(); // 0.3 >= 0.25 → no drop
    const bBoost = new EngagementBank({ rng: () => 0.3, bootstrapMultiplier: 2 });
    bBoost.addVoicedMs(30000);
    expect(bBoost.maybeDrop()).not.toBeNull(); // 0.3 < 0.5 → drop
  });
  it("endOfSession cashes out and may carry remainder", () => {
    const b = new EngagementBank({ rng: () => 0.4 }); // 0.4 < 0.5 → carries
    b.addVoicedMs(90000);
    const { drops, carryMs } = b.endOfSession();
    expect(carryMs).toBeGreaterThan(0);
    expect(drops.reduce((s, d) => s + d.xp, 0)).toBe(Math.round((90000 - carryMs) / 6000));
    expect(b.accruedMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/reward-scheduler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/services/reward-scheduler.ts`**

```ts
export interface Drop { xp: number; kind: "treasure" | "milestone" | "session-end" }

const MS_PER_XP = 6000;          // ~10 XP per voiced minute
const P_FULL_AT_MS = 120000;     // accrual at which base drop chance saturates
const P_MAX = 0.5;
const CARRY_CHANCE = 0.5;        // sometimes the surprise waits until next session
const CARRY_FRACTION = 0.3;

export class EngagementBank {
  private accrued: number;
  private readonly mult: number;
  private readonly rng: () => number;

  constructor(opts: { bootstrapMultiplier?: number; rng?: () => number; carriedMs?: number } = {}) {
    this.accrued = opts.carriedMs ?? 0;
    this.mult = opts.bootstrapMultiplier ?? 1;
    this.rng = opts.rng ?? Math.random;
  }

  addVoicedMs(ms: number): void {
    if (ms > 0) this.accrued += ms;
  }

  get accruedMs(): number {
    return this.accrued;
  }

  maybeDrop(): Drop | null {
    if (this.accrued < MS_PER_XP) return null;
    const p = Math.min(P_MAX, this.accrued / P_FULL_AT_MS) * this.mult;
    if (this.rng() >= p) return null;
    const xp = Math.round(this.accrued / MS_PER_XP);
    this.accrued = 0;
    return { xp, kind: "treasure" };
  }

  endOfSession(): { drops: Drop[]; carryMs: number } {
    let carryMs = 0;
    if (this.rng() < CARRY_CHANCE) carryMs = Math.round(this.accrued * CARRY_FRACTION);
    const cashMs = this.accrued - carryMs;
    this.accrued = 0;
    const xp = Math.round(cashMs / MS_PER_XP);
    return { drops: xp > 0 ? [{ xp, kind: "session-end" }] : [], carryMs };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/reward-scheduler.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/reward-scheduler.ts tests/backend/reward-scheduler.test.ts
git commit -m "feat: engagement bank with variable-ratio surprise drops"
```

---

### Task 9: VOICEVOX TTS proxy service

**Files:**
- Create: `src/backend/services/tts.ts`
- Test: `tests/backend/tts.test.ts`

**Interfaces:**
- Consumes: `AppConfig.voicevoxUrl` (Task 1). VOICEVOX HTTP API: `POST {base}/audio_query?text=<t>&speaker=<id>` → JSON query; `POST {base}/synthesis?speaker=<id>` with that JSON body → `audio/wav` bytes.
- Produces:
  - `synthesize(baseUrl: string, text: string, speaker: number, fetchFn?: typeof fetch): Promise<ArrayBuffer>` — throws `TtsUnavailableError` on any network/HTTP failure (frontend then falls back to browser `speechSynthesis`).
  - `class TtsUnavailableError extends Error`

- [ ] **Step 1: Write the failing test**

`tests/backend/tts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { synthesize, TtsUnavailableError } from "../../src/backend/services/tts";

describe("synthesize", () => {
  it("chains audio_query then synthesis and returns wav bytes", async () => {
    const wav = new ArrayBuffer(4);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ speedScale: 1 }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => wav });
    const out = await synthesize("http://vv", "こんにちは", 13, fetchFn as never);
    expect(out).toBe(wav);
    expect(fetchFn.mock.calls[0][0]).toContain("/audio_query?");
    expect(fetchFn.mock.calls[1][0]).toContain("/synthesis?speaker=13");
  });
  it("throws TtsUnavailableError when engine is down", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(synthesize("http://vv", "x", 1, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
  it("throws TtsUnavailableError on non-ok status", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(synthesize("http://vv", "x", 1, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/tts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/services/tts.ts`**

```ts
export class TtsUnavailableError extends Error {}

export async function synthesize(
  baseUrl: string, text: string, speaker: number, fetchFn: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  try {
    const q = await fetchFn(
      `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: "POST" },
    );
    if (!q.ok) throw new Error(`audio_query ${q.status}`);
    const query = await q.json();

    const s = await fetchFn(`${baseUrl}/synthesis?speaker=${speaker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!s.ok) throw new Error(`synthesis ${s.status}`);
    return await s.arrayBuffer();
  } catch (e) {
    throw new TtsUnavailableError(String(e));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/tts.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/tts.ts tests/backend/tts.test.ts
git commit -m "feat: VOICEVOX synthesis service with unavailable error"
```

---

### Task 10: Express API wiring

**Files:**
- Create: `src/backend/api/routes.ts`, `src/backend/server.ts`
- Test: `tests/backend/api.test.ts`

**Interfaces:**
- Consumes: every service from Tasks 1–9.
- Produces (HTTP API the frontend uses — all JSON unless noted):
  - `GET  /api/lessons/:subject` → `{ id, title }[]`
  - `POST /api/session/start` body `{ childName, subject, unitId }` → `{ lesson: Lesson, profile: ChildProfile, carriedMs: number }` (reads `profile.carriedEngagementMs`-style value from `data/children/<name>/engagement.json`, default 0)
  - `POST /api/turn` body `TurnRequest & { voicedMs: number }` → `{ turn: TurnResult, drop: Drop | null, unlocked: {japanese_name, unlock_message}[] }` — feeds `voicedMs` into a per-session `EngagementBank` (kept in an in-memory map keyed `childName:unitId`), calls `runTurn`, applies any drop via `applyReward` using the lesson's reward stat, appends transcript lines.
  - `POST /api/session/end` body `{ childName, unitId, summary: string }` → `{ drops: Drop[], unlocked: [...] }` — `endOfSession()`, persists `carryMs` to `data/children/<name>/engagement.json`, `recordLessonSummary` with the given summary (summary text is produced client-side from the debrief for v1 — no extra Claude call yet).
  - `GET  /api/tts?text=...&speaker=N` → `audio/wav` bytes, or HTTP `503` when VOICEVOX is down.
  - `makeApp(deps: { config: AppConfig; claude: ClaudeLike })` exported for tests; `server.ts` calls it with `makeRealClient()` and serves it.

- [ ] **Step 1: Write the failing test**

`tests/backend/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync, writeFileSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeApp } from "../../src/backend/api/routes";

const goodTurn = JSON.stringify({
  enemy_line: "ぐぬぬ", enemy_action: "shock", coach_line: "いいね！",
  damage: 40, score_reason: "reason", phase: "battle", deep_question: null,
});

let dataDir: string;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tq-"));
  writeFileSync(join(dataDir, "characters.csv"), "child,stat,points\n");
  writeFileSync(join(dataDir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n");
  const claude = { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: goodTurn }] }) };
  app = makeApp({
    config: { model: "claude-haiku-4-5", port: 0, voicevoxUrl: "http://127.0.0.1:1", dataDir, contentDir: "content" },
    claude,
  });
});

describe("api", () => {
  it("lists lessons", async () => {
    const r = await request(app).get("/api/lessons/negotiation");
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(3);
  });
  it("starts a session and returns lesson + profile", async () => {
    const r = await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    expect(r.status).toBe(200);
    expect(r.body.lesson.enemy.name).toContain("ゴルド");
    expect(r.body.profile.name).toBe("yuta");
  });
  it("runs a turn and returns turn result", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    const r = await request(app).post("/api/turn").send({
      childName: "yuta", unitId: "unit-01", utterance: "やすくして！",
      phase: "battle", history: [], voicedMs: 3000,
    });
    expect(r.status).toBe(200);
    expect(r.body.turn.damage).toBe(40);
    expect(r.body).toHaveProperty("drop");
  });
  it("ends a session, cashing drops into the reward stat", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    await request(app).post("/api/turn").send({
      childName: "yuta", unitId: "unit-01", utterance: "a", phase: "battle",
      history: [], voicedMs: 60000,
    });
    const r = await request(app).post("/api/session/end")
      .send({ childName: "yuta", unitId: "unit-01", summary: "りゆうをつけて交渉できた" });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.drops)).toBe(true);
  });
  it("tts returns 503 when engine is down", async () => {
    const r = await request(app).get("/api/tts?text=hi&speaker=1");
    expect(r.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend/api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/backend/api/routes.ts`**

```ts
import express from "express";
import type { AppConfig } from "../config";
import { listLessons, loadLesson } from "../services/lesson-store";
import { getProfile, appendTranscript, recordLessonSummary } from "../services/profile-store";
import { runTurn, type ClaudeLike, TurnServiceError } from "../services/claude-turn";
import { applyReward } from "../services/progression";
import { EngagementBank, type Drop } from "../services/reward-scheduler";
import { synthesize, TtsUnavailableError } from "../services/tts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

function engagementPath(dataDir: string, child: string) {
  return join(dataDir, "children", child, "engagement.json");
}
function readCarry(dataDir: string, child: string): number {
  const p = engagementPath(dataDir, child);
  if (!existsSync(p)) return 0;
  return JSON.parse(readFileSync(p, "utf8")).carryMs ?? 0;
}
function writeCarry(dataDir: string, child: string, carryMs: number) {
  const p = engagementPath(dataDir, child);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ carryMs }));
}

export function makeApp(deps: { config: AppConfig; claude: ClaudeLike }) {
  const { config, claude } = deps;
  const app = express();
  app.use(express.json());

  const banks = new Map<string, EngagementBank>();
  const bankKey = (child: string, unit: string) => `${child}:${unit}`;

  app.get("/api/lessons/:subject", (req, res) => {
    res.json(listLessons(config.contentDir, req.params.subject));
  });

  app.post("/api/session/start", (req, res) => {
    const { childName, subject, unitId } = req.body;
    const lesson = loadLesson(config.contentDir, subject, unitId);
    const profile = getProfile(config.dataDir, childName);
    const carriedMs = readCarry(config.dataDir, childName);
    banks.set(bankKey(childName, unitId), new EngagementBank({ carriedMs }));
    writeCarry(config.dataDir, childName, 0);
    appendTranscript(config.dataDir, childName, { kind: "session-start", unitId });
    res.json({ lesson, profile, carriedMs });
  });

  app.post("/api/turn", async (req, res) => {
    const { childName, unitId, utterance, phase, history, voicedMs } = req.body;
    const lesson = loadLesson(config.contentDir, lessonSubject(unitId, config), unitId);
    const profile = getProfile(config.dataDir, childName);
    const bank = banks.get(bankKey(childName, unitId));
    bank?.addVoicedMs(voicedMs ?? 0);
    try {
      const turn = await runTurn(claude, config.model, lesson, profile,
        { childName, unitId, utterance, phase, history });
      const drop: Drop | null = bank?.maybeDrop() ?? null;
      const unlocked = drop
        ? applyReward(config.dataDir, childName, lesson.reward.stat, drop.xp).unlocked
        : [];
      appendTranscript(config.dataDir, childName, { kind: "kid", text: utterance });
      appendTranscript(config.dataDir, childName, {
        kind: "turn", enemy: turn.enemy_line, coach: turn.coach_line,
        damage: turn.damage, deep_question: turn.deep_question, drop,
      });
      res.json({ turn, drop, unlocked });
    } catch (e) {
      const status = e instanceof TurnServiceError ? 502 : 500;
      res.status(status).json({ error: String(e) });
    }
  });

  app.post("/api/session/end", (req, res) => {
    const { childName, unitId, summary } = req.body;
    const lesson = loadLesson(config.contentDir, lessonSubject(unitId, config), unitId);
    const bank = banks.get(bankKey(childName, unitId));
    let drops: Drop[] = [];
    let unlocked: { japanese_name: string; unlock_message: string }[] = [];
    if (bank) {
      const out = bank.endOfSession();
      drops = out.drops;
      writeCarry(config.dataDir, childName, out.carryMs);
      for (const d of drops) {
        unlocked = unlocked.concat(
          applyReward(config.dataDir, childName, lesson.reward.stat, d.xp).unlocked,
        );
      }
      banks.delete(bankKey(childName, unitId));
    }
    recordLessonSummary(config.dataDir, childName, {
      unitId, title: lesson.title, summary,
      date: new Date().toISOString().slice(0, 10),
    });
    appendTranscript(config.dataDir, childName, { kind: "session-end", unitId, summary, drops });
    res.json({ drops, unlocked });
  });

  app.get("/api/tts", async (req, res) => {
    try {
      const wav = await synthesize(
        config.voicevoxUrl, String(req.query.text ?? ""), Number(req.query.speaker ?? 1),
      );
      res.type("audio/wav").send(Buffer.from(wav));
    } catch (e) {
      if (e instanceof TtsUnavailableError) res.status(503).json({ error: "tts-unavailable" });
      else res.status(500).json({ error: String(e) });
    }
  });

  return app;
}

// v1: all units live under negotiation; when more subjects arrive, the client
// sends subject explicitly and this helper goes away.
function lessonSubject(_unitId: string, _config: AppConfig): string {
  return "negotiation";
}
```

`src/backend/server.ts`:

```ts
import { loadConfig } from "./config";
import { makeApp } from "./api/routes";
import { makeRealClient } from "./services/claude-turn";

const config = loadConfig();
const app = makeApp({ config, claude: makeRealClient() });
app.listen(config.port, () => {
  console.log(`Talk Quest backend on http://localhost:${config.port} (model: ${config.model})`);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/backend/api.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run whole backend suite**

Run: `npx vitest run`
Expected: all tests from Tasks 1–10 PASS

- [ ] **Step 6: Commit**

```bash
git add src/backend/api/routes.ts src/backend/server.ts tests/backend/api.test.ts
git commit -m "feat: express API — session, turn, rewards, tts proxy"
```

---

### Task 11: Frontend scaffolding, screens & hero setup

**Files:**
- Create: `src/game/vite.config.ts`, `src/game/index.html`, `src/game/main.ts`, `src/game/style.css`, `src/game/screens.ts`, `src/game/api.ts`
- Test: `tests/game/screens.test.ts` (logic only — screen state machine)

**Interfaces:**
- Consumes: HTTP API (Task 10).
- Produces:
  - `api.ts`: `startSession(childName, subject, unitId)`, `postTurn(body)`, `endSession(body)`, `listLessons(subject)`, `ttsUrl(text, speaker)` — thin typed fetch wrappers against `/api/*` (Vite dev proxy → backend port).
  - `screens.ts`: `class ScreenRouter { show(name: "setup"|"subjects"|"units"|"arena"): void; current: string }` — toggles `.screen` sections by id; exported for the session controller (Task 15).
  - Screen DOM ids: `#screen-setup` (name entry + avatar picker), `#screen-subjects` (12 subject buttons; only negotiation enabled), `#screen-units`, `#screen-arena` (filled by Tasks 13–14).
  - LocalStorage key `tq-child` stores `{ name, avatar }`.

- [ ] **Step 1: Write the failing test**

`tests/game/screens.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ScreenRouter } from "../../src/game/screens";

beforeEach(() => {
  document.body.innerHTML = `
    <section class="screen" id="screen-setup"></section>
    <section class="screen" id="screen-subjects"></section>
    <section class="screen" id="screen-units"></section>
    <section class="screen" id="screen-arena"></section>`;
});

describe("ScreenRouter", () => {
  it("shows exactly one screen at a time", () => {
    const r = new ScreenRouter();
    r.show("subjects");
    expect(document.getElementById("screen-subjects")!.classList.contains("active")).toBe(true);
    expect(document.querySelectorAll(".screen.active")).toHaveLength(1);
    r.show("arena");
    expect(r.current).toBe("arena");
    expect(document.getElementById("screen-subjects")!.classList.contains("active")).toBe(false);
  });
});
```

Install jsdom first: `npm install -D jsdom`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/screens.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the frontend shell**

`src/game/vite.config.ts`:

```ts
import { defineConfig } from "vite";
export default defineConfig({
  root: "src/game",
  server: { proxy: { "/api": "http://localhost:5179" } },
});
```

`src/game/screens.ts`:

```ts
export type ScreenName = "setup" | "subjects" | "units" | "arena";

export class ScreenRouter {
  current: ScreenName = "setup";
  show(name: ScreenName): void {
    document.querySelectorAll<HTMLElement>(".screen").forEach((el) =>
      el.classList.toggle("active", el.id === `screen-${name}`),
    );
    this.current = name;
  }
}
```

`src/game/api.ts`:

```ts
import type { TurnRequest, TurnResult } from "../shared/types/turn";

export interface Drop { xp: number; kind: string }
export interface Unlock { japanese_name: string; unlock_message: string }

const j = async (r: Response) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

export const listLessons = (subject: string): Promise<{ id: string; title: string }[]> =>
  fetch(`/api/lessons/${subject}`).then(j);

export const startSession = (childName: string, subject: string, unitId: string) =>
  fetch("/api/session/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childName, subject, unitId }),
  }).then(j);

export const postTurn = (
  body: TurnRequest & { voicedMs: number },
): Promise<{ turn: TurnResult; drop: Drop | null; unlocked: Unlock[] }> =>
  fetch("/api/turn", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const endSession = (body: { childName: string; unitId: string; summary: string }) =>
  fetch("/api/session/end", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const ttsUrl = (text: string, speaker: number) =>
  `/api/tts?text=${encodeURIComponent(text)}&speaker=${speaker}`;
```

`src/game/index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>トーククエスト</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <section class="screen active" id="screen-setup">
    <h1>トーククエスト</h1>
    <label>なまえ <input id="child-name" placeholder="なまえをいれてね" /></label>
    <div id="avatar-picker"></div>
    <button id="btn-start" class="big">ぼうけんに でる！</button>
  </section>

  <section class="screen" id="screen-subjects">
    <h2>なにを まなぶ？</h2>
    <div id="subject-grid"></div>
  </section>

  <section class="screen" id="screen-units">
    <h2 id="units-title">レッスンを えらぼう</h2>
    <div id="unit-list"></div>
    <button id="btn-back-subjects">もどる</button>
  </section>

  <section class="screen" id="screen-arena">
    <canvas id="arena-canvas"></canvas>
    <div id="hud"></div>
  </section>

  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`src/game/style.css`:

```css
* { box-sizing: border-box; margin: 0; }
body { font-family: "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif;
       background: #2b2350; color: #fff; overflow: hidden; }
.screen { display: none; position: fixed; inset: 0; padding: 24px;
          flex-direction: column; align-items: center; justify-content: center; gap: 20px;
          transition: opacity .3s ease; }
.screen.active { display: flex; }
h1 { font-size: 3rem; } h2 { font-size: 2rem; }
button { font-size: 1.4rem; padding: 14px 28px; border-radius: 16px; border: none;
         background: #ffb703; color: #333; cursor: pointer; transition: transform .15s; }
button:hover { transform: scale(1.06); }
button.big { font-size: 2rem; }
button:disabled { background: #666; color: #999; cursor: default; transform: none; }
input { font-size: 1.6rem; padding: 10px 16px; border-radius: 12px; border: none; }
#subject-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
#unit-list { display: flex; flex-direction: column; gap: 14px; }
#arena-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud { position: absolute; inset: 0; pointer-events: none; }
#avatar-picker { display: flex; gap: 12px; }
#avatar-picker img, #avatar-picker .avatar-slot { width: 84px; height: 84px; border-radius: 50%;
  border: 4px solid transparent; cursor: pointer; background: #444; }
#avatar-picker .selected { border-color: #ffb703; }
```

`src/game/main.ts`:

```ts
import { ScreenRouter } from "./screens";
import { listLessons } from "./api";

const SUBJECTS: { id: string; label: string; enabled: boolean }[] = [
  { id: "negotiation", label: "こうしょう", enabled: true },
  { id: "social", label: "ソーシャル", enabled: false },
  { id: "english", label: "えいご", enabled: false },
  { id: "psychology", label: "こころ", enabled: false },
  { id: "persuasion", label: "せっとく", enabled: false },
  { id: "lifehack", label: "ライフハック", enabled: false },
  { id: "philosophy", label: "てつがく", enabled: false },
  { id: "morals", label: "モラル", enabled: false },
  { id: "friendship", label: "ゆうじょう", enabled: false },
  { id: "teamwork", label: "チームワーク", enabled: false },
  { id: "money", label: "おかね", enabled: false },
  { id: "stocks", label: "かぶ", enabled: false },
];

export const router = new ScreenRouter();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export function getChild(): { name: string; avatar: string } | null {
  const raw = localStorage.getItem("tq-child");
  return raw ? JSON.parse(raw) : null;
}

function initSetup() {
  const saved = getChild();
  if (saved) ($("#child-name") as HTMLInputElement).value = saved.name;
  const picker = $("#avatar-picker");
  ["🦊", "🐰", "🐯", "🐸"].forEach((emoji, i) => {
    const slot = document.createElement("div");
    slot.className = "avatar-slot" + (i === 0 ? " selected" : "");
    slot.textContent = emoji;
    slot.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:3rem";
    slot.onclick = () => {
      picker.querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
      slot.classList.add("selected");
    };
    picker.appendChild(slot);
  });
  $("#btn-start").onclick = () => {
    const name = ($("#child-name") as HTMLInputElement).value.trim();
    if (!name) return;
    const avatar = picker.querySelector(".selected")?.textContent ?? "🦊";
    localStorage.setItem("tq-child", JSON.stringify({ name, avatar }));
    router.show("subjects");
  };
}

function initSubjects() {
  const grid = $("#subject-grid");
  for (const s of SUBJECTS) {
    const b = document.createElement("button");
    b.textContent = s.label;
    b.disabled = !s.enabled;
    b.onclick = async () => {
      const units = await listLessons(s.id);
      const list = $("#unit-list");
      list.innerHTML = "";
      for (const u of units) {
        const ub = document.createElement("button");
        ub.textContent = u.title;
        ub.onclick = () => {
          // Arena launch is wired in Task 15 (session controller).
          document.dispatchEvent(new CustomEvent("tq-launch", { detail: { subject: s.id, unitId: u.id } }));
        };
        list.appendChild(ub);
      }
      router.show("units");
    };
    grid.appendChild(b);
  }
  $("#btn-back-subjects").onclick = () => router.show("subjects");
}

initSetup();
initSubjects();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/screens.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev:server` in one terminal, `npm run dev:game` in another. Open the Vite URL in Chrome.
Expected: setup screen → name + avatar → subjects grid (only こうしょう enabled) → unit list shows 3 units. Clicking a unit does nothing visible yet (event fires; arena comes in Tasks 13–15).

- [ ] **Step 6: Commit**

```bash
git add src/game tests/game/screens.test.ts package.json package-lock.json
git commit -m "feat: frontend shell — setup, subject and unit screens"
```

---

### Task 12: Speech recognizer module (Web Speech + debug input + activity signal)

**Files:**
- Create: `src/game/speech.ts`
- Test: `tests/game/speech.test.ts`

**Interfaces:**
- Consumes: browser `webkitSpeechRecognition` (feature-detected).
- Produces:
  - `interface SpeechEvents { onInterim(text: string): void; onFinal(text: string, voicedMs: number): void; onSilence(): void }` — `onSilence` fires after 10 s with no speech while listening.
  - `class Recognizer { constructor(events: SpeechEvents, lang?: "ja-JP"|"en-US"); start(): void; stop(): void; get listening(): boolean; setLang(l: "ja-JP"|"en-US"): void }` — tracks voiced duration between first interim and final result (this is the engagement signal).
  - `class DebugRecognizer` — same events interface, fed from a text input (`window.tqSay("...")`); `voicedMs` simulated as `text.length * 120`. Selected automatically when `location.search` contains `debug=1` **or** Web Speech API is unavailable.
  - `makeRecognizer(events: SpeechEvents): Recognizer | DebugRecognizer`

- [ ] **Step 1: Write the failing test (DebugRecognizer only — the real one needs Chrome)**

`tests/game/speech.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DebugRecognizer } from "../../src/game/speech";

describe("DebugRecognizer", () => {
  it("emits final with simulated voicedMs when tqSay is called", () => {
    const onFinal = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal, onSilence: vi.fn() });
    r.start();
    (window as never as { tqSay(t: string): void }).tqSay("やすくして");
    expect(onFinal).toHaveBeenCalledWith("やすくして", "やすくして".length * 120);
  });
  it("ignores tqSay while stopped", () => {
    const onFinal = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal, onSilence: vi.fn() });
    (window as never as { tqSay(t: string): void }).tqSay("x");
    expect(onFinal).not.toHaveBeenCalled();
  });
  it("fires onSilence after 10s of listening with no speech", () => {
    vi.useFakeTimers();
    const onSilence = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal: vi.fn(), onSilence });
    r.start();
    vi.advanceTimersByTime(10_100);
    expect(onSilence).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/speech.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/game/speech.ts`**

```ts
export interface SpeechEvents {
  onInterim(text: string): void;
  onFinal(text: string, voicedMs: number): void;
  onSilence(): void;
}

const SILENCE_MS = 10_000;

export class Recognizer {
  private rec: SpeechRecognition;
  private voiceStart = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  listening = false;

  constructor(private events: SpeechEvents, lang: "ja-JP" | "en-US" = "ja-JP") {
    const Ctor = (window as never as { webkitSpeechRecognition: new () => SpeechRecognition })
      .webkitSpeechRecognition;
    this.rec = new Ctor();
    this.rec.lang = lang;
    this.rec.interimResults = true;
    this.rec.continuous = false;
    this.rec.onresult = (e: SpeechRecognitionEvent) => {
      this.resetSilence();
      if (!this.voiceStart) this.voiceStart = Date.now();
      const res = e.results[e.results.length - 1];
      const text = res[0].transcript;
      if (res.isFinal) {
        const voicedMs = Date.now() - this.voiceStart;
        this.voiceStart = 0;
        this.events.onFinal(text, voicedMs);
      } else {
        this.events.onInterim(text);
      }
    };
    this.rec.onend = () => { if (this.listening) this.rec.start(); }; // keep alive
  }

  setLang(l: "ja-JP" | "en-US") { this.rec.lang = l; }

  start() { this.listening = true; this.voiceStart = 0; this.rec.start(); this.resetSilence(); }
  stop() { this.listening = false; this.clearSilence(); this.rec.stop(); }

  private resetSilence() {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => this.events.onSilence(), SILENCE_MS);
  }
  private clearSilence() { if (this.silenceTimer) clearTimeout(this.silenceTimer); }
}

export class DebugRecognizer {
  listening = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: SpeechEvents, _lang: "ja-JP" | "en-US" = "ja-JP") {
    (window as never as { tqSay(t: string): void }).tqSay = (t: string) => {
      if (!this.listening) return;
      this.resetSilence();
      this.events.onInterim(t);
      this.events.onFinal(t, t.length * 120);
    };
  }

  setLang(_l: "ja-JP" | "en-US") { /* debug: no-op */ }
  start() { this.listening = true; this.resetSilence(); }
  stop() {
    this.listening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
  }
  private resetSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.events.onSilence(), SILENCE_MS);
  }
}

export function makeRecognizer(events: SpeechEvents): Recognizer | DebugRecognizer {
  const hasApi = "webkitSpeechRecognition" in window;
  const forced = new URLSearchParams(location.search).get("debug") === "1";
  return forced || !hasApi ? new DebugRecognizer(events) : new Recognizer(events);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game/speech.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/game/speech.ts tests/game/speech.test.ts
git commit -m "feat: speech recognizer with debug mode and engagement signal"
```

---

### Task 13: Arena scene — Three.js stage, WebM enemy sprite, hero & tutor

**Files:**
- Create: `src/game/arena.ts`
- Copy assets: `content/avatars/enemies/` — copy 3 bull WebM sets used by the units (`yellow`, `red`, `purple`, all 10 actions each) from `/mnt/c/Projects/book/credit-palace/assets/character/web/` (read-only source).
- Test: manual visual verification (WebGL + video textures don't unit-test meaningfully).

**Interfaces:**
- Consumes: `EnemyAction` (Task 2). Enemy WebM naming: `bull_<NN>_<action>_transparent_<color>.webm` (e.g. `bull_05_shock_transparent_yellow.webm`).
- Produces:
  - `class Arena { constructor(canvas: HTMLCanvasElement); loadEnemy(color: string): Promise<void>; setEnemyAction(a: EnemyAction): void; setHero(emoji: string, name: string): void; heroAttack(): void; enemyDefeat(): void; dispose(): void }`
  - Video-textured billboard for the enemy; hero = emoji sprite on a canvas texture in the foreground (over-the-shoulder framing); tutor = static emoji sprite at screen left.

- [ ] **Step 1: Copy the enemy assets**

```bash
mkdir -p content/avatars/enemies
for color in yellow red purple; do
  cp /mnt/c/Projects/book/credit-palace/assets/character/web/bull_*_transparent_${color}.webm content/avatars/enemies/
done
ls content/avatars/enemies | wc -l   # expect 30
```

Then make Vite serve them — add to `src/game/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/game",
  publicDir: resolve(__dirname, "../../content"),
  server: { proxy: { "/api": "http://localhost:5179" } },
});
```
(Enemy videos are then reachable at `/avatars/enemies/bull_*.webm`.)

- [ ] **Step 2: Implement `src/game/arena.ts`**

```ts
import * as THREE from "three";
import type { EnemyAction } from "../shared/types/turn";

const ACTION_FILES: Record<EnemyAction, string> = {
  idle: "01_surf", angry: "02_angry", cry: "03_cry", laugh: "04_laugh",
  shock: "05_shock", excitement: "06_excitement", dancing: "07_dancing",
  fighting: "08_fighting", flying: "09_flying", sleep: "10_sleep",
};

function emojiSprite(emoji: string, size = 256): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.font = `${size * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
  return new THREE.Sprite(mat);
}

export class Arena {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private video: HTMLVideoElement;
  private enemy: THREE.Sprite | null = null;
  private hero: THREE.Sprite | null = null;
  private color = "yellow";
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 5);
    this.scene.background = new THREE.Color("#3a2f6b");

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshBasicMaterial({ color: "#5a4a8a" }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const tutor = emojiSprite("🦉");
    tutor.position.set(-2.6, 1.2, 1.5);
    tutor.scale.set(1.1, 1.1, 1);
    this.scene.add(tutor);

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.enemy) (this.enemy.material.map as THREE.VideoTexture | null)?.update?.();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  async loadEnemy(color: string): Promise<void> {
    this.color = color;
    const tex = new THREE.VideoTexture(this.video);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.enemy = new THREE.Sprite(mat);
    this.enemy.position.set(0.6, 1.5, 0);
    this.enemy.scale.set(3, 3, 1);
    this.scene.add(this.enemy);
    this.setEnemyAction("idle");
  }

  setEnemyAction(a: EnemyAction): void {
    this.video.src = `/avatars/enemies/bull_${ACTION_FILES[a]}_transparent_${this.color}.webm`;
    void this.video.play().catch(() => { /* autoplay needs user gesture; battle starts with one */ });
  }

  setHero(emoji: string, _name: string): void {
    if (this.hero) this.scene.remove(this.hero);
    this.hero = emojiSprite(emoji);
    this.hero.position.set(-0.9, 0.9, 3.2); // foreground, back-to-camera framing
    this.hero.scale.set(1.6, 1.6, 1);
    this.scene.add(this.hero);
  }

  heroAttack(): void {
    if (!this.hero) return;
    const start = this.hero.position.clone();
    const t0 = performance.now();
    const anim = (t: number) => {
      const k = Math.min(1, (t - t0) / 300);
      const lunge = Math.sin(k * Math.PI) * 0.8;
      this.hero!.position.set(start.x + lunge * 0.6, start.y, start.z - lunge);
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  enemyDefeat(): void {
    this.setEnemyAction("cry");
    if (!this.enemy) return;
    const t0 = performance.now();
    const anim = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      this.enemy!.position.x = 0.6 + k * 8; // runs away
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
```

- [ ] **Step 3: Wire a temporary preview to verify visually**

Append to `src/game/main.ts` (temporary, removed in Task 15):

```ts
// TEMP preview (Task 13) — replaced by session controller in Task 15
document.addEventListener("tq-launch", async () => {
  router.show("arena");
  const { Arena } = await import("./arena");
  const arena = new Arena(document.getElementById("arena-canvas") as HTMLCanvasElement);
  await arena.loadEnemy("yellow");
  arena.setHero(getChild()?.avatar ?? "🦊", getChild()?.name ?? "");
});
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev:server` + `npm run dev:game`, open in Chrome, pick a unit.
Expected: purple arena floor, owl tutor at left, animated yellow bull enemy center-right, hero emoji in the foreground. No console errors (an autoplay warning before first click is acceptable).

- [ ] **Step 5: Commit**

```bash
git add src/game/arena.ts src/game/vite.config.ts src/game/main.ts content/avatars/enemies
git commit -m "feat: three.js arena with WebM enemy sprite, hero and tutor"
```

---

### Task 14: HUD + audio manager

**Files:**
- Create: `src/game/hud.ts`, `src/game/audio.ts`
- Test: `tests/game/hud.test.ts`, `tests/game/audio.test.ts`

**Interfaces:**
- Consumes: `ttsUrl` (Task 11).
- Produces:
  - `class Hud { constructor(root: HTMLElement); setHp(current: number, max: number): void; setSubtitle(text: string): void; caption(who: "enemy"|"coach", text: string): void; damageNumber(n: number): void; journalAdd(entry: string): void; toast(text: string): void; celebration(text: string): void; micState(s: "idle"|"listening"|"thinking"): void; showRetry(onRetry: () => void): void }` — builds all HUD DOM inside `root`. **No earning meter and no correctness display anywhere** (spec §3.5).
  - `class AudioMan { playBgm(phase: "teach"|"battle"|"victory"): void; stopBgm(): void; sfx(name: "hit"|"miss"|"fanfare"|"unlock"|"click"|"ding"): void; speak(text: string, speaker: number): Promise<void>; interrupt(): void }` — `speak` fetches `/api/tts`; on 503/failure falls back to `window.speechSynthesis`; BGM auto-ducks to 20% volume while speaking; `interrupt()` stops current speech (barge-in). BGM/SFX read from `/audio/bgm/<phase>.mp3`, `/audio/sfx/<name>.mp3` under `content/audio/` — **missing files are silently skipped** (asset-box drop-in slots).

- [ ] **Step 1: Write the failing tests**

`tests/game/hud.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Hud } from "../../src/game/hud";

describe("Hud", () => {
  it("renders HP bar width proportionally", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.setHp(50, 100);
    const fill = root.querySelector<HTMLElement>(".hp-fill")!;
    expect(fill.style.width).toBe("50%");
  });
  it("journal accumulates entries; no earning meter exists", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.journalAdd("りゆうをつけて言えた");
    hud.journalAdd("しつもんできた");
    expect(root.querySelectorAll(".journal li")).toHaveLength(2);
    expect(root.querySelector(".coins, .money, .earnings")).toBeNull();
  });
  it("subtitle updates live", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.setSubtitle("やすく…");
    expect(root.querySelector(".subtitle")!.textContent).toBe("やすく…");
  });
});
```

`tests/game/audio.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AudioMan } from "../../src/game/audio";

describe("AudioMan", () => {
  it("falls back to speechSynthesis when tts fetch fails", async () => {
    const speak = vi.fn();
    (window as never as { speechSynthesis: unknown }).speechSynthesis = {
      speak, cancel: vi.fn(),
    };
    (window as never as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
      class { constructor(public text: string) {} onend: (() => void) | null = null; };
    const am = new AudioMan(vi.fn().mockRejectedValue(new Error("down")) as never);
    const p = am.speak("こんにちは", 13);
    await new Promise((r) => setTimeout(r, 0));
    const utt = speak.mock.calls[0][0] as { onend: () => void };
    utt.onend(); // simulate finish
    await p;
    expect(speak).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game/hud.test.ts tests/game/audio.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement `src/game/hud.ts`**

```ts
export class Hud {
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="hp-wrap"><div class="hp-bar"><div class="hp-fill"></div></div>
        <span class="enemy-name"></span></div>
      <div class="captions"></div>
      <div class="subtitle"></div>
      <div class="journal-wrap">📖 <ul class="journal"></ul></div>
      <div class="mic-state" data-state="idle">🎤</div>
      <div class="fx-layer"></div>`;
    for (const k of ["hp-fill", "captions", "subtitle", "journal", "mic-state", "fx-layer", "enemy-name"]) {
      this.el[k] = this.root.querySelector(`.${k}`) as HTMLElement;
    }
  }

  setEnemyName(n: string) { this.el["enemy-name"].textContent = n; }

  setHp(current: number, max: number): void {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    this.el["hp-fill"].style.width = `${pct}%`;
  }

  setSubtitle(text: string): void { this.el["subtitle"].textContent = text; }

  caption(who: "enemy" | "coach", text: string): void {
    const d = document.createElement("div");
    d.className = `caption caption-${who}`;
    d.textContent = `${who === "enemy" ? "👹" : "🦉"} ${text}`;
    this.el["captions"].appendChild(d);
    while (this.el["captions"].children.length > 3) this.el["captions"].firstChild!.remove();
  }

  damageNumber(n: number): void {
    const d = document.createElement("div");
    d.className = "dmg-pop";
    d.textContent = String(n);
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  journalAdd(entry: string): void {
    const li = document.createElement("li");
    li.textContent = entry;
    this.el["journal"].appendChild(li);
  }

  toast(text: string): void {
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = text;
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  celebration(text: string): void {
    const d = document.createElement("div");
    d.className = "celebration";
    d.textContent = `🎁 ${text}`;
    for (let i = 0; i < 24; i++) {
      const p = document.createElement("span");
      p.className = "confetti";
      p.style.setProperty("--dx", `${(Math.random() - 0.5) * 400}px`);
      p.style.setProperty("--delay", `${Math.random() * 0.4}s`);
      d.appendChild(p);
    }
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  micState(s: "idle" | "listening" | "thinking"): void {
    this.el["mic-state"].dataset.state = s;
    this.el["mic-state"].textContent = s === "listening" ? "🎤…" : s === "thinking" ? "💭" : "🎤";
  }

  showRetry(onRetry: () => void): void {
    const b = document.createElement("button");
    b.className = "retry";
    b.textContent = "もういっかい！";
    b.style.pointerEvents = "auto";
    b.onclick = () => { b.remove(); onRetry(); };
    this.el["fx-layer"].appendChild(b);
  }
}
```

Append HUD styles to `src/game/style.css`:

```css
.hp-wrap { position: absolute; top: 16px; right: 16px; width: 320px; }
.hp-bar { height: 22px; background: #222; border-radius: 11px; overflow: hidden; }
.hp-fill { height: 100%; width: 100%; background: linear-gradient(90deg,#ff5e5e,#ffb703);
           transition: width .5s ease; }
.enemy-name { font-size: 1.1rem; }
.subtitle { position: absolute; bottom: 88px; width: 100%; text-align: center;
            font-size: 1.6rem; text-shadow: 0 2px 6px #000; min-height: 2rem; }
.captions { position: absolute; bottom: 130px; width: 100%; display: flex;
            flex-direction: column; align-items: center; gap: 6px; }
.caption { background: rgba(0,0,0,.55); padding: 8px 18px; border-radius: 14px;
           font-size: 1.3rem; animation: rise .3s ease; }
.journal-wrap { position: absolute; top: 16px; left: 16px; max-width: 260px;
                background: rgba(0,0,0,.35); border-radius: 12px; padding: 10px; font-size: .95rem; }
.journal { list-style: "・"; padding-left: 1em; }
.mic-state { position: absolute; bottom: 24px; width: 100%; text-align: center; font-size: 2.4rem; }
.mic-state[data-state="listening"] { animation: pulse 1s infinite; }
.dmg-pop { position: absolute; top: 30%; right: 30%; font-size: 3.4rem; font-weight: bold;
           color: #ffd166; animation: pop 1.2s ease forwards; }
.toast { position: absolute; top: 20%; width: 100%; text-align: center; font-size: 1.6rem;
         animation: rise .4s ease; }
.celebration { position: absolute; inset: 0; display: flex; align-items: center;
               justify-content: center; font-size: 2.2rem; }
.confetti { position: absolute; top: 40%; left: 50%; width: 10px; height: 10px;
            background: hsl(calc(360 * var(--delay,0) * 2.5), 90%, 60%);
            animation: burst 1.6s var(--delay) ease-out forwards; }
.retry { position: absolute; bottom: 20%; left: 50%; transform: translateX(-50%); }
@keyframes pop { 0% {transform: scale(.3)} 30% {transform: scale(1.3)} 100% {transform: translateY(-80px) scale(1); opacity: 0} }
@keyframes rise { from {transform: translateY(14px); opacity: 0} to {transform: none; opacity: 1} }
@keyframes pulse { 50% { opacity: .4 } }
@keyframes burst { to { transform: translate(var(--dx), 60vh) rotate(720deg); opacity: 0 } }
```

- [ ] **Step 4: Implement `src/game/audio.ts`**

```ts
import { ttsUrl } from "./api";

type Sfx = "hit" | "miss" | "fanfare" | "unlock" | "click" | "ding";
type BgmPhase = "teach" | "battle" | "victory";

export class AudioMan {
  private bgm: HTMLAudioElement | null = null;
  private current: HTMLAudioElement | null = null;

  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  playBgm(phase: BgmPhase): void {
    this.stopBgm();
    const a = new Audio(`/audio/bgm/${phase}.mp3`);
    a.loop = true;
    a.volume = 0.6;
    a.play().catch(() => { /* asset missing or autoplay blocked → silent slot */ });
    this.bgm = a;
  }

  stopBgm(): void { this.bgm?.pause(); this.bgm = null; }

  sfx(name: Sfx): void {
    const a = new Audio(`/audio/sfx/${name}.mp3`);
    a.play().catch(() => { /* silent slot until asset box arrives */ });
  }

  private duck(on: boolean): void { if (this.bgm) this.bgm.volume = on ? 0.12 : 0.6; }

  async speak(text: string, speaker: number): Promise<void> {
    this.interrupt();
    this.duck(true);
    try {
      const r = await this.fetchFn(ttsUrl(text, speaker));
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      await new Promise<void>((resolve) => {
        const a = new Audio(URL.createObjectURL(blob));
        this.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      });
    } catch {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.onend = () => resolve();
        window.speechSynthesis.speak(u);
      });
    } finally {
      this.duck(false);
      this.current = null;
    }
  }

  interrupt(): void {
    this.current?.pause();
    this.current = null;
    window.speechSynthesis?.cancel?.();
    this.duck(false);
  }
}
```

Create the asset slot directories:

```bash
mkdir -p content/audio/bgm content/audio/sfx
touch content/audio/bgm/.gitkeep content/audio/sfx/.gitkeep
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/game/hud.test.ts tests/game/audio.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/game/hud.ts src/game/audio.ts src/game/style.css content/audio tests/game/hud.test.ts tests/game/audio.test.ts
git commit -m "feat: HUD (hp, subtitles, journal, celebrations) and audio manager with TTS fallback"
```

---

### Task 15: Session controller — the full game loop

**Files:**
- Create: `src/game/session.ts`
- Modify: `src/game/main.ts` (replace the Task-13 TEMP preview block with the real launch)
- Test: `tests/game/session.test.ts`

**Interfaces:**
- Consumes: everything frontend — `Arena` (13), `Hud`/`AudioMan` (14), `makeRecognizer`/`SpeechEvents` (12), api wrappers (11), `TurnResult`/`Phase` (2).
- Produces:
  - `class SessionController { constructor(deps: SessionDeps); start(subject: string, unitId: string): Promise<void> }` where `SessionDeps = { arena: ArenaLike; hud: HudLike; audio: AudioLike; api: ApiLike; child: { name: string; avatar: string }; makeRec(events: SpeechEvents): RecLike; onExit(): void }` — all dependencies are the structural interfaces below so the test can pass fakes:
    - `ArenaLike = { loadEnemy(c: string): Promise<void>; setEnemyAction(a: string): void; setHero(e: string, n: string): void; heroAttack(): void; enemyDefeat(): void }`
    - `HudLike = { setHp(c: number, m: number): void; setEnemyName(n: string): void; setSubtitle(t: string): void; caption(w: "enemy"|"coach", t: string): void; damageNumber(n: number): void; journalAdd(e: string): void; toast(t: string): void; celebration(t: string): void; micState(s: string): void; showRetry(f: () => void): void }`
    - `AudioLike = { playBgm(p: string): void; stopBgm(): void; sfx(n: string): void; speak(t: string, s: number): Promise<void>; interrupt(): void }`
    - `ApiLike = { startSession: typeof startSession; postTurn: typeof postTurn; endSession: typeof endSession }`
    - `RecLike = { start(): void; stop(): void; setLang(l: "ja-JP"|"en-US"): void }`
  - Behavior (the loop): start → `startSession` → hero+enemy load → teach phase (tutor speaks `lesson.teach` beats, BGM "teach") → listening → on final utterance: recognizer stops, `micState("thinking")`, `postTurn` → enemy HP -= damage, sprite action, hero attack anim + "hit" sfx (damage>0), captions, tutor speaks coach line then enemy speaks enemy line (enemy `voice` id; tutor speaker id **3**), deep question spoken if present and journaled → drop? celebration+unlock toasts (informational text from server) → phase transitions: `debrief` → victory BGM + `enemyDefeat()`; `end` → `endSession` (summary = last coach line) then session-end drops celebrated → back to `subjects` screen. Errors: `postTurn` failure → tutor speaks 「ちょっとかんがえちゅう…もういちどいってみて！」 and resumes listening; barge-in: recognizer interim → `audio.interrupt()`; silence 10 s → tutor re-prompt 「きこえてるよ、ゆっくりでいいからね」.

- [ ] **Step 1: Write the failing test**

`tests/game/session.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SessionController } from "../../src/game/session";
import type { SpeechEvents } from "../../src/game/speech";

function makeDeps(turnQueue: object[]) {
  let speechEvents: SpeechEvents | null = null;
  const deps = {
    arena: {
      loadEnemy: vi.fn().mockResolvedValue(undefined), setEnemyAction: vi.fn(),
      setHero: vi.fn(), heroAttack: vi.fn(), enemyDefeat: vi.fn(),
    },
    hud: {
      setHp: vi.fn(), setEnemyName: vi.fn(), setSubtitle: vi.fn(), caption: vi.fn(),
      damageNumber: vi.fn(), journalAdd: vi.fn(), toast: vi.fn(), celebration: vi.fn(),
      micState: vi.fn(), showRetry: vi.fn(),
    },
    audio: {
      playBgm: vi.fn(), stopBgm: vi.fn(), sfx: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined), interrupt: vi.fn(),
    },
    api: {
      startSession: vi.fn().mockResolvedValue({
        lesson: {
          id: "unit-01", subject: "negotiation", title: "T",
          teach: ["beat1"], check_questions: [],
          enemy: { name: "ゴルド", persona: "p", voice: 13, sprite: "yellow", hp: 100, win_criteria: "w" },
          reward: { stat: "charisma", xp: 50 }, lang: "ja",
        },
        profile: { name: "yuta", age: 8, interests: [], recentLessons: [] },
        carriedMs: 0,
      }),
      postTurn: vi.fn().mockImplementation(() => Promise.resolve(turnQueue.shift())),
      endSession: vi.fn().mockResolvedValue({ drops: [], unlocked: [] }),
    },
    child: { name: "yuta", avatar: "🦊" },
    makeRec: (ev: SpeechEvents) => {
      speechEvents = ev;
      return { start: vi.fn(), stop: vi.fn(), setLang: vi.fn() };
    },
    onExit: vi.fn(),
  };
  return { deps, say: (t: string) => speechEvents!.onFinal(t, 2000) };
}

const battleTurn = {
  turn: { enemy_line: "ぐぬ", enemy_action: "shock", coach_line: "いいね",
          damage: 40, score_reason: "r", phase: "battle", deep_question: null },
  drop: null, unlocked: [],
};
const endTurn = {
  turn: { enemy_line: "まいった！", enemy_action: "cry", coach_line: "りゆうが言えたね",
          damage: 60, score_reason: "r", phase: "end", deep_question: "あしたどう使う？" },
  drop: { xp: 8, kind: "treasure" }, unlocked: [{ japanese_name: "バッジ", unlock_message: "バッジを手に入れた！" }],
};

describe("SessionController", () => {
  it("runs teach intro then processes a battle turn", async () => {
    const { deps, say } = makeDeps([structuredClone(battleTurn)]);
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    expect(deps.audio.speak).toHaveBeenCalled();          // teach beat spoken
    expect(deps.arena.setHero).toHaveBeenCalledWith("🦊", "yuta");
    say("やすくして");
    await vi.waitFor(() => expect(deps.api.postTurn).toHaveBeenCalled());
    await vi.waitFor(() => expect(deps.hud.setHp).toHaveBeenCalledWith(60, 100));
    expect(deps.arena.heroAttack).toHaveBeenCalled();
    expect(deps.arena.setEnemyAction).toHaveBeenCalledWith("shock");
  });

  it("on phase end: defeat animation, celebration for drop+unlock, session end", async () => {
    const { deps, say } = makeDeps([structuredClone(endTurn)]);
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    say("おてつだいするから、やすくして");
    await vi.waitFor(() => expect(deps.api.endSession).toHaveBeenCalled());
    expect(deps.arena.enemyDefeat).toHaveBeenCalled();
    expect(deps.hud.celebration).toHaveBeenCalled();      // surprise drop revealed
    expect(deps.hud.toast).toHaveBeenCalledWith("バッジを手に入れた！");
    expect(deps.hud.journalAdd).toHaveBeenCalled();       // deep question journaled
  });

  it("tutor apologises and keeps listening when postTurn fails", async () => {
    const { deps, say } = makeDeps([]);
    (deps.api.postTurn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("502"));
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    say("あ");
    await vi.waitFor(() =>
      expect(deps.audio.speak).toHaveBeenCalledWith(expect.stringContaining("かんがえちゅう"), expect.anything()),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/session.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/game/session.ts`**

```ts
import type { SpeechEvents } from "./speech";
import type { TurnResult, Phase } from "../shared/types/turn";
import type { startSession, postTurn, endSession, Drop, Unlock } from "./api";

const TUTOR_SPEAKER = 3;

export interface SessionDeps {
  arena: {
    loadEnemy(c: string): Promise<void>; setEnemyAction(a: string): void;
    setHero(e: string, n: string): void; heroAttack(): void; enemyDefeat(): void;
  };
  hud: {
    setHp(c: number, m: number): void; setEnemyName(n: string): void;
    setSubtitle(t: string): void; caption(w: "enemy" | "coach", t: string): void;
    damageNumber(n: number): void; journalAdd(e: string): void; toast(t: string): void;
    celebration(t: string): void; micState(s: string): void; showRetry(f: () => void): void;
  };
  audio: {
    playBgm(p: string): void; stopBgm(): void; sfx(n: string): void;
    speak(t: string, s: number): Promise<void>; interrupt(): void;
  };
  api: { startSession: typeof startSession; postTurn: typeof postTurn; endSession: typeof endSession };
  child: { name: string; avatar: string };
  makeRec(events: SpeechEvents): { start(): void; stop(): void; setLang(l: "ja-JP" | "en-US"): void };
  onExit(): void;
}

export class SessionController {
  private phase: Phase = "teach";
  private hp = 100;
  private maxHp = 100;
  private history: { role: "kid" | "enemy" | "coach"; text: string }[] = [];
  private lesson!: Awaited<ReturnType<typeof startSession>>["lesson"];
  private rec!: ReturnType<SessionDeps["makeRec"]>;
  private lastCoachLine = "";

  constructor(private d: SessionDeps) {}

  async start(subject: string, unitId: string): Promise<void> {
    const { lesson } = await this.d.api.startSession(this.d.child.name, subject, unitId);
    this.lesson = lesson;
    this.maxHp = this.hp = lesson.enemy.hp;

    this.d.arena.setHero(this.d.child.avatar, this.d.child.name);
    await this.d.arena.loadEnemy(lesson.enemy.sprite);
    this.d.hud.setEnemyName(lesson.enemy.name);
    this.d.hud.setHp(this.hp, this.maxHp);
    this.d.audio.playBgm("teach");

    this.rec = this.d.makeRec({
      onInterim: (t) => { this.d.audio.interrupt(); this.d.hud.setSubtitle(t); },
      onFinal: (t, ms) => void this.handleUtterance(t, ms),
      onSilence: () => void this.d.audio.speak("きこえてるよ、ゆっくりでいいからね", TUTOR_SPEAKER),
    });
    if (lesson.lang === "en") this.rec.setLang("en-US");

    for (const beat of lesson.teach) {
      this.d.hud.caption("coach", beat);
      await this.d.audio.speak(beat, TUTOR_SPEAKER);
    }
    this.listen();
  }

  private listen(): void {
    this.d.hud.micState("listening");
    this.rec.start();
  }

  private async handleUtterance(text: string, voicedMs: number): Promise<void> {
    this.rec.stop();
    this.d.hud.micState("thinking");
    this.d.hud.setSubtitle(text);

    let res: { turn: TurnResult; drop: Drop | null; unlocked: Unlock[] };
    try {
      res = await this.d.api.postTurn({
        childName: this.d.child.name, unitId: this.lesson.id, utterance: text,
        phase: this.phase, history: this.history, voicedMs,
      });
    } catch {
      await this.d.audio.speak("ちょっとかんがえちゅう…もういちどいってみて！", TUTOR_SPEAKER);
      this.listen();
      return;
    }

    const { turn, drop, unlocked } = res;
    this.history.push({ role: "kid", text });
    this.history.push({ role: "enemy", text: turn.enemy_line });
    this.history.push({ role: "coach", text: turn.coach_line });
    this.lastCoachLine = turn.coach_line;

    if (this.phase === "teach" && turn.phase === "battle") this.d.audio.playBgm("battle");
    this.phase = turn.phase;

    if (turn.damage > 0) {
      this.d.arena.heroAttack();
      this.d.audio.sfx("hit");
      this.hp = Math.max(0, this.hp - turn.damage);
      this.d.hud.setHp(this.hp, this.maxHp);
      this.d.hud.damageNumber(turn.damage);
    }
    this.d.arena.setEnemyAction(turn.enemy_action);

    this.d.hud.caption("coach", turn.coach_line);
    await this.d.audio.speak(turn.coach_line, TUTOR_SPEAKER);
    this.d.hud.caption("enemy", turn.enemy_line);
    await this.d.audio.speak(turn.enemy_line, this.lesson.enemy.voice);

    if (turn.deep_question) {
      this.d.hud.caption("coach", turn.deep_question);
      this.d.hud.journalAdd(turn.deep_question);
      await this.d.audio.speak(turn.deep_question, TUTOR_SPEAKER);
    }
    this.d.hud.journalAdd(text.length > 24 ? `${text.slice(0, 24)}…` : text);

    if (drop) {
      this.d.audio.sfx("unlock");
      this.d.hud.celebration(turn.coach_line);   // informational framing: what they did
    }
    for (const u of unlocked) {
      this.d.audio.sfx("fanfare");
      this.d.hud.toast(u.unlock_message);
    }

    if (turn.phase === "debrief" || turn.phase === "end") {
      this.d.audio.playBgm("victory");
      this.d.arena.enemyDefeat();
    }
    if (turn.phase === "end") {
      await this.finish();
      return;
    }
    this.listen();
  }

  private async finish(): Promise<void> {
    const { drops, unlocked } = await this.d.api.endSession({
      childName: this.d.child.name, unitId: this.lesson.id, summary: this.lastCoachLine,
    });
    for (const d of drops) {
      this.d.audio.sfx("unlock");
      this.d.hud.celebration(`きょうの ぼうけんの あかし！（+${d.xp}）`);
    }
    for (const u of unlocked) this.d.hud.toast(u.unlock_message);
    this.d.audio.stopBgm();
    this.rec.stop();
    setTimeout(() => this.d.onExit(), 3500);
  }
}
```

- [ ] **Step 4: Replace the TEMP block in `src/game/main.ts`**

Delete the Task-13 TEMP preview listener and replace with:

```ts
document.addEventListener("tq-launch", async (e) => {
  const { subject, unitId } = (e as CustomEvent).detail;
  const child = getChild();
  if (!child) { router.show("setup"); return; }
  router.show("arena");
  const [{ Arena }, { Hud }, { AudioMan }, { SessionController }, { makeRecognizer }, api] =
    await Promise.all([
      import("./arena"), import("./hud"), import("./audio"),
      import("./session"), import("./speech"), import("./api"),
    ]);
  const arena = new Arena(document.getElementById("arena-canvas") as HTMLCanvasElement);
  const hud = new Hud(document.getElementById("hud")!);
  const audio = new AudioMan();
  const controller = new SessionController({
    arena, hud, audio, api, child,
    makeRec: (ev) => makeRecognizer(ev),
    onExit: () => { arena.dispose(); router.show("subjects"); },
  });
  try {
    await controller.start(subject, unitId);
  } catch {
    hud.toast("マイクのじゅんびができなかったよ。せっていをみてね");
  }
});
```

Also handle mic permission denial: `Recognizer.start()` failures surface as the recognizer never firing — Chrome prompts on first use; if the user denies, `onSilence` fires and the tutor re-prompts. Add a friendly hint by extending the `onSilence` handler count: after 3 consecutive silences the controller shows `hud.showRetry(...)` with a mic-setup message. (Implementation freedom: a `silenceCount` field in `SessionController`, reset in `handleUtterance`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/game/session.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Full-suite check**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/game/session.ts src/game/main.ts tests/game/session.test.ts
git commit -m "feat: session controller — full teach/battle/debrief loop with surprise rewards"
```

---

### Task 16: End-to-end scripted battle (mocked Claude, debug input)

**Files:**
- Create: `src/backend/services/mock-claude.ts`, `tests/e2e/battle.test.ts`
- Modify: `src/backend/server.ts` (use mock when `MOCK_CLAUDE=1`)

**Interfaces:**
- Consumes: `makeApp` (Task 10), `ClaudeLike` (Task 5).
- Produces:
  - `makeMockClaude(): ClaudeLike` — deterministic scripted enemy: returns `battle` turns with damage 40 until cumulative damage ≥ 100, then a final `end` turn (damage 60, `enemy_action: "cry"`, a deep question). Lets the whole game run offline.
  - `server.ts` reads `process.env.MOCK_CLAUDE === "1"` → uses mock instead of `makeRealClient()`.

- [ ] **Step 1: Write the failing test**

`tests/e2e/battle.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeApp } from "../../src/backend/api/routes";
import { makeMockClaude } from "../../src/backend/services/mock-claude";

let dataDir: string;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tq-e2e-"));
  writeFileSync(join(dataDir, "characters.csv"), "child,stat,points\n");
  writeFileSync(join(dataDir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n" +
    "accessory,1,/x.png,1,charisma,こうしょうバッジ,🗣️,d,こうしょうバッジを手に入れた！\n");
  app = makeApp({
    config: { model: "claude-haiku-4-5", port: 0, voicevoxUrl: "http://127.0.0.1:1", dataDir, contentDir: "content" },
    claude: makeMockClaude(),
  });
});

describe("scripted battle e2e", () => {
  it("plays a full battle: start → turns until end → session end updates CSV", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "e2e", subject: "negotiation", unitId: "unit-01" });

    const history: object[] = [];
    let phase = "battle";
    let turns = 0;
    while (phase !== "end" && turns < 10) {
      const r = await request(app).post("/api/turn").send({
        childName: "e2e", unitId: "unit-01",
        utterance: `おてつだいするから、やすくして（${turns}）`,
        phase, history, voicedMs: 30000,
      });
      expect(r.status).toBe(200);
      phase = r.body.turn.phase;
      turns++;
    }
    expect(phase).toBe("end");
    expect(turns).toBeGreaterThanOrEqual(3);

    const end = await request(app).post("/api/session/end")
      .send({ childName: "e2e", unitId: "unit-01", summary: "りゆう交渉ができた" });
    expect(end.status).toBe(200);

    const csv = readFileSync(join(dataDir, "characters.csv"), "utf8");
    expect(csv).toContain("e2e,charisma,");           // xp landed in CSV
    const profile = JSON.parse(
      readFileSync(join(dataDir, "children", "e2e", "profile.json"), "utf8"));
    expect(profile.recentLessons[0].summary).toBe("りゆう交渉ができた");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/e2e/battle.test.ts`
Expected: FAIL — mock-claude module not found

- [ ] **Step 3: Implement `src/backend/services/mock-claude.ts`**

```ts
import type { ClaudeLike } from "./claude-turn";

export function makeMockClaude(): ClaudeLike {
  let totalDamage = 0;
  return {
    async create() {
      const finishing = totalDamage + 40 >= 100;
      const damage = finishing ? 60 : 40;
      totalDamage += damage;
      const body = finishing
        ? {
            enemy_line: "ま、まいった〜！", enemy_action: "cry",
            coach_line: "りゆうをつけて言えたね！それが交渉の力だよ",
            damage, score_reason: "used a reason", phase: "end",
            deep_question: "きょうの『りゆうをつける』、あしたどこで使えそう？",
          }
        : {
            enemy_line: "ぐぬぬ…なかなかやるな！", enemy_action: "shock",
            coach_line: "いいちょうし！つぎはあいての とくも言ってみよう",
            damage, score_reason: "good attempt", phase: "battle",
            deep_question: null,
          };
      return { content: [{ type: "text", text: JSON.stringify(body) }] };
    },
  };
}
```

Update `src/backend/server.ts`:

```ts
import { loadConfig } from "./config";
import { makeApp } from "./api/routes";
import { makeRealClient } from "./services/claude-turn";
import { makeMockClaude } from "./services/mock-claude";

const config = loadConfig();
const claude = process.env.MOCK_CLAUDE === "1" ? makeMockClaude() : makeRealClient();
const app = makeApp({ config, claude });
app.listen(config.port, () => {
  console.log(`Talk Quest backend on http://localhost:${config.port}` +
    ` (model: ${config.model}${process.env.MOCK_CLAUDE === "1" ? ", MOCKED" : ""})`);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/e2e/battle.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Full manual playthrough (the real acceptance check)**

```bash
MOCK_CLAUDE=1 npm run dev:server   # terminal 1
npm run dev:game                   # terminal 2
```

Open the Vite URL with `?debug=1` in Chrome. Play: name → avatar → こうしょう → unit-01. In DevTools console drive turns with `tqSay("おてつだいするから、やすくして")` (3×).
Expected: teach beats speak (or browser TTS if VOICEVOX is off) → battle BGM slot → HP drops with damage pops → enemy sprite reacts → victory: enemy cries and runs away, celebration confetti, journal entries, return to subjects screen. Then repeat **without** `?debug=1` and with VOICEVOX running, speaking into the mic, against the real Claude (unset `MOCK_CLAUDE`) — verify one real session end-to-end and check `data/children/<name>/` contents.

- [ ] **Step 6: Run entire suite one last time**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/mock-claude.ts src/backend/server.ts tests/e2e/battle.test.ts
git commit -m "feat: mocked-claude e2e battle and offline dev mode"
```

---

## Post-v1 backlog (not in this plan)

- Remaining 11 subjects (lesson JSON authoring + enemy sprites via `transcode-web.sh` pipeline in credit-palace — copy outputs, never modify source repo).
- Real SFX/BGM from the asset box repo (drop into `content/audio/bgm/`, `content/audio/sfx/` — no code change needed).
- End-of-session Claude summarizer call (spec §4.2.1 — v1 uses last coach line as summary).
- Per-day token budget + monthly spend log (spec §4.5 cost controls).
- Cold-start `bootstrapMultiplier` per-child config surface (the `EngagementBank` already accepts it).
- faster-whisper STT behind the recognizer interface; hands-free/push-to-talk toggle refinement.
