import type { ChatSettings } from '@/lib/settings';

/** 언어별 환영 / 오프라인 안내 (관리자 한국어 설정은 ko 사이트에서만 덮어씀) */
const WELCOME: Record<string, string> = {
  ko: '안녕하세요, 카피드럼입니다! :)\n무엇이든 편하게 물어보세요.',
  en: "Hi, this is CopyDrum! :)\nFeel free to ask us anything.",
  ja: 'こんにちは、CopyDrumです！:)\nなんでもお気軽にお問い合わせください。',
  'zh-CN': '您好，这里是 CopyDrum！:)\n有任何问题都可以随时问我们。',
  'zh-TW': '您好，這裡是 CopyDrum！:)\n有任何問題都歡迎隨時詢問。',
  de: 'Hallo, hier ist CopyDrum! :)\nFragen Sie uns gerne alles.',
  fr: "Bonjour, ici CopyDrum ! :)\nN'hésitez pas à nous poser toutes vos questions.",
  es: '¡Hola, somos CopyDrum! :)\nPregúntanos lo que quieras.',
  vi: 'Xin chào, đây là CopyDrum! :)\nBạn cứ thoải mái hỏi bất cứ điều gì nhé.',
  th: 'สวัสดีค่ะ CopyDrum ยินดีให้บริการ! :)\nสอบถามได้ทุกเรื่องเลยนะคะ',
  hi: 'नमस्ते, यह CopyDrum है! :)\nबेझिझक कुछ भी पूछें।',
  id: 'Halo, ini CopyDrum! :)\nSilakan tanyakan apa saja.',
  pt: 'Olá, aqui é a CopyDrum! :)\nFique à vontade para perguntar o que quiser.',
  ru: 'Здравствуйте, это CopyDrum! :)\nСпрашивайте о чём угодно.',
  it: 'Ciao, siamo CopyDrum! :)\nChiedici pure qualsiasi cosa.',
  tr: 'Merhaba, burası CopyDrum! :)\nAklınıza takılan her şeyi sorabilirsiniz.',
  uk: 'Вітаємо, це CopyDrum! :)\nПитайте про що завгодно.',
};

const OFFLINE: Record<string, string> = {
  ko: '지금은 운영시간 외예요.\n메시지를 남겨주시면 확인 후 답변드릴게요. :)',
  en: "We're currently outside business hours.\nLeave us a message and we'll get back to you. :)",
  ja: '現在は営業時間外です。\nメッセージを残していただければ、確認後にお返事します。:)',
  'zh-CN': '目前是非营业时间。\n请留言，我们确认后会回复您。:)',
  'zh-TW': '目前是非營業時間。\n請留言，我們確認後會回覆您。:)',
  de: 'Wir sind gerade außerhalb unserer Geschäftszeiten.\nHinterlassen Sie uns eine Nachricht – wir melden uns bei Ihnen. :)',
  fr: "Nous sommes actuellement en dehors des heures d'ouverture.\nLaissez-nous un message, nous vous répondrons. :)",
  es: 'Ahora estamos fuera del horario de atención.\nDéjanos un mensaje y te responderemos. :)',
  vi: 'Hiện đang ngoài giờ làm việc.\nHãy để lại tin nhắn, chúng tôi sẽ kiểm tra và trả lời bạn. :)',
  th: 'ขณะนี้อยู่นอกเวลาทำการค่ะ\nฝากข้อความไว้ได้เลย เราจะตรวจสอบและตอบกลับค่ะ :)',
  hi: 'अभी हमारा कार्य समय नहीं है।\nअपना संदेश छोड़ें, हम देखकर जवाब देंगे। :)',
  id: 'Saat ini di luar jam operasional.\nTinggalkan pesan, kami akan memeriksa dan membalasnya. :)',
  pt: 'No momento estamos fora do horário de atendimento.\nDeixe uma mensagem e responderemos em breve. :)',
  ru: 'Сейчас нерабочее время.\nОставьте сообщение — мы проверим и ответим. :)',
  it: "Al momento siamo fuori dall'orario di assistenza.\nLasciaci un messaggio e ti risponderemo. :)",
  tr: 'Şu anda çalışma saatleri dışındayız.\nMesajınızı bırakın, kontrol edip yanıtlayacağız. :)',
  uk: 'Зараз неробочий час.\nЗалиште повідомлення — ми перевіримо й відповімо. :)',
};

