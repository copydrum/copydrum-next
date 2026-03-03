/**
 * 선주문(PREORDER) 주문 알림 이메일 전송
 * 
 * 선주문 악보가 결제 완료되면 관리자(copydrum@hanmail.net)에게
 * 이메일 알림을 보냅니다.
 * 
 * 환경변수 설정 필요:
 * - SMTP_HOST: SMTP 서버 호스트 (예: smtp.gmail.com)
 * - SMTP_PORT: SMTP 포트 (기본값: 587)
 * - SMTP_USER: SMTP 인증 사용자 (이메일 주소)
 * - SMTP_PASS: SMTP 인증 비밀번호 (앱 비밀번호 등)
 * - ADMIN_NOTIFICATION_EMAIL: 알림 받을 이메일 (기본값: copydrum@hanmail.net)
 */
import nodemailer from 'nodemailer';

interface PreorderNotificationParams {
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  totalAmount: number;
  paymentMethod: string;
  items: Array<{
    sheetId: string;
    sheetTitle?: string;
    price?: number;
  }>;
  expectedCompletionDate?: string | null;
  paymentConfirmedAt?: string;
}

/**
 * 선주문 알림 이메일 전송
 * SMTP 설정이 없으면 콘솔 로그만 출력하고 건너뜁니다 (에러를 발생시키지 않음).
 */
export async function sendPreorderNotification(params: PreorderNotificationParams): Promise<void> {
  const {
    orderId,
    orderNumber,
    userId,
    userEmail,
    totalAmount,
    paymentMethod,
    items,
    expectedCompletionDate,
    paymentConfirmedAt,
  } = params;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'copydrum@hanmail.net';

  // SMTP 설정이 없으면 콘솔 로그만 출력
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[PreorderNotification] ⚠️ SMTP 설정 없음 - 이메일 알림 건너뜀', {
      orderId,
      itemCount: items.length,
      hint: 'SMTP_HOST, SMTP_USER, SMTP_PASS 환경변수를 설정해주세요.',
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const paymentDate = paymentConfirmedAt
      ? new Date(paymentConfirmedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      : new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const itemsList = items
      .map((item, idx) => `  ${idx + 1}. ${item.sheetTitle || item.sheetId} - ${item.price?.toLocaleString() || '0'}원`)
      .join('\n');

    const subject = `🥁 [CopyDrum] 선주문 접수! - ${items.map(i => i.sheetTitle || '악보').join(', ')}`;

    const text = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥁 CopyDrum 선주문 알림
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 주문 정보
• 주문 ID: ${orderId}
${orderNumber ? `• 주문번호: ${orderNumber}` : ''}
• 결제일시: ${paymentDate}
• 결제수단: ${paymentMethod}
• 결제금액: ${totalAmount.toLocaleString()}원

👤 고객 정보
• 사용자 ID: ${userId}
${userEmail ? `• 이메일: ${userEmail}` : ''}

🎵 선주문 악보 목록
${itemsList}

${expectedCompletionDate ? `📅 예상 완료일: ${expectedCompletionDate}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
이 메일은 자동 발송된 알림입니다.
`.trim();

    const html = `
<div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 24px; margin-bottom: 20px;">
    <h1 style="color: #fff; font-size: 20px; margin: 0;">🥁 CopyDrum 선주문 알림</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <h3 style="color: #333; margin: 0 0 12px 0; font-size: 15px;">📋 주문 정보</h3>
    <table style="width: 100%; font-size: 14px; color: #555;">
      <tr><td style="padding: 4px 0; font-weight: 600;">주문 ID</td><td>${orderId}</td></tr>
      ${orderNumber ? `<tr><td style="padding: 4px 0; font-weight: 600;">주문번호</td><td>${orderNumber}</td></tr>` : ''}
      <tr><td style="padding: 4px 0; font-weight: 600;">결제일시</td><td>${paymentDate}</td></tr>
      <tr><td style="padding: 4px 0; font-weight: 600;">결제수단</td><td>${paymentMethod}</td></tr>
      <tr><td style="padding: 4px 0; font-weight: 600;">결제금액</td><td style="color: #2563eb; font-weight: 700;">${totalAmount.toLocaleString()}원</td></tr>
    </table>
  </div>

  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <h3 style="color: #333; margin: 0 0 12px 0; font-size: 15px;">👤 고객 정보</h3>
    <table style="width: 100%; font-size: 14px; color: #555;">
      <tr><td style="padding: 4px 0; font-weight: 600;">사용자 ID</td><td>${userId}</td></tr>
      ${userEmail ? `<tr><td style="padding: 4px 0; font-weight: 600;">이메일</td><td>${userEmail}</td></tr>` : ''}
    </table>
  </div>

  <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <h3 style="color: #3730a3; margin: 0 0 12px 0; font-size: 15px;">🎵 선주문 악보 목록</h3>
    <ul style="margin: 0; padding: 0 0 0 16px; font-size: 14px; color: #4338ca;">
      ${items.map(item => `<li style="padding: 4px 0;"><strong>${item.sheetTitle || item.sheetId}</strong> - ${(item.price || 0).toLocaleString()}원</li>`).join('')}
    </ul>
  </div>

  ${expectedCompletionDate ? `
  <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center;">
    <span style="font-size: 14px; color: #92400e;">📅 예상 완료일: <strong>${expectedCompletionDate}</strong></span>
  </div>
  ` : ''}

  <div style="text-align: center; color: #999; font-size: 12px; margin-top: 24px;">
    이 메일은 자동 발송된 알림입니다.
  </div>
</div>
`.trim();

    await transporter.sendMail({
      from: `CopyDrum <${smtpUser}>`,
      to: adminEmail,
      subject,
      text,
      html,
    });

    console.log('[PreorderNotification] ✅ 선주문 알림 이메일 전송 성공', {
      orderId,
      to: adminEmail,
      itemCount: items.length,
    });
  } catch (error) {
    // 이메일 전송 실패는 치명적이지 않으므로 경고만 출력
    console.error('[PreorderNotification] ❌ 선주문 알림 이메일 전송 실패', {
      orderId,
      error: error instanceof Error ? error.message : error,
    });
  }
}
