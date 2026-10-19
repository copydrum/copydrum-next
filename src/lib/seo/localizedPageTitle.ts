import { getLocaleFromHeaders } from './hreflang';

type TitleNamespace = 'authLogin' | 'cartPage' | 'mypage' | 'customOrder' | 'customerSupport' | 'guidePage';

const loadTitle = async (locale: string, ns: TitleNamespace): Promise<string | null> => {
  try {
    const mod = await import(`@/i18n/locales/${locale}/${ns}.json`);
    const title = (mod.default ?? mod)?.title;
    return typeof title === 'string' && title ? title : null;
  } catch {
    return null;
  }
};

/** 클라이언트 페이지 라우트의 generateMetadata 에서 쓰는 언어별 탭 제목 */
export async function getLocalizedPageTitle(ns: TitleNamespace): Promise<string> {
  const locale = await getLocaleFromHeaders();
  return (await loadTitle(locale, ns)) ?? (await loadTitle('en', ns)) ?? 'COPYDRUM';
}

const loadCommonText = async (locale: string, key: string): Promise<string | null> => {
  try {
    const mod = await import(`@/i18n/local/${locale}/common.ts`);
    const value = (mod.default ?? mod)?.[key];
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
};

/** JSON 네임스페이스가 없는 페이지 제목은 common 사전의 키로 찾는다 */
export async function getLocalizedCommonTitle(key: string): Promise<string> {
  const locale = await getLocaleFromHeaders();
  return (await loadCommonText(locale, key)) ?? (await loadCommonText('en', key)) ?? 'COPYDRUM';
}
