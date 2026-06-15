import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
}

interface ToastProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

const icons = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
}

const iconColours = {
  success: 'var(--semantic-success)',
  info: 'var(--semantic-info)',
  warning: 'var(--semantic-warning)',
  error: 'var(--semantic-error)',
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  const [leaving, setLeaving] = useState(false)
  const Icon = icons[toast.type]

  const dismiss = useCallback(() => {
    setLeaving(true)
    setTimeout(() => onDismiss(toast.id), 150)
  }, [toast.id, onDismiss])

  useEffect(() => {
    if (toast.type === 'info' || toast.type === 'success') {
      const t = setTimeout(dismiss, 4000)
      return () => clearTimeout(t)
    }
  }, [toast.type, dismiss])

  return (
    <div className={`toast ${leaving ? 'toast-out' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Icon size={15} style={{ color: iconColours[toast.type], flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5 }}>{toast.message}</span>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', flexShrink: 0 }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
