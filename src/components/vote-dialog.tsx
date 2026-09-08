"use client";
import { useState, type FormEvent } from "react";
import Modal from "./modal";
import { COMMENT_MAX, NICKNAME_MAX } from "@/lib/model";
import { rememberNickname, rememberedNickname } from "@/lib/client";

/**
 * 「観たい」を押したときに開く。おすすめポイントは任意なので、
 * 空のまま送れば「無言の1票」として成立する。
 */
export default function VoteDialog({ movieTitle, editing, initialComment = "", initialNickname = "", busy, error, onSubmit, onClose }: {
  movieTitle: string; editing?: boolean; initialComment?: string; initialNickname?: string; busy: boolean; error: string;
  onSubmit: (values: { comment: string; nickname: string }) => void; onClose: () => void;
}) {
  const [comment, setComment] = useState(initialComment);
  const [nickname, setNickname] = useState(() => initialNickname || rememberedNickname());
  function submit(e: FormEvent) { e.preventDefault(); if (busy) return; rememberNickname(nickname); onSubmit({ comment, nickname }); }
  return <Modal title={editing ? "おすすめポイントを書き直す" : `「${movieTitle}」に1票`} onClose={onClose} busy={busy}>
    <p className="modal-description">{editing ? "書いた内容はいつでも直せます。" : "この映画のどこが good か、ひとことどうぞ。空のまま送っても1票入ります。"}</p>
    <form onSubmit={submit}>
      <label className="field">おすすめポイント <span>任意・ネタバレなしで</span>
        <textarea autoFocus rows={4} maxLength={COMMENT_MAX} value={comment} placeholder="どんなところが好き？" onChange={e => setComment(e.target.value)} />
        <small>{comment.length} / {COMMENT_MAX}</small>
      </label>
      <label className="field">ニックネーム <span>任意・空欄なら「匿名」</span>
        <input maxLength={NICKNAME_MAX} value={nickname} placeholder="例：はると" onChange={e => setNickname(e.target.value)} />
        <small>次に投票するときも同じ名前が入ります</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary full" type="submit" disabled={busy}>{busy ? "送信中…" : editing ? "書き直す" : "観たいを届ける ↗"}</button>
    </form>
  </Modal>;
}
