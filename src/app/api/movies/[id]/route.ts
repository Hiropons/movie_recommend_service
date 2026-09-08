import { adminClient } from "@/lib/supabase";
import { movieId, movieInput, normalizeTitle } from "@/lib/model";
import { movieDetails } from "@/lib/tmdb";
import { ApiError, databaseError, endpoint, json, mutationBody, rateLimit, requireAdmin, voterHash } from "@/lib/request";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const { id } = await params; if (!movieId(id)) throw new ApiError(400, "映画の指定が不正です");
  const { data, error } = await adminClient().rpc("movie_detail", { p_id: id, p_voter: await voterHash() });
  databaseError(error); if (!data) throw new ApiError(404, "映画が見つかりません");
  return json(data);
}); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const input = await mutationBody(request); if (!(await requireAdmin())) throw new ApiError(401, "配信者としてログインしてください");
  const { id } = await params; if (!movieId(id)) throw new ApiError(400, "映画の指定が不正です"); await rateLimit(request, "admin");
  let update: Record<string, unknown> = {};
  if (input.restore === true) update.deleted_at = null;
  else if (input.status !== undefined) { if (!["unwatched", "next", "watched"].includes(String(input.status))) throw new ApiError(400, "視聴状態が不正です"); update.status = input.status; }
  // 配信者が直せるのは作品の情報だけ。おすすめコメントは投稿者本人のものなので触らない。
  else {
    let m; try { m = movieInput(input); } catch (e) { throw new ApiError(400, (e as Error).message); }
    // TMDBの作品を選び直したときは、題名から監督・あらすじ・上映時間までTMDBの値で揃える。
    // 手入力で登録された作品を、あとから正しい作品に結び付け直すための経路でもある。
    const found = m.tmdb_id ? await movieDetails(m.tmdb_id) : null;
    if (m.tmdb_id && !found) throw new ApiError(503, "映画データベースに接続できませんでした。少し時間をおいてお試しください");
    update = found
      ? { title: found.title, normalized_title: normalizeTitle(found.title), release_year: found.release_year, tmdb_id: found.tmdb_id, poster_path: found.poster_path, director: found.director, overview: found.overview, runtime: found.runtime }
      : { title: m.title, normalized_title: m.normalized_title, release_year: m.release_year };
  }
  let query = adminClient().from("movies").update(update).eq("id", id); if (input.restore !== true) query = query.is("deleted_at", null);
  const { data, error } = await query.select("id").maybeSingle(); databaseError(error); if (!data) throw new ApiError(404, "映画が見つかりません"); return json({ ok: true });
}); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  await mutationBody(request); if (!(await requireAdmin())) throw new ApiError(401, "配信者としてログインしてください");
  const { id } = await params; if (!movieId(id)) throw new ApiError(400, "映画の指定が不正です"); await rateLimit(request, "admin");
  const { data, error } = await adminClient().from("movies").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  databaseError(error); if (!data) throw new ApiError(404, "映画が見つかりません"); return json({ ok: true });
}); }
