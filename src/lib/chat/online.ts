import type { ChatSettings } from '@/lib/settings';

/**
 * 주어진 시각(now)에 대해 chat 설정상 "지금 운영시간 내인지" 판정.
 * 타임존(chat.timezone) 기준으로 요일/시간을 계산한다.
 */
export function isWithinBusinessHours(chat: ChatSettings, now: Date = new Date()): boolean {
  const { timezone, businessHours } = chat;
  if (!Array.isArray(businessHours) || businessHours.length !== 7) return false;

  // 설정된 타임존 기준의 요일/시/분 추출
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayIndex = weekdayMap[weekdayStr];
  if (dayIndex === undefined) return false;

  const day = businessHours[dayIndex];
  if (!day || !day.enabled) return false;

  const nowMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
  const fromMinutes = toMinutes(day.from);
  const toMin = toMinutes(day.to);
  if (fromMinutes === null || toMin === null) return false;

  return nowMinutes >= fromMinutes && nowMinutes < toMin;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 최종 온라인 여부. enabled=false면 위젯 자체를 숨기는 용도로 별도 사용.
 * - manual: manualOnline 그대로
 * - auto: 운영시간으로 판정
 * - manual_and_hours: manualOnline=true AND 운영시간 내
 */
export function isChatOnline(chat: ChatSettings, now: Date = new Date()): boolean {
  if (!chat?.enabled) return false;
  switch (chat.mode) {
    case 'manual':
      return !!chat.manualOnline;
    case 'auto':
      return isWithinBusinessHours(chat, now);
    case 'manual_and_hours':
    default:
      return !!chat.manualOnline && isWithinBusinessHours(chat, now);
  }
}

