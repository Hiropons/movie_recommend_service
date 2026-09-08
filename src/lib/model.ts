export type MovieStatus = "unwatched" | "next" | "watched";
export type Movie = { id: string; title: string; release_year: number | null; comment: string; status: MovieStatus; created_at: string; vote_count: number; voted: boolean };
export type Feed = { movies: Movie[]; next: Movie[]; total: number; page: number; pageSize: number };
export const statusLabels: Record<MovieStatus, string> = { unwatched: "未視聴", next: "次に観る", watched: "視聴済み" };
export const normalizeTitle = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export function movieInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("入力内容を確認してください");
  const b = input as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  const rawYear = b.release_year;
  if (rawYear != null && typeof rawYear !== "string" && typeof rawYear !== "number") throw new Error("公開年は4桁で入力してください");
  const year = rawYear == null || String(rawYear).trim() === "" ? null : Number(rawYear);
  if (!title || title.length > 100 || !normalizeTitle(title)) throw new Error("映画名を1〜100文字で入力してください");
  if (comment.length > 300) throw new Error("コメントは300文字以内で入力してください");
  if (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2100)) throw new Error("公開年は1888〜2100年で入力してください");
  return { title, comment, release_year: year, normalized_title: normalizeTitle(title) };
}
export function movieId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
