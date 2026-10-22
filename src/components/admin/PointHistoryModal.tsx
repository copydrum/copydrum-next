'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PointTransaction } from '@/hooks/useRewardPoints';

const PAGE_SIZE = 20;

const TYPE_META: Record<PointTransaction['type'], { label: string; className: string }> = {
  earn: { label: '구매 적립', className: 'bg-emerald-100 text-emerald-700' },
  signup: { label: '가입 축하', className: 'bg-emerald-100 text-emerald-700' },
  admin_add: { label: '관리자 지급', className: 'bg-purple-100 text-purple-700' },
  release: { label: '사용 취소', className: 'bg-blue-100 text-blue-700' },
  use: { label: '사용', className: 'bg-gray-100 text-gray-700' },
  revoke: { label: '적립 취소', className: 'bg-red-100 text-red-700' },
  expire: { label: '소멸', className: 'bg-red-100 text-red-700' },
  admin_deduct: { label: '관리자 차감', className: 'bg-rose-100 text-rose-700' },
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '결제 대기',
  completed: '결제 완료',
  failed: '결제 실패',
  cancelled: '취소',
  refunded: '환불',
};

interface PointHistoryRow extends PointTransaction {
  order_id: string | null;
}

interface OrderSummary {
  order_number: string | null;
  status: string | null;
}

interface PointHistoryModalProps {
  member: { id: string; email: string; name?: string | null; points?: number | null };
  onClose: () => void;
  /** 지급/차감 후 바뀐 잔액 */
  onBalanceChange?: (balance: number) => void;
}

const formatPoints = (value: number) => `${value.toLocaleString('ko-KR')}P`;

