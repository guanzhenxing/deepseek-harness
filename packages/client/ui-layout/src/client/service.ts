/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * details open/close from ui-conversation) — writes stay inside the store's
 * declared action set, delivered as the registration's bound actions.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { createLayoutStore } from './stores.ts'

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /** Open the details panel (no-op when already open). */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
  /**
   * Activate a registered root-scope work area. Unknown ids throw.
   * @param id - registered work-area id.
   * @param options - initial companion and sidebar visibility.
   */
  openWorkArea(id: string, options?: { conversationVisible?: boolean; sidebarVisible?: boolean }): void
  /**
   * Close this work area when it remains active; stale ids are ignored.
   * @param id - work-area id that owns the close request.
   */
  closeWorkArea(id: string): void
  /**
   * Show or hide the native conversation companion for this active work area.
   * @param id - work-area id that owns the visibility request.
   * @param visible - whether the companion is visible.
   */
  setWorkAreaConversationVisible(id: string, visible: boolean): void
  /**
   * Show or hide the sidebar for this active work area without changing the user's sidebar preference.
   * @param id - work-area id that owns the visibility request.
   * @param visible - whether the sidebar is visible.
   */
  setWorkAreaSidebarVisible(id: string, visible: boolean): void
  /**
   * Resize the native conversation companion for this active work area —
   * the programmatic equivalent of the drag handle. The store clamps to the
   * companion floor and the frame's solver concedes anything the viewport
   * cannot spare beside the work-area reserve, so oversized requests settle
   * at "as wide as fits" instead of overflowing.
   * @param id - work-area id that owns the resize request; inactive ids are ignored.
   * @param px - requested companion width in px.
   */
  setWorkAreaCompanionWidth(id: string, px: number): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined
  #slots: SlotRegistry | undefined
  #disposeWorkAreaSubscription: (() => void) | undefined
  #activeWorkArea: string | undefined

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   */
  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  /**
   * Watch current `shell.workArea` winners so unload and HMR cannot leave a
   * selected id whose contribution has disappeared.
   * @param slots - root slot registry supplied by the layout plugin.
   */
  attachWorkAreas(slots: SlotRegistry): void {
    this.#disposeWorkAreaSubscription?.()
    this.#slots = slots
    const reconcile = () => { this.#reconcileWorkArea() }
    this.#disposeWorkAreaSubscription = slots.subscribe('shell.workArea', reconcile)
    reconcile()
  }

  /** Detach work-area observation during layout-plugin disposal. */
  detachWorkAreas(): void {
    this.#disposeWorkAreaSubscription?.()
    this.#disposeWorkAreaSubscription = undefined
    this.#slots = undefined
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Open the details panel (no-op when already open). */
  openDetails(): void {
    this.#require().openDetails()
  }

  /** Close the details panel. */
  closeDetails(): void {
    this.#require().closeDetails()
  }

  /** Activate a registered work area, optionally hiding its native companion. */
  openWorkArea(id: string, options: { conversationVisible?: boolean; sidebarVisible?: boolean } = {}): void {
    if (!this.#hasWorkArea(id)) throw new Error(`layout: unknown work area "${id}"`)
    this.#activeWorkArea = id
    this.#require().openWorkArea(id, options.conversationVisible ?? true, options.sidebarVisible ?? true)
  }

  /** Close this id only, so a stale plugin callback cannot close a newer area. */
  closeWorkArea(id: string): void {
    if (this.#activeWorkArea === id) this.#activeWorkArea = undefined
    this.#require().closeWorkArea(id)
  }

  /** Change companion visibility only while this id remains active. */
  setWorkAreaConversationVisible(id: string, visible: boolean): void {
    this.#require().setWorkAreaConversationVisible(id, visible)
  }

  /** Change sidebar visibility only while this id remains active. */
  setWorkAreaSidebarVisible(id: string, visible: boolean): void {
    this.#require().setWorkAreaSidebarVisible(id, visible)
  }

  /** Resize the companion only while this id remains active. */
  setWorkAreaCompanionWidth(id: string, px: number): void {
    this.#require().setWorkAreaCompanionWidth(id, px)
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }

  #hasWorkArea(id: string): boolean {
    return this.#slots?.entriesOfSlot('shell.workArea').some(entry => entry.options.id === id) === true
  }

  #reconcileWorkArea(): void {
    const actions = this.#panels
    if (actions === undefined) return
    const active = this.#activeWorkArea
    if (active !== undefined && !this.#hasWorkArea(active)) {
      actions.closeWorkArea(active)
      this.#activeWorkArea = undefined
    }
  }
}
