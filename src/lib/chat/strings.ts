import type { ChatTypicalReply } from '@/lib/settings';

// 채팅 위젯 UI 다국어 문자열(자체 사전). 관리자 작성 환영/오프라인 문구는 설정값을 그대로 사용.
export interface ChatStrings {
  headerTitle: string;
  statusOnline: string;
  statusOffline: string;
  agentName: string;
  launcherLabel: string;
  teaser: string;
  inputPlaceholder: string;
  send: string;
  quickRepliesTitle: string;
  quickReplies: string[];
  typicalReply: Record<Exclude<ChatTypicalReply, 'none'>, string>;
  emailAsk: string;
  emailAskOptional: string;
  emailAskHint: string;
  emailPlaceholder: string;
  emailConfirm: string;
  emailSkip: string;
  emailInvalid: string;
  emailSaved: string;
  startFailed: string;
  attachImage: string;
  attachTooLarge: string;
  attachFailed: string;
  uploading: string;
  imageAlt: string;
  ariaOpen: string;
  close: string;
  sendFailed: string;
}

const ko: ChatStrings = {
  headerTitle: '카피드럼 고객센터',
  statusOnline: '지금 상담 가능해요',
  statusOffline: '운영시간 외',
  agentName: '카피드럼',
  launcherLabel: '문의하기',
  teaser: '결제·다운로드 문제, 여기서 바로 물어보세요!',
  inputPlaceholder: '메시지를 입력하세요',
  send: '전송',
  quickRepliesTitle: '이런 문의가 많아요',
  quickReplies: ['결제·다운로드 문의', '악보 제작 요청', '기타 문의'],
  typicalReply: {
    minutes: '보통 몇 분 안에 답변드려요',
    hour: '보통 1시간 안에 답변드려요',
    hours: '보통 몇 시간 안에 답변드려요',
    day: '보통 하루 안에 답변드려요',
  },
  emailAsk: '답변을 받으실 이메일 주소를 알려주세요.',
  emailAskOptional: '답변이 오면 이메일로 알려드릴까요?',
  emailAskHint: '로그인하시면 이 과정 없이 바로 상담할 수 있어요.',
  emailPlaceholder: 'example@email.com',
  emailConfirm: '확인',
  emailSkip: '나중에 할게요',
  emailInvalid: '올바른 이메일 주소를 입력해 주세요.',
  emailSaved: '이메일이 등록됐어요. 답변이 오면 알려드릴게요.',
  startFailed: '상담을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.',
  attachImage: '사진 첨부',
  attachTooLarge: '5MB 이하의 사진만 보낼 수 있어요.',
  attachFailed: '사진을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  uploading: '사진 보내는 중...',
  imageAlt: '첨부한 사진',
  ariaOpen: '고객 상담 채팅',
  close: '닫기',
  sendFailed: '메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
};

const en: ChatStrings = {
  headerTitle: 'CopyDrum Support',
  statusOnline: "We're online",
  statusOffline: 'Outside business hours',
  agentName: 'CopyDrum',
  launcherLabel: 'Help',
  teaser: 'Payment or download issue? Ask us right here!',
  inputPlaceholder: 'Type a message',
  send: 'Send',
  quickRepliesTitle: 'Common questions',
  quickReplies: ['Payment / download', 'Request a sheet', 'Something else'],
  typicalReply: {
    minutes: 'Typically replies in a few minutes',
    hour: 'Typically replies within an hour',
    hours: 'Typically replies in a few hours',
    day: 'Typically replies within a day',
  },
  emailAsk: 'Which email should we reply to?',
  emailAskOptional: 'Want an email when we reply?',
  emailAskHint: 'Sign in to skip this step next time.',
  emailPlaceholder: 'example@email.com',
  emailConfirm: 'OK',
  emailSkip: 'Maybe later',
  emailInvalid: 'Please enter a valid email address.',
  emailSaved: "Got it! We'll email you when we reply.",
  startFailed: "We couldn't start the chat. Please try again in a moment.",
  attachImage: 'Attach a photo',
  attachTooLarge: 'Photos must be 5MB or smaller.',
  attachFailed: "We couldn't send your photo. Please try again.",
  uploading: 'Sending photo...',
  imageAlt: 'Attached photo',
  ariaOpen: 'Customer support chat',
  close: 'Close',
  sendFailed: 'Failed to send your message. Please try again.',
};

