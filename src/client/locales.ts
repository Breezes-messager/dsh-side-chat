/**
 * Every string this plugin draws, in both shipped languages.
 *
 * The dictionary shape is deliberately plain: `zh` is the source of truth for
 * the key union and `en` must cover exactly the same keys, so a forgotten
 * translation is a compile error rather than a raw key in the panel.
 */

/**
 * Chinese copy — the key source of truth.
 *
 * The namespace is declared to the locale service at registration; the key union
 * below is what keeps the two shipped dictionaries in step, and it is
 * deliberately local so this package compiles without the Harness Client
 * packages installed.
 */
export const zh = {
  'tab.title': '侧边聊天',
  'empty.title': '侧边聊天',
  'empty.body': '侧边聊天是临时聊天，关闭应用后会消失。',
  'composer.placeholder': '在侧边聊天中提问…',
  'composer.send': '发送',
  'composer.stop': '停止',
  'action.ask': '在侧边聊天中提问',
  'header.open': '侧边聊天',
  'context.quoted': '已引用所选消息作为上下文',
  'context.recent': '已带上当前对话的最近内容作为上下文',
  'notice.temporary': '临时聊天 · 关闭应用后消失',
  'status.thinking': '正在回答…',
  'action.clear': '清空',
  'error.prefix': '出错了：',
  'guide.description': '临时对话，关闭应用后消失',
} satisfies Record<string, string>

/** This namespace's key union. */
export type SideChatKey = keyof typeof zh

/** English copy, complete against {@link zh}. */
export const en = {
  'tab.title': 'Side chat',
  'empty.title': 'Side chat',
  'empty.body': 'A side chat is temporary. It disappears when the app closes.',
  'composer.placeholder': 'Ask in the side chat…',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'action.ask': 'Ask in side chat',
  'header.open': 'Side chat',
  'context.quoted': 'The selected message is attached as context',
  'context.recent': 'The recent conversation is attached as context',
  'notice.temporary': 'Temporary · gone when the app closes',
  'status.thinking': 'Answering…',
  'action.clear': 'Clear',
  'error.prefix': 'Failed: ',
  'guide.description': 'A temporary chat that disappears when the app closes',
} satisfies Record<SideChatKey, string>

/** Copy used before the locale service answers, and when it is unavailable. */
export function fallbackTranslate(key: string): string {
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase()
  const table = preferred.startsWith('zh') ? zh : en
  return (table as Record<string, string>)[key] ?? key
}
