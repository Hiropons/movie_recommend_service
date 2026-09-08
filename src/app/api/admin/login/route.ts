import { authClient } from "@/lib/supabase";
import { ApiError, endpoint, json, mutationBody, rateLimit, saveSession } from "@/lib/request";
export async function POST(request: Request) { return endpoint(async () => {
  const input = await mutationBody(request); await rateLimit(request, "login");
  const expected = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (typeof input.email !== "string" || typeof input.password !== "string" || input.email.trim().toLowerCase() !== expected) throw new ApiError(401, "メールアドレスまたはパスワードを確認してください");
  const { data, error } = await authClient().auth.signInWithPassword({ email: input.email.trim(), password: input.password });
  if (error || !data.session || !data.user.email_confirmed_at) throw new ApiError(401, "メールアドレスまたはパスワードを確認してください");
  await saveSession(data.session); return json({ ok: true });
}); }
