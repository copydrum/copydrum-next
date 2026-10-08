'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseMembership, ratePercent, TIER_STYLE, type MembershipSummary } from '@/lib/membership';

const TIER_NAME: Record<string, string> = { rookie: '루키', session: '세션', master: '마스터' };
const SOURCE_LABEL: Record<string, string> = { imweb: '아임웹', cafe24: '카페24' };
const CORRECTION_STATUS: Record<string, string> = { pending: '지급 대기', applied: '지급 완료', skipped: '지급 안 함' };

interface LegacyMember {
  id: number;
  source: 'imweb' | 'cafe24';
  legacy_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  joined_at: string | null;
  balance: number;
  earned: number;
  used: number;
  spend_krw: number;
  order_count: number;
  grade: string | null;
  user_id: string | null;
}

interface LegacyOrder {
  id: number;
  source: 'imweb' | 'cafe24';
  order_no: string;
  ordered_at: string | null;
  buyer_key: string | null;
  buyer_name: string | null;
  product: string | null;
  amount: number;
  currency: string;
  status: string | null;
}

interface LinkedAccount {
  id: string;
  email: string | null;
  name: string | null;
  credits: number;
  points: number;
  membership: MembershipSummary | null;
  correction: {
    amount: number;
    imweb_balance: number;
    cafe24_unmoved: number;
    migrated_opening: number;
    prior_admin_add: number;
    status: string;
    applied_at: string | null;
  } | null;
}

interface LookupResult {
  members: LegacyMember[];
  orders: LegacyOrder[];
  accounts: LinkedAccount[];
}

const won = (n: number | null | undefined) => `${(Number(n) || 0).toLocaleString('ko-KR')}원`;
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-');

/** PostgREST or() 필터를 깨뜨리는 문자를 뺀다 */
function sanitize(term: string) {
  return term.replace(/[,()*%\\]/g, ' ').trim();
}

async function lookup(rawTerm: string): Promise<LookupResult> {
  const term = sanitize(rawTerm);
  const digits = term.replace(/\D/g, '');
  const filters = [`email.ilike.%${term}%`, `name.ilike.%${term}%`, `legacy_id.ilike.%${term}%`];
  if (digits.length >= 4) filters.push(`phone.ilike.%${digits}%`);

  const { data: memberRows, error } = await supabase
    .from('legacy_members')
    .select('*')
    .or(filters.join(','))
    .order('spend_krw', { ascending: false })
    .limit(30);
  if (error) throw error;

  let members = (memberRows ?? []) as LegacyMember[];

  // 같은 새 사이트 계정에 연결된 다른 이전 계정도 함께 보여준다
  const userIds = [...new Set(members.map((m) => m.user_id).filter(Boolean))] as string[];
  if (userIds.length > 0) {
    const { data: siblings } = await supabase.from('legacy_members').select('*').in('user_id', userIds);
    const seen = new Set(members.map((m) => m.id));
    members = members.concat(((siblings ?? []) as LegacyMember[]).filter((m) => !seen.has(m.id)));
  }

  const imwebEmails = [...new Set(members.filter((m) => m.source === 'imweb' && m.email).map((m) => m.email!))];
  const cafe24Ids = [...new Set(members.filter((m) => m.source === 'cafe24').map((m) => m.legacy_id))];
  const orderQueries = [
    supabase
      .from('legacy_orders')
      .select('*')
      .eq('source', 'imweb')
      .or(`buyer_key.ilike.%${term}%,buyer_name.ilike.%${term}%`)
      .limit(200),
  ];
  if (imwebEmails.length > 0) {
    orderQueries.push(supabase.from('legacy_orders').select('*').eq('source', 'imweb').in('buyer_key', imwebEmails).limit(300));
  }
  if (cafe24Ids.length > 0) {
    orderQueries.push(supabase.from('legacy_orders').select('*').eq('source', 'cafe24').in('buyer_key', cafe24Ids).limit(300));
  }
  const orderResults = await Promise.all(orderQueries);
  const orderMap = new Map<number, LegacyOrder>();
  orderResults.forEach(({ data }) => ((data ?? []) as LegacyOrder[]).forEach((o) => orderMap.set(o.id, o)));
  const orders = [...orderMap.values()].sort((a, b) => (b.ordered_at ?? '').localeCompare(a.ordered_at ?? ''));

  const accounts: LinkedAccount[] = await Promise.all(
    userIds.slice(0, 5).map(async (id) => {
      const [profileRes, membershipRes, correctionRes] = await Promise.all([
        supabase.from('profiles').select('id, email, name, credits, points').eq('id', id).maybeSingle(),
        supabase.rpc('get_member_membership', { p_user_id: id }),
        supabase.from('legacy_balance_corrections').select('*').eq('user_id', id).maybeSingle(),
      ]);
      return {
        id,
        email: profileRes.data?.email ?? null,
        name: profileRes.data?.name ?? null,
        credits: Number(profileRes.data?.credits) || 0,
        points: Number(profileRes.data?.points) || 0,
        membership: parseMembership(membershipRes.data),
        correction: correctionRes.data ?? null,
      };
    }),
  );

  return { members, orders, accounts };
}

