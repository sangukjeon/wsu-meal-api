// 우송대 주간 식단 크롤러 (Node 18+, 의존성 없음)
const URL = "https://www.wsu.ac.kr/page/meal_list.jsp";

const clean = (s) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

// { 식당명: { "MM.DD": { 코너명: [메뉴...] } } }
export async function fetchMeals() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`식단 페이지 요청 실패: HTTP ${res.status}`);
  const html = await res.text();

  const result = {};
  // 식당별 블록: <h5>식당명 메뉴</h5> ... <table>...</table>
  for (const [, name, table] of html.matchAll(/<h5[^>]*>([^<]+?)\s*메뉴<\/h5>[\s\S]*?(<table[\s\S]*?<\/table>)/g)) {
    const headers = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => clean(m[1]));
    const days = {};
    for (const [, row] of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const date = row.match(/<th scope="row">([\s\S]*?)<\/th>/)?.[1];
      if (!date) continue;
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]));
      days[clean(date)] = Object.fromEntries(
        cells.map((c, i) => [headers[i + 1], c.split("\n").map((s) => s.trim()).filter(Boolean)])
             .filter(([, v]) => v.length)
      );
    }
    result[name.trim()] = days;
  }
  if (!Object.keys(result).length) throw new Error("식단 표를 찾지 못했습니다 (페이지 구조 변경 가능성)");
  return result;
}
