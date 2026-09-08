"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label="閉じる">×</button></div>{children}</dialog>;
}
