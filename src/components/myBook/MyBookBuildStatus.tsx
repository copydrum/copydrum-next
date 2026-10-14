'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

const POLL_MS = 3000;
const SLOW_POLL_MS = 10000;
const DELAYED_POLL_MS = 30000;
const SLOW_AFTER_MS = 3 * 60 * 1000;
/** 이보다 오래 끝나지 않으면 담당자 처리로 안내하고 관리자에게 알린다 (api/my-book/build 의 DELAY_REPORT_MINUTES 와 맞춘다) */
const DELAYED_AFTER_MS = 10 * 60 * 1000;
const STOP_AFTER_MS = 60 * 60 * 1000;
const FINISH_DELAY_MS = 1200;
/** 서버와 같은 기준: 이보다 오래 building 이면 멈춘 것으로 보고 다시 시작을 요청한다 */
const STALE_MS = 5 * 60 * 1000;

type BuildStatus = 'pending' | 'building' | 'done' | 'failed' | null;

interface BuildRow {
  status: string;
  completed_pdf_url: string | null;
  book_build_status: BuildStatus;
  book_build_started_at: string | null;
}

interface MyBookBuildStatusProps {
  orderId: string;
  songCount: number;
  initialStatus: BuildStatus;
  /** 완성 파일이 생겼을 때 상세 화면을 조용히 다시 불러온다 */
  onCompleted: () => void;
}

const isStale = (row: Pick<BuildRow, 'book_build_status' | 'book_build_started_at'>) => {
  if (row.book_build_status !== 'building') return false;
  const started = row.book_build_started_at ? new Date(row.book_build_started_at).getTime() : 0;
  return !started || Date.now() - started > STALE_MS;
};

