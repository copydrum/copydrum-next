'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface OrderRow {
  id: string;
  order_number: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-blue-100 text-blue-700',
  completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-purple-100 text-purple-700',
};

export default function ChatCustomerContext({
  userId,
  email,
  memberName,
}: {
  userId: string | null;
  email: string | null;
  memberName?: string | null;
}) {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId);
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(email);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      let uid = userId;
      let resolved = email;
      if (uid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, email, name')
          .eq('id', uid)
          .maybeSingle();
        resolved = resolved || prof?.email || null;
        uid = prof?.id ?? uid;
      } else if (email) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', email)
          .maybeSingle();
        uid = prof?.id ?? null;
        resolved = resolved || prof?.email || email;
      }
      setResolvedUserId(uid);
      setResolvedEmail(resolved);
      if (!uid) {
        setOrders([]);
        return;
      }
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, payment_status, payment_method, total_amount, created_at, metadata')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(10);
      setOrders((data ?? []) as OrderRow[]);
    } finally {
      setLoading(false);
    }
  }, [userId, email]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const pendingPaypal = orders.filter(
    (o) => o.payment_status === 'pending' && o.payment_method === 'paypal',
  );

  const handleRecover = async () => {
    if (recovering) return;
    setRecovering(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await supabase.functions.invoke('admin-reconcile-order', {
        body: { userId: resolvedUserId, email: resolvedEmail },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error) throw res.error;
      const data = res.data as { ok: boolean; orders?: Array<{ order_number: string; action: string }>; message?: string };
      const recovered = (data.orders ?? []).filter((o) => o.action === 'RECOVERED').length;
      const noMatch = (data.orders ?? []).filter((o) => o.action === 'no-paid-match').length;
      setResult(
        data.message ??
          `복구 ${recovered}건` + (noMatch ? `, 미매칭 ${noMatch}건` : ''),
      );
      await loadOrders();
    } catch (e) {
      setResult('복구 처리 실패: ' + (e instanceof Error ? e.message : '오류'));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-2">
        <p className="text-sm font-semibold text-gray-800">고객 / 주문</p>
        <p className="truncate text-xs text-gray-500">
          {memberName && <span className="font-medium text-gray-700">{memberName} · </span>}
          {resolvedEmail || (resolvedUserId ? '이메일 조회 실패' : '식별 불가')}
        </p>
      </div>

      {pendingPaypal.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">
            결제대기 PayPal {pendingPaypal.length}건
          </p>
          <p className="mt-0.5 text-[11px] text-amber-600">
            실제 결제됐는데 멈춘 건일 수 있습니다.
          </p>
          <button
            onClick={handleRecover}
            disabled={recovering}
            className="mt-2 w-full rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {recovering ? '확인 중...' : 'PortOne 재확인 · 자동복구'}
          </button>
        </div>
      )}

      {result && (
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">{result}</div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {loading && <p className="p-2 text-xs text-gray-400">불러오는 중...</p>}
        {!loading && orders.length === 0 && (
          <p className="p-2 text-xs text-gray-400">주문 내역이 없습니다.</p>
        )}
        {orders.map((o) => (
          <div key={o.id} className="mb-2 rounded-lg border border-gray-100 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-800">{o.order_number}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  STATUS_BADGE[o.payment_status ?? ''] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {o.payment_status}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
              {o.metadata?.description ?? ''}
            </p>
            <p className="text-[10px] text-gray-400">
              {o.payment_method ?? '미확인'} · {(o.total_amount ?? 0).toLocaleString()}원 ·{' '}
              {new Date(o.created_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
