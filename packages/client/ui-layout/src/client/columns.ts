/**
 * Pure concession-chain column solver for the three-column AppFrame.
 * Chain order is fixed by contract: keep center >= CENTER_MIN by shrinking
 * details, then auto-closing it (derived zero width — preferred width
 * preferences are never rewritten, so widening the window restores them).
 * The sidebar never concedes: its rendered width is always the drag
 * preference (or the collapsed rail), and center absorbs any remaining
 * deficit as the last resort. Inputs are the layout store's plain width
 * preferences (0 = closed); a closed sidebar resolves to the fixed
 * SIDEBAR_COLLAPSED control rail while closed details resolve to zero width.
 * The SIDEBAR_AUTO_COLLAPSE breakpoint is consumed by AppFrame, which decides
 * the effective sidebar preference before solving; the solver itself stays
 * breakpoint-free.
 */

/** Resolved widths for one frame; center may drop below CENTER_MIN only at the final fallback. */
export interface Columns { sidebar: number; center: number; details: number }

// Contract-frozen geometry: the three-column concession chain's fixed points.
/** Center column floor; only the final fallback may go below it. */
export const CENTER_MIN = 640
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Details drag clamp floor. */
export const DETAILS_MIN = 300
/** Details drag clamp ceiling. */
export const DETAILS_MAX = 520
/** Details width before any user drag. */
export const DETAILS_DEFAULT = 360
/** Work-area companion conversation drag clamp floor. */
export const COMPANION_MIN = 320
/** Work-area companion conversation drag clamp ceiling. */
export const COMPANION_MAX = 620
/** Work-area companion conversation width before a user drag. */
export const COMPANION_DEFAULT = 420
/** Minimum width reserved for the active plugin work area. */
export const WORK_AREA_MIN = 400

/** Resolved widths for an active work area. */
export interface WorkAreaColumns extends Columns { workArea: number; companion: number }

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame. Pure: no hysteresis —
 * the output is a function of (viewport, preferences) only, so recovery on
 * re-widening is automatic. Preferences re-clamp here because they cross the
 * store boundary and callers may still supply stale ranges.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @returns resolved widths; details 0 means visually closed (never unmounted), while a closed sidebar keeps its compact rail.
 */
export function computeColumns(viewport: number, sidebar: number, details: number): Columns {
  // The sidebar is fixed at its preference (or the rail) — it never concedes.
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)

  // Step 1: everything fits at preferred widths.
  if (s + d0 + CENTER_MIN <= viewport) return { sidebar: s, center: viewport - s - d0, details: d0 }

  // Step 2: shrink details toward its minimum.
  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 }

  // Step 3: auto-close details (derived — preferences untouched); center
  // absorbs any remaining deficit (may drop below CENTER_MIN).
  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}

/**
 * Solve the four-column work-area layout. Details concedes first, then the
 * native conversation companion. The selected plugin work area receives the
 * remaining center width and may fall below its floor only after both optional
 * columns are exhausted.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param companion - native conversation companion preference (0 = hidden).
 * @param details - details preference in px (0 = closed).
 * @param sidebarVisible - whether the active work area temporarily shows the sidebar.
 * @returns resolved sidebar, work-area, companion, and details widths.
 */
export function computeWorkAreaColumns(
  viewport: number, sidebar: number, companion: number, details: number, sidebarVisible = true,
): WorkAreaColumns {
  const s = sidebarVisible ? (sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)) : 0
  let c = companion === 0 ? 0 : clampWidth(companion, COMPANION_MIN, COMPANION_MAX)
  let d = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)
  let workArea = viewport - s - c - d

  if (workArea < WORK_AREA_MIN && d > 0) {
    const deficit = WORK_AREA_MIN - workArea
    d = deficit >= d - DETAILS_MIN ? 0 : d - deficit
    workArea = viewport - s - c - d
  }
  if (workArea < WORK_AREA_MIN && c > 0) {
    const deficit = WORK_AREA_MIN - workArea
    c = Math.max(COMPANION_MIN, c - deficit)
    workArea = viewport - s - c - d
  }
  return { sidebar: s, center: Math.max(0, workArea), workArea: Math.max(0, workArea), companion: c, details: d }
}
