import { adminClient } from "@/lib/supabase";
import { movieId } from "@/lib/model";
import { ApiError, databaseError, endpoint, json, mutationBody, rateLimit, requireAdmin } from "@/lib/request";
// 配信者による不適切コメントの削除。票は残し、本文とニックネームだけ消す。
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return endpoint(async () => {
  await mutationBody(request); if (!(await requireAdmin())) throw new ApiError(401, "配信者としてログインしてください");
  const { id } = await params; if (!movieId(id)) throw new ApiError(400, "コメントの指定が不正です"); await rateLimit(request, "admin");
  const { data, error } = await adminClient().rpc("clear_comment", { p_comment_id: id });
  databaseError(error); if (!data) throw new ApiError(404, "コメントが見つかりません");
  return json({ ok: true });
}); }
