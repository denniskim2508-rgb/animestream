import { isValidElement } from 'react'
import { useFocusable } from '../TVFocusManager'

const VARIANTS = {
  primary: 'tv-btn-primary',
  ghost: 'tv-btn-ghost',
}

export default function TVButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  tvScope,
  autoFocus = false,
  className = '',
  icon: Icon,
  region,
}) {
  const focus = useFocusable({ onSelect: onClick, disabled, scope: tvScope || 'root', autoFocus, region })
  const variantClass = VARIANTS[variant] || VARIANTS.primary
  return (
    <button
      ref={focus.ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${variantClass} inline-flex items-center gap-3 rounded-xl px-7 py-4 text-lg font-semibold select-none
        ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      {Icon && (isValidElement(Icon) ? Icon : <Icon className="w-6 h-6 shrink-0" />)}
      {children}
    </button>
  )
}
