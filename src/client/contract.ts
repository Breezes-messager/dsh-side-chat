/**
 * The browser half's slice of the Harness client services.
 *
 * Declared structurally on purpose: this plugin compiles against the Harness it
 * is installed into rather than against a pinned copy of its internals, so a
 * service gaining methods upstream cannot break the build here. Every member
 * named below is public API of the package that owns it.
 */

/** One slot contribution, in the shape `ctx.slots.register` accepts. */
export interface SlotRegistrationOptions {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: unknown
  readonly store?: unknown
}

/** `ctx.slots` — the one composition API for UI contributions. */
export interface SlotsFace {
  register(options: SlotRegistrationOptions, component: unknown): () => void
  inject(key: string, callback: () => () => void): () => void
}

/** `ctx.locale` — one dictionary per namespace and locale. */
export interface LocaleFace {
  register(namespace: string, locale: string, dictionary: Record<string, string>): () => void
  bind(namespace: string): (key: string) => string
}

/** One entry capsule offered on the right Sidebar's guide page. */
export interface GuideEntry {
  readonly id: string
  readonly order: number
  readonly title: () => string
  readonly description?: () => string
}

/** A right-Sidebar tab type, as its registry declares one. */
export interface TabDefinition {
  readonly id: string
  readonly kind: string
  readonly title: (address: string) => string
  readonly guide?: readonly GuideEntry[]
}

/** `ctx.sidebarRightTabs` — the registry of tab types. */
export interface SidebarRightTabsFace {
  register(definition: TabDefinition): () => void
}

/** What opening a page accepts. */
export interface OpenTabOptions {
  readonly params?: unknown
  readonly paneId?: string
  readonly revealIfOpened?: boolean
}

/** `ctx.sidebarRight` — navigation of the right Sidebar column. */
export interface SidebarRightFace {
  openTab(kind: string, options?: OpenTabOptions): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotsFace
    locale: LocaleFace
    sidebarRightTabs: SidebarRightTabsFace
    sidebarRight: SidebarRightFace
  }
}

/** The tab actions a body may take on the tab it is drawn in. */
export interface TabActionsLike {
  /** Close this tab, the way the tab strip's own close control does. */
  readonly close?: () => void
}

/** The tab record a body reads through its props. */
export interface TabRecordLike {
  readonly navigation: {
    readonly params?: unknown
    readonly revision?: number
  }
  /** Only the foreground Session is visible; a hidden body must not steal focus. */
  readonly visible?: boolean
  readonly actions?: TabActionsLike
}

/** Props every session-scoped slot occupant receives, whatever else it declares. */
export interface SessionScopeProps {
  readonly sessionId?: string
}

/** Props a right-Sidebar tab body receives from the tab kit. */
export interface TabBodyProps extends SessionScopeProps {
  /**
   * Framework-injected hook; the kit hands the tab record through this rather
   * than as a plain prop. Absent only if a future kit stops providing it, which
   * is why {@link TabBodyProps.tab} stays as a fallback.
   */
  readonly useTabInfo?: () => { readonly tab?: TabRecordLike }
  readonly tab?: TabRecordLike
  readonly t?: (key: string) => string
}

/** Read `messageId` out of a tab record's untyped navigation params. */
export function messageIdOf(params: unknown): string | undefined {
  if (params === null || typeof params !== 'object') return undefined
  const value = (params as { messageId?: unknown }).messageId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read the selected conversation text out of a tab record's navigation params. */
export function selectionOf(params: unknown): string | undefined {
  if (params === null || typeof params !== 'object') return undefined
  const value = (params as { selection?: unknown }).selection
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