const WEEKDAY_SHORT: Record<string, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  'zh-CN': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  'zh-TW': ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  hi: ['रवि', 'सोम', 'मंग', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
  id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
  pt: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  it: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
  tr: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  uk: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

function pickLocale<T>(map: Record<string, T>, locale: string): T {
  if (map[locale]) return map[locale];
  const base = locale.split('-')[0];
  if (map[base]) return map[base];
  return map.en;
}

/** 환영 메시지 (ko: 관리자 설정 우선) */
export function getChatWelcomeMessage(locale: string, settings?: ChatSettings | null): string {
  if (locale === 'ko' && settings?.welcomeMessage?.trim()) {
    return settings.welcomeMessage.trim();
  }
  return pickLocale(WELCOME, locale);
}

/** 오프라인 안내 (ko: 관리자 설정 우선) */
export function getChatOfflineMessage(locale: string, settings?: ChatSettings | null): string {
  if (locale === 'ko' && settings?.offlineMessage?.trim()) {
    return settings.offlineMessage.trim();
  }
  return pickLocale(OFFLINE, locale);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function parseHHmm(hhmm: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/** 해당 시각의 timeZone UTC 오프셋(분) */
function tzOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** timeZone 기준 벽시계 시각 → UTC 타임스탬프 */
function zonedTimeToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo, d, h, mi);
  const offset = tzOffsetMinutes(timeZone, new Date(guess));
  const utc = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(timeZone, new Date(utc));
  return offset2 === offset ? utc : guess - offset2 * 60000;
}

interface DaySlot {
  /** 0(일)~6(토) */
  weekday: number;
  hours: string;
}

/** 운영 요일·시간을 고객 브라우저 시간대로 변환 (이번 주 기준이라 서머타임도 반영) */
function toLocalSlots(settings: ChatSettings, sourceTz: string): DaySlot[] {
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: sourceTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => todayParts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const todayWeekday = weekdayMap[get('weekday')] ?? 0;
  const y = Number(get('year'));
  const mo = Number(get('month')) - 1;
  const d = Number(get('day'));

  const slots: DaySlot[] = [];
  settings.businessHours.forEach((day, idx) => {
    if (!day?.enabled) return;
    const from = parseHHmm(day.from);
    const to = parseHHmm(day.to);
    if (!from || !to) return;
    const ref = new Date(Date.UTC(y, mo, d + ((idx - todayWeekday + 7) % 7)));
    const [ry, rm, rd] = [ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()];
    const start = new Date(zonedTimeToUtc(sourceTz, ry, rm, rd, from[0], from[1]));
    const end = new Date(zonedTimeToUtc(sourceTz, ry, rm, rd, to[0], to[1]));
    slots.push({
      weekday: start.getDay(),
      hours: `${pad2(start.getHours())}:${pad2(start.getMinutes())}~${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
    });
  });
  return slots;
}

/**
 * 운영시간 요약. 고객 브라우저 시간대로 변환하고, 같은 시간대의 연속된 요일은 묶어서 표시한다.
 * 예) "월~금 10:00~17:00", 해외: "Sun–Thu 18:00~01:00 (PDT)"
 */
export function getBusinessHoursHint(locale: string, settings?: ChatSettings | null): string | null {
  if (!settings || !Array.isArray(settings.businessHours) || settings.businessHours.length !== 7) return null;
  const dayLabels = pickLocale(WEEKDAY_SHORT, locale);
  const sourceTz = settings.timezone || 'Asia/Seoul';

  let slots: DaySlot[];
  let tzLabel = '';
  try {
    const now = new Date();
    const isSameOffset = tzOffsetMinutes(sourceTz, now) === -now.getTimezoneOffset();
    if (isSameOffset) {
      slots = settings.businessHours.flatMap((day, idx) =>
        day?.enabled ? [{ weekday: idx, hours: `${day.from}~${day.to}` }] : [],
      );
    } else {
      slots = toLocalSlots(settings, sourceTz);
      tzLabel =
        new Intl.DateTimeFormat(locale, { timeZoneName: 'short' })
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value ?? '';
    }
  } catch {
    return null;
  }

  // 월요일부터 묶되, 운영 요일이 일요일부터 이어지면(예: 해외 시간대의 일~목) 그 요일부터 시작
  const byWeekday = new Map(slots.map((s) => [s.weekday, s.hours]));
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  const startPos = mondayFirst.findIndex(
    (day) => byWeekday.has(day) && !byWeekday.has(mondayFirst[(mondayFirst.indexOf(day) + 6) % 7]),
  );
  const order = startPos > 0
    ? [...mondayFirst.slice(startPos), ...mondayFirst.slice(0, startPos)]
    : mondayFirst;
  const groups: { start: number; end: number; hours: string }[] = [];
  for (const idx of order) {
    const hours = byWeekday.get(idx);
    if (!hours) continue;
    const last = groups[groups.length - 1];
    const prevPos = last ? order.indexOf(last.end) : -2;
    if (last && last.hours === hours && order.indexOf(idx) === prevPos + 1) {
      last.end = idx;
    } else {
      groups.push({ start: idx, end: idx, hours });
    }
  }
  if (!groups.length) return null;
  const summary = groups
    .map((g) =>
      g.start === g.end
        ? `${dayLabels[g.start]} ${g.hours}`
        : `${dayLabels[g.start]}~${dayLabels[g.end]} ${g.hours}`,
    )
    .join(', ');
  return tzLabel ? `${summary} (${tzLabel})` : summary;
}
