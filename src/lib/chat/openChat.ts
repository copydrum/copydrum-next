export const OPEN_CHAT_EVENT = 'copydrum:open-chat';

/** 다른 화면의 버튼에서 사이트 공통 채팅 위젯을 연다. */
export function openChatWidget() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
