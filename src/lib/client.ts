"use client";
export class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(url, { method: options.method || "GET", credentials: "same-origin", cache: "no-store", signal: options.signal, ...(options.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}) });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw new RequestError(b?.error || "通信できませんでした。接続を確認してください", r.status);
  return b as T;
}
const NICKNAME_KEY = "movie_nickname";
/** ニックネームは毎回打ち直さなくていいように、その人のブラウザにだけ覚えておく。 */
export function rememberedNickname() { try { return localStorage.getItem(NICKNAME_KEY) ?? ""; } catch { return ""; } }
export function rememberNickname(value: string) {
  const name = value.trim();
  try { if (name) localStorage.setItem(NICKNAME_KEY, name); else localStorage.removeItem(NICKNAME_KEY); } catch {}
}
