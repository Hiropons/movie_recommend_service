import type { TmdbDetails, TmdbResult } from "./model";

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

type RawDetails = {
  title?: unknown; original_title?: unknown; release_date?: unknown; poster_path?: unknown;
  overview?: unknown; runtime?: unknown; credits?: { crew?: { job?: unknown; name?: unknown }[] };
};

/**
 * 作品ページに出す情報をTMDBから取り直す。
 * 監督・あらすじ・上映時間は作品ごとに1つしかない事実なので、
 * 投稿者が送ってきた値ではなくここで取得したものを保存する。
 */
export async function movieDetails(tmdbId: number): Promise<TmdbDetails | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${key}&language=ja-JP&append_to_response=credits`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (!response.ok) return null;
    const d = await response.json() as RawDetails;
    const title = (typeof d.title === "string" && d.title) || (typeof d.original_title === "string" && d.original_title) || "";
    if (!title) return null;
    const date = typeof d.release_date === "string" ? d.release_date : "";
    const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
    const directors = (d.credits?.crew ?? [])
      .filter(c => c.job === "Director" && typeof c.name === "string")
      .map(c => c.name as string);
    const runtime = typeof d.runtime === "number" && d.runtime > 0 && d.runtime <= 2000 ? Math.round(d.runtime) : null;
    return {
      tmdb_id: tmdbId,
      title: title.slice(0, 100),
      release_year: year !== null && year >= 1888 && year <= 2100 ? year : null,
      poster_path: typeof d.poster_path === "string" && /^\/[A-Za-z0-9._-]{1,120}$/.test(d.poster_path) ? d.poster_path : null,
      director: [...new Set(directors)].join("、").slice(0, 120),
      overview: (typeof d.overview === "string" ? d.overview : "").slice(0, 2000),
      runtime,
    };
  } catch { return null; }
}
