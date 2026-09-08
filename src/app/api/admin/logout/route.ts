import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase";
import { clearSession, endpoint, json, mutationBody } from "@/lib/request";
export async function POST(request: Request) { return endpoint(async () => {
  await mutationBody(request); const token = (await cookies()).get("movie_admin")?.value;
  if (token) await adminClient().auth.admin.signOut(token, "local"); await clearSession(); return json({ ok: true });
}); }