const ja: ChatStrings = {
  headerTitle: 'CopyDrum サポート',
  statusOnline: 'ただいま対応中',
  statusOffline: '営業時間外',
  agentName: 'CopyDrum',
  launcherLabel: 'お問い合わせ',
  teaser: '決済・ダウンロードのお困りごとは、こちらでお気軽に！',
  inputPlaceholder: 'メッセージを入力',
  send: '送信',
  quickRepliesTitle: 'よくあるお問い合わせ',
  quickReplies: ['決済・ダウンロード', '楽譜制作のご依頼', 'その他'],
  typicalReply: {
    minutes: '通常数分以内に返信します',
    hour: '通常1時間以内に返信します',
    hours: '通常数時間以内に返信します',
    day: '通常1日以内に返信します',
  },
  emailAsk: '返信先のメールアドレスを教えてください。',
  emailAskOptional: '返信が届いたらメールでお知らせしましょうか？',
  emailAskHint: 'ログインすると、この手順なしですぐにご相談いただけます。',
  emailPlaceholder: 'example@email.com',
  emailConfirm: 'OK',
  emailSkip: 'あとで',
  emailInvalid: '正しいメールアドレスを入力してください。',
  emailSaved: 'メールアドレスを登録しました。返信が届いたらお知らせします。',
  startFailed: 'チャットを開始できませんでした。しばらくしてから再度お試しください。',
  attachImage: '写真を添付',
  attachTooLarge: '5MB以下の写真のみ送信できます。',
  attachFailed: '写真を送信できませんでした。しばらくしてから再度お試しください。',
  uploading: '写真を送信中...',
  imageAlt: '添付した写真',
  ariaOpen: 'カスタマーサポートチャット',
  close: '閉じる',
  sendFailed: 'メッセージの送信に失敗しました。しばらくしてから再度お試しください。',
};

const DICT: Record<string, ChatStrings> = { ko, en, ja };

const SEND_FAILED: Record<string, string> = {
  ko: '메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  en: 'Failed to send your message. Please try again.',
  ja: 'メッセージの送信に失敗しました。しばらくしてから再度お試しください。',
  'zh-CN': '消息发送失败，请稍后再试。',
  'zh-TW': '訊息傳送失敗，請稍後再試。',
  de: 'Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
  fr: "Échec de l'envoi du message. Veuillez réessayer.",
  es: 'No se pudo enviar el mensaje. Inténtalo de nuevo.',
  vi: 'Gửi tin nhắn thất bại. Vui lòng thử lại.',
  th: 'ส่งข้อความไม่สำเร็จ กรุณาลองอีกครั้ง',
  hi: 'संदेश भेजने में विफल। कृपया पुनः प्रयास करें।',
  id: 'Gagal mengirim pesan. Silakan coba lagi.',
  pt: 'Falha ao enviar a mensagem. Tente novamente.',
  ru: 'Не удалось отправить сообщение. Попробуйте снова.',
  it: 'Invio del messaggio non riuscito. Riprova.',
  tr: 'Mesaj gönderilemedi. Lütfen tekrar deneyin.',
  uk: 'Не вдалося надіслати повідомлення. Спробуйте ще раз.',
};

function pickLocale(map: Record<string, string>, locale: string): string {
  if (map[locale]) return map[locale];
  const base = locale.split('-')[0];
  if (map[base]) return map[base];
  return map.en;
}

export function getChatStrings(lang?: string): ChatStrings {
  const locale = lang ?? 'en';
  const base = DICT[locale] ?? DICT[locale.split('-')[0]] ?? en;
  return {
    ...base,
    sendFailed: pickLocale(SEND_FAILED, locale),
  };
}
