import { getLocaleFromHeaders } from './hreflang';

type TitleNamespace = 'authLogin' | 'cartPage';

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
