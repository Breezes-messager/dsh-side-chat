/**
 * Every string this plugin draws, in both shipped languages.
 *
 * The dictionary shape is deliberately plain: `zh` is the source of truth for
 * the key union and `en` must cover exactly the same keys, so a forgotten
 * translation is a compile error rather than a raw key in the panel.
 *
 * The copy is written for someone who has never heard of a model route, a
 * session, or a plugin: every failure says what happened and what to do next,
 * in that order.
 */
import type { SideChatFailureCode } from './failure.ts'

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
  'empty.example': '可以问：这段代码是什么意思？这个结论有什么前提？',
  'composer.placeholder': '在侧边聊天中提问…',
  'composer.send': '发送',
  'composer.stop': '停止',
  'action.ask': '在侧边聊天中提问',
  'header.open': '侧边聊天',
  'context.quoted': '已引用所选消息作为上下文',
  'context.recent': '已带上当前对话的最近内容作为上下文',
  'context.selection': '询问选中的内容',
  'context.clear': '移除上下文',
  'context.join': '：',
  'notice.temporary': '临时聊天 · 关闭应用后消失',
  'status.thinking': '正在回答…',
  'action.clear': '清空',
  'guide.description': '临时对话，关闭应用后消失',
  'notice.openFailed': '侧边聊天暂时打不开。请先打开一个对话，然后再点一次。',
  'notice.dismiss': '关闭提示',
  'a11y.transcript': '侧边聊天记录',
  'a11y.question': '提问内容',
  'a11y.send': '发送问题',
  'a11y.stop': '停止回答',
  'a11y.close': '关闭侧边聊天',
  'a11y.open': '打开侧边聊天',
  'error.network': '连接不上应用了。请确认 DeepSeek Harness 还在运行，然后重试。',
  'error.cancelled': '已停止。',
  'error.unauthorized': '这次提问被拒绝了。请刷新页面后重试。',
  'error.rate-limited': '同时进行的提问太多了。请等几秒再试。',
  'error.too-long': '内容太长了。请把问题或选中的文字缩短一些，再试一次。',
  'error.bad-request': '这次提问没有被接受。请重新输入后再试。',
  'error.not-found': '没有找到回答服务。请重启 DeepSeek Harness 后再试。',
  'error.not-configured': '还没有可用的模型。请先打开一个对话并发送一条消息，或在插件设置里指定模型，然后再问。',
  'error.service-missing': '应用里没有可用的模型服务。请重启 DeepSeek Harness 后再试。',
  'error.timeout': '这次回答等得太久了，已经中止。可以再问一次，或把问题拆小一点。',
  'error.server': '应用内部出错了。请稍后重试；如果一直如此，请重启 DeepSeek Harness。',
  'error.host-error': '这次回答失败了。可以换个说法再问一次。',
  'error.empty': '这次没有收到回答。可以换个说法再问一次。',
} satisfies Record<string, string>

/** This namespace's key union. */
export type SideChatKey = keyof typeof zh

/** English copy, complete against {@link zh}. */
export const en = {
  'tab.title': 'Side chat',
  'empty.title': 'Side chat',
  'empty.body': 'A side chat is temporary. It disappears when the app closes.',
  'empty.example': 'Try asking: what does this code do? What are the assumptions behind this conclusion?',
  'composer.placeholder': 'Ask in the side chat…',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'action.ask': 'Ask in side chat',
  'header.open': 'Side chat',
  'context.quoted': 'The selected message is attached as context',
  'context.recent': 'The recent conversation is attached as context',
  'context.selection': 'Asking about the selected text',
  'context.clear': 'Remove the context',
  'context.join': ': ',
  'notice.temporary': 'Temporary · gone when the app closes',
  'status.thinking': 'Answering…',
  'action.clear': 'Clear',
  'guide.description': 'A temporary chat that disappears when the app closes',
  'notice.openFailed': 'The side chat cannot open right now. Open a conversation first, then try again.',
  'notice.dismiss': 'Dismiss this message',
  'a11y.transcript': 'Side chat transcript',
  'a11y.question': 'Your question',
  'a11y.send': 'Send the question',
  'a11y.stop': 'Stop the answer',
  'a11y.close': 'Close the side chat',
  'a11y.open': 'Open the side chat',
  'error.network': 'Could not reach the app. Make sure DeepSeek Harness is still running, then try again.',
  'error.cancelled': 'Stopped.',
  'error.unauthorized': 'This request was refused. Reload the page and try again.',
  'error.rate-limited': 'Too many questions are running at once. Wait a few seconds and try again.',
  'error.too-long': 'That was too long. Shorten the question or the selected text, then try again.',
  'error.bad-request': 'The app did not accept this question. Please type it again and retry.',
  'error.not-found': 'The answering service was not found. Restart DeepSeek Harness and try again.',
  'error.not-configured': 'No model is available yet. Open a conversation and send one message, or set a model in the plugin settings, then ask again.',
  'error.service-missing': 'This app has no model service available. Restart DeepSeek Harness and try again.',
  'error.timeout': 'This answer took too long and was stopped. Ask again, or split the question into smaller ones.',
  'error.server': 'The app hit an internal error. Try again in a moment; restart DeepSeek Harness if it keeps happening.',
  'error.host-error': 'This answer failed. Try asking again in different words.',
  'error.empty': 'No answer came back this time. Try asking again in different words.',
} satisfies Record<SideChatKey, string>

/**
 * The copy shown for each way a turn can fail.
 *
 * Keyed by the failure code, so a new code without copy is a compile error here
 * rather than a raw identifier in the panel.
 */
export const FAILURE_COPY: Record<SideChatFailureCode, SideChatKey> = {
  network: 'error.network',
  cancelled: 'error.cancelled',
  unauthorized: 'error.unauthorized',
  'rate-limited': 'error.rate-limited',
  'too-long': 'error.too-long',
  'bad-request': 'error.bad-request',
  'not-found': 'error.not-found',
  'not-configured': 'error.not-configured',
  'service-missing': 'error.service-missing',
  timeout: 'error.timeout',
  server: 'error.server',
  'host-error': 'error.host-error',
  empty: 'error.empty',
}

/** Copy used before the locale service answers, and when it is unavailable. */
export function fallbackTranslate(key: string): string {
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase()
  const table = preferred.startsWith('zh') ? zh : en
  return (table as Record<string, string>)[key] ?? key
}
