import type { ChatSettings } from '@/lib/settings';

/** 언어별 환영 / 오프라인 안내 (관리자 한국어 설정은 ko 사이트에서만 덮어씀) */
const WELCOME: Record<string, string> = {
  ko: `안녕하세요! 카피드럼 악보 플랫폼에 오신 것을 환영합니다 :)
결제나 악보 다운로드에 문제가 있으신가요? 빠르고 정확한 확인을 위해 '가입하신 이메일 주소'와 '결제하신 악보 제목'을 함께 남겨주시면 확인 후 신속하게 도와드리겠습니다!`,

  en: `Hello! Welcome to the CopyDrum sheet music platform :)
Having trouble with payment or downloading your sheet? For a quick and accurate check, please leave your registered email address and the title of the sheet you purchased — we'll help you right away!`,

  ja: `こんにちは！CopyDrum 楽譜プラットフォームへようこそ :)
お支払いや楽譜のダウンロードでお困りですか？迅速かつ正確に確認するため、ご登録のメールアドレスとご購入の楽譜タイトルを一緒にお知らせください。確認後、すぐに対応いたします！`,

  'zh-CN': `您好！欢迎来到 CopyDrum 乐谱平台 :)
支付或乐谱下载遇到问题了吗？为快速准确核实，请一并留下您注册的邮箱地址和所购乐谱标题，我们会在确认后尽快为您处理！`,

  'zh-TW': `您好！歡迎來到 CopyDrum 樂譜平台 :)
付款或樂譜下載遇到問題了嗎？為快速準確確認，請一併留下您註冊的電子郵件與所購樂譜標題，我們會在確認後盡快為您處理！`,

  de: `Hallo! Willkommen auf der CopyDrum-Notenplattform :)
Probleme mit der Zahlung oder dem Download Ihrer Noten? Bitte geben Sie zur schnellen und genauen Prüfung Ihre registrierte E-Mail-Adresse und den Titel der gekauften Noten an — wir helfen Ihnen umgehend!`,

  fr: `Bonjour ! Bienvenue sur la plateforme de partitions CopyDrum :)
Un problème de paiement ou de téléchargement ? Pour une vérification rapide et précise, merci d'indiquer votre adresse e-mail d'inscription et le titre de la partition achetée — nous vous aiderons rapidement !`,

  es: `¡Hola! Bienvenido a la plataforma de partituras CopyDrum :)
¿Problemas con el pago o la descarga de tu partitura? Para una verificación rápida y precisa, deja tu correo registrado y el título de la partitura comprada — ¡te ayudaremos enseguida!`,

  vi: `Xin chào! Chào mừng bạn đến với nền tảng sheet nhạc CopyDrum :)
Gặp sự cố thanh toán hoặc tải sheet? Để xác minh nhanh và chính xác, vui lòng để lại email đăng ký và tên sheet đã mua — chúng tôi sẽ hỗ trợ ngay!`,

  th: `สวัสดี! ยินดีต้อนรับสู่แพลตฟอร์มโน้ตดนตรี CopyDrum :)
มีปัญหาเรื่องการชำระเงินหรือดาวน์โหลดโน้ตหรือไม่? เพื่อตรวจสอบอย่างรวดเร็วและแม่นยำ กรุณาแจ้งอีเมลที่สมัครและชื่อโน้ตที่ซื้อ — เราจะช่วยเหลือทันที!`,

  hi: `नमस्ते! CopyDrum शीट संगीत प्लेटफ़ॉर्म में आपका स्वागत है :)
भुगतान या शीट डाउनलोड में समस्या है? त्वरित और सटीक जाँच के लिए कृपया अपना पंजीकृत ईमेल और खरीदी गई शीट का शीर्षक बताएं — हम जल्दी मदद करेंगे!`,

  id: `Halo! Selamat datang di platform partitur CopyDrum :)
Ada masalah pembayaran atau unduhan partitur? Untuk pemeriksaan cepat dan akurat, mohon cantumkan email terdaftar dan judul partitur yang dibeli — kami akan segera membantu!`,

  pt: `Olá! Bem-vindo à plataforma de partituras CopyDrum :)
Problemas com pagamento ou download da partitura? Para uma verificação rápida e precisa, informe seu e-mail cadastrado e o título da partitura comprada — ajudaremos em breve!`,

  ru: `Здравствуйте! Добро пожаловать на платформу нот CopyDrum :)
Проблемы с оплатой или загрузкой нот? Для быстрой и точной проверки укажите зарегистрированный e-mail и название купленных нот — мы оперативно поможем!`,

  it: `Ciao! Benvenuto sulla piattaforma di spartiti CopyDrum :)
Problemi con il pagamento o il download dello spartito? Per una verifica rapida e precisa, indica l'e-mail registrata e il titolo dello spartito acquistato — ti aiuteremo subito!`,

  tr: `Merhaba! CopyDrum nota platformuna hoş geldiniz :)
Ödeme veya nota indirme sorunu mu var? Hızlı ve doğru kontrol için kayıtlı e-posta adresinizi ve satın aldığınız notanın başlığını birlikte bırakın — hemen yardımcı olacağız!`,

  uk: `Вітаємо! Ласкаво просимо на платформу нот CopyDrum :)
Проблеми з оплатою чи завантаженням нот? Для швидкої та точної перевірки залиште зареєстровану e-mail адресу та назву придбаних нот — ми оперативно допоможемо!`,
};

