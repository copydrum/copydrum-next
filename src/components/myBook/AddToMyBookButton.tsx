'use client';

import { useTranslation } from 'react-i18next';
import { useHydrated } from '@/hooks/useHydrated';
import { useMyBookStore } from '@/stores/myBookStore';
import { useDialogStore } from '@/stores/dialogStore';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { isMyBookVisible } from '@/config/featureFlags';
import { getMyBookIneligibleReason, type MyBookSheetRow } from '@/lib/myBook/catalog';
import {
  calculateMyBookPrice,
  MY_BOOK_MAX_DISCOUNT_PERCENT,
  MY_BOOK_MAX_SONGS,
  MY_BOOK_MIN_SONGS,
} from '@/lib/myBook/pricing';

interface AddToMyBookButtonProps {
  sheet: Pick<MyBookSheetRow, 'id' | 'price' | 'sales_type' | 'categories'> & { title?: string };
  /** compact: 모바일 하단 바용 아이콘 버튼 */
  variant?: 'full' | 'compact';
  className?: string;
}

export default function AddToMyBookButton({ sheet, variant = 'full', className = '' }: AddToMyBookButtonProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const { showAlert, showConfirm } = useDialogStore();
  const ids = useMyBookStore((s) => s.ids);
  const add = useMyBookStore((s) => s.add);
  const hydrated = useHydrated();

  const eligible =
    getMyBookIneligibleReason({ ...sheet, title: sheet.title ?? '', artist: null } as MyBookSheetRow) === null;
  if (!hydrated || !isMyBookVisible(i18n.language) || !eligible) return null;

  const added = ids.includes(sheet.id);

  const handleClick = async () => {
    if (added) {
      router.push('/my-book');
      return;
    }
    if (!add(sheet.id)) {
      await showAlert(t('myBook.addButton.full', { max: MY_BOOK_MAX_SONGS }));
      return;
    }
    const count = useMyBookStore.getState().ids.length;
    const { nextTier } = calculateMyBookPrice(Array.from({ length: count }, () => ({ listPrice: 0 })));
    const nudge =
      count < MY_BOOK_MIN_SONGS
        ? t('myBook.addButton.nudgeMin', { count: MY_BOOK_MIN_SONGS - count })
        : nextTier
          ? t('myBook.addButton.nudgeNext', { count: nextTier.songsNeeded, percent: nextTier.percent })
          : t('myBook.addButton.nudgeMax', { percent: MY_BOOK_MAX_DISCOUNT_PERCENT });
    if (await showConfirm(t('myBook.addButton.addedToast', { count, nudge }))) {
      router.push('/my-book');
    }
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={added ? t('myBook.addButton.added', { count: ids.length }) : t('myBook.addButton.add')}
        className={`relative flex h-12 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition-all active:scale-95 ${
          added ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-indigo-200 bg-white text-indigo-600'
        } ${className}`}
      >
        <i className={`${added ? 'ri-book-open-fill' : 'ri-book-open-line'} text-lg leading-none`} />
        <span className="text-[11px] font-semibold leading-none">{t('myBook.addButton.compactLabel')}</span>
        {ids.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-indigo-600 px-1 text-[11px] font-bold leading-[18px] text-white">
            {ids.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
          added
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
        }`}
      >
        <i className={added ? 'ri-book-open-fill' : 'ri-book-open-line'} />
        {added ? t('myBook.addButton.added', { count: ids.length }) : t('myBook.addButton.add')}
      </button>
      <p className="mt-1 text-center text-[11px] text-indigo-600/80">
        {t('myBook.addButton.hint', { percent: MY_BOOK_MAX_DISCOUNT_PERCENT })}
      </p>
    </div>
  );
}
