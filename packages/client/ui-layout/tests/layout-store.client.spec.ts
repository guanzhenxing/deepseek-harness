// @vitest-environment jsdom
/**
 * createLayoutStore unit account: init shape, the action write set (clamp
 * inside actions), and the absence of browser persistence. Uses the
 * test-sanctioned path: factory self-call + .create() gives the
 * real engine instance (same create path as production).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import {
  COMPANION_DEFAULT, COMPANION_MIN, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, WORK_AREA_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

const PERSIST_KEY = 'dsh.layout.panels'

beforeEach(() => { localStorage.clear() })

describe('createLayoutStore', () => {
  it('initializes the sidebar at its default width, details closed, wide viewport assumed', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      companion: 420,
      activeWorkArea: undefined,
      workAreaConversationVisible: false,
      workAreaSidebarVisible: false,
      narrow: false,
      narrowExpanded: false,
    })
  })

  it('each create() is an independent instance (factory is not a singleton)', () => {
    const a = createLayoutStore().create()
    const b = createLayoutStore().create()
    a.actions.setSidebar(400)
    expect(b.store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('setSidebar/setDetails clamp into the contract ranges', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MIN)
    actions.setSidebar(9999)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    actions.setDetails(1)
    expect(store.getSnapshot().details).toBe(DETAILS_MIN)
    actions.setDetails(9999)
    expect(store.getSnapshot().details).toBe(DETAILS_MAX)
  })

  it('setCompanion clamps into the drag-time ceiling, never a fixed constant', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setCompanion(1, 1_512 - WORK_AREA_MIN)
    expect(store.getSnapshot().companion).toBe(COMPANION_MIN)
    actions.setCompanion(9999, 1_512 - WORK_AREA_MIN)
    expect(store.getSnapshot().companion).toBe(1_512 - WORK_AREA_MIN)
    // A wider frame accepts a wider drag the same way.
    actions.setCompanion(9999, 5_120 - WORK_AREA_MIN)
    expect(store.getSnapshot().companion).toBe(5_120 - WORK_AREA_MIN)
  })

  it('setCompanion keeps the floor when the passed ceiling collapses below it', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setCompanion(500, 0)
    expect(store.getSnapshot().companion).toBe(COMPANION_MIN)
  })

  it('setWorkAreaCompanionWidth guards by id and clamps to the floor only', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setWorkAreaCompanionWidth('example.editor', 900)
    expect(store.getSnapshot().companion).toBe(COMPANION_DEFAULT)
    actions.openWorkArea('example.editor', true)
    actions.setWorkAreaCompanionWidth('stale.editor', 900)
    expect(store.getSnapshot().companion).toBe(COMPANION_DEFAULT)
    actions.setWorkAreaCompanionWidth('example.editor', 1)
    expect(store.getSnapshot().companion).toBe(COMPANION_MIN)
    // No fixed ceiling: the frame's solver bounds the rendered width against
    // the live viewport, so the preference stores the request verbatim.
    actions.setWorkAreaCompanionWidth('example.editor', 9999)
    expect(store.getSnapshot().companion).toBe(9999)
  })

  it('toggleSidebar flips closed <-> contract default (drag width forgotten)', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('narrow toggleSidebar flips only the re-expand override; the width preference survives', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: 400, details: 0, narrow: true, narrowExpanded: true })
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(false)
    expect(store.getSnapshot().sidebar).toBe(400)
  })

  it('crossing the breakpoint drops the override; a same-value setNarrow keeps it', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(false)
    expect(store.getSnapshot()).toMatchObject({ narrow: false, narrowExpanded: false })
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(false)
  })

  it('openDetails uses the contract default, preserves an open width, and closeDetails zeroes', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    actions.setDetails(500)
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(500)
    actions.closeDetails()
    expect(store.getSnapshot().details).toBe(0)
  })

  it('does not persist panel geometry', () => {
    const first = createLayoutStore().create()
    first.actions.setSidebar(400)
    first.actions.openDetails()
    first.actions.setDetails(500)
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()

    const second = createLayoutStore().create()
    expect(second.store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      companion: 420,
      activeWorkArea: undefined,
      workAreaConversationVisible: false,
      workAreaSidebarVisible: false,
      narrow: false,
      narrowExpanded: false,
    })
  })

  it('guards work-area lifecycle by id and restores sidebar visibility on close', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openWorkArea('example.editor', true, false)
    expect(store.getSnapshot()).toMatchObject({
      activeWorkArea: 'example.editor', workAreaConversationVisible: true, workAreaSidebarVisible: false,
    })
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    actions.setWorkAreaConversationVisible('stale.editor', false)
    expect(store.getSnapshot()).toMatchObject({ activeWorkArea: 'example.editor', workAreaConversationVisible: true })
    actions.setWorkAreaConversationVisible('example.editor', false)
    expect(store.getSnapshot()).toMatchObject({ workAreaConversationVisible: false, details: 0 })
    actions.setWorkAreaSidebarVisible('stale.editor', true)
    expect(store.getSnapshot().workAreaSidebarVisible).toBe(false)
    actions.setWorkAreaSidebarVisible('example.editor', true)
    expect(store.getSnapshot().workAreaSidebarVisible).toBe(true)
    actions.closeWorkArea('stale.editor')
    expect(store.getSnapshot().activeWorkArea).toBe('example.editor')
    actions.closeWorkArea('example.editor')
    expect(store.getSnapshot()).toMatchObject({
      activeWorkArea: undefined, workAreaConversationVisible: false, workAreaSidebarVisible: false,
    })
  })
})
