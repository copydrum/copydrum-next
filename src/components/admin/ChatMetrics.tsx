'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Period = 7 | 30;

interface ConvRow {
  id: string;
  created_at: string;
  status: string;
  reply_email_sent_at?: string | null;
  user_last_seen_at?: string | null;
}

interface MsgRow {
  conversation_id: string;
  sender_type: string;
  created_at: string;
}

interface Metrics {
  conversations: number;
  answeredRate: number | null;
  medianFirstReplyMin: number | null;
  waiting: number;
  replyEmails: number | null;
  returnedAfterEmail: number | null;
}

function formatMinutes(min: number | null): string {
  if (min === null) return '-';
  if (min < 1) return '1분 미만';
  if (min < 60) return `${Math.round(min)}분`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h < 24) return m ? `${h}시간 ${m}분` : `${h}시간`;
  const d = Math.floor(h / 24);
  return `${d}일 ${h % 24}시간`;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function loadConversations(sinceIso: string): Promise<{ rows: ConvRow[]; hasEmailColumns: boolean }> {
  const withEmail = await supabase
    .from('chat_conversations')
    .select('id, created_at, status, reply_email_sent_at, user_last_seen_at')
    .gte('created_at', sinceIso)
    .limit(1000);
  if (!withEmail.error) return { rows: (withEmail.data ?? []) as ConvRow[], hasEmailColumns: true };

  // 마이그레이션 적용 전
  const basic = await supabase
    .from('chat_conversations')
    .select('id, created_at, status')
    .gte('created_at', sinceIso)
    .limit(1000);
  if (basic.error) throw basic.error;
  return { rows: (basic.data ?? []) as ConvRow[], hasEmailColumns: false };
}

async function loadMessages(conversationIds: string[]): Promise<MsgRow[]> {
  const rows: MsgRow[] = [];
  for (let i = 0; i < conversationIds.length; i += 200) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('conversation_id, sender_type, created_at')
      .in('conversation_id', conversationIds.slice(i, i + 200))
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw error;
    rows.push(...((data ?? []) as MsgRow[]));
  }
  return rows;
}

async function computeMetrics(period: Period): Promise<Metrics> {
  const sinceIso = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
  const { rows: convs, hasEmailColumns } = await loadConversations(sinceIso);
  const messages = await loadMessages(convs.map((c) => c.id));

  const byConv = new Map<string, MsgRow[]>();
  for (const m of messages) {
    const list = byConv.get(m.conversation_id) ?? [];
    list.push(m);
    byConv.set(m.conversation_id, list);
  }

  let conversations = 0;
  let answered = 0;
  let waiting = 0;
  const firstReplyMinutes: number[] = [];

  for (const c of convs) {
    const msgs = byConv.get(c.id) ?? [];
    const firstUser = msgs.find((m) => m.sender_type === 'user');
    if (!firstUser) continue; // 고객 메시지가 없는 빈 대화는 제외
    conversations++;

    const firstAdmin = msgs.find((m) => m.sender_type === 'admin' && m.created_at >= firstUser.created_at);
    if (firstAdmin) {
      answered++;
      firstReplyMinutes.push(
        (new Date(firstAdmin.created_at).getTime() - new Date(firstUser.created_at).getTime()) / 60000,
      );
    }

    const last = [...msgs].reverse().find((m) => m.sender_type === 'user' || m.sender_type === 'admin');
    if (c.status !== 'closed' && last?.sender_type === 'user') waiting++;
  }

  let replyEmails: number | null = null;
  let returnedAfterEmail: number | null = null;
  if (hasEmailColumns) {
    const emailed = convs.filter((c) => c.reply_email_sent_at);
    replyEmails = emailed.length;
    returnedAfterEmail = emailed.filter(
      (c) => c.user_last_seen_at && c.reply_email_sent_at && c.user_last_seen_at > c.reply_email_sent_at,
    ).length;
  }

  return {
    conversations,
    answeredRate: conversations ? Math.round((answered / conversations) * 100) : null,
    medianFirstReplyMin: median(firstReplyMinutes),
    waiting,
    replyEmails,
    returnedAfterEmail,
  };
}

export default function ChatMetrics() {
  const [period, setPeriod] = useState<Period>(7);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError(false);
    try {
      setMetrics(await computeMetrics(p));
    } catch (e) {
      console.error('[chat-metrics]', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const cards: { label: string; value: string; hint?: string }[] = metrics
    ? [
        { label: '새 대화', value: `${metrics.conversations}건`, hint: '고객이 메시지를 보낸 대화' },
        { label: '답변한 비율', value: metrics.answeredRate === null ? '-' : `${metrics.answeredRate}%` },
        { label: '첫 응답까지 (중간값)', value: formatMinutes(metrics.medianFirstReplyMin) },
        { label: '답변 대기 중', value: `${metrics.waiting}건`, hint: '마지막 메시지가 고객인 진행 중 대화' },
        {
          label: '답변 이메일 발송',
          value: metrics.replyEmails === null ? '-' : `${metrics.replyEmails}건`,
          hint: metrics.replyEmails === null ? 'DB 마이그레이션 적용 후 집계' : '대화 기준',
        },
        {
          label: '이메일 후 재방문',
          value:
            metrics.returnedAfterEmail === null || metrics.replyEmails === null
              ? '-'
              : `${metrics.returnedAfterEmail}건${
                  metrics.replyEmails ? ` (${Math.round((metrics.returnedAfterEmail / metrics.replyEmails) * 100)}%)` : ''
                }`,
          hint: '이메일 발송 뒤 채팅을 다시 연 대화',
        },
      ]
    : [];

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">채팅 지표</p>
        <div className="flex items-center gap-1">
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-1 text-xs ${period === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              최근 {p}일
            </button>
          ))}
          <button
            onClick={() => load(period)}
            className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            title="새로고침"
          >
            <i className="ri-refresh-line" />
          </button>
        </div>
      </div>

      {loading && !metrics ? (
        <p className="text-xs text-gray-400">불러오는 중...</p>
      ) : error ? (
        <p className="text-xs text-red-500">지표를 불러오지 못했습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-500">{c.label}</p>
              <p className="text-lg font-bold text-gray-900">{c.value}</p>
              {c.hint && <p className="text-[10px] text-gray-400">{c.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