/** 결제 직후 악보집 자동 제작 진행 상황 (완성되면 부모가 다운로드 영역을 보여준다) */
export default function MyBookBuildStatus({ orderId, songCount, initialStatus, onCompleted }: MyBookBuildStatusProps) {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const [buildStatus, setBuildStatus] = useState<BuildStatus>(initialStatus);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [finished, setFinished] = useState(false);
  const mountedAt = useRef(0);
  const completedRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  // 게이지가 100% 까지 차는 모습을 잠깐 보여 준 뒤 다운로드 영역으로 바꾼다
  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFinished(true);
    setTimeout(() => onCompletedRef.current(), FINISH_DELAY_MS);
  }, []);

  const requestBuild = useCallback(
    async (retry = false, reportDelay = false) => {
      try {
        const res = await fetch('/api/my-book/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customOrderId: orderId, retry, reportDelay }),
        });
        const json = await res.json().catch(() => ({}));
        if (json?.buildStatus === 'done') {
          finish();
        } else if (json?.buildStatus) {
          setBuildStatus(json.buildStatus);
        }
      } catch (error) {
        console.warn('[my-book] 제작 요청 실패:', error);
      }
    },
    [orderId, finish]
  );

  // 결제 확인 직후 서버가 이미 시작했더라도 한 번 더 요청해 둔다 (중복 제작은 서버에서 막는다)
  useEffect(() => {
    if (initialStatus === 'failed') return;
    const timer = setTimeout(() => void requestBuild(), 0);
    return () => clearTimeout(timer);
  }, [initialStatus, requestBuild]);

  useEffect(() => {
    if (buildStatus === 'failed') return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let staleRequested = false;
    let delayReported = false;

    const poll = async () => {
      const elapsed = Date.now() - mountedAt.current;
      if (elapsed > STOP_AFTER_MS || cancelled) return;

      const { data } = await supabase
        .from('custom_orders')
        .select('status, completed_pdf_url, book_build_status, book_build_started_at')
        .eq('id', orderId)
        .maybeSingle<BuildRow>();
      if (cancelled) return;

      if (data?.completed_pdf_url) {
        finish();
        return;
      }
      if (data) {
        setBuildStatus(data.book_build_status);
        if (data.book_build_status === 'failed') return;
        if (!staleRequested && (isStale(data) || data.book_build_status === null || data.book_build_status === 'pending')) {
          staleRequested = true;
          void requestBuild();
        }
        if (!delayReported && elapsed > DELAYED_AFTER_MS) {
          delayReported = true;
          void requestBuild(false, true);
        }
      }
      const nextPollMs = elapsed > DELAYED_AFTER_MS ? DELAYED_POLL_MS : elapsed > SLOW_AFTER_MS ? SLOW_POLL_MS : POLL_MS;
      timer = setTimeout(poll, nextPollMs);
    };

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buildStatus === 'failed', orderId, requestBuild, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (buildStatus === 'failed') return;
    const tick = setInterval(() => setElapsedMs(Date.now() - mountedAt.current), 1000);
    return () => clearInterval(tick);
  }, [buildStatus]);

  const handleRetry = async () => {
    setRetrying(true);
    mountedAt.current = Date.now();
    setElapsedMs(0);
    await requestBuild(true);
    setRetrying(false);
  };

  const goPurchases = () => router.push('/purchases');

  const failed = buildStatus === 'failed';
  if (!finished && (failed || elapsedMs > DELAYED_AFTER_MS)) {
    return (
      <div className="mt-4 break-keep rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <div className="flex items-start gap-2 sm:gap-3">
          <i className="ri-customer-service-2-line mt-0.5 text-xl text-amber-600 sm:text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-900">
              {failed ? t('myBook.build.failedTitle') : t('myBook.build.delayedTitle')}
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-900">{t('myBook.build.manualDesc')}</p>
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-900">
              <i className="ri-time-line mr-1" />
              {t('myBook.build.manualSchedule')}
            </p>
            <p className="mt-2 text-sm text-amber-800">{t('myBook.build.manualMeanwhile')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goPurchases}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {t('myBook.build.goPurchases')}
              </button>
            </div>
            {failed && (
              <p className="mt-3 text-xs text-amber-700">
                {t('myBook.build.retryHint')}{' '}
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={retrying}
                  className="font-semibold underline underline-offset-2 hover:text-amber-900 disabled:opacity-60"
                >
                  {retrying ? t('myBook.build.retrying') : t('myBook.build.retry')}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 실제 진행률을 알 수 없어 예상 시간 기준으로 점점 느려지며 95% 까지만 채운다
  const expectedMs = Math.max(8000, songCount * 600 + 6000);
  const estimated = Math.max(3, Math.round(95 * (1 - Math.exp((-2.2 * elapsedMs) / expectedMs))));
  const progress = finished ? 100 : Math.min(95, estimated);
  const slow = elapsedMs > SLOW_AFTER_MS;
  const steps = [t('myBook.build.stepCollect'), t('myBook.build.stepDesign'), t('myBook.build.stepBind')];
  const activeStep = finished ? steps.length : progress < 35 ? 0 : progress < 70 ? 1 : 2;

  return (
    <div
      className={`-mx-2 mt-4 overflow-hidden break-keep rounded-2xl border-2 p-4 shadow-lg ring-4 sm:mx-0 sm:p-6 ${
        finished
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50 ring-emerald-100'
          : 'border-indigo-300 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 ring-indigo-100'
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {finished ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xl text-white sm:h-11 sm:w-11 sm:text-2xl">
            <i className="ri-check-line" />
          </div>
        ) : (
          <div className="h-9 w-9 shrink-0 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 sm:h-11 sm:w-11" />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-extrabold sm:text-xl ${finished ? 'text-emerald-900' : 'text-indigo-900'}`}>
            {finished ? t('myBook.build.finishedTitle') : t('myBook.build.buildingTitle')}
          </p>
          <p className={`mt-1 text-sm ${finished ? 'text-emerald-800' : 'text-indigo-800'}`}>
            {finished
              ? t('myBook.build.finishedDesc')
              : slow
                ? t('myBook.build.slowDesc')
                : t('myBook.build.buildingDesc', { count: songCount })}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-end justify-between gap-2">
          <span className={`text-sm font-semibold ${finished ? 'text-emerald-800' : 'text-indigo-800'}`}>
            {finished ? t('myBook.build.stepDone') : `${steps[activeStep]}…`}
          </span>
          <span
            className={`text-2xl font-extrabold tabular-nums sm:text-3xl ${finished ? 'text-emerald-600' : 'text-indigo-700'}`}
          >
            {progress}%
          </span>
        </div>
        <div className="relative h-4 overflow-hidden rounded-full bg-indigo-100 shadow-inner sm:h-5">
          <div
            className={`relative h-full overflow-hidden rounded-full transition-all duration-1000 ease-out ${
              finished
                ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500'
            }`}
            style={{ width: `${progress}%` }}
          >
            {!finished && <div className="absolute inset-0 animate-pulse bg-white/25" />}
          </div>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] sm:text-xs">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-md px-1 py-1.5 ${
              index < activeStep
                ? 'bg-indigo-600 text-white'
                : index === activeStep
                  ? 'bg-indigo-100 font-semibold text-indigo-800'
                  : 'bg-white/70 text-gray-400'
            }`}
          >
            {index < activeStep && <i className="ri-check-line mr-0.5" />}
            {label}
          </li>
        ))}
      </ol>

      {!finished && (
        <p className="mt-3 text-xs text-gray-600">
          <i className="ri-information-line mr-1" />
          {t('myBook.build.keepOpen')}{' '}
          <button type="button" onClick={goPurchases} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">
            {t('myBook.build.purchasesLink')}
          </button>
        </p>
      )}
    </div>
  );
}
