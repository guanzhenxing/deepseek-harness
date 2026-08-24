import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'
import type { PanelActions } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    setSidebar: vi.fn(),
    setDetails: vi.fn(),
    toggleSidebar: vi.fn(),
    setNarrow: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setCompanion: vi.fn(),
    openWorkArea: vi.fn(),
    closeWorkArea: vi.fn(),
    setWorkAreaConversationVisible: vi.fn(),
  }
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
    const slots = {
      entriesOfSlot: vi.fn(() => [{ options: { id: 'example.editor' } }]),
      subscribe: vi.fn(() => () => {}),
    } as never
    service.attachWorkAreas(slots)

    service.openWorkArea('example.editor', { conversationVisible: false })
    service.setWorkAreaConversationVisible('example.editor', true)
    service.closeWorkArea('stale.editor')

    expect(panels.openWorkArea).toHaveBeenCalledWith('example.editor', false)
    expect(panels.setWorkAreaConversationVisible).toHaveBeenCalledWith('example.editor', true)
    expect(panels.closeWorkArea).toHaveBeenCalledWith('stale.editor')
    expect(() => { service.openWorkArea('unknown') }).toThrow(/unknown work area/)
  })
})
