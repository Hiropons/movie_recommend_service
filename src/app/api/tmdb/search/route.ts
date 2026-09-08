import { endpoint, json, rateLimit } from "@/lib/request";
import { searchMovies, tmdbConfigured } from "@/lib/tmdb";

export async function GET(request: Request) { return endpoint(async () => {
  const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (!tmdbConfigured()) return json({ results: [], unavailable: true });
  if (query.length < 2) return json({ results: [] });
  await rateLimit(request, "search");
  const results = await searchMovies(query);
  // TMDBが応答しないときは候補なしとして返し、利用者は手入力で投稿できる。
  return results === null ? json({ results: [], unavailable: true }) : json({ results });
}); }