export default function PointHistoryModal({ member, onClose, onBalanceChange }: PointHistoryModalProps) {
  const [rows, setRows] = useState<PointHistoryRow[]>([]);
  const [orders, setOrders] = useState<Record<string, OrderSummary>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(Number(member.points) || 0);
  const [reloadKey, setReloadKey] = useState(0);
  const [adjustType, setAdjustType] = useState<'admin_add' | 'admin_deduct'>('admin_add');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const handleAdjust = async () => {
    const amount = Math.floor(Number(adjustAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('1P 이상의 포인트를 입력하세요.');
      return;
    }
    if (adjustType === 'admin_deduct' && amount > balance) {
      alert(`보유 포인트(${formatPoints(balance)})보다 많이 차감할 수 없습니다.`);
      return;
    }
    const label = adjustType === 'admin_add' ? '지급' : '차감';
    if (!confirm(`${member.name || member.email} 회원에게 ${formatPoints(amount)}를 ${label}할까요?`)) return;

    setAdjusting(true);
    try {
      const { data, error } = await supabase.rpc('points_admin_adjust', {
        p_user_id: member.id,
        p_amount: adjustType === 'admin_add' ? amount : -amount,
        p_description: adjustReason.trim(),
      });
      if (error) throw error;

      const nextBalance = Number(data) || 0;
      setBalance(nextBalance);
      onBalanceChange?.(nextBalance);
      setAdjustAmount('');
      setAdjustReason('');
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (error: any) {
      console.error('포인트 수정 오류:', error);
      alert(
        String(error?.message ?? '').includes('INSUFFICIENT_POINTS')
          ? '보유 포인트보다 많이 차감할 수 없습니다.'
          : '포인트 수정 중 오류가 발생했습니다.',
      );
    } finally {
      setAdjusting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const from = (page - 1) * PAGE_SIZE;
      const [historyRes, profileRes] = await Promise.all([
        supabase
          .from('point_transactions')
          .select('id, type, amount, balance_after, description, order_id, created_at', { count: 'exact' })
          .eq('user_id', member.id)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1),
        supabase.from('profiles').select('points').eq('id', member.id).maybeSingle(),
      ]);

      if (historyRes.error) {
        console.error('포인트 내역 로드 오류:', historyRes.error);
        alert('포인트 내역을 불러오는 중 오류가 발생했습니다.');
      }

      const history = (historyRes.data as PointHistoryRow[] | null) ?? [];
      const orderIds = [...new Set(history.map((row) => row.order_id).filter(Boolean) as string[])];
      const orderMap: Record<string, OrderSummary> = {};
      if (orderIds.length > 0) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, order_number, status')
          .in('id', orderIds);
        (orderData ?? []).forEach((order) => {
          orderMap[order.id] = { order_number: order.order_number, status: order.status };
        });
      }

      if (cancelled) return;
      setRows(history);
      setOrders(orderMap);
      setTotal(historyRes.count ?? 0);
      if (profileRes.data) setBalance(Number(profileRes.data.points) || 0);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [member.id, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const describe = (row: PointHistoryRow) => {
    const order = row.order_id ? orders[row.order_id] : undefined;
    return {
      typeMeta: TYPE_META[row.type] ?? { label: row.type, className: 'bg-gray-100 text-gray-700' },
      orderLabel: order
        ? `${order.order_number ?? ''}${order.status ? ` · ${ORDER_STATUS_LABEL[order.status] ?? order.status}` : ''}`
        : null,
      amountText: `${row.amount >= 0 ? '+' : '-'}${formatPoints(Math.abs(row.amount))}`,
      amountClass: row.amount >= 0 ? 'text-emerald-600' : 'text-rose-600',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 md:px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">적립 포인트 관리</h3>
            <p className="text-sm text-gray-500 truncate">
              {member.name || member.email} · 현재 잔액 {formatPoints(balance)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-4 md:px-6 py-3 md:flex-row md:items-center">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 ring-1 ring-gray-200 md:w-40 md:shrink-0">
            {(['admin_add', 'admin_deduct'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAdjustType(type)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${adjustType === type
                  ? type === 'admin_add'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {type === 'admin_add' ? '지급' : '차감'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 md:contents">
            <div className="relative w-32 shrink-0">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="포인트"
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-7 text-sm focus:border-transparent focus:ring-2 focus:ring-emerald-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">P</span>
            </div>
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder={adjustType === 'admin_add' ? '사유 (기본: 관리자 지급)' : '사유 (기본: 관리자 차감)'}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={handleAdjust}
            disabled={adjusting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 md:shrink-0"
          >
            {adjusting ? '처리 중...' : '적용'}
          </button>
        </div>

        <div className="max-h-[50vh] md:max-h-[480px] overflow-y-auto">
          {loading ? (
            <p className="px-6 py-8 text-center text-gray-500">포인트 내역을 불러오는 중입니다...</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-gray-500">기록이 없습니다.</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 md:hidden">
                {rows.map((row) => {
                  const { typeMeta, orderLabel, amountText, amountClass } = describe(row);
                  return (
                    <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeMeta.className}`}>
                            {typeMeta.label}
                          </span>
                          <span className="truncate text-sm text-gray-700">{row.description || '-'}</span>
                        </div>
                        {orderLabel && <p className="mt-0.5 truncate text-xs text-gray-400">{orderLabel}</p>}
                        <p className="mt-0.5 text-xs text-gray-400">{new Date(row.created_at).toLocaleString('ko-KR')}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold ${amountClass}`}>{amountText}</p>
                        <p className="text-[11px] text-gray-400">잔액 {formatPoints(row.balance_after ?? 0)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <table className="hidden w-full md:table">
                <thead className="sticky top-0 bg-white shadow-sm">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">일시</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">유형</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">포인트</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">잔액</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">설명/주문</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((row) => {
                    const { typeMeta, orderLabel, amountText, amountClass } = describe(row);
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('ko-KR')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${typeMeta.className}`}>
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-sm font-semibold whitespace-nowrap ${amountClass}`}>{amountText}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatPoints(row.balance_after ?? 0)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div>{row.description || '-'}</div>
                          {orderLabel && <div className="text-xs text-gray-400">{orderLabel}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 md:px-6 py-4">
          <div className="text-sm text-gray-600">
            전체 {total}건 · {page}/{totalPages}페이지
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${page === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
            >
              <i className="ri-arrow-left-s-line"></i>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${page === totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
            >
              <i className="ri-arrow-right-s-line"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
