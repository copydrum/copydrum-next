'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import {
  getSiteCurrency,
  convertFromKrw,
  formatCurrency as formatCurrencyUtil,
} from '@/lib/currency';
import StarRating from '@/components/reviews/StarRating';
import { fetchReviewStatsMap, type ReviewStatsMap } from '@/lib/reviews/reviewStats';

interface RelatedSheet {
  id: string;
  slug: string | null;
  title: string;
  title_translations?: Record<string, string> | null;
  artist: string;
  price: number | null;
  thumbnail_url: string | null;
  preview_image_url: string | null;
}

interface RelatedSheetsProps {
  currentSheetId: string;
  artist: string;
  categoryId?: string | null;
}

const MAX_ITEMS = 8;

export default function RelatedSheets({
  currentSheetId,
  artist,
  categoryId,
}: RelatedSheetsProps) {
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const [sheets, setSheets] = useState<RelatedSheet[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStatsMap>({});
  const [loading, setLoading] = useState(true);

  // 현재 URL 의 첫 세그먼트(= locale path)를 그대로 사용해 리다이렉트 hop 을 방지
  const localePrefix = (pathname?.split('/').filter(Boolean)[0]) || 'en';

  const currency = getSiteCurrency(undefined, i18n.language);
  const formatPrice = (value: number) =>
    formatCurrencyUtil(convertFromKrw(value, currency, i18n.language), currency);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const supabase = createClient();
      const SELECT =
        'id, slug, title, title_translations, artist, price, thumbnail_url, preview_image_url';
      const collected = new Map<string, RelatedSheet>();

      // 1) 같은 아티스트
      if (artist) {
        const { data } = await supabase
          .from('drum_sheets')
          .select(SELECT)
          .eq('is_active', true)
          .eq('artist', artist)
          .neq('id', currentSheetId)
          .not('slug', 'is', null)
          .limit(MAX_ITEMS);
        for (const row of (data as RelatedSheet[]) || []) {
          if (row.slug) collected.set(row.id, row);
        }
      }

      // 2) 부족하면 같은 카테고리로 보충
      if (collected.size < MAX_ITEMS && categoryId) {
        const { data } = await supabase
          .from('drum_sheets')
          .select(SELECT)
          .eq('is_active', true)
          .eq('category_id', categoryId)
          .neq('id', currentSheetId)
          .not('slug', 'is', null)
          .limit(MAX_ITEMS * 2);
        for (const row of (data as RelatedSheet[]) || []) {
          if (collected.size >= MAX_ITEMS) break;
          if (row.slug && !collected.has(row.id)) collected.set(row.id, row);
        }
      }

      const finalSheets = Array.from(collected.values()).slice(0, MAX_ITEMS);

      if (active) {
        setSheets(finalSheets);
        setLoading(false);
      }

      const stats = await fetchReviewStatsMap(finalSheets.map((s) => s.id));
      if (active) setReviewStats(stats);
    };

    load().catch(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [currentSheetId, artist, categoryId]);

  if (loading || sheets.length === 0) {
    return null;
  }

  const sectionTitle =
    i18n.language === 'ko' ? '이런 악보도 추천해요' : 'You may also like';

  const displayTitle = (s: RelatedSheet) =>
    i18n.language !== 'ko'
      ? s.title_translations?.en?.trim() || s.title
      : s.title;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-gray-100">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
        {sectionTitle}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {sheets.map((s) => (
          <Link
            key={s.id}
            href={`/${localePrefix}/drum-sheet/${s.slug}`}
            className="group block rounded-xl overflow-hidden border border-gray-100 bg-white hover:shadow-lg transition-shadow"
          >
            <div className="aspect-square bg-gray-50 overflow-hidden">
              <img
                src={
                  s.thumbnail_url ||
                  s.preview_image_url ||
                  `https://readdy.ai/api/search-image?query=drum%20sheet%20music%20album%20cover%20minimalist&width=400&height=400&seq=${s.id}&orientation=square`
                }
                alt={`${displayTitle(s)} - ${s.artist}`}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {displayTitle(s)}
              </p>
              <p className="text-xs text-gray-500 truncate">{s.artist}</p>
              <StarRating
                rating={reviewStats[s.id]?.avgRating ?? 0}
                count={reviewStats[s.id]?.reviewCount ?? 0}
                className="mt-1"
              />
              <p className="text-sm font-bold text-blue-600 mt-1">
                {(s.price ?? 0) === 0
                  ? i18n.language === 'ko'
                    ? '무료'
                    : 'Free'
                  : formatPrice(s.price ?? 0)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
