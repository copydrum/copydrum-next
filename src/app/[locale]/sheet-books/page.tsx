import type { Metadata } from 'next';
import SheetBooksPage from '@/_pages/sheet-books/page';
import { getLocaleFromHeaders, canonicalFor, buildLanguageAlternates } from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const canonical = canonicalFor(locale, '/sheet-books');

  return {
    title: locale === 'ko' ? '악보집 | COPYDRUM' : 'Sheet Books | COPYDRUM',
    description:
      locale === 'ko'
        ? '여러 곡이 한 권으로 담긴 PDF 드럼 악보집을 만나보세요.'
        : 'Curated drum sheet music books in a single PDF download.',
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/sheet-books'),
    },
  };
}

export default function Page() {
  return <SheetBooksPage />;
}
