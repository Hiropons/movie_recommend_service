import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Xや各種SNSにURLを貼ったときに出るカード画像。
export const alt = "はるとのMOVIE ROOM｜“はると”が次に観る映画を、みんなで。";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const EYEBROW = "COMMUNITY WATCHLIST";
const TITLE = "はるとのMOVIE ROOM";
const LEAD = "“はると”が次に観る映画を、みんなで。";
const NOTE = "おすすめを投稿して、気になる一本に「おすすめしたい」を。";

/**
 * 画像生成に使う既定フォントは日本語の字形を持たないため、
 * この画像に出る文字だけを収めた部分フォントを取り寄せる。
 * 取得できなかった場合は null を返し、描画自体は続行する。
 */
async function japaneseFont(text: string, weight: 400 | 700) {
  try {
    const query = `family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 86400 },
    }).then(r => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) return null;
    const data = await fetch(url, { next: { revalidate: 86400 } }).then(r => r.arrayBuffer());
    return { name: "Noto Sans JP", data, weight, style: "normal" as const };
  } catch { return null; }
}

export default async function OpengraphImage() {
  const [haruto, bold, regular] = await Promise.all([
    readFile(join(process.cwd(), "public", "haruto.png")),
    japaneseFont(EYEBROW + TITLE + LEAD, 700),
    japaneseFont(NOTE, 400),
  ]);
  const character = `data:image/png;base64,${haruto.toString("base64")}`;
  const fonts = [bold, regular].filter(f => f !== null);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#304f3c", padding: "0 78px", fontFamily: "Noto Sans JP" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 6, color: "#dcec9b", fontWeight: 700 }}>{EYEBROW}</div>
        <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: "#fff", marginTop: 24, letterSpacing: -1, whiteSpace: "nowrap" }}>{TITLE}</div>
        <div style={{ display: "flex", fontSize: 33, fontWeight: 700, color: "#dcec9b", marginTop: 20, whiteSpace: "nowrap" }}>{LEAD}</div>
        <div style={{ display: "flex", fontSize: 22, color: "#cfdcc9", marginTop: 24, lineHeight: 1.6 }}>{NOTE}</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={character} alt="" width={380} height={380} />
    </div>,
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
