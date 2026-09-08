import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Movie Room | みんなのおすすめ映画", description: "おすすめの映画を持ち寄って、次に観る一本をみんなで選ぼう。ログイン不要で投稿・投票できます。", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}</body></html>; }
