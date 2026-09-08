import { adminClient } from "@/lib/supabase";
import { ApiError, databaseError, endpoint, json, mutationBody, rateLimit, voterHash } from "@/lib/request";
import { movieInput, normalizeTitle } from "@/lib/model";
export async function GET(request: Request) { return endpoint(async () => {
  const db = adminClient(); const voter = await voterHash(); const q = new URL(request.url).searchParams;
  const page = Math.floor(Math.max(1, Math.min(10000, Number(q.get("page")) || 1))); const size = 30;
  const search = normalizeTitle((q.get("q") || "").slice(0, 100));
  const filter = ["unwatched", "watched", "all"].includes(q.get("filter") || "") ? q.get("filter")! : "unwatched";
  const [{ data: feed, error }, { data: next, error: nextError }] = await Promise.all([
    db.rpc("list_movies", { p_voter: voter, p_search: search, p_filter: filter, p_sort: q.get("sort") === "new" ? "new" : "votes", p_offset: (page - 1) * size, p_limit: size }),
    db.from("movie_rankings").select("*").eq("status", "next").order("vote_count", { ascending: false }).order("created_at", { ascending: true })
  ]);
  databaseError(error || nextError); return json({ movies: feed?.movies ?? [], total: Number(feed?.total ?? 0), next: next ?? [], page, pageSize: size });
}); }
export async function POST(request: Request) { return endpoint(async () => {
  const input = await mutationBody(request); let movie;
  try { movie = movieInput(input); } catch (e) { throw new ApiError(400, (e as Error).message); }
  const voter = await voterHash(); await rateLimit(request, "post", voter);
  const { data, error } = await adminClient().rpc("recommend_movie", { p_title: movie.title, p_normalized: movie.normalized_title, p_year: movie.release_year, p_comment: movie.comment, p_voter: voter });
  databaseError(error); return json({ id: data }, 201);
}); }
