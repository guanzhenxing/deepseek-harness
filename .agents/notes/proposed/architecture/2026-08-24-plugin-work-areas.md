# Agent Note: Plugin Work Areas

Status: proposed

English | [中文](2026-08-24-plugin-work-areas.zh.md)

## Problem

DeepSeek Harness lets a client plugin add chrome to existing views, replace a declared single slot, or float additive content in `shell.overlay`. It does not let a plugin open a full primary work area while retaining the shipped conversation beside it. `shell.overlay` cannot ask `AppFrame` to allocate columns, and re-registering `conversation` replaces the shipped occupant and all child slots it declares. A general outlet that renders `conversation` again would conflict with the [one-declarer authorization model](../../implemented/architecture/2026-07-22-slot-type-chain-implementation.md) and duplicate stateful input, approval, question, attachment, focus, and details behavior.

This gap is not specific to a knowledge-management product. Editors, notebooks, terminal dashboards, artifact previews, data-analysis tools, and other plugins may all need their own primary content beside the native conversation. Without a shell-owned composition, each consumer must either cover the application with an overlay, implement a reduced chat client against services, or copy private conversation UI.

## Proposal

Ship one change: a shell-owned plugin work area with the existing native conversation as its single companion. The change contains no product branding, knowledge-management behavior, downstream storage markers, or product-specific default.

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

`ctx.layout` gains the imperative activation face used by launch buttons, commands, and keyboard shortcuts:

```ts
interface ILayout {
  openWorkArea(id: string, options?: { conversationVisible?: boolean; sidebarVisible?: boolean }): void
  closeWorkArea(id: string): void
  setWorkAreaConversationVisible(id: string, visible: boolean): void
  setWorkAreaSidebarVisible(id: string, visible: boolean): void
}
```

The contract has exact behavior:

- `id` is the work area's list-entry id. `openWorkArea` throws when no active `shell.workArea` winner has that id.
- Opening an id replaces the previously active work area. Reopening the active id updates the requested companion and sidebar visibility.
- `conversationVisible` and `sidebarVisible` default to `true`. Both are layout state, not plugin-owned CSS conventions.
- `closeWorkArea`, `setWorkAreaConversationVisible`, and `setWorkAreaSidebarVisible` are id-guarded no-ops when another work area has since become active. This makes stale callbacks and unload cleanup unable to close or change a replacement.
- If the active id is absent at the next registration reconciliation, the layout closes that work area. A same-id HMR replacement that is already a current winner may preserve activation; an id that remains absent cannot stay active.
- Active id, companion visibility, sidebar visibility, and dragged companion width are transient. Reload starts in the ordinary conversation layout.

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

`AppFrame` adds `shell.workArea` to its child declaration and `PropsRenderSlots` authorization. When `activeId` is defined, it calls `renderSlot('shell.workArea', owner, { only: activeId })`; it does not call the list renderer without `only`, which would render every registered work area. The work-area subtree may mount and unmount with activation. The existing `renderSlot('conversation', {})` remains the only conversation render call and stays at one React tree position while CSS grid moves it between the ordinary and companion columns.

With no active work area, the current sidebar / conversation / details layout is unchanged. With an active work area and a visible companion, the logical order is sidebar / work area / conversation / details. Details concedes and auto-closes first, preserving the existing policy. The conversation companion then stays within `ui-layout`-owned minimum, default, and maximum widths; the work area receives the remaining center width. On a narrower frame, the existing sidebar auto-collapse still applies, details remains closed, and the work area may compress before the conversation companion. `sidebarVisible: false` instead uses a zero-width, inert, and `aria-hidden` sidebar column without changing the user's stored sidebar preference. The shell provides native dividers and resize handles; work-area entries receive visibility callbacks but cannot choose breakpoints or raw column widths. An optional `shell.workArea.companionHeader` entry uses its work area's id and renders only while that id is active with a visible companion. The frame ships no header controls.

