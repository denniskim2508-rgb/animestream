import { TVRegionContext, TVContainerContext, useFocusContainer } from '../TVFocusManager'

/**
 * A horizontal rail of focusable content. When `region` is provided it also
 * declares a focusable container: children (cards) register under it and the
 * row wins deterministic navigation — sibling cards in the rail first, then
 * declared exits, then stay. Exit destinations (`exitUp`/`exitDown`/`exitLeft`)
 * are container ids or focus keys supplied by the page.
 */
export default function TVRow({ title, region, children, count = null, exitUp, exitDown }) {
  const exits = {}
  if (exitUp) exits.up = exitUp
  if (exitDown) exits.down = exitDown

  // Only becomes a registered container when `region` is provided; otherwise
  // the hook is a no-op (id null) and the row keeps legacy (free) behavior.
  // Called unconditionally (before the empty-guard) to satisfy rules-of-hooks.
  useFocusContainer({ id: region || null, region, exits })

  if (!children || (Array.isArray(children) && children.length === 0)) return null

  return (
    <section className="mb-12 tv-enter">
      <div className="flex items-center justify-between mb-4 kx-shell-padding">
        <h2 className="flex items-center gap-3">
          <span className="kx-section-accent" />
          <span className="kx-section-title">{title}</span>
          {count != null && <span className="kx-count-badge hidden sm:inline-flex">{count}</span>}
        </h2>
      </div>
      <TVRegionContext.Provider value={region || null}>
        <TVContainerContext.Provider value={region || null}>
          <div className="flex overflow-x-auto scrollbar-hide scroll-smooth pb-3 kx-shell-padding" style={{ gap: 'var(--kx-card-gap, 18px)' }}>
            {children}
          </div>
        </TVContainerContext.Provider>
      </TVRegionContext.Provider>
    </section>
  )
}
