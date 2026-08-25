/**
 * Shell frame, registered into the built-in 'root' slot (the web shell renders
 * only 'root'). It owns the grid tracks, drag handles (pointer capture + rAF
 * throttle), concession chain (columns.ts), and child-slot render decisions:
 * the sidebar slot renders HERE with live parameters from the concession
 * solve, and session-aware occupants render in fixed positions; strict entries
 * gate themselves on current-session availability while session-maybe entries
 * retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { computeColumns, computeWorkAreaColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.workArea' | 'shell.workArea.companionHeader' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>

/** Selected plugin work-area grid item. */
function WorkAreaColumn(props: { active: boolean; children?: ReactNode }) {
  return <div className={css.workAreaCol} data-work-area-active={props.active || undefined}>{props.children}</div>
}

/** Native conversation host; its grid position changes without replacing its React tree. */
function CompanionColumn(props: { companion: boolean; children?: ReactNode }) {
  return <div className={css.companionCol} data-shell-native-conversation-companion={props.companion || undefined}>{props.children}</div>
}

/** Details column grid item; only an explicitly hidden companion unmounts its subtree. */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'companion' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The shell frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const activeWorkArea = panels.activeWorkArea
  const sidebarVisible = activeWorkArea === undefined || panels.workAreaSidebarVisible
  const sidebarCollapsed = sidebarVisible && (narrow ? !panels.narrowExpanded : panels.sidebar === 0)
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const companionVisible = activeWorkArea !== undefined && panels.workAreaConversationVisible
  const conversationMounted = activeWorkArea === undefined || companionVisible
  const detailsPreference = detailsSession === undefined || (activeWorkArea !== undefined && !companionVisible)
    ? 0
    : panels.details
  const workAreaCols = activeWorkArea === undefined
    ? undefined
    : computeWorkAreaColumns(viewport, sidebarPreference, companionVisible ? panels.companion : 0, detailsPreference, sidebarVisible)
  const cols = workAreaCols ?? computeColumns(viewport, sidebarPreference, detailsPreference)
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const companionBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onCompanionStart = useCallback(() => { companionBase.current = workAreaCols?.companion ?? 0; setDragging(true) }, [workAreaCols])
  const onCompanionDrag = useCallback((dx: number) => {
    actions.setCompanion(companionBase.current - dx)
  }, [actions])
  // Companion-header slot share: the active work area's own UI (registered
  // into 'shell.workArea.companionHeader') receives the same id-guarded
  // companion visibility control the work-area owner gets. The frame stays
  // business-agnostic: no built-in controls, entries bring their own.
  const onCompanionSetVisible = useCallback((visible: boolean) => {
    if (activeWorkArea === undefined) return
    actions.setWorkAreaConversationVisible(activeWorkArea, visible)
  }, [actions, activeWorkArea])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: activeWorkArea === undefined
        ? `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`
        : `${cols.sidebar}px minmax(0, 1fr) ${workAreaCols?.companion ?? 0}px ${cols.details}px` }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-hidden={!sidebarVisible || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-work-area-active={activeWorkArea}
      data-work-area-companion-visible={companionVisible || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol} data-shell-sidebar-hidden={!sidebarVisible || undefined} aria-hidden={!sidebarVisible || undefined} {...(!sidebarVisible ? { inert: '' } : {})}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })}
      </div>
      <WorkAreaColumn active={activeWorkArea !== undefined}>
        {activeWorkArea !== undefined && renderSlot('shell.workArea', {
          id: activeWorkArea,
          conversation: {
            visible: companionVisible,
            setVisible: (visible) => { actions.setWorkAreaConversationVisible(activeWorkArea, visible) },
          },
          sidebar: {
            visible: sidebarVisible,
            setVisible: (visible) => { actions.setWorkAreaSidebarVisible(activeWorkArea, visible) },
          },
        }, { only: activeWorkArea })}
      </WorkAreaColumn>
      <CompanionColumn companion={activeWorkArea !== undefined}>
        {activeWorkArea !== undefined && conversationMounted && renderSlot('shell.workArea.companionHeader', {
          id: activeWorkArea,
          conversation: { visible: companionVisible, setVisible: onCompanionSetVisible },
        }, { only: activeWorkArea })}
        {conversationMounted && renderSlot('conversation', {})}
      </CompanionColumn>
      <DetailsColumn>{conversationMounted && renderSlot('details', {})}</DetailsColumn>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {sidebarVisible && !sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {activeWorkArea !== undefined && companionVisible && (workAreaCols?.companion ?? 0) > 0 && <DragHandle side="companion" left={cols.sidebar + (workAreaCols?.workArea ?? 0)} onStart={onCompanionStart} onDrag={onCompanionDrag} onEnd={onDragEnd} />}
      {cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
