# Agent Note: Plugin Work Areas

Status: implemented

English | [中文](2026-08-24-plugin-work-areas.zh.md)

## Problem

DeepSeek Harness lets a client plugin add chrome to existing views, replace a declared single slot, or float additive content in `shell.overlay`. It does not let a plugin open a full primary work area while retaining the shipped conversation beside it. `shell.overlay` cannot ask `AppFrame` to allocate columns, and re-registering `conversation` replaces the shipped occupant and all child slots it declares. A general outlet that renders `conversation` again would conflict with the [one-declarer authorization model](../../implemented/architecture/2026-07-22-slot-type-chain-implementation.md) and duplicate stateful input, approval, question, attachment, focus, and details behavior.

This gap is not specific to a knowledge-management product. Editors, notebooks, terminal dashboards, artifact previews, data-analysis tools, and other plugins may all need their own primary content beside the native conversation. Without a shell-owned composition, each consumer must either cover the application with an overlay, implement a reduced chat client against services, or copy private conversation UI.

## Decision

The fork ships a shell-owned plugin work area with the existing native conversation as its single companion: one root-scoped list slot, an id-guarded `ctx.layout` activation face, and `AppFrame`-owned column allocation. The change carries no product branding, knowledge-management behavior, downstream storage markers, or product-specific defaults; with no work area active, the client renders pixel-identical to upstream.

### Definitions and invariants

A **work area** is one root-scoped, plugin-owned primary content region selected by the shell. It is not a DSH Workspace, a Task Surface, a modal, or an overlay. A **conversation companion** is the shipped `conversation` slot occupant rendered by `AppFrame` beside the active work area.

The implementation preserves these invariants:

- `conversation` retains one declarer and is rendered at most once.
- `ui-conversation` remains the only owner of its message, composer, tool, approval, question, attachment, and details child slots.
- A work-area plugin imports public contracts only; it does not value-import DSH UI internals.
- `AppFrame` owns column allocation, responsive concession, drag handles, and companion visibility.
- One work-area id is active at a time; activation is transient viewing state, not Session or Workspace state.
- Closing or unloading a work area returns to the ordinary full conversation without changing the current Session.
- `shell.overlay` keeps its present floating, additive semantics and remains above all allocated columns.

### `shell.workArea` and layout control

`ui-layout` declares one new list slot beside its existing children. A list allows unrelated plugins to register independently, while `AppFrame` renders only the selected id:

```ts
interface SlotMap {
  'shell.workArea': {
    kind: 'list'
    scope: 'root'
    owner: WorkAreaOwnerProps
  }
}

interface WorkAreaOwnerProps {
  id: string
  conversation: {
    visible: boolean
    setVisible(visible: boolean): void
  }
  sidebar: {
    visible: boolean
    setVisible(visible: boolean): void
  }
}
```

`ctx.layout` carries the imperative activation face used by launch buttons, commands, and keyboard shortcuts:

```ts
interface ILayout {
  openWorkArea(id: string, options?: { conversationVisible?: boolean; sidebarVisible?: boolean }): void
  closeWorkArea(id: string): void
  setWorkAreaConversationVisible(id: string, visible: boolean): void
  setWorkAreaSidebarVisible(id: string, visible: boolean): void
  setWorkAreaCompanionWidth(id: string, px: number): void
  setWorkAreaReserve(id: string, px: number): void
}
```

The contract has exact behavior:

