'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import LegalDocLayout from './LegalDocLayout';

const TermsPage: React.FC = () => {
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

  const updated = '2026-06-17';

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />
      <LegalDocLayout
        title={isKo ? '이용약관' : 'Terms and Conditions'}
        updatedLabel={isKo ? `최종 수정일: ${updated}` : `Last updated: ${updated}`}
      >
        {isKo ? (
          <>
            <p>
              본 약관은 COPYDRUM(이하 &ldquo;당사&rdquo;)이 운영하는 웹사이트 copydrum.com(이하
              &ldquo;서비스&rdquo;)의 이용 조건을 규정합니다. 서비스를 이용함으로써 고객님은 본 약관에
              동의하는 것으로 간주됩니다.
            </p>

            <h2>1. 서비스 내용</h2>
            <p>
              당사는 드럼 악보 및 드럼 교재를 디지털 파일(PDF) 형태로 판매합니다. 모든 상품은 결제 후
              즉시 다운로드 방식으로 제공됩니다.
            </p>

            <h2>2. 계정</h2>
            <p>
              일부 기능은 계정 등록 또는 게스트 이메일 인증이 필요합니다. 고객님은 계정 정보를 정확하게
              유지하고, 계정을 통한 활동에 대한 책임을 집니다.
            </p>

            <h2>3. 라이선스 및 저작권</h2>
            <ul>
              <li>구매한 악보는 고객님의 개인적 연주·연습 용도로만 사용할 수 있습니다.</li>
              <li>
                구매한 파일의 무단 재배포, 복제, 공유, 재판매는 금지되며 관련 법령에 따라 제재될 수
                있습니다.
              </li>
              <li>상업적 이용(공연, 방송, 교육 사업 등)에는 별도의 라이선스가 필요합니다.</li>
            </ul>

            <h2>4. 결제 및 가격</h2>
            <p>
              가격은 사이트에 표시된 통화 기준으로 청구됩니다. 결제는 당사가 지정한 결제 수단을 통해
              처리됩니다. 한국에서는 KG이니시스(신용카드 등), 카카오페이 등이, 해외에서는 PayPal 등이
              제공될 수 있으며, 일부는 포트원(PortOne)을 통해 연동됩니다. 해외 거래 중 Lemon Squeezy를
              통해 결제하는 경우 Lemon Squeezy가 판매자(Merchant of Record)로서 거래를 처리할 수
              있습니다.
            </p>

            <h2>5. 환불</h2>
            <p>
              환불은 별도의 <a href="/policy/refund">환불 정책</a>을 따릅니다. 당사는 구매일로부터 14일
              이내 사유를 묻지 않는 전액 환불을 보장합니다.
            </p>

            <h2>6. 금지 행위</h2>
            <p>
              고객님은 서비스의 정상적인 운영을 방해하거나, 타인의 권리를 침해하거나, 관련 법령을
              위반하는 행위를 해서는 안 됩니다.
            </p>

            <h2>7. 책임의 한계</h2>
            <p>
              당사는 관련 법령이 허용하는 범위 내에서, 서비스 이용으로 인해 발생한 간접적·부수적 손해에
              대해 책임을 지지 않습니다.
            </p>

            <h2>8. 약관의 변경</h2>
            <p>
              당사는 필요 시 본 약관을 개정할 수 있으며, 변경 사항은 본 페이지에 게시됩니다.
            </p>

            <h2>9. 사업자 정보 및 문의</h2>
            <ul>
              <li>상호: COPYDRUM</li>
              <li>대표자: 강만수</li>
              <li>사업자등록번호: 307-07-86155</li>
              <li>통신판매업 신고번호: 제2020세종0099호</li>
              <li>주소: 세종특별자치시 한누리대로 2200, 제비동 1층 113호</li>
              <li>연락처: 070-7570-0028</li>
              <li>
                이메일: <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>
              </li>
            </ul>
          </>
        ) : (
          <>
            <p>
              These Terms and Conditions govern your use of the website copydrum.com (the
              &ldquo;Service&rdquo;) operated by COPYDRUM (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
              using the Service, you agree to be bound by these Terms.
            </p>

            <h2>1. The Service</h2>
            <p>
              We sell drum sheet music and drum lesson books as digital files (PDF). All products are
              delivered by instant download after payment.
            </p>

            <h2>2. Accounts</h2>
            <p>
              Some features require account registration or guest email verification. You are
              responsible for keeping your account information accurate and for activity that occurs
              under your account.
            </p>

            <h2>3. License and Copyright</h2>
            <ul>
              <li>Purchased sheet music may be used only for your personal performance and practice.</li>
              <li>
                Unauthorized redistribution, reproduction, sharing, or resale of purchased files is
                prohibited and may be subject to legal action.
              </li>
              <li>
                Commercial use (public performance, broadcast, teaching business, etc.) requires a
                separate license.
              </li>
            </ul>

            <h2>4. Payments and Pricing</h2>
            <p>
              Prices are charged in the currency displayed on the site. Payments are processed
              through the payment methods we designate. In Korea, these may include KG Inicis (credit
              cards, etc.) and Kakao Pay; internationally, PayPal and other methods may be
              available. Some methods are integrated via PortOne. For certain international
              transactions processed through Lemon Squeezy, Lemon Squeezy may act as the Merchant of
              Record.
            </p>

            <h2>5. Refunds</h2>
            <p>
              Refunds are governed by our separate <a href="/policy/refund">Refund Policy</a>. We
              offer a full refund within 14 days of purchase, for any reason.
            </p>

            <h2>6. Prohibited Conduct</h2>
            <p>
              You must not interfere with the normal operation of the Service, infringe the rights of
              others, or violate any applicable law.
            </p>

            <h2>7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we are not liable for any indirect or
              incidental damages arising from your use of the Service.
            </p>

            <h2>8. Changes to These Terms</h2>
            <p>
              We may revise these Terms from time to time. Any changes will be posted on this page.
            </p>

            <h2>9. Business Information and Contact</h2>
            <ul>
              <li>Business name: COPYDRUM</li>
              <li>Representative: Kang Man-su</li>
              <li>Business registration no.: 307-07-86155</li>
              <li>Mail-order sales registration: 제2020세종0099호</li>
              <li>
                Address: Unit 113, 1F, Jebi-dong, 2200 Hannuri-daero, Sejong-si, Republic of Korea
              </li>
              <li>Phone: +82-70-7570-0028</li>
              <li>
                Email: <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>
              </li>
            </ul>
          </>
        )}
      </LegalDocLayout>
      <Footer />
    </div>
  );
};

export default TermsPage;
