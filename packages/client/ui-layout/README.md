---
description: "Shell layout for the Web GUI: the three-column AppFrame with drag handles, concession behavior, the panel-geometry service, and theme presentation; for users and maintainers of the window chrome."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

This package provides the shell layout of the Web GUI: a three-column AppFrame with resizable sidebar and details panels, a concession chain that shrinks the details column and then auto-closes it when space runs out, and the `ctx.layout` panel-geometry service other plugins call to open or close the details column. It also seats the theme presenter, which projects the resolved color scheme, alias tokens, content font size, and `theme-color` metadata onto the document. Choose it for the standard window chrome; panel geometry is transient and resets on reload.

Without an active work area, AppFrame keeps its ordinary sidebar / conversation / details composition; the frame's one `register()` call also declares root-list `shell.workArea`, `shell.workArea.companionHeader`, and `shell.workArea.footer` beside the built-in children. `ctx.layout.openWorkArea(id)` selects exactly one registered id and renders that contribution beside the single native conversation; `conversationVisible: false` starts the companion hidden, while `sidebarVisible: false` creates an immersive work area without changing the user's sidebar preference. `setWorkAreaConversationVisible()` hides or restores the companion, and hiding unmounts both the conversation and details trees rather than leaving an inactive duplicate alive. `setWorkAreaSidebarVisible()` hides the mounted sidebar at zero width with no interactive or accessibility path; closing the work area restores the ordinary sidebar state. `setWorkAreaCompanionWidth()` resizes the companion as the programmatic equivalent of the drag handle; it has no fixed ceiling — an oversized request settles at whatever the viewport can spare beside the work-area reserve. `setWorkAreaReserve()` declares the active work area's actual minimum width — the floor the concession solve keeps for it, defaulting to the contract 400px and resetting on open and close — so a work area collapsed to a thin strip can hand its width to the companion. Moving between an ordinary conversation and a visible companion changes grid placement without remounting the conversation tree. `shell.workArea.companionHeader` is optional plugin chrome at the top of the visible companion; its entry uses the active work area's id, so controls for other work areas do not render. `shell.workArea.footer` is the matching optional chrome as a bottom strip spanning the work-area column and its companion; it renders for the active work area's id while the companion is hidden too, and absent entries leave the frame upstream-identical. `closeWorkArea(id)` is id-guarded, and unloading the selected slot contribution clears it as well.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin at the root slot; it then renders the app frame around whatever occupies the sidebar, conversation, and details columns. Users resize the sidebar by dragging its invisible hit strip and the details panel by dragging its floating pill; when the window narrows, only details shrinks, then auto-closes. A closed sidebar retains a 56px control rail; details closes to zero width.

### Theme presentation

The presenter consumes resolved theme snapshots and projects them onto the document: `html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens and `--dsh-content-font-size` as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background. Disposing the presenter removes its metadata node with its other global writes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `register()` call contributes `AppFrame` into the runtime's built-in `'root'` slot and, in the same breath, declares its child slots (`sidebar`, `conversation`, `details`, `shell.workArea`, `shell.workArea.companionHeader`, `shell.workArea.footer`, `shell.overlay`), seats the layout store (panel geometry), and wires the `ctx.layout` panel-action service. The transient layout store starts the sidebar at its default width and details closed, and never reads or writes `localStorage`. AppFrame always mounts the conversation and details columns; a connected Session renders through `SessionProvider`. It projects the selected Session title over the build-configured product title or the localized `common.brand.localBuild` fallback, so locale revisions update document metadata with the root entry. The theme presenter is a second effect: pure DOM writes from resolved snapshots — initial state through the getter once, then event-driven only, with no React path. It applies palette, font-size, and token variables before measuring the rendered background as the single color authority.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the layout surface is not enough. They move from the frame to the columns it renders and the theme it presents.

- [ui-sidebar](../ui-sidebar/README.md) — occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) — occupies the `conversation` and `details` columns.
- [ui-theme](../ui-theme/README.md) — the theme seam whose resolved snapshots the presenter consumes.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current layout behavior. They are current package constraints, not a general window-manager comparison or a task backlog.

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **Work-area selection is transient** — a work area must keep its registered id alive while selected; reload starts in the ordinary shell and a hidden companion remounts with fresh local UI state.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The shell viewing-state store behind ctx.layout emits no cordis events; clamp/prune/concession-chain sequencing is asserted directly by this package's columns and service specs.