- `id` is the work area's list-entry id. `openWorkArea` throws when no active `shell.workArea` winner has that id.
- Opening an id replaces the previously active work area. Reopening the active id updates the requested companion and sidebar visibility.
- `conversationVisible` and `sidebarVisible` default to `true`. Both are layout state, not plugin-owned CSS conventions.
- `closeWorkArea`, `setWorkAreaConversationVisible`, and `setWorkAreaSidebarVisible` are id-guarded no-ops when another work area has since become active. This makes stale callbacks and unload cleanup unable to close or change a replacement. The guards live in the store keyed on the active id; the controller forwards without tracking activity itself.
- If the active id is absent at the next registration reconciliation, the layout closes that work area. A same-id HMR replacement that is already a current winner may preserve activation; an id that remains absent cannot stay active.
- Active id, companion visibility, sidebar visibility, dragged companion width, and the declared reserve are transient. Reload starts in the ordinary conversation layout.
- `setWorkAreaCompanionWidth` is the programmatic equivalent of the drag handle. It has no fixed ceiling: the stored preference is unbounded and the frame's solver concedes it against the live viewport, so an oversized request settles at whatever the viewport can spare beside the work-area reserve.
- `setWorkAreaReserve` declares the active work area's actual minimum width — the floor the concession solve keeps for the work-area column. It defaults to the contract `WORK_AREA_MIN` of 400px, resets on open and close (and on a direct switch between areas), clamps to a non-negative integer, and bounds both the solve and the drag ceiling. A work area that collapses itself to a residual strip declares the smaller floor it really needs, handing the freed width to the companion.

A third-party registration uses only existing public mechanisms:

```ts
declare const ctx: {
  slots: {
    inject(name: string, effect: () => () => void): () => void
    register(options: { name: string; id: string }, component: unknown): () => void
  }
  layout: { openWorkArea(id: string): void }
}
declare const ExampleEditor: unknown

ctx.slots.inject('shell.workArea', () => ctx.slots.register(
  { name: 'shell.workArea', id: 'example.editor' },
  ExampleEditor,
))

ctx.layout.openWorkArea('example.editor')
```

### Rendering, geometry, and lifecycle

`AppFrame` declares `shell.workArea` among its children and in its `PropsRenderSlots` authorization. When `activeId` is defined, it calls `renderSlot('shell.workArea', owner, { only: activeId })`; it does not call the list renderer without `only`, which would render every registered work area. The work-area subtree may mount and unmount with activation. The existing `renderSlot('conversation', {})` remains the only conversation render call and stays at one React tree position while CSS grid moves it between the ordinary and companion columns.

With no active work area, the sidebar / conversation / details layout is unchanged. With an active work area and a visible companion, the logical order is sidebar / work area / conversation / details. Details concedes and auto-closes first, preserving the existing policy. The conversation companion keeps its contract floor and default; its ceiling is whatever the viewport can spare beside the work-area reserve at drag time — no fixed maximum. The work area receives the remaining center width, conceded last and kept at its declared reserve after details and the companion are exhausted. On a narrower frame, the existing sidebar auto-collapse still applies, details remains closed, and the work area may compress before the conversation companion. `sidebarVisible: false` instead uses a zero-width, inert, and `aria-hidden` sidebar column without changing the user's stored sidebar preference. The shell provides native dividers and resize handles; work-area entries receive visibility callbacks but cannot choose breakpoints or raw column widths.

An optional `shell.workArea.companionHeader` entry uses its work area's id and renders only while that id is active with a visible companion; the frame ships no header controls. An optional `shell.workArea.footer` entry renders in a second grid row spanning the work-area column and its companion for the active id — with the companion hidden included, since the strip belongs to the work area, not the conversation. Absent footer entries render nothing and the row collapses to zero height, leaving the frame upstream-identical; the frame adds no border, background, or built-in content to either seat.

When the companion is hidden, `AppFrame` does not render the `conversation` or `details` occupants in a zero-width interactive tree. Showing it renders the same registered occupants again, never a second copy. Session-scoped stores remain owned and cached by the slot runtime while their registrations live, so authoritative conversation state and drafts survive; component-local scroll, focus, selection, or open-popover state may reset and is not promised across an explicit hide. Closing a work area with a visible companion changes only grid placement, so the conversation tree remains mounted.

