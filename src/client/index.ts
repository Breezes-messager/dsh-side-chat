/**
 * Side chat, browser half.
 *
 * Three contributions, all through public Harness extension points:
 *
 * - a right-Sidebar tab type (`side-chat`), with its body in the keyed
 *   `sidebar.right.pane.tab` seat and an entry on the guide page;
 * - a control in `conversation.session.header.actions` that opens it;
 * - an action in `conversation.chat.assistant-actions` that opens it with one
 *   specific message attached as context.
 *
 * The panel itself is {@link file://./panel.tsx}; this module only wires.
 */
import type { Context } from '@deepseek-ai/cordis'
import { HEADER_ACTION_ID, MESSAGE_ACTION_ID, SIDE_CHAT_KIND, SIDE_CHAT_NS, SIDE_CHAT_TAB_ID } from '../protocol.ts'
import { AskInSideChatAction, SideChatHeaderButton } from './actions.tsx'
import { en, zh } from './locales.ts'
import { SideChatBody } from './panel.tsx'

/** Cordis plugin name. */
export const name = 'dsh-side-chat'

/** The services every contribution below reads. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']

/**
 * Client plugin body: register the dictionaries, the tab type, its body, and the
 * two ways in.
 * @param ctx - client root context carrying the registries and the copy service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(SIDE_CHAT_NS, 'zh', zh), 'side-chat: zh dictionary')
  ctx.effect(() => ctx.locale.register(SIDE_CHAT_NS, 'en', en), 'side-chat: en dictionary')
  const t: (key: string) => string = ctx.locale.bind(SIDE_CHAT_NS)

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: SIDE_CHAT_TAB_ID,
    kind: SIDE_CHAT_KIND,
    title: () => t('tab.title'),
    guide: [{
      id: SIDE_CHAT_TAB_ID,
      order: 20,
      title: () => t('tab.title'),
      description: () => t('guide.description'),
    }],
  }), 'side-chat: tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: SIDE_CHAT_TAB_ID,
    locale: SIDE_CHAT_NS,
  }, SideChatBody)), 'side-chat: tab body')

  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: HEADER_ACTION_ID,
    order: 20,
    locale: SIDE_CHAT_NS,
    inject: () => ({ open: () => { ctx.sidebarRight.openTab(SIDE_CHAT_KIND) } }),
  }, SideChatHeaderButton)), 'side-chat: header control')

  ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: MESSAGE_ACTION_ID,
    order: 20,
    locale: SIDE_CHAT_NS,
    inject: () => ({
      askAbout: (messageId: string) => {
        ctx.sidebarRight.openTab(SIDE_CHAT_KIND, { params: { messageId } })
      },
    }),
  }, AskInSideChatAction)), 'side-chat: message action')
}
