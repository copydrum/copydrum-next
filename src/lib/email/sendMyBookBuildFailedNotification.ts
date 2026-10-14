/**
 * 나만의 악보집 자동 제작 실패 알림 이메일 (관리자용)
 * SMTP 설정이 없으면 콘솔 로그만 남기고 건너뛴다.
 */
import nodemailer from 'nodemailer';

interface MyBookBuildFailedParams {
  customOrderId: string;
  bookTitle: string;
  buyerName: string;
  buyerEmail?: string | null;
  songCount: number;
  error: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export async function sendMyBookBuildFailedNotification(params: MyBookBuildFailedParams): Promise<void> {
  const { customOrderId, bookTitle, buyerName, buyerEmail, songCount, error } = params;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'copydrum@hanmail.net';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[MyBookBuildFailed] ⚠️ SMTP 설정 없음 - 이메일 알림 건너뜀', { customOrderId });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = `⚠️ [CopyDrum] 나만의 악보집 자동 제작 실패 - ${bookTitle}`;
    const text = `
나만의 악보집 자동 제작에 실패했습니다. 관리자 화면에서 확인 후 다시 만들거나 파일을 올려 주세요.

• 주문 ID: ${customOrderId}
• 악보집 제목: ${bookTitle} (${songCount}곡)
• 고객: ${buyerName}${buyerEmail ? ` (${buyerEmail})` : ''}
• 오류: ${error}

관리자 > 주문제작 > 해당 주문 > "악보집 자동 제작" 에서 [다시 만들기] 또는 곡별 대체 PDF로 만들 수 있습니다.
고객에게는 "운영 시간 기준 영업일 1일 이내 완성, 완성되면 메시지로 안내"라고 표시됩니다. 위 두 방법으로 완성하면 완성 안내 메시지는 자동으로 남습니다.
`.trim();

    const html = `
<div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #b91c1c; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
    <h1 style="color: #fff; font-size: 18px; margin: 0;">⚠️ 나만의 악보집 자동 제작 실패</h1>
  </div>
  <table style="width: 100%; font-size: 14px; color: #444; background: #f8f9fa; border-radius: 12px; padding: 16px;">
    <tr><td style="padding: 4px 0; font-weight: 600; width: 110px;">주문 ID</td><td>${escapeHtml(customOrderId)}</td></tr>
    <tr><td style="padding: 4px 0; font-weight: 600;">악보집 제목</td><td>${escapeHtml(bookTitle)} (${songCount}곡)</td></tr>
    <tr><td style="padding: 4px 0; font-weight: 600;">고객</td><td>${escapeHtml(buyerName)}${buyerEmail ? ` (${escapeHtml(buyerEmail)})` : ''}</td></tr>
    <tr><td style="padding: 4px 0; font-weight: 600; vertical-align: top;">오류</td><td style="color: #b91c1c;">${escapeHtml(error)}</td></tr>
  </table>
  <p style="font-size: 13px; color: #555; margin-top: 16px;">
    관리자 &gt; 주문제작 &gt; 해당 주문의 <strong>악보집 자동 제작</strong>에서 [다시 만들기] 또는 곡별 대체 PDF로 만들 수 있습니다.
  </p>
  <p style="font-size: 13px; color: #b91c1c; margin-top: 8px;">
    고객 화면에는 "운영 시간 기준 영업일 1일 이내 완성, 완성되면 메시지로 안내"라고 표시됩니다. 위 두 방법으로 완성하면 완성 안내 메시지는 자동으로 남습니다.
  </p>
</div>
`.trim();

    await transporter.sendMail({ from: `CopyDrum <${smtpUser}>`, to: adminEmail, subject, text, html });
    console.log('[MyBookBuildFailed] ✅ 알림 이메일 전송', { customOrderId, to: adminEmail });
  } catch (mailError) {
    console.error('[MyBookBuildFailed] ❌ 알림 이메일 전송 실패', {
      customOrderId,
      error: mailError instanceof Error ? mailError.message : mailError,
    });
  }
}
