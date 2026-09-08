import type { TmdbResult } from "./model";

/** TMDBキーが未設定でも、手入力での投稿は動き続ける。 */
export function tmdbConfigured() { return !!process.env.TMDB_API_KEY; }

type RawResult = { id?: unknown; title?: unknown; original_title?: unknown; release_date?: unknown; poster_path?: unknown; overview?: unknown };

/**
 * 邦題で検索する。TMDBが落ちていても投稿自体は止めたくないので、
 * 失敗は例外にせず null を返して呼び出し側で「手入力に切り替え」を促す。
 */
export async function searchMovies(query: string): Promise<TmdbResult[] | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&language=ja-JP&include_adult=false&page=1&query=${encodeURIComponent(query)}`;
  try {
    // 検索語ごとの結果は滅多に変わらないので1時間キャッシュし、TMDBへの往復を減らす。
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const body = await response.json() as { results?: RawResult[] };
    return (body.results ?? []).slice(0, 8).flatMap(r => {
      const id = typeof r.id === "number" ? r.id : null;
      const title = (typeof r.title === "string" && r.title) || (typeof r.original_title === "string" && r.original_title) || "";
      if (!id || !title) return [];
      const date = typeof r.release_date === "string" ? r.release_date : "";
      const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
      return [{
        tmdb_id: id,
        title: title.slice(0, 100),
        release_year: year !== null && year >= 1888 && year <= 2100 ? year : null,
        poster_path: typeof r.poster_path === "string" ? r.poster_path : null,
        overview: (typeof r.overview === "string" ? r.overview : "").slice(0, 200),
      }];
    });
  } catch { return null; }
}
