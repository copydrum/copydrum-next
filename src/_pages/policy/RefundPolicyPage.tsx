'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import LegalDocLayout from './LegalDocLayout';

const RefundPolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const isKo = i18n.language === 'ko';
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const updated = '2026-06-11';

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />
      <LegalDocLayout
        title={isKo ? '환불 정책' : 'Refund Policy'}
        updatedLabel={isKo ? `최종 수정일: ${updated}` : `Last updated: ${updated}`}
      >
        {isKo ? (
          <>
            <p>
              COPYDRUM(이하 &ldquo;당사&rdquo;)에서 판매하는 모든 상품은 결제 후 즉시 다운로드되는
              디지털 콘텐츠(PDF 드럼 악보)입니다. 고객님의 안심 구매를 위해 아래와 같은 환불 정책을
              운영합니다.
            </p>

            <h2>1. 14일 무조건 환불 보장</h2>
            <p>
              <strong>구매일로부터 14일 이내에는 사유를 묻지 않고 전액 환불해 드립니다.</strong>{' '}
              파일을 이미 다운로드했거나 열람한 경우에도 환불이 가능하며, 별도의 조건이나 예외는
              없습니다.
            </p>

            <h2>2. 환불 신청 방법</h2>
            <p>
              아래 이메일로 주문 번호(또는 결제에 사용한 이메일)와 함께 환불을 요청해 주세요. 결제를
              Paddle(당사의 공식 결제 대행/판매자)을 통해 진행하신 경우 Paddle 영수증의 안내 링크를
              통해서도 환불을 요청하실 수 있습니다.
            </p>
            <p>
              이메일: <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>
            </p>

            <h2>3. 환불 처리 기간</h2>
            <p>
              환불 요청은 영업일 기준 보통 1~3일 이내에 처리되며, 카드사·결제수단에 따라 실제 환급까지는
              추가로 5~10영업일이 소요될 수 있습니다.
            </p>

            <h2>4. 제공(배송) 방식</h2>
            <p>
              결제 완료 후 <strong>마이페이지 &gt; 구매 내역</strong>에서 즉시 PDF 파일을 다운로드할 수
              있으며, 구매한 악보는 횟수 제한 없이 다시 내려받을 수 있습니다. 다운로드가 되지 않는 경우
              재발급 링크를 제공하거나 파일을 다시 전송해 드립니다.
            </p>

            <h2>5. 문의</h2>
            <p>
              환불 및 주문 관련 문의는 <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>{' '}
              으로 연락 주시면 신속히 도와드리겠습니다.
            </p>
          </>
        ) : (
          <>
            <p>
              All products sold by COPYDRUM (&ldquo;we&rdquo;, &ldquo;us&rdquo;) are digital contents
              (PDF drum sheet music) available for immediate download after payment. To let you buy
              with confidence, we operate the refund policy below.
            </p>

            <h2>1. 14-Day Money-Back Guarantee</h2>
            <p>
              <strong>
                You may request a full refund within 14 days of your purchase, for any reason.
              </strong>{' '}
              Refunds are available even if the file has already been downloaded or accessed. There
              are no conditions or exceptions.
            </p>

            <h2>2. How to Request a Refund</h2>
            <p>
              Email us at the address below with your order number (or the email address used at
              checkout). If your payment was processed through Paddle (our authorized reseller and
              Merchant of Record), you can also request a refund using the link on your Paddle
              receipt.
            </p>
            <p>
              Email: <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>
            </p>

            <h2>3. Processing Time</h2>
            <p>
              Refund requests are typically processed within 1&ndash;3 business days. Depending on
              your card issuer or payment method, it may take an additional 5&ndash;10 business days
              for the funds to appear on your statement.
            </p>

            <h2>4. Delivery Method</h2>
            <p>
              After successful payment, files are available for instant download under{' '}
              <strong>My Page &gt; Order History</strong>, and purchased sheet music can be
              re-downloaded without limit. If a download does not work, we provide a reissued
              download link or resend the file upon request.
            </p>

            <h2>5. Contact</h2>
            <p>
              For any refund or order inquiry, contact{' '}
              <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a> and we will be glad to
              help.
            </p>
          </>
        )}
      </LegalDocLayout>
      <Footer />
    </div>
  );
};

export default RefundPolicyPage;
