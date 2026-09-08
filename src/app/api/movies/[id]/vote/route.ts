import { adminClient } from "@/lib/supabase";
import { ApiError, databaseError, endpoint, json, mutationBody, rateLimit, voterHash } from "@/lib/request";
import { commentInput, movieId } from "@/lib/model";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const { id } = await params; const input = await mutationBody(request);
  if (!movieId(id) || typeof input.voted !== "boolean") throw new ApiError(400, "投票内容が不正です");
  let fields; try { fields = commentInput(input); } catch (e) { throw new ApiError(400, (e as Error).message); }
  const voter = await voterHash(); await rateLimit(request, "vote", voter);
  // 同じ人が投票し直すとコメントの上書きになる。取り消すと票ごとコメントも消える。
  const { error } = await adminClient().rpc("set_movie_vote", { p_id: id, p_voter: voter, p_voted: input.voted, p_comment: fields.comment, p_nickname: fields.nickname });
  databaseError(error); return json({ ok: true });
}); }
