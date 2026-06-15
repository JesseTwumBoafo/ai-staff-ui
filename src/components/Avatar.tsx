interface AvatarProps {
  initials: string
  colour: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  pulse?: boolean
  showPresence?: boolean
  presenceActive?: boolean
}

const sizeClasses = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-9 h-9 text-sm',
  xl: 'w-12 h-12 text-base',
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function lighten(hex: string, amount: number) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.min(255, rgb.r + Math.round((255 - rgb.r) * amount))
  const g = Math.min(255, rgb.g + Math.round((255 - rgb.g) * amount))
  const b = Math.min(255, rgb.b + Math.round((255 - rgb.b) * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function Avatar({ initials, colour, size = 'md', pulse = false, showPresence, presenceActive }: AvatarProps) {
  const lightColour = lighten(colour, 0.3)
  const gradientStyle = {
    background: `linear-gradient(135deg, ${lightColour} 0%, ${colour} 100%)`,
  }

  const showDot = showPresence !== undefined ? showPresence : pulse

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 relative select-none`}
      style={gradientStyle}
    >
      <span className="tracking-wide">{initials}</span>
      {showDot && (
        <span
          className={`presence-dot ${presenceActive !== undefined ? (presenceActive ? 'active' : 'idle') : 'active'} ${presenceActive !== false ? 'status-pulse' : ''}`}
        />
      )}
    </div>
  )
}
