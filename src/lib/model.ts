export type MovieStatus = "unwatched" | "next" | "watched";
export type Movie = { id: string; title: string; release_year: number | null; status: MovieStatus; created_at: string; vote_count: number; comment_count: number; voted: boolean; tmdb_id: number | null; poster_path: string | null };
export type Comment = { id: string; nickname: string; comment: string; created_at: string; mine: boolean };
export type MovieDetail = { movie: Movie & { my_comment: string; my_nickname: string }; comments: Comment[] };
export type Feed = { movies: Movie[]; next: Movie[]; total: number; page: number; pageSize: number };
export type TmdbResult = { tmdb_id: number; title: string; release_year: number | null; poster_path: string | null; overview: string };
export const statusLabels: Record<MovieStatus, string> = { unwatched: "未視聴", next: "次に観る", watched: "視聴済み" };
export const COMMENT_MAX = 300, NICKNAME_MAX = 20;
export const posterUrl = (path: string | null, size: "w154" | "w342" = "w154") => path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
/** ニックネームは任意。空欄で投稿した人は「匿名」として扱う。 */
export const displayName = (nickname: string) => nickname.trim() || "匿名";
export const normalizeTitle = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const posterShape = /^\/[A-Za-z0-9._-]{1,120}$/;

/** 投票に添えるおすすめコメントとニックネーム。どちらも任意。 */
export function commentInput(input: unknown) {
  const b = (input ?? {}) as Record<string, unknown>;
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  const nickname = typeof b.nickname === "string" ? b.nickname.trim().replace(/\s+/g, " ") : "";
  if (comment.length > COMMENT_MAX) throw new Error(`おすすめコメントは${COMMENT_MAX}文字以内で入力してください`);
  if (nickname.length > NICKNAME_MAX) throw new Error(`ニックネームは${NICKNAME_MAX}文字以内で入力してください`);
  return { comment, nickname };
}

export function movieInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("入力内容を確認してください");
  const b = input as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const { comment, nickname } = commentInput(b);
  const rawYear = b.release_year;
  if (rawYear != null && typeof rawYear !== "string" && typeof rawYear !== "number") throw new Error("公開年は4桁で入力してください");
  const year = rawYear == null || String(rawYear).trim() === "" ? null : Number(rawYear);
  if (!title || title.length > 100 || !normalizeTitle(title)) throw new Error("映画名を1〜100文字で入力してください");
  if (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2100)) throw new Error("公開年は1888〜2100年で入力してください");
  // TMDBから選ばれた作品だけがIDとポスターを持つ。手入力の作品は両方 null。
  const rawId = b.tmdb_id;
  const tmdb_id = rawId == null || rawId === "" ? null : Number(rawId);
  if (tmdb_id !== null && (!Number.isInteger(tmdb_id) || tmdb_id < 1)) throw new Error("映画の指定が不正です");
  const poster = typeof b.poster_path === "string" && b.poster_path ? b.poster_path : null;
  if (poster !== null && (tmdb_id === null || !posterShape.test(poster))) throw new Error("映画の指定が不正です");
  return { title, comment, nickname, release_year: year, normalized_title: normalizeTitle(title), tmdb_id, poster_path: poster };
}

export function movieId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
