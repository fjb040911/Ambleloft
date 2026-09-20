import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {t} from './i18n';
export default function Modal({ title, children, close, wide = false, busy = false }: { title: string; children: ReactNode; close(): void; wide?: boolean; busy?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    returnFocus.current ??= document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (returnFocus.current?.isConnected && !document.querySelector('dialog[open]')) returnFocus.current.focus();
      });
    };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClick={event => { if (!busy && event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }} aria-labelledby={titleId}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={close} aria-label={t("关闭")}><X size={18} /></button></div>{children}
  </dialog>;
}
