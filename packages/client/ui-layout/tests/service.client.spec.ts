/**
 * LayoutController behavior: the cross-plugin panel-action face. Geometry
 * lives in the entry store (layout-store.spec.ts) — here we assert the
 * delegation contract: attachPanels wiring, the panel actions forwarding, the
 * unwired fail-loud, and re-attach overwriting a stale action set.
 */
import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'
import type { PanelActions } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    setSidebar: vi.fn(),
    setDetails: vi.fn(),
    setCompanion: vi.fn(),
    toggleSidebar: vi.fn(),
    setNarrow: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    openWorkArea: vi.fn(),
    closeWorkArea: vi.fn(),
    setWorkAreaConversationVisible: vi.fn(),
    setWorkAreaSidebarVisible: vi.fn(),
    setWorkAreaCompanionWidth: vi.fn(),
  }
}

function fakeSlots() {
  return {
    entriesOfSlot: vi.fn(() => [{ options: { id: 'example.editor' } }]),
    subscribe: vi.fn(() => () => {}),
  } as never
}

describe('LayoutController', () => {
  it('forwards the three panel actions to the attached set', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    service.toggleSidebar()
    service.openDetails()
    service.closeDetails()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.openDetails).toHaveBeenCalledTimes(1)
    expect(panels.closeDetails).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
    expect(panels.setDetails).not.toHaveBeenCalled()
  })

  it('fails loud before the root entry wired its actions', () => {
    const service = new LayoutController()
    expect(() => { service.toggleSidebar() }).toThrow(/panel actions not wired/)
    expect(() => { service.openDetails() }).toThrow(/panel actions not wired/)
    expect(() => { service.closeDetails() }).toThrow(/panel actions not wired/)
  })

  it('re-attach overwrites the stale action set (entry re-register)', () => {
    const service = new LayoutController()
    const stale = fakePanels()
    const fresh = fakePanels()
    service.attachPanels(stale)
    service.attachPanels(fresh)

    service.toggleSidebar()

    expect(stale.toggleSidebar).not.toHaveBeenCalled()
    expect(fresh.toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('validates work-area activation against live slot winners', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)
    service.attachWorkAreas(fakeSlots())

    service.openWorkArea('example.editor', { conversationVisible: false, sidebarVisible: false })
    service.setWorkAreaConversationVisible('example.editor', true)
    service.setWorkAreaSidebarVisible('example.editor', true)
    service.closeWorkArea('stale.editor')

    expect(panels.openWorkArea).toHaveBeenCalledWith('example.editor', false, false)
    expect(panels.setWorkAreaConversationVisible).toHaveBeenCalledWith('example.editor', true)
    expect(panels.setWorkAreaSidebarVisible).toHaveBeenCalledWith('example.editor', true)
    expect(panels.closeWorkArea).toHaveBeenCalledWith('stale.editor')
    expect(() => { service.openWorkArea('unknown') }).toThrow(/unknown work area/)
  })

  it('forwards the work-area companion resize with its owner id', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)
    service.attachWorkAreas(fakeSlots())
    service.openWorkArea('example.editor')

    service.setWorkAreaCompanionWidth('example.editor', 900)

    expect(panels.setWorkAreaCompanionWidth).toHaveBeenCalledTimes(1)
    expect(panels.setWorkAreaCompanionWidth).toHaveBeenCalledWith('example.editor', 900)
  })
})