The details column remains paired with the one conversation mount. Hiding the companion closes details. `openDetails()` while the companion is hidden opens the companion and details atomically; it never records an invisible interactive panel. Details never opens behind a work area or in a covered `shell.overlay` layer.

`LayoutController` observes `shell.workArea` registration changes through the existing slot registry. It validates activation against the current winners, clears an id that remains absent at reconciliation, and detaches its store actions and subscription on disposal. HMR replacement may preserve a same-id winner but cannot leave a stale active id, callback, listener, or column.

### Package and file ownership

The shipped footprint is deliberately narrow:

| Change | Owning files or packages | Work |
|---|---|---|
| Work-area slot and public types | `packages/client/ui-layout/src/client/index.ts` | `shell.workArea`, `WorkAreaOwnerProps`, the child declaration, and render authorization. |
| Optional companion header | `packages/client/ui-layout/src/client/index.ts`, `AppFrame.tsx` | `shell.workArea.companionHeader`; entries filtered by the active work-area id, no built-in control. |
| Optional work-area footer | `packages/client/ui-layout/src/client/index.ts`, `AppFrame.tsx`, `AppFrame.module.css` | `shell.workArea.footer`; second grid row spanning the work-area and companion columns for the active id, no built-in content. |
| Activation and cleanup | `packages/client/ui-layout/src/client/service.ts`, `stores.ts` | Id-guarded actions, registration reconciliation, companion visibility, transient width and reserve state. |
| Layout rendering | `packages/client/ui-layout/src/client/AppFrame.tsx`, `AppFrame.module.css`, `columns.ts` | The selected work area beside one conversation mount, split geometry, controls, and the concession solve with its yieldable reserve. |
| Layout verification | `packages/client/ui-layout/tests/*` | Registration, service semantics, store actions, geometry, render counts, unload, and HMR-shaped replacement. |
| Shell contract documentation | `packages/client/ui-layout/README.md` and counterpart, runtime slot comments, generated slot catalog | The seats and methods, without changing the slot engine. |

The change requires no behavior change in `ui-slots`, `ui-renderer`, or `ui-conversation`. Those packages receive comment, type-graph, or generated-document updates only when repository tooling requires them. An implementation that adds a second conversation renderer, exports private conversation components, or weakens child-slot authorization is out of scope.

### Downstream adapter

A downstream knowledge-management plugin registers its entire workbench in `shell.workArea`, replaces its `shell.overlay` registration, and opens it through `ctx.layout.openWorkArea('innovation.pkm')`. Its Agent toggle delegates to `setWorkAreaConversationVisible`; its editor collapse hands width to the companion through `setWorkAreaReserve` and `setWorkAreaCompanionWidth`; its status bar registers into `shell.workArea.footer` so it spans the work-area column and the companion. Existing note actions remain plugin-owned; the reduced message renderer, model menu, command menu, approval warning, and custom composer are gone in favor of the native companion. Brand marks, the workbench label, note injection, and keyboard policy stay downstream.

Because the companion is the ordinary `conversation` occupant, a later DSH upgrade to message cards, tool trees, approvals, questions, attachments, models, commands, or the composer is consumed automatically when the fork rebases onto that release. This is source reuse, not source copying. It does not promise a conflict-free rebase: changes to `AppFrame`, the `conversation` slot contract, or column policy may require adaptation, and the assembled tests are the compatibility gate.

## Alternatives considered

**Expose a public `ConversationSurface` or arbitrary `SlotOutlet`.** Rejected for the first version. It introduces a second render authority for a slot whose declaration currently grants exclusive child ownership, and it makes two live composers, approval controls, question controls, attachment hubs, document listeners, scroll stores, and details targets an immediate correctness problem. A future portable-surface primitive requires its own cross-domain demand and lifecycle model; this design does not weaken the current slot invariant to solve one layout use case.