export default function LegacyLookupModal({ initialQuery = '', onClose }: { initialQuery?: string; onClose: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searching, setSearching] = useState(sanitize(initialQuery).length >= 2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runSearch = useCallback((term: string) => {
    if (sanitize(term).length < 2) {
      setErrorMessage('두 글자 이상 입력해 주세요.');
      return;
    }
    setSearching(true);
    setErrorMessage(null);
    lookup(term)
      .then(setResult)
      .catch((err) => setErrorMessage(err?.message ?? '조회하지 못했습니다.'))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (sanitize(initialQuery).length < 2) return;
    let cancelled = false;
    lookup(initialQuery)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setErrorMessage(err?.message ?? '조회하지 못했습니다.'))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [initialQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">이전 사이트 내역 조회</h3>
            <p className="text-xs text-gray-500">아임웹·카페24 시절 회원 정보, 적립금, 주문 (관리자만 볼 수 있음)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form
          className="flex gap-2 border-b border-gray-100 px-6 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이메일, 이름, 전화번호, 카페24 아이디"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? '조회 중...' : '조회'}
          </button>
        </form>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4 text-sm">
          {errorMessage && <p className="text-red-600">{errorMessage}</p>}
          {result && result.members.length === 0 && result.orders.length === 0 && (
            <p className="py-8 text-center text-gray-500">이전 사이트 기록이 없습니다.</p>
          )}

          {result && result.accounts.length > 0 && (
            <section className="space-y-3">
              <h4 className="font-semibold text-gray-900">현재 사이트 계정</h4>
              {result.accounts.map((acc) => {
                const tier = acc.membership?.tier ?? 'rookie';
                return (
                  <div key={acc.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">{acc.name || '이름 없음'}</span>
                      <span className="text-gray-500">{acc.email}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[tier].badge}`}>
                        {TIER_NAME[tier]} · 적립 {ratePercent(acc.membership?.earn_rate)}%
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-gray-700 md:grid-cols-4">
                      <div>보유 캐쉬 <b>{won(acc.credits)}</b></div>
                      <div>보유 포인트 <b>{acc.points.toLocaleString('ko-KR')}P</b></div>
                      <div>누적 구매(이전 포함) <b>{won(acc.membership?.lifetime_spend)}</b></div>
                      <div>
                        {acc.membership?.next_tier
                          ? `${TIER_NAME[acc.membership.next_tier]}까지 ${won(acc.membership.remaining)}`
                          : '최고 등급'}
                      </div>
                    </div>
                    {acc.correction && (
                      <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                        <b>이전 사이트 잔액 보정 {won(acc.correction.amount)}</b> ({CORRECTION_STATUS[acc.correction.status] ?? acc.correction.status}
                        {acc.correction.applied_at ? ` · ${day(acc.correction.applied_at)}` : ''})
                        <div className="mt-1 text-xs text-amber-800">
                          아임웹 마지막 잔액 {won(acc.correction.imweb_balance)} + 카페24에서 못 옮겨진 금액{' '}
                          {won(acc.correction.cafe24_unmoved)} − 새 사이트 이전 시 넣은 금액 {won(acc.correction.migrated_opening)} −
                          이전에 수동 지급 {won(acc.correction.prior_admin_add)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {result && result.members.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-semibold text-gray-900">이전 사이트 회원 기록</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-2 py-2">사이트</th>
                      <th className="px-2 py-2">아이디 / 이메일</th>
                      <th className="px-2 py-2">이름 · 연락처</th>
                      <th className="px-2 py-2">가입일</th>
                      <th className="px-2 py-2 text-right">마지막 적립금</th>
                      <th className="px-2 py-2 text-right">적립 / 사용</th>
                      <th className="px-2 py-2 text-right">구매 금액(횟수)</th>
                      <th className="px-2 py-2">등급</th>
                      <th className="px-2 py-2">새 사이트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.members.map((m) => (
                      <tr key={m.id}>
                        <td className="px-2 py-2">{SOURCE_LABEL[m.source]}</td>
                        <td className="px-2 py-2">
                          {m.source === 'cafe24' && <div className="font-medium">{m.legacy_id}</div>}
                          <div className="text-gray-500">{m.email || '-'}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div>{m.name || '-'}</div>
                          <div className="text-gray-500">{m.phone || ''}</div>
                        </td>
                        <td className="px-2 py-2">{day(m.joined_at)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{won(m.balance)}</td>
                        <td className="px-2 py-2 text-right text-gray-600">
                          {won(m.earned)} / {won(m.used)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {won(m.spend_krw)} ({m.order_count})
                        </td>
                        <td className="px-2 py-2">{m.grade || '-'}</td>
                        <td className="px-2 py-2">{m.user_id ? '연결됨' : <span className="text-gray-400">미가입</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {result && result.orders.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-semibold text-gray-900">이전 사이트 주문 ({result.orders.length}건)</h4>
              <p className="text-xs text-gray-500">아임웹은 2024-11 ~ 2025-11, 카페24는 2021-08 ~ 2024-06 주문입니다.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-2 py-2">사이트</th>
                      <th className="px-2 py-2">주문일</th>
                      <th className="px-2 py-2">주문번호</th>
                      <th className="px-2 py-2">상품</th>
                      <th className="px-2 py-2 text-right">결제 금액</th>
                      <th className="px-2 py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-2 py-2">{SOURCE_LABEL[o.source]}</td>
                        <td className="px-2 py-2">{day(o.ordered_at)}</td>
                        <td className="px-2 py-2 text-gray-500">{o.order_no}</td>
                        <td className="px-2 py-2">{o.product}</td>
                        <td className="px-2 py-2 text-right">
                          {o.currency === 'KRW' ? won(o.amount) : `${Number(o.amount).toLocaleString('en-US')} ${o.currency}`}
                        </td>
                        <td className="px-2 py-2 text-gray-500">{o.status || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