When the companion is hidden, `AppFrame` does not render the `conversation` or `details` occupants in a zero-width interactive tree. Showing it renders the same registered occupants again, never a second copy. Session-scoped stores remain owned and cached by the slot runtime while their registrations live, so authoritative conversation state and drafts survive; component-local scroll, focus, selection, or open-popover state may reset and is not promised across an explicit hide. Closing a work area with a visible companion changes only grid placement, so the conversation tree remains mounted.

The details column remains paired with the one conversation mount. Hiding the companion closes details. `openDetails()` while the companion is hidden opens the companion and details atomically; it never records an invisible interactive panel. Details must never open behind a work area or in a covered `shell.overlay` layer.

`LayoutController` observes `shell.workArea` registration changes through the existing slot registry. It validates activation against the current winners, clears an id that remains absent at reconciliation, and detaches its store actions and subscription on disposal. HMR replacement may preserve a same-id winner but cannot leave a stale active id, callback, listener, or column.

### Package and file ownership

The intended implementation footprint is deliberately narrow:

| Change | Owning files or packages | Required work |
|---|---|---|
| Work-area slot and public types | `packages/client/ui-layout/src/client/index.ts` | Add `shell.workArea`, `WorkAreaOwnerProps`, the child declaration, and render authorization. |
| Optional companion header | `packages/client/ui-layout/src/client/index.ts`, `AppFrame.tsx` | Add `shell.workArea.companionHeader`; filter entries by the active work-area id and provide no built-in control. |
| Activation and cleanup | `packages/client/ui-layout/src/client/service.ts`, `stores.ts` | Add id-guarded actions, registration reconciliation, companion visibility, and transient width state. |
| Layout rendering | `packages/client/ui-layout/src/client/AppFrame.tsx`, `AppFrame.module.css`, `columns.ts` | Render the selected work area, keep one conversation mount, add split geometry, controls, and concession. |
| Layout verification | `packages/client/ui-layout/tests/*` | Cover registration, service semantics, store actions, geometry, render counts, unload, and HMR-shaped replacement. |
| Shell contract documentation | `packages/client/ui-layout/README.md` and counterpart, runtime slot comments, generated slot catalog | Document the new seat without changing the slot engine. |

The change requires no behavior change in `ui-slots`, `ui-renderer`, or `ui-conversation`. Those packages may receive comment, type-graph, or generated-document updates only when repository tooling requires them. A proposed implementation that adds a second conversation renderer, exports private conversation components, or weakens child-slot authorization is out of scope.

### Downstream adapter

A downstream knowledge-management plugin registers its entire workbench in `shell.workArea`, replaces its `shell.overlay` registration, and uses `ctx.layout.openWorkArea('innovation.pkm')`. Its Agent toggle delegates to `setWorkAreaConversationVisible`; its existing note actions remain plugin-owned. The plugin deletes its reduced message renderer, model menu, command menu, approval warning, and custom composer only after the native companion passes integration tests. Brand marks, the “PKM Workbench” label, note injection, and keyboard policy remain downstream.

Because the companion is the ordinary `conversation` occupant, a later DSH upgrade to message cards, tool trees, approvals, questions, attachments, models, commands, or the composer is consumed automatically when the fork rebases onto that release. This is source reuse, not source copying. It does not promise a conflict-free rebase: changes to `AppFrame`, the `conversation` slot contract, or column policy may require adaptation, and the assembled tests are the compatibility gate.

### Delivery sequence

The fork carries small, reviewable commits in this order:

1. Add the `shell.workArea` contract and id-guarded layout state.
2. Render the selected work area beside the single native conversation and add geometry controls.
3. Add assembled lifecycle, conversation-identity, details, and HMR replacement tests; update paired documentation.
4. Integrate one external example plugin without product branding.

The series must stay buildable and releasable on its own.

## Alternatives considered

**Expose a public `ConversationSurface` or arbitrary `SlotOutlet`.** Rejected for the first version. It introduces a second render authority for a slot whose declaration currently grants exclusive child ownership, and it makes two live composers, approval controls, question controls, attachment hubs, document listeners, scroll stores, and details targets an immediate correctness problem. A future portable-surface primitive requires its own cross-domain demand and lifecycle model; this proposal does not weaken the current slot invariant to solve one layout use case.

