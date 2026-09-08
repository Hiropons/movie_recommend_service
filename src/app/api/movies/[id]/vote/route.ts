import { adminClient } from "@/lib/supabase";
import { ApiError, databaseError, endpoint, json, mutationBody, rateLimit, voterHash } from "@/lib/request";
import { movieId } from "@/lib/model";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  const { id } = await params; const input = await mutationBody(request);
  if (!movieId(id) || typeof input.voted !== "boolean") throw new ApiError(400, "投票内容が不正です");
  const voter = await voterHash(); await rateLimit(request, "vote", voter);
  const { error } = await adminClient().rpc("set_movie_vote", { p_id: id, p_voter: voter, p_voted: input.voted });
  databaseError(error); return json({ ok: true });
}); }
