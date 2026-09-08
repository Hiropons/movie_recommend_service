"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/client";
import { displayName, posterUrl, runtimeLabel, statusLabels, type MovieDetail } from "@/lib/model";
import VoteDialog from "./vote-dialog";

const stamp = (iso: string) => new Date(iso).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

export default function MovieDetailView({ id }: { id: string }) {
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [admin, setAdmin] = useState(false);
  const [voting, setVoting] = useState(false), [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(""), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { setDetail(await api<MovieDetail>(`/api/movies/${id}`)); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    api<MovieDetail>(`/api/movies/${id}`, { signal: controller.signal })
      .then(d => { setDetail(d); setError(""); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => { api<{ admin: boolean }>("/api/admin/session").then(s => setAdmin(s.admin)).catch(() => setAdmin(false)); }, []);

  const movie = detail?.movie;
  async function sendVote(values: { comment: string; nickname: string }) {
    setBusy(true); setFormError("");
    try { await api(`/api/movies/${id}/vote`, { method: "POST", body: { voted: true, ...values } }); setVoting(false); setNotice(movie?.voted ? "おすすめポイントを書き直しました" : "1票届けました"); await load(); }
    catch (e) { setFormError((e as Error).message); } finally { setBusy(false); }
  }
  async function cancelVote() {
    setBusy(true);
    try { await api(`/api/movies/${id}/vote`, { method: "POST", body: { voted: false } }); setNotice("投票を取り消しました。コメントも一緒に消えています"); await load(); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function removeComment(commentId: string) {
    setBusy(true);
    try { await api(`/api/comments/${commentId}`, { method: "DELETE", body: {} }); setNotice("コメントを削除しました"); await load(); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }

  const poster = posterUrl(movie?.poster_path ?? null, "w342");
  return <>
    <header className="site-header"><Link className="brand" href="/" aria-label="はるとのMOVIE ROOM ホーム"><span className="brand-mark" aria-hidden="true">M<span>R</span></span><span>はるとのMOVIE ROOM<small>みんなのおすすめ映画</small></span></Link><Link className="plain-button" href="/">← リストへ戻る</Link></header>
    <main className="shell detail-shell">
      {loading && !detail ? <div className="empty" role="status"><span className="empty-icon" aria-hidden="true">…</span><p>映画の情報を読み込んでいます</p></div>
      : error && !detail ? <div className="empty"><span className="empty-icon" aria-hidden="true">✦</span><h3>映画を表示できませんでした</h3><p>{error}</p><Link className="secondary" href="/">リストへ戻る</Link></div>
      : movie && detail ? <>
        <section className="detail-head">
          {poster ? <Image className="detail-poster" src={poster} alt={`${movie.title}のポスター`} width={200} height={300} priority /> : <div className="detail-poster placeholder" aria-hidden="true">no image</div>}
          <div className="detail-info">
            <div className="movie-title"><h1>{movie.title}</h1>{movie.status !== "unwatched" && <span className={`badge ${movie.status}`}>{statusLabels[movie.status]}</span>}</div>
            <p className="meta">{movie.release_year ? `${movie.release_year}年公開` : "公開年未登録"}{movie.director && <><span>·</span>{`監督 ${movie.director}`}</>}{movie.runtime ? <><span>·</span>{runtimeLabel(movie.runtime)}</> : null}<span>·</span>{`${movie.vote_count}票`}<span>·</span>{`おすすめコメント${movie.comment_count}件`}</p>
            {movie.overview && <div className="overview"><p className="eyebrow">あらすじ</p><p>{movie.overview}</p></div>}
            {movie.status === "watched"
              ? <p className="detail-closed">この作品は視聴済みです。おすすめの受付は終了しました。</p>
              : movie.voted
                ? <div className="detail-actions"><button className="vote selected" onClick={() => { setFormError(""); setVoting(true); }} disabled={busy}><span className="vote-number"><span aria-hidden="true">♥</span> {movie.vote_count}</span><span>おすすめ済み</span></button><button className="plain-button" disabled={busy} onClick={() => void cancelVote()}>おすすめを取り消す</button></div>
                : <button className="primary" disabled={busy} onClick={() => { setFormError(""); setVoting(true); }}><span aria-hidden="true">♡</span> おすすめしたい</button>}
            {movie.voted && movie.my_comment && <div className="my-comment"><p className="eyebrow">あなたのおすすめポイント</p><p>{movie.my_comment}</p><button className="plain-button" disabled={busy} onClick={() => { setFormError(""); setVoting(true); }}>書き直す</button></div>}
            {movie.voted && !movie.my_comment && movie.status !== "watched" && <p className="form-note">おすすめポイントはまだ書かれていません。<button className="link-button" onClick={() => { setFormError(""); setVoting(true); }}>いま書く</button></p>}
          </div>
        </section>
        <section className="comments" aria-labelledby="comments-title">
          <h2 id="comments-title">みんなのおすすめポイント <span className="count">{detail.comments.length}</span></h2>
          {detail.comments.length === 0
            ? <div className="empty small"><p>まだ誰もポイントを書いていません。</p><p>最初のひとことを、あなたから。</p></div>
            : <ol className="comment-list">{detail.comments.map(c => <li key={c.id} className={c.mine ? "mine" : ""}>
                <div className="comment-head"><strong>{displayName(c.nickname)}</strong>{c.mine && <span className="tag">あなた</span>}<time dateTime={c.created_at}>{stamp(c.created_at)}</time></div>
                <p>{c.comment}</p>
                {admin && <button className="link-button danger-text" disabled={busy} onClick={() => void removeComment(c.id)}>このコメントを削除</button>}
              </li>)}</ol>}
        </section>
      </> : null}
    </main>
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="通知を閉じる" onClick={() => setNotice("")}>×</button></div>}
    {voting && movie && <VoteDialog movieTitle={movie.title} editing={movie.voted} initialComment={movie.my_comment} initialNickname={movie.my_nickname} busy={busy} error={formError} onSubmit={values => void sendVote(values)} onClose={() => setVoting(false)} />}
  </>;
}