**Export or copy `ConversationRoot`, message cards, tools, and composer components.** Rejected. Their props are assembled from private plugin stores and injected faces, direct value imports violate client package purity, and copying converts every upstream UI change into a manual merge. MIT permits copying but does not make it an appropriate maintenance boundary.

**Keep a reduced chat UI over public Session services.** Valid as a temporary downstream fallback, but rejected as the target. It cannot inherit native approval, question, attachment, command, model, tool-details, accessibility, and interaction changes without reimplementation.

**Use `shell.overlay` for the workbench and visually place a custom chat panel above the native page.** Rejected as the generic contract. An overlay owns neither spatial allocation nor the native details target and can leave covered interactive UI mounted underneath. It remains correct for toasts, badges, modals, and genuinely floating surfaces.

**Replace the entire `root` or `conversation` slot from the downstream plugin.** Rejected. Replacement removes the shipped AppFrame or conversation child slots and transfers permanent ownership of core UI to the consumer.

**Add product branding, flat-by-default behavior, or knowledge-management commands to the fork.** Rejected. Those are distribution choices, reduce upstream acceptability, and create conflicts for other DSH consumers.

**Ship a native Session-browser disclosure inside the fork.** Rejected on 2026-08-24. The fork ships only capabilities official DSH lacks and leaves shipped UI untouched, so with no plugin work area active the client renders pixel-identical to upstream. A fork-owned collapse control inside `ui-workspace` broke that boundary for a product concern official DSH does not have; the fork returned the package to upstream. A downstream distribution that still wants a collapsed Session region keeps its own adapter outside the DSH patch, and an equivalent official control is adopted from upstream rather than maintained in parallel.

**Position downstream CSS over the fork-rendered companion column.** Rejected. The companion column is shell DOM a plugin cannot own; chrome positioned against it depends on fork-internal markup, stacking order, and column width, and it broke on every concession change (the downstream experiment was withdrawn with its ADR-0015). The footer and companion-header seats carry the same chrome through public slots instead.

**Shrink the fixed work-area floor instead of a declared reserve.** Rejected. The minimum a collapsed work area needs varies with its own residual content — rail, tree, collapse strips — so a smaller fixed constant either clips that residual or permanently reserves width nobody needs. `setWorkAreaReserve` moves the fact to the work area that owns it, reset when its area closes.

**Open a second browser window.** Rejected as the primary design. It is not an embedded work area, complicates focus and lifecycle, and does not solve in-page editors or dashboards. A second window can remain a downstream option.

## Testing

The package's client specs pin the contract. `columns.client.spec.ts` covers the concession solve — floor preservation, declared reserves below and above the default, and the drag ceiling's viewport tracking. `layout-store.client.spec.ts` covers the init shape, the action write set with id guards, and the reserve lifecycle: reset on open, close, and direct area switch, stale writes ignored. `service.client.spec.ts` covers controller forwarding for every method. `app-frame.client.spec.tsx` covers render placement — the footer seat renders for the active id with the companion hidden included — plus drag sequences and concession through the ResizeObserver path. `apply.client.spec.ts` covers the cordis registration, the child-slot ledger, and teardown.

## Consequences

Plugins can open a primary work area beside the shipped conversation and inherit every upstream conversation upgrade on rebase, and a work area can hand width it does not need to the companion by declaring its true minimum. The cost is a more capable public composition boundary: width constants, concession order, and the reserve contract stay layout-owned, or plugins create mutually incompatible geometry. The fork carries a diff against upstream `AppFrame` that an upstream redesign of root navigation may supersede; when an equivalent official route exists, the fork deletes this patch rather than preserve parallel concepts. Explicitly hiding the companion may reset component-local view state — the contract promises Session and scoped-store continuity, not preservation of ephemeral DOM state — and the hidden-companion details behavior (atomic reopen, close on hide) is test-pinned rather than implicit. Deterministic state under replacement, stale callbacks, registration removal, plugin disposal, and HMR-shaped re-registration is enforced by the id guards and the active-id reconciliation.
