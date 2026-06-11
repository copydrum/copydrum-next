'use client';

interface StarRatingProps {
  rating: number;
  count?: number;
  /** 별 아이콘 tailwind 크기 클래스 (예: text-xs, text-sm) */
  size?: string;
  /** 리뷰 개수 표기 여부 */
  showCount?: boolean;
  className?: string;
}

/**
 * 목록/카드용 읽기 전용 별점 표시.
 * 리뷰가 0개면 아무것도 렌더링하지 않아 카드가 깔끔하게 유지된다.
 */
export default function StarRating({
  rating,
  count = 0,
  size = 'text-xs',
  showCount = true,
  className = '',
}: StarRatingProps) {
  if (!count || count <= 0) return null;

  const rounded = Math.round(rating);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i
          key={n}
          className={`${n <= rounded ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} ${size}`}
        />
      ))}
      {showCount && (
        <span className={`ml-1 text-gray-500 ${size}`}>({count})</span>
      )}
    </span>
  );
}
