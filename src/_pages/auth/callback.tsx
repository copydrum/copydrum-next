'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import MainHeader from '../../components/common/MainHeader';

// 이전 경로를 가져오는 헬퍼 함수
const getRedirectPath = (): string => {
  if (typeof window === 'undefined') return '/';
  
  // 1. URL 쿼리 파라미터에서 확인
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get('from');
  if (fromParam) {
    return fromParam;
  }
  
  // 2. localStorage에서 확인
  const storedPath = localStorage.getItem('auth_redirect_path');
  if (storedPath) {
    return storedPath;
  }
  
  // 3. 기본값: 홈
  return '/';
};

export default function AuthCallback() {
  const { t } = useTranslation();
  const router = useLocaleRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // URL에서 hash fragment 추출
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const error = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        if (error) {
          console.error(t('authCallback.console.oauthError'), error, errorDescription);
          alert(`${t('authCallback.errors.oauthError')}: ${errorDescription || error}`);
          router.push('/login');
          return;
        }

        if (accessToken && refreshToken) {
          // Supabase 세션 설정
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }

          if (data.user) {
            // 사용자 프로필 확인 및 생성
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .single();

            if (profileError && profileError.code === 'PGRST116') {
              // 프로필이 없으면 생성
              // 이름 우선순위: user_metadata.full_name > name > user_name > 이메일 ID
              const meta = data.user.user_metadata || {};
              const resolvedName =
                meta.full_name?.trim() ||
                meta.name?.trim() ||
                meta.user_name?.trim() ||
                (data.user.email ? data.user.email.split('@')[0] : '');

              const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: data.user.id,
                  email: data.user.email || '',
                  name: resolvedName
                });

              if (insertError) {
                // 프로필 생성 실패해도 로그인은 계속 진행
                console.error('프로필 생성 오류:', insertError);
              }
            } else if (profile) {
              // 기존 프로필 업데이트 (소셜 ID가 없으면 추가)
              // 주의: 실제 DB에 존재하는 컬럼만 업데이트해야 함
              const provider = data.user.app_metadata?.provider || 'oauth';
              const userMetadata = data.user.user_metadata || {};
              const updates: any = {};

              // 실제 DB에 존재하는 컬럼만 업데이트 (kakao_id, google_id, provider는 DB에 있을 경우에만)
              if (provider === 'kakao' && !profile.kakao_id) {
                updates.kakao_id = userMetadata.sub;
              }
              if (provider === 'google' && !profile.google_id) {
                updates.google_id = userMetadata.sub;
              }
              if (!profile.provider) {
                updates.provider = provider;
              }

              // 기존 이름이 '사용자' 또는 비어있으면 소셜 메타데이터 또는 이메일에서 이름 업데이트
              if (!profile.name || profile.name === '사용자' || profile.name === 'User') {
                const betterName =
                  userMetadata.full_name?.trim() ||
                  userMetadata.name?.trim() ||
                  userMetadata.user_name?.trim() ||
                  (data.user.email ? data.user.email.split('@')[0] : '');
                if (betterName) {
                  updates.name = betterName;
                }
              }

              if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                  .from('profiles')
                  .update(updates)
                  .eq('id', data.user.id);
                
                if (updateError) {
                  // 프로필 업데이트 실패해도 로그인은 계속 진행
                  console.error('프로필 업데이트 오류:', updateError);
                }
              }
            }

            // 로그인 성공 - 이전 경로로 이동 (없으면 홈)
            if (typeof window !== 'undefined') {
              const currentOrigin = window.location.origin;
              const currentHost = window.location.host;
              
              // en.copydrum.com에서 시작했는데 copydrum.com으로 왔다면 다시 en.copydrum.com으로
              // localStorage에 원래 호스트 정보 저장 (로그인 시작 시 저장)
              const originalHost = localStorage.getItem('oauth_original_host');
              if (originalHost && originalHost !== currentHost) {
                const protocol = window.location.protocol;
                const redirectPath = getRedirectPath();
                // localStorage에서 경로 제거 (한 번만 사용)
                localStorage.removeItem('auth_redirect_path');
                localStorage.removeItem('oauth_original_host');
                window.location.replace(`${protocol}//${originalHost}${redirectPath}`);
                return;
              }
              
              // 이전 경로로 이동 (없으면 홈)
              const redirectPath = getRedirectPath();
              // localStorage에서 경로 제거 (한 번만 사용)
              localStorage.removeItem('auth_redirect_path');
              window.location.replace(`${currentOrigin}${redirectPath}`);
            } else {
              // SSR 환경에서는 기본적으로 홈으로 (실제로는 브라우저에서만 실행됨)
              const redirectPath = getRedirectPath();
              router.push(redirectPath);
            }
          }
        } else {
          // 토큰이 없으면 로그인 페이지로
          router.push('/login');
        }
      } catch (err: any) {
        console.error(t('authCallback.console.callbackError'), err);
        alert(t('authCallback.errors.callbackError'));
        router.push('/login');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <MainHeader />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-4xl text-blue-600 mb-4"></i>
          <p className="text-gray-600">{t('authCallback.loading')}</p>
        </div>
      </main>
    </div>
  );
}

