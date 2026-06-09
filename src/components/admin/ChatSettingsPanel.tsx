'use client';

import { useEffect, useState } from 'react';
import { fetchSettings, updateSettings, type ChatSettings } from '@/lib/settings';
import { isChatOnline } from '@/lib/chat/online';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ChatSettingsPanel({ updatedBy }: { updatedBy?: string | null }) {
  const [chat, setChat] = useState<ChatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { settings } = await fetchSettings();
        setChat(settings.chat);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (patch: Partial<ChatSettings>) => {
    setChat((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateDay = (index: number, patch: Partial<ChatSettings['businessHours'][number]>) => {
    setChat((prev) => {
      if (!prev) return prev;
      const businessHours = prev.businessHours.map((d, i) => (i === index ? { ...d, ...patch } : d));
      return { ...prev, businessHours };
    });
  };

  const handleSave = async () => {
    if (!chat) return;
    setSaving(true);
    try {
      await updateSettings({ chat }, { updatedBy: updatedBy ?? null });
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
      alert(msg ? `저장에 실패했습니다.\n${msg}` : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  if (!chat) return <div className="p-6 text-sm text-red-500">설정을 불러오지 못했습니다.</div>;

  const onlineNow = isChatOnline(chat);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">채팅 상담 설정</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            onlineNow ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          현재: {onlineNow ? '상담 가능(온라인)' : '운영시간 외(오프라인)'}
        </span>
      </div>

      {/* 기능 사용 여부 */}
      <Row title="채팅 기능 사용" desc="끄면 사이트에서 채팅 위젯이 보이지 않습니다.">
        <Toggle checked={chat.enabled} onChange={(v) => update({ enabled: v })} />
      </Row>

      {/* 모드 */}
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="mb-2 text-sm font-semibold text-gray-700">온라인 판정 방식</p>
        <div className="space-y-2 text-sm">
          {[
            { v: 'manual_and_hours', label: '수동 스위치 ON + 운영시간 내일 때만 온라인 (권장)' },
            { v: 'auto', label: '운영시간으로 자동 판정 (스위치 무시)' },
            { v: 'manual', label: '수동 스위치만 사용 (운영시간 무시)' },
          ].map((opt) => (
            <label key={opt.v} className="flex items-center gap-2">
              <input
                type="radio"
                name="chat-mode"
                checked={chat.mode === opt.v}
                onChange={() => update({ mode: opt.v as ChatSettings['mode'] })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 수동 스위치 */}
      <Row title="지금 상담 받기 (수동 스위치)" desc="자리에 있을 때 켜두면 즉시 상담을 받습니다.">
        <Toggle checked={chat.manualOnline} onChange={(v) => update({ manualOnline: v })} />
      </Row>

      {/* 운영시간 */}
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="mb-3 text-sm font-semibold text-gray-700">운영시간 (요일별)</p>
        <div className="space-y-2">
          {chat.businessHours.map((day, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <label className="flex w-16 items-center gap-2">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => updateDay(i, { enabled: e.target.checked })}
                />
                <span className="font-medium">{DAY_LABELS[i]}</span>
              </label>
              <input
                type="time"
                value={day.from}
                disabled={!day.enabled}
                onChange={(e) => updateDay(i, { from: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
              />
              <span>~</span>
              <input
                type="time"
                value={day.to}
                disabled={!day.enabled}
                onChange={(e) => updateDay(i, { to: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">타임존: {chat.timezone}</p>
      </div>

      {/* 문구 */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">환영 메시지</label>
          <textarea
            value={chat.welcomeMessage}
            onChange={(e) => update({ welcomeMessage: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">오프라인 안내 문구</label>
          <textarea
            value={chat.offlineMessage}
            onChange={(e) => update({ offlineMessage: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {savedAt && <span className="text-xs text-green-600">{savedAt} 저장됨</span>}
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-indigo-600' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
