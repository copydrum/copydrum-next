// 채팅 위젯 UI 다국어 문자열(자체 사전). 관리자 작성 환영/오프라인 문구는 설정값을 그대로 사용.
export interface ChatStrings {
  headerTitle: string;
  statusOnline: string;
  statusOffline: string;
  guestStartHint: string;
  name: string;
  email: string;
  emailForReply: string;
  startChat: string;
  inputPlaceholder: string;
  send: string;
  offlineSubmit: string;
  offlinePlaceholder: string;
  offlineSentTitle: string;
  offlineSentDesc: string;
  catPayment: string;
  catDownload: string;
  catRefund: string;
  catEtc: string;
  quickReplies: string[];
  ariaOpen: string;
  close: string;
  payBotRunning: string;
  payBotNeedEmail: string;
}

const ko: ChatStrings = {
  headerTitle: 'CopyDrum 상담',
  statusOnline: '상담 가능',
  statusOffline: '운영시간 외',
  guestStartHint: '상담을 시작하려면 정보를 입력해 주세요.',
  name: '이름',
  email: '이메일',
  emailForReply: '이메일 (답변 받을 주소)',
  startChat: '상담 시작',
  inputPlaceholder: '메시지를 입력하세요',
  send: '전송',
  offlineSubmit: '문의 남기기',
  offlinePlaceholder: '문의 내용을 남겨주세요.',
  offlineSentTitle: '문의가 접수되었습니다.',
  offlineSentDesc: '운영시간에 순차적으로 확인 후 입력하신 이메일로 답변드리겠습니다.',
  catPayment: '결제/주문 문의',
  catDownload: '다운로드 문의',
  catRefund: '주문제작 요청',
  catEtc: '기타',
  quickReplies: ['결제했는데 악보가 안 보여요', '다운로드가 안 돼요', '요청하고 싶은 악보가 있어요', '기타 다른 궁금한 점이 있어요'],
  ariaOpen: '고객 상담 채팅',
  close: '닫기',
  payBotRunning: '결제 확인 중...',
  payBotNeedEmail: '결제하신 이메일을 먼저 입력해 주세요.',
};

const en: ChatStrings = {
  headerTitle: 'CopyDrum Support',
  statusOnline: 'Online',
  statusOffline: 'Offline',
  guestStartHint: 'Please enter your details to start a chat.',
  name: 'Name',
  email: 'Email',
  emailForReply: 'Email (for our reply)',
  startChat: 'Start chat',
  inputPlaceholder: 'Type a message',
  send: 'Send',
  offlineSubmit: 'Leave a message',
  offlinePlaceholder: 'Leave your message.',
  offlineSentTitle: 'Your message has been received.',
  offlineSentDesc: 'We will review it during business hours and reply to your email.',
  catPayment: 'Payment / Order',
  catDownload: 'Download issue',
  catRefund: 'Custom order request',
  catEtc: 'Other',
  quickReplies: ["I paid but can't see my sheet", "I can't download", "I'd like to request a sheet", 'I have other questions'],
  ariaOpen: 'Customer support chat',
  close: 'Close',
  payBotRunning: 'Checking your payment…',
  payBotNeedEmail: 'Please enter the email you paid with first.',
};

const ja: ChatStrings = {
  headerTitle: 'CopyDrum サポート',
  statusOnline: '対応可能',
  statusOffline: '営業時間外',
  guestStartHint: 'チャットを開始するには情報を入力してください。',
  name: 'お名前',
  email: 'メール',
  emailForReply: 'メール（返信先）',
  startChat: 'チャット開始',
  inputPlaceholder: 'メッセージを入力',
  send: '送信',
  offlineSubmit: 'メッセージを残す',
  offlinePlaceholder: 'お問い合わせ内容をご記入ください。',
  offlineSentTitle: 'お問い合わせを受け付けました。',
  offlineSentDesc: '営業時間内に順次確認し、ご入力のメールへ返信いたします。',
  catPayment: '決済・注文',
  catDownload: 'ダウンロード',
  catRefund: 'オーダー制作依頼',
  catEtc: 'その他',
  quickReplies: ['支払ったのに楽譜が見えません', 'ダウンロードできません', 'リクエストしたい楽譜があります', 'その他のご質問があります'],
  ariaOpen: 'カスタマーサポートチャット',
  close: '閉じる',
  payBotRunning: '決済を確認中...',
  payBotNeedEmail: 'お支払いに使用したメールを先に入力してください。',
};

const DICT: Record<string, ChatStrings> = { ko, en, ja };

/** 문의 유형: 주문제작 요청 (17개 언어) */
const CAT_REFUND: Record<string, string> = {
  ko: '주문제작 요청',
  en: 'Custom order request',
  ja: 'オーダー制作依頼',
  'zh-CN': '定制订单请求',
  'zh-TW': '客製訂單請求',
  de: 'Individuelle Bestellung anfragen',
  fr: 'Demande de commande personnalisée',
  es: 'Solicitud de pedido personalizado',
  vi: 'Yêu cầu đặt hàng tùy chỉnh',
  th: 'ขอสั่งทำแบบกำหนดเอง',
  hi: 'कस्टम ऑर्डर अनुरोध',
  id: 'Permintaan pesanan kustom',
  pt: 'Solicitação de pedido personalizado',
  ru: 'Запрос на индивидуальный заказ',
  it: 'Richiesta ordine personalizzato',
  tr: 'Özel sipariş talebi',
  uk: 'Запит на індивідуальне замовлення',
};

/** 오프라인 문의 입력 placeholder (17개 언어) */
const OFFLINE_PLACEHOLDER: Record<string, string> = {
  ko: '문의 내용을 남겨주세요.',
  en: 'Leave your message.',
  ja: 'お問い合わせ内容をご記入ください。',
  'zh-CN': '请留下您的咨询内容。',
  'zh-TW': '請留下您的諮詢內容。',
  de: 'Bitte hinterlassen Sie Ihre Nachricht.',
  fr: 'Laissez votre message.',
  es: 'Deja tu consulta.',
  vi: 'Vui lòng để lại nội dung câu hỏi.',
  th: 'กรุณาแจ้งข้อความของคุณ',
  hi: 'कृपया अपना संदेश छोड़ें।',
  id: 'Silakan tinggalkan pesan Anda.',
  pt: 'Deixe sua mensagem.',
  ru: 'Оставьте ваше сообщение.',
  it: 'Lascia il tuo messaggio.',
  tr: 'Mesajınızı bırakın.',
  uk: 'Залиште ваше повідомлення.',
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
    catRefund: pickLocale(CAT_REFUND, locale),
    offlinePlaceholder: pickLocale(OFFLINE_PLACEHOLDER, locale),
  };
}
