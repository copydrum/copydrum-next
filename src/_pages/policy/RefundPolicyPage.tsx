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

  const updated = '2026-10-08';

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

            <h2>1. 환불 기준</h2>
            <p>
              결제 후 즉시 다운로드되는 디지털 콘텐츠의 특성상,{' '}
              <strong>
                파일을 한 번이라도 다운로드하거나 열람한 이력이 있는 경우에는 어떠한 사유로도 환불이
                불가합니다.
              </strong>{' '}
              (단, 다운로드를 받지 않았거나 파일 자체에 치명적인 오류가 있는 경우에 한해 결제일로부터
              7일 이내 환불 가능)
            </p>

            <h2>2. 환불 신청 방법</h2>
            <p>
              아래 이메일로 주문 번호(또는 결제에 사용한 이메일)와 함께 환불을 요청해 주세요. Lemon
              Squeezy를 통해 결제하신 경우 Lemon Squeezy 영수증 또는 구매 확인 메일의 안내를 통해서도
              환불을 요청하실 수 있습니다. PayPal, KG이니시스, 카카오페이 등 그 외 결제 수단으로
              결제하신 경우에도 동일한 이메일로 문의해 주시면 안내해 드립니다.
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

            <h2 id="cash-charge">6. 캐쉬 충전 환불</h2>
            <p>
              충전한 캐쉬는 실제로 결제한 <strong>결제 캐쉬</strong>와 충전 혜택으로 더 드린{' '}
              <strong>보너스 캐쉬</strong>로 나뉩니다. 캐쉬로 악보를 살 때는 결제 캐쉬가 먼저 쓰이고,
              보너스 캐쉬는 마지막에 쓰입니다.
            </p>
            <ul>
              <li>
                환불을 요청하시면 <strong>남은 결제 캐쉬를 전액 환불</strong>해 드리며, 남은 보너스 캐쉬는
                환불과 함께 소멸됩니다. 환불 수수료는 없습니다.
              </li>
              <li>
                예시: 10,000원을 결제해 11,500원이 충전 → 3,000원 사용 → <strong>7,000원 환불</strong>,
                남은 보너스 1,500원 소멸
              </li>
              <li>충전 후 7일 이내에 전혀 사용하지 않았다면 결제를 전액 취소해 드립니다.</li>
              <li>
                환불은 결제하신 수단(카드·카카오페이 등)으로 진행되며, 무통장입금(가상계좌)으로 충전하신
                경우 환불받으실 계좌를 확인한 뒤 송금해 드립니다.
              </li>
              <li>
                캐쉬로 구매한 악보가 1항에 따라 환불 대상이 되면 결제한 캐쉬로 돌려드립니다.
              </li>
              <li>
                해외 사이트의 Credits도 같은 기준으로 환불되며, 처음 결제한 수단(카드·PayPal)으로 환불됩니다.
              </li>
              <li>
                이벤트·보상 등으로 지급된 캐쉬와 이전 사이트에서 보유하던 캐쉬는 기존과 같이 사용할 수
                있지만 이 항목의 환불 대상에는 포함되지 않습니다. 관련 문의는 고객센터로 연락해 주세요.
              </li>
              <li>환불 신청은 2항의 이메일로 해 주세요.</li>
            </ul>

            <h2 id="reward-points">7. 적립 포인트</h2>
            <ul>
              <li>
                악보를 구매하면 결제 금액의 3~7%가 회원 등급에 따라 적립됩니다. (루키 3% · 세션 5% · 마스터 7%)
              </li>
              <li>1P = 1원으로 악보 구매에만 사용할 수 있으며, 캐쉬 충전에는 사용할 수 없습니다.</li>
              <li>포인트는 현금으로 환불하거나 다른 수단으로 바꿀 수 없습니다.</li>
              <li>포인트는 적립일로부터 1년이 지나면 소멸됩니다.</li>
              <li>
                주문이 취소·환불되면 그 주문으로 적립된 포인트는 회수되고, 그 주문에 사용한 포인트는 되돌려
                드립니다.
              </li>
            </ul>
          </>
        ) : (
          <>
            <p>
              All products sold by COPYDRUM (&ldquo;we&rdquo;, &ldquo;us&rdquo;) are digital contents
              (PDF drum sheet music) available for immediate download after payment. To let you buy
              with confidence, we operate the refund policy below.
            </p>

            <h2>1. Refund Eligibility</h2>
            <p>
              Due to the nature of digital content that becomes available for immediate download
              after payment,{' '}
              <strong>
                refunds are not available for any reason once the file has been downloaded or
                accessed even once.
              </strong>{' '}
              (Exception: a refund may be requested within 7 days of payment only if the file has
              not been downloaded, or if the file itself has a critical defect.)
            </p>

            <h2>2. How to Request a Refund</h2>
            <p>
              Email us at the address below with your order number (or the email address used at
              checkout). If your payment was processed through Lemon Squeezy (our Merchant of Record
              for certain international transactions), you may also request a refund using the
              instructions on your Lemon Squeezy receipt or order confirmation email. For payments
              made via PayPal, KG Inicis, Kakao Pay, or other methods, contact us at the same email
              and we will guide you through the process.
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

            <h2 id="cash-charge">6. Credits Refunds</h2>
            <p>
              Credits you buy are made up of <strong>paid Credits</strong> (the amount you actually paid)
              and <strong>bonus Credits</strong> (extra Credits added as a purchase bonus). When you buy
              sheet music with Credits, paid Credits are used first and bonus Credits are used last.
            </p>
            <ul>
              <li>
                If you request a refund, we <strong>refund all of your remaining paid Credits</strong>, and
                any remaining bonus Credits are forfeited. There is no refund fee.
              </li>
              <li>
                Example: pay $10 and get $11.50 in Credits &rarr; use $3 &rarr;{' '}
                <strong>$7 refunded</strong>, and the remaining $1.50 bonus is forfeited.
              </li>
              <li>If you haven&rsquo;t used any of the Credits within 7 days of purchase, we cancel the full payment.</li>
              <li>Refunds go back to your original payment method (card or PayPal).</li>
              <li>
                If sheet music bought with Credits qualifies for a refund under Section 1, the Credits you
                spent are returned to your balance.
              </li>
              <li>
                Credits granted through promotions or compensation are not covered by this section. Please
                contact us with any questions.
              </li>
              <li>To request a refund, email us at the address in Section 2.</li>
            </ul>

            <h2 id="reward-points">7. Rewards</h2>
            <ul>
              <li>
                You earn 3&ndash;7% of what you pay for sheet music as Rewards, depending on your tier
                (Rookie 3% &middot; Session 5% &middot; Master 7%).
              </li>
              <li>Rewards can only be used toward sheet music purchases, not to buy Credits.</li>
              <li>Rewards cannot be refunded as cash or exchanged for anything else.</li>
              <li>Rewards expire 1 year after they are earned.</li>
              <li>
                If an order is cancelled or refunded, Rewards earned from that order are reversed and
                Rewards you used on it are returned.
              </li>
            </ul>
          </>
        )}
      </LegalDocLayout>
      <Footer />
    </div>
  );
};

export default RefundPolicyPage;
