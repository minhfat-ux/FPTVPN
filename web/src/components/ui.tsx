import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, X } from "lucide-react";
import { useI18n } from "../i18n";

/** Markdown renderer with GFM tables, highlighted code and per-block copy. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={src} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <pre ref={ref}>
      <button className="btn btn-sm btn-ghost copy-btn" onClick={copy} type="button" title={t("shell.ui.copyBlock")}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {children}
    </pre>
  );
}

// --------------------------------------------------------------------- modal

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="grow">
            <div className="modal-title">{title}</div>
            {description && <div className="card-desc mt-1">{description}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t("shell.ui.modalClose")} type="button">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ toaster

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; kind: string; message: string }[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">
          <div className="grow">{toast.message}</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onDismiss(toast.id)} aria-label={t("shell.ui.toastDismiss")}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- inputs

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="track" />
      <span className="label">{label}</span>
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row gap-2">
      <span className="spinner" />
      {label && <span className="muted small">{label}</span>}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="bold">{title}</div>
      {hint && <div className="small mt-1">{hint}</div>}
    </div>
  );
}

/** Confirmation dialog used for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel} type="button" disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} type="button" disabled={busy}>
            {busy ? t("shell.ui.busy") : confirmLabel ?? t("common.delete")}
          </button>
        </>
      }
    >
      <p className="mb-0">{message}</p>
    </Modal>
  );
}

/** Small copy-to-clipboard button used next to ids, keys and URLs. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const title = label ?? t("shell.ui.copyBlock");
  return (
    <button
      className="btn btn-sm btn-ghost"
      type="button"
      title={title}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/** Debounced text input, used by every search box. */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const sticky = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      sticky.current = distance < 120;
    };
    node.addEventListener("scroll", onScroll);
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  const key = JSON.stringify(deps);
  useEffect(() => {
    const node = ref.current;
    if (node && sticky.current) node.scrollTop = node.scrollHeight;
  }, [key]);

  return ref;
}

/** Short badge text shown on file/artifact cards. */
export function fileIconLabel(kind: string): string {
  switch (kind) {
    case "image": return "IMG";
    case "pptx": return "PPT";
    case "xlsx": return "XLS";
    case "data": return "CSV";
    case "pdf": return "PDF";
    default: return "FILE";
  }
}
