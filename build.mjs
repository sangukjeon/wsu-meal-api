// 크롤링 결과를 docs/api 아래 정적 JSON 파일로 저장 (GitHub Pages로 제공)
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMeals } from "./crawler.mjs";

const OUT = fileURLToPath(new URL("./docs/api/", import.meta.url));

// 한국 시간 기준 오늘 "YYYY-MM-DD" (en-CA 로캘이 이 형식)
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// "MM.DD" → "YYYY-MM-DD". 연도는 오늘과 가장 가까운 쪽으로 정해 연말연초에도 맞게 한다
function toISODate(mmdd, today) {
  const match = mmdd.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) throw new Error(`날짜 형식을 알 수 없습니다: ${mmdd}`);
  const [, m, d] = match.map(Number);
  const base = new Date(`${today}T00:00:00Z`);
  const y = base.getUTCFullYear();
  const nearest = [y - 1, y, y + 1]
    .map((year) => new Date(Date.UTC(year, m - 1, d)))
    .reduce((a, b) => (Math.abs(b - base) < Math.abs(a - base) ? b : a));
  return nearest.toISOString().slice(0, 10);
}

async function readJSON(relPath) {
  try {
    return JSON.parse(await readFile(path.join(OUT, relPath), "utf8"));
  } catch {
    return null;
  }
}

// 내용이 바뀐 경우에만 쓴다. updatedAt은 내용이 마지막으로 바뀐 시각이라 비교에서 뺀다
const changed = [];
async function writeIfChanged(relPath, body) {
  const prev = await readJSON(relPath);
  if (prev) {
    const { updatedAt, ...prevBody } = prev;
    if (JSON.stringify(prevBody) === JSON.stringify(body)) return;
  }
  const file = path.join(OUT, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ updatedAt: new Date().toISOString(), ...body }, null, 2) + "\n");
  changed.push(relPath);
}

const raw = await fetchMeals(); // 실패하면 여기서 예외로 끝나 기존 파일은 그대로 남는다
const today = kstToday();
const cafeterias = Object.keys(raw);
const emptyDay = () => Object.fromEntries(cafeterias.map((name) => [name, null]));

// { 식당: { "MM.DD": 코너들 } } → { "YYYY-MM-DD": { 식당: 코너들 | null } }
const days = {};
for (const [name, byDate] of Object.entries(raw)) {
  for (const [mmdd, corners] of Object.entries(byDate)) {
    const date = toISODate(mmdd, today);
    days[date] ??= emptyDay();
    days[date][name] = Object.keys(corners).length ? corners : null;
  }
}
const dates = Object.keys(days).sort();

for (const date of dates) {
  await writeIfChanged(`date/${date}.json`, { date, data: days[date] });
}

await writeIfChanged("week.json", {
  start: dates[0] ?? null,
  end: dates.at(-1) ?? null,
  data: Object.fromEntries(dates.map((date) => [date, days[date]])),
});

// 학교 사이트가 이미 다음 주로 넘어갔으면 예전에 저장한 오늘 파일을 쓴다
const todayData = days[today] ?? (await readJSON(`date/${today}.json`))?.data ?? emptyDay();
await writeIfChanged("today.json", { date: today, data: todayData });

await writeIfChanged("cafeterias.json", { data: cafeterias });

let allDates = [];
try {
  allDates = (await readdir(path.join(OUT, "date")))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
await writeIfChanged("index.json", {
  endpoints: ["today.json", "week.json", "cafeterias.json", "date/{YYYY-MM-DD}.json"],
  dates: allDates,
});

console.log(changed.length ? `변경된 파일:\n${changed.map((f) => `  ${f}`).join("\n")}` : "변경 없음");
