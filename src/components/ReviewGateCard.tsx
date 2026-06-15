import { CheckCircle, Edit3 } from 'lucide-react'

interface ReviewGateCardProps {
  title: string
  summary: string
  proposedAction: string
  recommendation: string
  recommendationLabel: string
  onConfirm: () => void
  onEdit: () => void
}

export function ReviewGateCard({
  title,
  summary,
  proposedAction,
  recommendation,
  recommendationLabel,
  onConfirm,
  onEdit,
}: ReviewGateCardProps) {
  return (
    <div className="gate-card feed-step-enter" style={{ padding: 16, margin: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--state-active)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <CheckCircle size={14} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div>
          <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.4 }}>{title}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>{summary}</p>
        </div>
      </div>

      <div style={{
        background: 'var(--surface-sidebar)',
        borderRadius: 4,
        padding: '10px 12px',
        marginBottom: 8,
        border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Proposed action
        </p>
        <p style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5 }}>{proposedAction}</p>
      </div>

      <div style={{
        background: '#f0edfa',
        borderRadius: 4,
        padding: '10px 12px',
        marginBottom: 12,
        border: '1px solid var(--state-active)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Recommended
        </p>
        <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{recommendation}</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm}>
          <CheckCircle size={13} />
          {recommendationLabel}
        </button>
        <button className="btn-secondary" style={{ height: 32 }} onClick={onEdit}>
          <Edit3 size={12} />
          Edit first
        </button>
      </div>
    </div>
  )
}
