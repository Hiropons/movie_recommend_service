"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="shell empty"><h1>ページを読み込めませんでした</h1><p>少し時間をおいて、もう一度お試しください。</p><button onClick={reset}>もう一度読み込む</button></main>; }
