import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function CustomDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: number | string
  options: (number | string)[]
  onChange: (value: number | string) => void
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return (
    <div className={`custom-dropdown ${className}`} ref={ref}>
      <button
        type="button"
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
      >
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="custom-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(option => (
            <button
              type="button"
              key={String(option)}
              className={`custom-dropdown-option ${String(option) === String(value) ? 'active' : ''}`}
              role="option"
              aria-selected={String(option) === String(value)}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {String(option) === String(value) && <span className="custom-dropdown-check">✓</span>}
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
