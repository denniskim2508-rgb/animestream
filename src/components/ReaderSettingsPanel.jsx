// Reusable, schema-driven reader settings panel.
//
// Responsive breakpoints:
//   - <768px   : bottom sheet with swipe-down-to-close
//   - 768-1023 : centered modal
//   - >=1024px : floating side panel (350-400px) docked to the right
//
// Every control is generated from READER_SETTINGS_SCHEMA, so future options
// can be added in src/utils/readerSettings.js without touching this component.

import { useRef, useState } from 'react'
import { X, RotateCcw, GripHorizontal } from 'lucide-react'
import { READER_SETTING_GROUPS, READER_SETTINGS_SCHEMA } from '../utils/readerSettings'

function SegmentedControl({ option, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {option.options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === opt.value
              ? 'bg-primary text-white shadow-lg shadow-primary/25'
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ option, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{option.label}</p>
        {option.description && <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          value ? 'bg-primary' : 'bg-white/10'
        }`}
        aria-label={option.label}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}

export default function ReaderSettingsPanel({ open, onClose, settings, onChange, onReset }) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const touchStartY = useRef(null)
  const panelRef = useRef(null)

  if (!open) return null

  const handleTouchStart = (e) => {
    const scrollEl = panelRef.current?.querySelector('.reader-settings-scroll')
    if (scrollEl && scrollEl.scrollTop > 0) return
    touchStartY.current = e.touches[0].clientY
    setDragging(true)
  }

  const handleTouchMove = (e) => {
    if (touchStartY.current == null) return
    const delta = e.touches[0].clientY - touchStartY.current
    setDragY(Math.max(0, delta))
  }

  const handleTouchEnd = (e) => {
    const start = touchStartY.current
    const end = e.changedTouches?.[0]?.clientY ?? null
    if (start != null && end != null && end - start > 100) onClose()
    setDragY(0)
    setDragging(false)
    touchStartY.current = null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center lg:items-stretch lg:justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={dragging ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`relative z-10 w-full md:max-w-lg lg:w-[380px] lg:max-w-none md:rounded-2xl lg:rounded-none rounded-t-2xl h-[85dvh] md:h-auto md:max-h-[85vh] lg:h-full lg:max-h-none bg-surface border-t md:border border-white/10 lg:border-y-0 lg:border-r-0 shadow-2xl shadow-black/60 flex flex-col overflow-hidden ${
          dragging ? '' : 'transition-transform duration-200 ease-out'
        } animate-[readerSheetIn_280ms_cubic-bezier(0.16,1,0.3,1)] md:animate-[readerFadeUp_240ms_ease-out] lg:animate-[readerSideIn_280ms_cubic-bezier(0.16,1,0.3,1)]`}
      >
        <div className="md:hidden flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <GripHorizontal className="w-8 h-4 text-gray-600" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <h2 className="text-base font-semibold text-white">Reader Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="reader-settings-scroll flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {READER_SETTING_GROUPS.map((group) => (
            <section key={group.id}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">{group.title}</h3>
              <div className="space-y-4">
                {group.items.map((key) => {
                  const option = READER_SETTINGS_SCHEMA[key]
                  if (!option) return null
                  return (
                    <div key={key}>
                      {option.type === 'toggle' ? (
                        <Toggle option={option} value={settings[key]} onChange={(value) => onChange(key, value)} />
                      ) : (
                        <div>
                          <p className="text-sm font-medium text-white mb-2">{option.label}</p>
                          <SegmentedControl option={option} value={settings[key]} onChange={(value) => onChange(key, value)} />
                        </div>
                      )}
                      {key === 'zoom' && settings.zoom === 'free' && (
                        <div className="mt-3 flex items-center gap-3">
                          <input
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.05"
                            value={settings.freeZoom || 1}
                            onChange={(e) => onChange('freeZoom', Number(e.target.value))}
                            className="flex-1 accent-primary"
                          />
                          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{settings.freeZoom}x</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <div className="flex items-center justify-between gap-4 pt-2 pb-6">
            <p className="text-xs text-gray-500">Changes apply instantly.</p>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