const OFFLINE: Record<string, string> = {
  ko: `현재는 관리자 오프라인 시간입니다.
글로벌 시차로 인해 즉각적인 답변은 어렵지만, 문의 내용과 함께 '이메일 주소', '결제하신 악보 제목'을 남겨주시면 업무 시작 후 최우선으로 처리해 드리겠습니다. 고객님의 결제 내역은 안전하게 기록되고 있으니 안심하시고 조금만 기다려주세요! :)`,

  en: `Our support team is currently offline.
Due to global time zones, we may not reply instantly. Please leave your message along with your email address and the title of the sheet you purchased — we'll prioritize your request when we're back. Your payment is safely recorded, so please rest assured and wait a little while! :)`,

  ja: `現在、管理者はオフラインです。
時差のため即時の返信は難しい場合がありますが、お問い合わせ内容とともにメールアドレスとご購入の楽譜タイトルをお知らせください。業務開始後、優先的に対応いたします。お支払い情報は安全に記録されていますので、ご安心ください。少々お待ちください！ :)`,

  'zh-CN': `管理员目前不在线。
由于全球时差，我们可能无法立即回复。请留下咨询内容、您的邮箱地址和所购乐谱标题，我们将在开始工作后优先处理。您的付款记录已安全保存，请放心稍候！ :)`,

  'zh-TW': `管理員目前離線中。
因全球時差，我們可能無法立即回覆。請留下諮詢內容、您的電子郵件與所購樂譜標題，我們將在開始工作後優先處理。您的付款紀錄已安全保存，請放心稍候！ :)`,

  de: `Unser Support ist derzeit offline.
Aufgrund globaler Zeitzonen können wir nicht sofort antworten. Bitte hinterlassen Sie Ihre Nachricht mit E-Mail-Adresse und Titel der gekauften Noten — wir bearbeiten Ihre Anfrage nach Arbeitsbeginn vorrangig. Ihre Zahlung ist sicher erfasst, bitte haben Sie etwas Geduld! :)`,

  fr: `Notre équipe est actuellement hors ligne.
En raison des fuseaux horaires, une réponse immédiate peut être difficile. Laissez votre message avec votre e-mail et le titre de la partition achetée — nous traiterons votre demande en priorité à la reprise. Votre paiement est enregistré en toute sécurité, merci de patienter un peu ! :)`,

  es: `Nuestro equipo de soporte está fuera de línea.
Por la diferencia horaria global, puede que no respondamos al instante. Deja tu consulta con tu correo y el título de la partitura comprada — la atenderemos con prioridad al volver. Tu pago está registrado de forma segura, ¡ten un poco de paciencia! :)`,

  vi: `Đội ngũ hỗ trợ hiện đang offline.
Do múi giờ toàn cầu, chúng tôi có thể không trả lời ngay. Vui lòng để lại nội dung kèm email và tên sheet đã mua — chúng tôi sẽ ưu tiên xử lý khi bắt đầu làm việc. Thanh toán của bạn đã được ghi nhận an toàn, xin hãy kiên nhẫn chờ! :)`,

  th: `ทีมงานออฟไลน์อยู่ในขณะนี้
เนื่องจากความต่างของเขตเวลา เราอาจไม่ตอบทันที กรุณาแจ้งข้อความพร้อมอีเมลและชื่อโน้ตที่ซื้อ — เราจะดำเนินการเป็นลำดับแรกเมื่อเริ่มงาน การชำระเงินของคุณถูกบันทึกอย่างปลอดภัย กรุณารอสักครู่! :)`,

  hi: `हमारी सहायता टीम अभी ऑफ़लाइन है।
वैश्विक समय क्षेत्र के कारण तुरंत जवाब मुश्किल हो सकता है। कृपया अपना संदेश, ईमेल और खरीदी गई शीट का शीर्षक छोड़ें — कार्य शुरू होते ही प्राथमिकता से देखेंगे। आपका भुगतान सुरक्षित रूप से दर्ज है, कृपया थोड़ा प्रतीक्षा करें! :)`,

  id: `Tim dukungan kami sedang offline.
Karena perbedaan zona waktu global, kami mungkin tidak dapat membalas segera. Silakan tinggalkan pesan beserta email dan judul partitur yang dibeli — kami akan memprioritaskan saat jam kerja dimulai. Pembayaran Anda tercatat dengan aman, mohon bersabar sebentar! :)`,

  pt: `Nossa equipe de suporte está offline no momento.
Devido ao fuso horário global, talvez não respondamos imediatamente. Deixe sua mensagem com e-mail e título da partitura comprada — priorizaremos ao retomar o expediente. Seu pagamento está registrado com segurança, aguarde um pouco! :)`,

  ru: `Служба поддержки сейчас офлайн.
Из-за часовых поясов мы можем не ответить сразу. Оставьте сообщение с e-mail и названием купленных нот — обработаем в приоритете при начале работы. Ваш платёж надёжно зафиксирован, пожалуйста, подождите немного! :)`,

  it: `Il nostro supporto è attualmente offline.
Per i fusi orari globali potremmo non rispondere subito. Lascia il messaggio con e-mail e titolo dello spartito acquistato — lo gestiremo in priorità all'inizio dell'orario lavorativo. Il pagamento è registrato in sicurezza, attendi un momento! :)`,

  tr: `Destek ekibimiz şu anda çevrimdışı.
Küresel saat farkı nedeniyle anında yanıt veremeyebiliriz. Mesajınızla birlikte e-posta adresinizi ve satın aldığınız notanın başlığını bırakın — işe başladığımızda öncelikli işleme alacağız. Ödemeniz güvenle kayıtlıdır, lütfen biraz bekleyin! :)`,

  uk: `Наша підтримка зараз офлайн.
Через глобальні часові пояси ми можемо не відповісти одразу. Залиште повідомлення з e-mail та назвою придбаних нот — опрацюємо в пріоритеті на початку робочого дня. Ваш платіж надійно зафіксовано, зачекайте трохи! :)`,
};

