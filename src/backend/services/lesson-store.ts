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
