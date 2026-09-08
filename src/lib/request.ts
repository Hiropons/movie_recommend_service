import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { adminClient, authClient, configured } from "./supabase";
import { sign, validOrigin, visitorIdentity } from "./security";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
export async function endpoint(action: () => Promise<Response>) {
  try { if (!configured()) throw new ApiError(503, "ただいま公開準備中です。少し時間をおいてアクセスしてください"); return await action(); }
  catch (e) { return json({ error: e instanceof ApiError ? e.message : "処理できませんでした。少し時間をおいて再度お試しください" }, e instanceof ApiError ? e.status : 500); }
}
export async function mutationBody(request: Request) {
  if (!validOrigin(request)) throw new ApiError(403, "ページを再読み込みしてお試しください");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "入力形式が正しくありません");
  const reader = request.body?.getReader(); if (!reader) throw new ApiError(400, "入力を読み取れませんでした");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); throw new ApiError(413, "入力が長すぎます"); } chunks.push(value); }
  try { const b = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!b || typeof b !== "object" || Array.isArray(b)) throw Error(); return b as Record<string, unknown>; }
  catch { throw new ApiError(400, "入力を読み取れませんでした"); }
}
const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
export async function voterHash() {
  const store = await cookies(); const identity = visitorIdentity(store.get("movie_voter")?.value, process.env.SUPABASE_SECRET_KEY!);
  if (identity.isNew) store.set("movie_voter", identity.cookie, { ...options, maxAge: 31_536_000 });
  return identity.hash;
}
export async function rateLimit(request: Request, action: "post" | "vote" | "login" | "admin", voter?: string) {
  // Vercel replaces x-forwarded-for at its edge. Do not trust it outside Vercel.
  const ip = process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
  const rules = { post: [3600, 10, 50], vote: [60, 40, 200], login: [900, 10, 15], admin: [60, 60, 100] };
  const [window, personal, network] = rules[action];
  const entries = [[`ip:${ip}`, network], ...(voter ? [[`voter:${voter}`, personal]] : [])] as [string, number][];
  for (const [identity, limit] of entries) {
    const bucket = sign(`${action}:${identity}`, process.env.SUPABASE_SECRET_KEY!);
    const { data, error } = await adminClient().rpc("consume_rate_limit", { p_key: bucket, p_seconds: window, p_limit: limit });
    if (error) throw new ApiError(503, "ただいま受付を準備しています。少し時間をおいてお試しください");
    if (!data) throw new ApiError(429, action === "login" ? "ログイン試行が続いています。15分ほど待ってお試しください" : "操作が続いています。少し時間をおいてお試しください");
  }
}
export async function saveSession(session: Session) {
  const store = await cookies(); store.set("movie_admin", session.access_token, { ...options, maxAge: session.expires_in });
  store.set("movie_refresh", session.refresh_token, { ...options, maxAge: 604800 });
}
export async function clearSession() { const store = await cookies(); store.delete("movie_admin"); store.delete("movie_refresh"); }
export async function requireAdmin(refresh = false) {
  const store = await cookies(); const token = store.get("movie_admin")?.value; const expected = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (token) { const { data, error } = await authClient().auth.getUser(token); if (!error && expected && data.user?.email?.toLowerCase() === expected && data.user.email_confirmed_at) return true; }
  const refreshToken = store.get("movie_refresh")?.value;
  if (refresh && refreshToken) {
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && expected && data.user?.email?.toLowerCase() === expected && data.user.email_confirmed_at) { await saveSession(data.session); return true; }
    await clearSession();
  }
  return false;
}
export function databaseError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new ApiError(409, "この映画は投稿済みです。既存作品へ投票してください");
  if (error.message === "movie_not_found") throw new ApiError(404, "映画が見つかりません。リストを更新してください");
  if (error.message === "voting_closed") throw new ApiError(409, "視聴済み作品の投票は終了しています");
  throw new ApiError(500, "保存できませんでした。少し時間をおいて再度お試しください");
}