/** 결제 자동확인 버튼 문구 */
const PAY_BOT_BUTTON: Record<string, string> = {
  ko: '결제 후 악보가 안 보인다면? (이 버튼을 클릭해주세요)',
  en: "Can't see your sheet after payment? (Please click this button)",
  ja: 'お支払い後に楽譜が表示されませんか？（このボタンをクリックしてください）',
  'zh-CN': '付款后看不到乐谱？（请点击此按钮）',
  'zh-TW': '付款後看不到樂譜？（請點擊此按鈕）',
  de: 'Partitur nach der Zahlung nicht sichtbar? (Bitte klicken Sie auf diese Schaltfläche)',
  fr: 'La partition n\'apparaît pas après le paiement ? (Cliquez sur ce bouton)',
  es: '¿No ves la partitura después del pago? (Haz clic en este botón)',
  vi: 'Không thấy sheet sau khi thanh toán? (Vui lòng nhấn nút này)',
  th: 'ไม่เห็นโน้ตหลังชำระเงิน? (กรุณาคลิกปุ่มนี้)',
  hi: 'भुगतान के बाद शीट नहीं दिख रही? (कृपया इस बटन पर क्लिक करें)',
  id: 'Partitur tidak muncul setelah pembayaran? (Silakan klik tombol ini)',
  pt: 'Não vê a partitura após o pagamento? (Clique neste botão)',
  ru: 'Не видите ноты после оплаты? (Нажмите эту кнопку)',
  it: 'Non vedi lo spartito dopo il pagamento? (Clicca questo pulsante)',
  tr: 'Ödemeden sonra nota görünmüyor mu? (Lütfen bu düğmeye tıklayın)',
  uk: 'Не бачите ноти після оплати? (Натисніть цю кнопку)',
};

function pickLocale(map: Record<string, string>, locale: string): string {
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

/** 결제 자동확인 버튼 문구 */
export function getPayBotButtonLabel(locale: string): string {
  return pickLocale(PAY_BOT_BUTTON, locale);
}
