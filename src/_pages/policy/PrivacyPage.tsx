'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import LegalDocLayout from './LegalDocLayout';

const PrivacyPage: React.FC = () => {
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
        title={isKo ? '개인정보처리방침' : 'Privacy Policy'}
        updatedLabel={isKo ? `최종 수정일: ${updated}` : `Last updated: ${updated}`}
      >
        {isKo ? (
          <>
            <p>
              COPYDRUM(이하 &ldquo;당사&rdquo;)은 고객님의 개인정보를 소중히 여기며, 관련 법령에 따라
              개인정보를 안전하게 처리합니다. 본 방침은 당사가 어떤 정보를 수집하고 어떻게 이용·보호하는지
              설명합니다.
            </p>

            <h2>1. 수집하는 정보</h2>
            <ul>
              <li>계정/주문 정보: 이메일 주소, 이름</li>
              <li>결제 정보: 결제 처리에 필요한 정보(카드 정보는 결제대행사가 처리하며 당사는 저장하지 않습니다)</li>
              <li>이용 기록: 주문 내역, 다운로드 내역, 고객 문의 내용</li>
            </ul>

            <h2>2. 이용 목적</h2>
            <ul>
              <li>계정 등록 및 주문 처리, 디지털 상품 제공</li>
              <li>고객 지원 및 문의 응대</li>
              <li>서비스 개선 및 부정 이용 방지</li>
            </ul>

            <h2>3. 결제 처리 및 제3자 제공</h2>
            <p>
              결제는 Paddle, PayPal 등 신뢰할 수 있는 결제대행사를 통해 처리되며, 결제 진행에 필요한
              최소한의 정보가 해당 업체에 제공됩니다. 당사는 법령에 근거하거나 고객님의 사전 동의가 있는
              경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.
            </p>

            <h2>4. 보관 및 보호</h2>
            <p>
              개인정보는 Supabase 기반의 보안 환경에 안전하게 저장되며, 수집 목적이 달성되거나 관련 법령에
              따른 보관 기간이 경과하면 지체 없이 파기합니다.
            </p>

            <h2>5. 고객님의 권리</h2>
            <p>
              고객님은 마이페이지 또는 고객센터를 통해 본인의 개인정보 열람·수정·삭제를 요청할 수 있으며,
              요청은 지체 없이 처리됩니다.
            </p>

            <h2>6. 쿠키</h2>
            <p>
              당사는 로그인 유지, 언어 설정, 서비스 분석 등을 위해 쿠키를 사용할 수 있습니다. 브라우저
              설정을 통해 쿠키 사용을 제어할 수 있습니다.
            </p>

            <h2>7. 문의</h2>
            <p>
              개인정보 보호 관련 문의는{' '}
              <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a> 으로 연락 주시기 바랍니다.
            </p>
          </>
        ) : (
          <>
            <p>
              COPYDRUM (&ldquo;we&rdquo;, &ldquo;us&rdquo;) values your privacy and handles your
              personal information securely in accordance with applicable laws. This policy explains
              what information we collect and how we use and protect it.
            </p>

            <h2>1. Information We Collect</h2>
            <ul>
              <li>Account/order information: email address, name</li>
              <li>
                Payment information: data needed to process payment (card details are handled by our
                payment processors and are not stored by us)
              </li>
              <li>Usage data: order history, download history, and customer inquiries</li>
            </ul>

            <h2>2. How We Use Information</h2>
            <ul>
              <li>Account registration, order processing, and delivery of digital products</li>
              <li>Customer support and responding to inquiries</li>
              <li>Improving the service and preventing fraud or abuse</li>
            </ul>

            <h2>3. Payment Processing and Third Parties</h2>
            <p>
              Payments are processed through trusted payment providers such as Paddle and PayPal, and
              the minimum information required to complete payment is shared with them. We do not
              share your personal information with third parties except as required by law or with
              your prior consent.
            </p>

            <h2>4. Storage and Protection</h2>
            <p>
              Personal information is securely stored in a Supabase-based environment and is deleted
              without delay once the purpose of collection has been fulfilled or the retention period
              required by law has passed.
            </p>

            <h2>5. Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal information
              through My Page or Customer Support, and such requests will be processed without delay.
            </p>

            <h2>6. Cookies</h2>
            <p>
              We may use cookies to keep you signed in, remember your language preference, and
              analyze the service. You can control the use of cookies through your browser settings.
            </p>

            <h2>7. Contact</h2>
            <p>
              For privacy-related inquiries, please contact{' '}
              <a href="mailto:copydrum@hanmail.net">copydrum@hanmail.net</a>.
            </p>
          </>
        )}
      </LegalDocLayout>
      <Footer />
    </div>
  );
};

export default PrivacyPage;
