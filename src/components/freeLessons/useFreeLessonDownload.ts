'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { downloadFile } from '@/utils/downloadHelpers';

/** 현재 로그인 사용자 (세션 변화 구독) */
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, ready };
}

/**
 * 무료 레슨 PDF 다운로드. 비회원이면 onLoginRequired 를 호출한다.
 */
export function useFreeLessonDownload(user: User | null, onLoginRequired: () => void) {
  const { t } = useTranslation();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setDownloadedIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from('free_lesson_downloads')
      .select('lesson_id')
      .eq('user_id', user.id)
      .limit(1000)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setDownloadedIds(new Set(data.map((row: { lesson_id: string }) => row.lesson_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const download = useCallback(
    async (lessonId: string): Promise<boolean> => {
      if (!user) {
        onLoginRequired();
        return false;
      }
      if (downloadingId) return false;

      setDownloadingId(lessonId);
      try {
        const response = await fetch('/api/free-lessons/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId }),
        });
        const payload = await response.json().catch(() => null);

        if (response.status === 401) {
          onLoginRequired();
          return false;
        }
        if (!response.ok || !payload?.url) {
          const code = payload?.error;
          alert(
            code === 'RATE_LIMITED'
              ? t('freeLessons.errors.rateLimited')
              : code === 'NOT_FOUND'
                ? t('freeLessons.errors.notFound')
                : t('freeLessons.errors.downloadFailed'),
          );
          return false;
        }

        await downloadFile(payload.url, payload.fileName || 'copydrum-lesson.pdf');
        setDownloadedIds((prev) => new Set(prev).add(lessonId));
        return true;
      } catch (error) {
        console.error('[free-lesson] download error:', error);
        alert(t('freeLessons.errors.downloadFailed'));
        return false;
      } finally {
        setDownloadingId(null);
      }
    },
    [user, downloadingId, onLoginRequired, t],
  );

  return { download, downloadingId, downloadedIds };
}
