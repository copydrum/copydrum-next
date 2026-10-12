import type { Metadata } from 'next';
import EventSalePage from '@/_pages/event-sale/page';
import { getLocaleFromHeaders, canonicalFor, buildLanguageAlternates } from '@/lib/seo/hreflang';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  const canonical = canonicalFor(locale, '/event-sale');

  return {
    title: locale === 'ko' ? '타임특가' : 'Flash Sale',
    description:
      locale === 'ko'
        ? '신곡 드럼 악보를 정해진 시간 동안만 할인된 가격으로 만나보세요.'
        : 'Limited-time discounts on new drum sheet music. Grab them before the timer runs out.',
    alternates: {
      canonical,
      languages: buildLanguageAlternates('/event-sale'),
    },
  };
}

export default function Page() {
  return <EventSalePage />;
}
