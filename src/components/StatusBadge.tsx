import type { AgentStatus } from '../data/types'

const labels: Record<AgentStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
  retired: 'Retired',
}

const styles: Record<AgentStatus, { background: string; color: string; border: string }> = {
  active: { background: '#e8f7ef', color: '#1a7a4c', border: '1px solid #b8e8cf' },
  paused: { background: '#fef3e2', color: '#9a5c0a', border: '1px solid #f7d8a0' },
  archived: { background: '#f2f2f5', color: '#6B6780', border: '1px solid #D4D1E3' },
  retired: { background: '#fde8e6', color: '#b53424', border: '1px solid #f5c0bb' },
}

const dotStyles: Record<AgentStatus, string> = {
  active: 'status-pulse',
  paused: '',
  archived: '',
  retired: '',
}

const dotColours: Record<AgentStatus, string> = {
  active: '#22A06B',
  paused: '#E2812A',
  archived: '#9C97B0',
  retired: '#E34935',
}

interface StatusBadgeProps {
  status: AgentStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
      style={{ ...styles[status], fontSize: '11px', fontWeight: 600, lineHeight: '1.3' }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotStyles[status]}`}
        style={{ background: dotColours[status] }}
      />
      {labels[status]}
    </span>
  )
}
