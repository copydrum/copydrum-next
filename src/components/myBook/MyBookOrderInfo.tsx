'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { getCoverThemeGradientCss, getMyBookCoverTheme } from '../../lib/myBook/coverThemes';

export interface MyBookOrderFields {
  id: string;
  order_type?: string | null;
  book_title?: string | null;
  cover_file_path?: string | null;
  cover_file_name?: string | null;
  book_cover_theme?: string | null;
  book_item_count?: number | null;
  book_list_price?: number | null;
  book_discount_rate?: number | null;
  estimated_price?: number | null;
}

interface MyBookOrderItem {
  id: string;
  drum_sheet_id: string | null;
  sheet_title: string;
  artist: string | null;
  position: number;
  list_price: number;
  is_owned: boolean;
  drum_sheets?: { pdf_url: string | null; slug: string | null } | null;
}

interface MyBookOrderInfoProps {
  order: MyBookOrderFields;
  /** 관리자 화면: 곡별 원본 PDF 링크와 목차 복사 버튼을 보여준다 */
  admin?: boolean;
}

export const isMyBookOrder = (order: { order_type?: string | null } | null | undefined) =>
  order?.order_type === 'book';

const formatWon = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export default function MyBookOrderInfo({ order, admin = false }: MyBookOrderInfoProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<MyBookOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('custom_order_items')
        .select(
          admin
            ? 'id, drum_sheet_id, sheet_title, artist, position, list_price, is_owned, drum_sheets ( pdf_url, slug )'
            : 'id, drum_sheet_id, sheet_title, artist, position, list_price, is_owned'
        )
        .eq('custom_order_id', order.id)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[my-book] 곡 목록 로드 실패:', error);
        setItems([]);
      } else {
        setItems((data ?? []) as unknown as MyBookOrderItem[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, admin]);

  const coverUrl = useMemo(() => {
    if (!order.cover_file_path) return null;
    return supabase.storage.from('custom-orders').getPublicUrl(order.cover_file_path).data.publicUrl;
  }, [order.cover_file_path]);

  const isImageCover = /\.(jpe?g|png)$/i.test(order.cover_file_path ?? '');
  const coverTheme = getMyBookCoverTheme(order.book_cover_theme);
  const listTotal = order.book_list_price ?? items.reduce((sum, item) => sum + item.list_price, 0);
  const discountRate = Number(order.book_discount_rate ?? 0);
  const payableListTotal = items.reduce((sum, item) => sum + (item.is_owned ? 0 : item.list_price), 0);
  const saving =
    typeof order.estimated_price === 'number' ? Math.max(0, payableListTotal - order.estimated_price) : 0;

  const handleCopyToc = async () => {
    const lines = [
      order.book_title ?? '',
      '',
      ...items.map((item) => `${item.position}. ${item.sheet_title}${item.artist ? ` - ${item.artist}` : ''}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('목차', lines.join('\n'));
    }
  };

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">
          <i className="ri-book-open-line mr-1 text-indigo-600" />
          {t('myBook.order.infoTitle', '악보집 구성')}
        </h3>
        {admin && items.length > 0 && (
          <button
            type="button"
            onClick={handleCopyToc}
            className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            {copied ? '복사됨' : '목차 텍스트 복사'}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500">{t('myBook.order.bookTitle', '악보집 제목')}</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{order.book_title}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">{t('myBook.order.cover', '표지')}</dt>
            <dd className="mt-0.5 text-gray-700">
              {coverUrl ? (
                <a
                  href={coverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  <i className="ri-attachment-2" />
                  {order.cover_file_name || t('myBook.order.coverView', '표지 파일 보기')}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                    style={{ background: getCoverThemeGradientCss(coverTheme) }}
                  />
                  {t('myBook.order.coverDefaultTheme', { theme: t(`myBook.form.coverThemes.${coverTheme.id}`) })}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">{t('myBook.order.listTotal', '낱곡 정가 합계')}</dt>
            <dd className="mt-0.5 text-gray-700">
              {formatWon(listTotal)}
              {discountRate > 0 && (
                <span className="ml-2 font-semibold text-indigo-600">
                  {t('myBook.order.discount', '곡 수 할인')} {discountRate}%
                </span>
              )}
              {saving > 0 && (
                <span className="mt-0.5 block text-xs font-semibold text-rose-600">
                  {t('myBook.order.saving', { amount: formatWon(saving) })}
                </span>
              )}
            </dd>
          </div>
        </dl>
        {coverUrl && isImageCover && (
          <a href={coverUrl} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={coverUrl}
              alt={order.book_title ?? ''}
              className="h-36 w-auto rounded-md border border-gray-200 object-cover shadow-sm"
            />
          </a>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500">
          {t('myBook.order.songs', {
            count: order.book_item_count ?? items.length,
            defaultValue: `담은 곡 (${order.book_item_count ?? items.length}곡)`,
          })}
        </p>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">...</p>
        ) : (
          <ol className="mt-2 max-h-80 divide-y divide-indigo-100 overflow-y-auto rounded-lg border border-indigo-100 bg-white">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-gray-400">{item.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-gray-900">{item.sheet_title}</p>
                  {item.artist && <p className="truncate text-xs text-gray-500">{item.artist}</p>}
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {item.is_owned ? (
                    <span className="font-semibold text-emerald-600">{t('myBook.order.owned', '이미 구매함')}</span>
                  ) : (
                    formatWon(item.list_price)
                  )}
                </span>
                {admin && item.drum_sheets?.pdf_url && (
                  <a
                    href={item.drum_sheets.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    PDF
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