**Export or copy `ConversationRoot`, message cards, tools, and composer components.** Rejected. Their props are assembled from private plugin stores and injected faces, direct value imports violate client package purity, and copying converts every upstream UI change into a manual merge. MIT permits copying but does not make it an appropriate maintenance boundary.

**Keep a reduced chat UI over public Session services.** Valid as a temporary downstream fallback, but rejected as the target. It cannot inherit native approval, question, attachment, command, model, tool-details, accessibility, and interaction changes without reimplementation.

**Use `shell.overlay` for the workbench and visually place a custom chat panel above the native page.** Rejected as the generic contract. An overlay owns neither spatial allocation nor the native details target and can leave covered interactive UI mounted underneath. It remains correct for toasts, badges, modals, and genuinely floating surfaces.

**Replace the entire `root` or `conversation` slot from the downstream plugin.** Rejected. Replacement removes the shipped AppFrame or conversation child slots and transfers permanent ownership of core UI to the consumer.

**Add product branding, flat-by-default behavior, or knowledge-management commands to the fork.** Rejected. Those are distribution choices, reduce upstream acceptability, and create conflicts for other DSH consumers.

**Ship a native Session-browser disclosure inside the fork.** Rejected on 2026-08-24. The fork ships only capabilities official DSH lacks and leaves shipped UI untouched, so with no plugin work area active the client renders pixel-identical to upstream. A fork-owned collapse control inside `ui-workspace` broke that boundary for a product concern official DSH does not have; the fork returned the package to upstream. A downstream distribution that still wants a collapsed Session region keeps its own adapter outside the DSH patch, and an equivalent official control is adopted from upstream rather than maintained in parallel.

**Open a second browser window.** Rejected as the primary design. It is not an embedded work area, complicates focus and lifecycle, and does not solve in-page editors or dashboards. A second window can remain a downstream option.

## Acceptance criteria

- A third-party client plugin can register a root-scoped `shell.workArea` list entry and open it through `ctx.layout` without importing DSH implementation files.
- Unknown work-area ids fail loudly; replacement, stale close calls, registration removal, plugin disposal, and HMR-shaped re-registration leave deterministic layout state.
- At most one work-area id is rendered, and the shipped `conversation` slot is rendered at most once in every state.
- With no active work area, current AppFrame geometry, sidebar behavior, conversation behavior, details behavior, and `shell.overlay` ordering remain unchanged.
- With an active work area, native conversation messages, streaming, tools, approvals, questions, attachments, models, commands, composer, cancellation, and errors remain the shipped implementations for the current Session.
- Hiding and showing the companion cannot submit, answer, cancel, focus, or handle a shortcut from a hidden zero-width tree; Session state and draft recover through the existing scoped stores.
- Details is visible in the allocated layout when opened and is never rendered behind the work area; details and companion concession recover after resize.
- Column resizing, sidebar auto-collapse, narrow frames, reduced motion, light/dark themes, no-Session hero state, and `shell.overlay` remain usable.
- Paired docs, package tests, assembled client boot, typecheck, lint, and packed-artifact verification pass with no downstream brand or absolute local path in the DSH patch.

## Risks

- `AppFrame` becomes a more capable public composition boundary. Width constants and concession order must stay layout-owned, or plugins will create mutually incompatible geometry.
- Explicitly hiding the companion may reset component-local view state. The contract promises Session and scoped-store continuity, not preservation of ephemeral DOM state.
- The existing details API was designed for an always-present conversation column. Its hidden-companion behavior must be selected before implementation and protected by tests.
- A work-area entry can crash or disappear during HMR. Existing slot error boundaries and the active-id reconciliation must return the user to a usable conversation layout.
- An upstream redesign of root navigation may supersede `shell.workArea`. The fork should delete its patch when an equivalent official route exists rather than preserve parallel concepts.
