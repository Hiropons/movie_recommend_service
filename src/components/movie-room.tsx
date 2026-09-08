"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { api, RequestError, rememberNickname, rememberedNickname } from "@/lib/client";
import { COMMENT_MAX, NICKNAME_MAX, posterUrl, statusLabels, type Feed, type Movie, type MovieStatus, type TmdbResult } from "@/lib/model";
import Modal from "./modal";
import VoteDialog from "./vote-dialog";

const blankDraft = { title: "", release_year: "", comment: "", nickname: "", tmdb_id: null as number | null, poster_path: null as string | null };
type Draft = typeof blankDraft;

export default function MovieRoom() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [filter, setFilter] = useState("unwatched"), [sort, setSort] = useState("votes"), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [admin, setAdmin] = useState(false);
  const [modal, setModal] = useState<"post" | "login" | "edit" | "delete" | null>(null), [selected, setSelected] = useState<Movie | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft), [picked, setPicked] = useState(false);
  const [results, setResults] = useState<{ term: string; existing: Movie[]; tmdb: TmdbResult[]; off: boolean }>({ term: "", existing: [], tmdb: [], off: false });
  const [formError, setFormError] = useState(""), [busy, setBusy] = useState(false);
  const [voteFor, setVoteFor] = useState<Movie | null>(null), [pendingVote, setPendingVote] = useState<string | null>(null);
  const [notice, setNotice] = useState(""), [undoId, setUndoId] = useState<string | null>(null);
  const requestNumber = useRef(0), refreshing = useRef(false);

  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const refresh = useCallback(async (quiet = false) => {
    const number = ++requestNumber.current; refreshing.current = true;
    if (!quiet) setLoading(true);
    try {
      const value = await api<Feed>(`/api/movies?${new URLSearchParams({ q: query, filter, sort, page: String(page) })}`);
      if (number !== requestNumber.current) return;
      if (!value.movies.length && value.total > 0 && page > 1) { setPage(Math.max(1, Math.ceil(value.total / value.pageSize))); return; }
      setFeed(value); setError("");
    } catch (e) { if (number === requestNumber.current) setError((e as Error).message); }
    finally { if (number === requestNumber.current) { setLoading(false); refreshing.current = false; } }
  }, [query, filter, sort, page]);
  useEffect(() => {
    const controller = new AbortController(); const number = ++requestNumber.current;
    api<Feed>(`/api/movies?${new URLSearchParams({ q: query, filter, sort, page: String(page) })}`, { signal: controller.signal })
      .then(value => { if (number !== requestNumber.current) return; setFeed(value); setError(""); if (!value.movies.length && value.total > 0 && page > 1) setPage(Math.max(1, Math.ceil(value.total / value.pageSize))); })
      .catch(e => { if (!controller.signal.aborted && number === requestNumber.current) setError(e.message); })
      .finally(() => { if (number === requestNumber.current && !controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, filter, sort, page]);
  const checkAdmin = useCallback(async () => { try { const s = await api<{ admin: boolean }>("/api/admin/session"); setAdmin(s.admin); return s.admin; } catch { setAdmin(false); return false; } }, []);
  useEffect(() => { api<{ admin: boolean }>("/api/admin/session").then(s => setAdmin(s.admin)).catch(() => setAdmin(false)); const t = setInterval(() => { if (!document.hidden) void checkAdmin(); }, 15 * 60 * 1000); return () => clearInterval(t); }, [checkAdmin]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden && !modal && !voteFor && !pendingVote && !refreshing.current && !document.activeElement?.matches("select, input, textarea")) void refresh(true); }, 15000); return () => clearInterval(t); }, [refresh, modal, voteFor, pendingVote]);

  // 投稿フォームでは、すでに登録済みの作品とTMDBの候補を同時に探す。
  // 表示は「いま入力中の語に対する結果か」を毎回描画時に判定するので、
  // 打ち直した瞬間に古い候補が残らない。
  const term = modal === "post" && !picked ? draft.title.trim() : "";
  const fresh = term.length >= 2 && results.term === term;
  const suggestions = fresh ? results.existing : [], tmdb = fresh ? results.tmdb : [];
  const tmdbOff = fresh && results.off, searching = term.length >= 2 && !fresh;
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void Promise.all([
        api<Feed>(`/api/movies?${new URLSearchParams({ q: term, filter: "all" })}`, { signal: controller.signal }).then(v => v.movies.slice(0, 5)).catch(() => []),
        api<{ results: TmdbResult[]; unavailable?: boolean }>(`/api/tmdb/search?${new URLSearchParams({ q: term })}`, { signal: controller.signal }).catch(() => ({ results: [] as TmdbResult[], unavailable: true })),
      ]).then(([existing, found]) => {
        if (!controller.signal.aborted) setResults({ term, existing, tmdb: found.results, off: !!found.unavailable });
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);

  function closeModal() { setModal(null); setFormError(""); }
  function openPost() { setDraft({ ...blankDraft, nickname: rememberedNickname() }); setPicked(false); setFormError(""); setModal("post"); }
  function pickTmdb(r: TmdbResult) { setDraft(d => ({ ...d, title: r.title, release_year: r.release_year?.toString() ?? "", tmdb_id: r.tmdb_id, poster_path: r.poster_path })); setPicked(true); setFormError(""); }
  function pickManual() { setDraft(d => ({ ...d, tmdb_id: null, poster_path: null })); setPicked(true); setFormError(""); }
  function openEdit(movie: Movie) { setSelected(movie); setDraft({ ...blankDraft, title: movie.title, release_year: movie.release_year?.toString() || "" }); setFormError(""); setModal("edit"); }
  async function adminRequest(url: string, method: string, body: unknown) { if (!(await checkAdmin())) throw new RequestError("ログインの有効期限が切れました。再度ログインしてください", 401); return api(url, { method, body }); }

  async function sendVote(movie: Movie, values: { comment: string; nickname: string }) {
    setBusy(true); setFormError("");
    try { await api(`/api/movies/${movie.id}/vote`, { method: "POST", body: { voted: true, ...values } }); setVoteFor(null); setNotice(`「${movie.title}」に1票届けました`); await refresh(true); }
    catch (e) { setFormError((e as Error).message); } finally { setBusy(false); }
  }
  async function cancelVote(movie: Movie) {
    if (pendingVote) return; setPendingVote(movie.id); setNotice("");
    try { await api(`/api/movies/${movie.id}/vote`, { method: "POST", body: { voted: false } }); setNotice("投票を取り消しました。コメントも一緒に消えています"); await refresh(true); }
    catch (e) { setNotice((e as Error).message); } finally { setPendingVote(null); }
  }
  async function saveMovie(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setFormError("");
    try {
      if (modal === "edit" && selected) await adminRequest(`/api/movies/${selected.id}`, "PATCH", { title: draft.title, release_year: draft.release_year });
      else { rememberNickname(draft.nickname); await api("/api/movies", { method: "POST", body: draft }); }
      setNotice(modal === "edit" ? "映画の情報を更新しました" : "おすすめを追加しました。あなたの1票も届きました");
      setModal(null); setUndoId(null); await refresh(true);
    } catch (e) { setFormError((e as Error).message); } finally { setBusy(false); }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setFormError("");
    try { await api("/api/admin/login", { method: "POST", body: Object.fromEntries(new FormData(e.currentTarget)) }); setAdmin(true); setModal(null); setNotice("配信者としてログインしました"); }
    catch (e) { setFormError((e as Error).message); } finally { setBusy(false); }
  }
  async function changeStatus(movie: Movie, status: MovieStatus) { setBusy(true); try { await adminRequest(`/api/movies/${movie.id}`, "PATCH", { status }); setNotice(`「${movie.title}」を「${statusLabels[status]}」にしました`); await refresh(true); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }
  async function deleteMovie() {
    if (!selected) return; setBusy(true); setFormError("");
    try { await adminRequest(`/api/movies/${selected.id}`, "DELETE", {}); setUndoId(selected.id); setNotice(`「${selected.title}」をリストから削除しました`); setModal(null); await refresh(true); }
    catch (e) { setFormError((e as Error).message); } finally { setBusy(false); }
  }
  async function undoDelete() { if (!undoId) return; setBusy(true); try { await adminRequest(`/api/movies/${undoId}`, "PATCH", { restore: true }); setUndoId(null); setNotice("映画を元に戻しました"); await refresh(true); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }
  async function logout() { setBusy(true); try { await api("/api/admin/logout", { method: "POST", body: {} }); setAdmin(false); setUndoId(null); setNotice("ログアウトしました"); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }

  return <><a className="skip-link" href="#movie-list">映画リストへ</a><header className="site-header"><Link className="brand" href="/" aria-label="はるとのMOVIE ROOM ホーム"><span className="brand-mark" aria-hidden="true">M<span>R</span></span><span>はるとのMOVIE ROOM<small>みんなのおすすめ映画</small></span></Link><button className="plain-button" disabled={busy} onClick={() => admin ? void logout() : (setFormError(""), setModal("login"))}>{admin ? "管理中 · ログアウト" : "配信者ログイン"}<span aria-hidden="true"> ↗</span></button></header>
  <main className="shell"><section className="intro"><div><p className="eyebrow">COMMUNITY WATCHLIST</p><h1>“はると”が次に観る映画を、みんなで。</h1><p className="intro-copy">おすすめを投稿して、気になる一本に「観たい」を。ひとこと添えると、もっと伝わります。</p></div><button className="primary" onClick={openPost}><span aria-hidden="true">＋</span> 映画をおすすめする</button></section>
  <div className="workspace"><section className="list-panel" id="movie-list" aria-labelledby="list-title"><div className="list-heading"><h2 id="list-title">みんなのおすすめ <span className="count">{feed?.total ?? "—"}</span></h2><div className="perch"><Image className="perch-haruto" src="/haruto-point.png" alt="" width={96} height={128} priority /><span className="refresh-label">15秒ごとに更新</span></div></div>
  <div className="toolbar"><div className="tabs" role="group" aria-label="視聴状態で絞り込む">{[["unwatched", "これから観る"], ["watched", "視聴済み"], ["all", "すべて"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(1); }}>{label}</button>)}</div><div className="search-row"><label className="search-label"><span className="sr-only">映画名で検索</span><span aria-hidden="true">⌕</span><input type="search" placeholder="映画名で検索" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">並び順</span><select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="votes">観たいが多い順</option><option value="new">新しく届いた順</option></select></label></div></div>
  {error && <div className="error-banner" role="alert"><span>{error}{feed && "（前回取得したリストを表示中）"}</span><button onClick={() => void refresh()}>再読み込み</button></div>}
  {loading && !feed ? <div className="empty" role="status"><span className="empty-icon" aria-hidden="true">…</span><p>映画リストを読み込んでいます</p></div> : !feed?.movies.length ? <div className="empty">{error || query ? <span className="empty-icon" aria-hidden="true">✦</span> : <Image className="empty-haruto" src="/haruto.png" alt="" width={160} height={160} priority />}<h3>{error ? "映画リストを読み込めませんでした" : query ? "一致する映画がありません" : filter === "watched" ? "観た映画が、ここに並びます。" : "最初の一本を、教えてください。"}</h3><p>{error ? "再読み込みするか、少し時間をおいてお試しください。" : query ? "別の映画名で検索するか、新しくおすすめを投稿できます。" : filter === "watched" ? "配信者が視聴済みにした作品を残していきます。" : "あなたが好きな映画で、リストをはじめましょう。"}</p>{!error && filter !== "watched" && <button className="secondary" onClick={openPost}>映画をおすすめする</button>}</div> : <div className="movie-list" aria-busy={loading}>{feed.movies.map((m, i) => { const thumb = posterUrl(m.poster_path); return <article className="movie" key={m.id}><span className={`rank ${i < 3 && page === 1 ? "top" : ""}`}>{String((page - 1) * 30 + i + 1).padStart(2, "0")}</span>
  {thumb ? <Image className="thumb" src={thumb} alt="" width={54} height={81} /> : <span className="thumb placeholder" aria-hidden="true">✦</span>}
  <div className="movie-body"><div className="movie-title"><h3><Link href={`/movies/${m.id}`}>{m.title}</Link></h3>{m.status !== "unwatched" && <span className={`badge ${m.status}`}>{statusLabels[m.status]}</span>}</div><p className="meta">{m.release_year ? `${m.release_year}年公開` : "公開年未登録"}<span>·</span>{new Date(m.created_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric", timeZone: "Asia/Tokyo" })} に届いたおすすめ</p>
  <Link className="comment-link" href={`/movies/${m.id}`}>{m.comment_count > 0 ? `おすすめポイント ${m.comment_count}件を読む →` : "最初のおすすめポイントを書く →"}</Link>
  {admin && <div className="admin-tools"><label><span className="sr-only">{m.title}の視聴状態</span><select disabled={busy} value={m.status} onChange={e => void changeStatus(m, e.target.value as MovieStatus)}>{Object.entries(statusLabels).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label><button disabled={busy} onClick={() => openEdit(m)}>編集</button><button disabled={busy} onClick={() => { setSelected(m); setFormError(""); setModal("delete"); }}>削除</button></div>}</div>
  <button className={`vote ${m.voted ? "selected" : ""}`} aria-pressed={m.voted} aria-label={`${m.title}：${m.vote_count}票。${m.voted ? "投票を取り消す" : "観たいに投票してひとこと書く"}`} disabled={!!pendingVote || m.status === "watched"} onClick={() => m.voted ? void cancelVote(m) : (setFormError(""), setVoteFor(m))}><span className="vote-number"><span aria-hidden="true">{m.voted ? "♥" : "♡"}</span> {m.vote_count}</span><span>{pendingVote === m.id ? "更新中…" : m.status === "watched" ? "投票終了" : m.voted ? "投票済み" : "観たい"}</span></button></article>; })}</div>}
  {feed && feed.total > feed.pageSize && <nav className="pagination" aria-label="リストのページ"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>← 前へ</button><span>{page} / {Math.ceil(feed.total / feed.pageSize)}</span><button disabled={page * feed.pageSize >= feed.total || loading} onClick={() => setPage(p => p + 1)}>次へ →</button></nav>}</section>
  <aside className="sidebar"><section className="next-card"><p className="eyebrow"><span aria-hidden="true">✦</span> UP NEXT</p><h2>配信者の「次に観る」</h2><p className="aside-copy">投票ランキングとは別に、観る予定に入れた作品です。</p>{feed?.next.length ? <ol className="next-list">{feed.next.map(m => <li key={m.id}><Link href={`/movies/${m.id}`}><strong>{m.title}</strong><span>{m.release_year || "公開年未登録"} <span aria-hidden="true">↗</span></span></Link></li>)}</ol> : <div className="next-empty">次の一本を選んでいるところです。<br />みんなの「観たい」を待っています。</div>}<div className="ticket-foot">SAVE A SEAT FOR THE NEXT ONE</div></section>
  <section className="howto"><h2>おすすめの届け方</h2><ol><li><span>01</span><div><strong>まずは映画名を検索</strong><p>同じ作品があれば、そこに1票。</p></div></li><li><span>02</span><div><strong>「観たい」にひとこと添える</strong><p>どこが good か、ネタバレなしで。</p></div></li><li><span>03</span><div><strong>作品ページで読み合う</strong><p>同じ映画を推す人の言葉が並びます。</p></div></li></ol></section></aside></div>
  <footer><div><strong>はるとのMOVIE ROOM</strong><span>映画のあとも、話そう。</span></div><details><summary>投稿・投票とデータについて</summary><p>ログイン不要。1作品につき1ブラウザ1票です。Cookieの削除や別端末からの重複投票はお控えください。投票を取り消すと、その作品に書いたおすすめポイントも一緒に消えます。</p><p>投稿とおすすめポイントは公開されます。個人情報・ネタバレ・中傷を書き込まないでください。不適切な投稿は配信者が削除する場合があります。ニックネームは任意で、空欄の場合は「匿名」と表示されます。</p><p>投票識別と配信者ログインにCookieを使います。連投防止のため接続元を復元できない形に変換して一時保存します。視聴済み作品の投票は終了します。</p><p>映画情報とポスター画像は <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer noopener">TMDB</a> を利用しています。TMDBによる公認・提携を受けたサービスではありません。</p></details></footer></main>
  {notice && <div className="notice" role="status"><span>{notice}</span>{undoId && admin && <button disabled={busy} onClick={() => void undoDelete()}>元に戻す</button>}<button aria-label="通知を閉じる" onClick={() => setNotice("")}>×</button></div>}
  {voteFor && <VoteDialog movieTitle={voteFor.title} busy={busy} error={formError} onSubmit={values => void sendVote(voteFor, values)} onClose={() => setVoteFor(null)} />}
  {modal === "post" && <Modal title={picked ? "おすすめポイントを書く" : "どの映画をおすすめしますか？"} onClose={closeModal} busy={busy}>
    {!picked ? <>
      <p className="modal-description">映画名を入れると候補が出ます。同じ作品がすでにあれば、そこへ1票を。</p>
      <label className="field">映画名 <span>2文字以上で検索</span><input autoFocus maxLength={100} value={draft.title} placeholder="例：インターステラー" onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      {suggestions.length > 0 && <div className="suggestions"><p>すでに投稿されています</p>{suggestions.map(m => <Link key={m.id} href={`/movies/${m.id}`}>{m.title} <span>{m.release_year || "公開年未登録"} · {m.vote_count}票 →</span></Link>)}</div>}
      {searching && <p className="form-note">候補を探しています…</p>}
      {tmdb.length > 0 && <div className="tmdb-results"><p>映画データベースの候補</p>{tmdb.map(r => { const thumb = posterUrl(r.poster_path); return <button type="button" key={r.tmdb_id} onClick={() => pickTmdb(r)}>{thumb ? <Image src={thumb} alt="" width={40} height={60} /> : <span className="thumb placeholder small" aria-hidden="true">✦</span>}<span className="tmdb-text"><strong>{r.title}</strong><span>{r.release_year ?? "公開年不明"}</span></span></button>; })}</div>}
      {tmdbOff && <p className="form-note">映画データベースに接続できませんでした。手入力で進められます。</p>}
      {draft.title.trim().length >= 2 && !searching && <button type="button" className="secondary full" onClick={pickManual}>候補にない・このまま「{draft.title.trim()}」で進む</button>}
    </> : <form onSubmit={saveMovie}>
      <div className="picked"><div>{draft.poster_path ? <Image src={posterUrl(draft.poster_path)!} alt="" width={54} height={81} /> : <span className="thumb placeholder" aria-hidden="true">✦</span>}</div><div><strong>{draft.title}</strong><span>{draft.release_year ? `${draft.release_year}年公開` : "公開年未登録"}</span><button type="button" className="link-button" onClick={() => setPicked(false)}>選び直す</button></div></div>
      {!draft.tmdb_id && <label className="field">公開年 <span>任意・同名作品の区別に</span><input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={draft.release_year} placeholder="例：2014" onChange={e => setDraft({ ...draft, release_year: e.target.value })} /></label>}
      <label className="field">おすすめポイント <span>任意・ネタバレなしで</span><textarea autoFocus rows={4} maxLength={COMMENT_MAX} value={draft.comment} placeholder="どんなところが好き？" onChange={e => setDraft({ ...draft, comment: e.target.value })} /><small>{draft.comment.length} / {COMMENT_MAX}</small></label>
      <label className="field">ニックネーム <span>任意・空欄なら「匿名」</span><input maxLength={NICKNAME_MAX} value={draft.nickname} placeholder="例：はると" onChange={e => setDraft({ ...draft, nickname: e.target.value })} /></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <button className="primary full" disabled={busy} type="submit">{busy ? "保存中…" : "おすすめを届ける ↗"}</button>
      <p className="form-note">投稿時にあなたの「観たい」が1票入ります。</p>
    </form>}
  </Modal>}
  {modal === "edit" && <Modal title="映画の情報を編集" onClose={closeModal} busy={busy}><p className="modal-description">映画名や公開年の間違いを修正できます。おすすめポイントは投稿者本人のものなので変更されません。</p><form onSubmit={saveMovie}><label className="field">映画名 <span>必須</span><input autoFocus required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label className="field">公開年 <span>任意</span><input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={draft.release_year} onChange={e => setDraft({ ...draft, release_year: e.target.value })} /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary full" disabled={busy} type="submit">{busy ? "保存中…" : "変更を保存する"}</button></form></Modal>}
  {modal === "login" && <Modal title="配信者ログイン" onClose={closeModal} busy={busy}><p className="modal-description">配信者用アカウントでログインしてください。</p><form onSubmit={login}><label className="field">メールアドレス<input autoFocus type="email" name="email" required autoComplete="username" /></label><label className="field">パスワード<input type="password" name="password" required autoComplete="current-password" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary full" type="submit" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button></form></Modal>}
  {modal === "delete" && selected && <Modal title="映画をリストから削除" onClose={closeModal} busy={busy}><p className="modal-description">「{selected.title}」を削除します。削除後の通知から元に戻せます。</p>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="dialog-actions"><button className="secondary" disabled={busy} onClick={closeModal}>キャンセル</button><button className="danger" disabled={busy} onClick={() => void deleteMovie()}>{busy ? "削除中…" : "削除する"}</button></div></Modal>}
  </>;
}
