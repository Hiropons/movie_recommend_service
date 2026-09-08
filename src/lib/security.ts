import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export function sign(value: string, key: string) { return createHmac("sha256", key).update(value).digest("hex"); }
export function visitorIdentity(cookie: string | undefined, key: string) {
  const parts = cookie?.split(".") ?? [];
  const valid = parts.length === 2 && /^[a-f0-9]{48}$/.test(parts[0]) && /^[a-f0-9]{64}$/.test(parts[1]) && timingSafeEqual(Buffer.from(sign(parts[0], key)), Buffer.from(parts[1]));
  const id = valid ? parts[0] : randomBytes(24).toString("hex");
  return { cookie: `${id}.${sign(id, key)}`, hash: sign(`voter:${id}`, key), isNew: !valid };
}
export function validOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
