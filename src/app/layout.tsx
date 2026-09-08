import type { Metadata } from "next";
import "./globals.css";
const title = "はるとのMOVIE ROOM | みんなのおすすめ映画";
const description = "おすすめの映画を持ち寄って、次に観る一本をみんなで選ぼう。ログイン不要で投稿・投票できます。";
export const metadata: Metadata = {
  // XやLINEに貼ったとき、カード画像の場所を絶対URLで示すために必要。
  metadataBase: new URL("https://movie-recommend-service.vercel.app"),
  title, description,
  robots: { index: false, follow: false },
  openGraph: { title, description, siteName: "はるとのMOVIE ROOM", locale: "ja_JP", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}</body></html>; }
