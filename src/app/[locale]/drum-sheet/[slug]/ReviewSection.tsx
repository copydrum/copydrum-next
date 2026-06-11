'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { hasPurchasedSheet } from '@/lib/purchaseCheck';

interface Review {
  id: string;
  user_id?: string;
  rating: number;
  comment: string | null;
  user_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewSectionProps {
  sheetId: string;
  user: User | null;
}

interface ReviewStrings {
  title: string;
  count: (n: number) => string;
  noReviews: string;
  writeTitle: string;
  editTitle: string;
  placeholder: string;
  submit: string;
  update: string;
  deleteBtn: string;
  loginRequired: string;
  purchaseRequired: string;
  ratingRequired: string;
  saved: string;
  deleted: string;
  error: string;
  deleteConfirm: string;
  anonymous: string;
}

const L: Record<string, ReviewStrings> = {
  ko: {
    title: '리뷰',
    count: (n) => `리뷰 ${n}개`,
    noReviews: '아직 등록된 리뷰가 없어요. 첫 리뷰를 남겨보세요!',
    writeTitle: '리뷰 작성',
    editTitle: '내 리뷰 수정',
    placeholder: '이 악보에 대한 후기를 남겨주세요 (선택)',
    submit: '등록',
    update: '수정',
    deleteBtn: '삭제',
    loginRequired: '리뷰를 작성하려면 로그인이 필요합니다.',
    purchaseRequired: '구매한 고객만 리뷰를 작성할 수 있어요.',
    ratingRequired: '별점을 선택해주세요.',
    saved: '리뷰가 등록되었습니다. 감사합니다!',
    deleted: '리뷰가 삭제되었습니다.',
    error: '처리 중 오류가 발생했습니다.',
    deleteConfirm: '리뷰를 삭제할까요?',
    anonymous: '익명',
  },
  en: {
    title: 'Reviews',
    count: (n) => `${n} review${n === 1 ? '' : 's'}`,
    noReviews: 'No reviews yet. Be the first to leave one!',
    writeTitle: 'Write a review',
    editTitle: 'Edit your review',
    placeholder: 'Share your thoughts about this sheet music (optional)',
    submit: 'Submit',
    update: 'Update',
    deleteBtn: 'Delete',
    loginRequired: 'Please sign in to write a review.',
    purchaseRequired: 'Only customers who purchased this item can review it.',
    ratingRequired: 'Please select a rating.',
    saved: 'Thanks! Your review has been posted.',
    deleted: 'Your review has been deleted.',
    error: 'Something went wrong. Please try again.',
    deleteConfirm: 'Delete your review?',
    anonymous: 'Anonymous',
  },
  ja: {
    title: 'レビュー',
    count: (n) => `レビュー${n}件`,
    noReviews: 'まだレビューはありません。最初のレビューを書いてみましょう！',
    writeTitle: 'レビューを書く',
    editTitle: 'レビューを編集',
    placeholder: 'この楽譜の感想を書いてください（任意）',
    submit: '投稿',
    update: '更新',
    deleteBtn: '削除',
    loginRequired: 'レビューを書くにはログインが必要です。',
    purchaseRequired: '購入されたお客様のみレビューを書けます。',
    ratingRequired: '評価を選択してください。',
    saved: 'レビューを投稿しました。ありがとうございます！',
    deleted: 'レビューを削除しました。',
    error: '処理中にエラーが発生しました。',
    deleteConfirm: 'レビューを削除しますか？',
    anonymous: '匿名',
  },
  'zh-CN': {
    title: '评价',
    count: (n) => `${n} 条评价`,
    noReviews: '暂无评价，快来发表第一条评价吧！',
    writeTitle: '撰写评价',
    editTitle: '编辑我的评价',
    placeholder: '分享您对此乐谱的看法（选填）',
    submit: '提交',
    update: '更新',
    deleteBtn: '删除',
    loginRequired: '请登录后再发表评价。',
    purchaseRequired: '仅购买的顾客可以发表评价。',
    ratingRequired: '请选择评分。',
    saved: '评价已发布，谢谢！',
    deleted: '评价已删除。',
    error: '处理时发生错误。',
    deleteConfirm: '确定删除评价吗？',
    anonymous: '匿名',
  },
  'zh-TW': {
    title: '評價',
    count: (n) => `${n} 則評價`,
    noReviews: '尚無評價，來發表第一則評價吧！',
    writeTitle: '撰寫評價',
    editTitle: '編輯我的評價',
    placeholder: '分享您對此樂譜的看法（選填）',
    submit: '送出',
    update: '更新',
    deleteBtn: '刪除',
    loginRequired: '請登入後再發表評價。',
    purchaseRequired: '僅購買的顧客可以發表評價。',
    ratingRequired: '請選擇評分。',
    saved: '評價已發布，謝謝！',
    deleted: '評價已刪除。',
    error: '處理時發生錯誤。',
    deleteConfirm: '確定刪除評價嗎？',
    anonymous: '匿名',
  },
  de: {
    title: 'Bewertungen',
    count: (n) => `${n} Bewertungen`,
    noReviews: 'Noch keine Bewertungen. Schreibe die erste!',
    writeTitle: 'Bewertung schreiben',
    editTitle: 'Meine Bewertung bearbeiten',
    placeholder: 'Teile deine Meinung zu diesen Noten (optional)',
    submit: 'Senden',
    update: 'Aktualisieren',
    deleteBtn: 'Löschen',
    loginRequired: 'Bitte melde dich an, um eine Bewertung zu schreiben.',
    purchaseRequired: 'Nur Käufer können dieses Produkt bewerten.',
    ratingRequired: 'Bitte wähle eine Bewertung.',
    saved: 'Danke! Deine Bewertung wurde veröffentlicht.',
    deleted: 'Deine Bewertung wurde gelöscht.',
    error: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
    deleteConfirm: 'Bewertung löschen?',
    anonymous: 'Anonym',
  },
  fr: {
    title: 'Avis',
    count: (n) => `${n} avis`,
    noReviews: 'Aucun avis pour le moment. Soyez le premier !',
    writeTitle: 'Écrire un avis',
    editTitle: 'Modifier mon avis',
    placeholder: 'Partagez votre avis sur cette partition (facultatif)',
    submit: 'Envoyer',
    update: 'Mettre à jour',
    deleteBtn: 'Supprimer',
    loginRequired: 'Connectez-vous pour écrire un avis.',
    purchaseRequired: 'Seuls les clients ayant acheté cet article peuvent laisser un avis.',
    ratingRequired: 'Veuillez sélectionner une note.',
    saved: 'Merci ! Votre avis a été publié.',
    deleted: 'Votre avis a été supprimé.',
    error: 'Une erreur s’est produite. Veuillez réessayer.',
    deleteConfirm: 'Supprimer votre avis ?',
    anonymous: 'Anonyme',
  },
  es: {
    title: 'Reseñas',
    count: (n) => `${n} reseñas`,
    noReviews: 'Aún no hay reseñas. ¡Sé el primero en dejar una!',
    writeTitle: 'Escribir una reseña',
    editTitle: 'Editar mi reseña',
    placeholder: 'Comparte tu opinión sobre esta partitura (opcional)',
    submit: 'Enviar',
    update: 'Actualizar',
    deleteBtn: 'Eliminar',
    loginRequired: 'Inicia sesión para escribir una reseña.',
    purchaseRequired: 'Solo los clientes que compraron este artículo pueden reseñarlo.',
    ratingRequired: 'Selecciona una calificación.',
    saved: '¡Gracias! Tu reseña se ha publicado.',
    deleted: 'Tu reseña se ha eliminado.',
    error: 'Algo salió mal. Inténtalo de nuevo.',
    deleteConfirm: '¿Eliminar tu reseña?',
    anonymous: 'Anónimo',
  },
  vi: {
    title: 'Đánh giá',
    count: (n) => `${n} đánh giá`,
    noReviews: 'Chưa có đánh giá nào. Hãy là người đầu tiên!',
    writeTitle: 'Viết đánh giá',
    editTitle: 'Sửa đánh giá của tôi',
    placeholder: 'Chia sẻ cảm nhận của bạn về bản nhạc này (tùy chọn)',
    submit: 'Gửi',
    update: 'Cập nhật',
    deleteBtn: 'Xóa',
    loginRequired: 'Vui lòng đăng nhập để viết đánh giá.',
    purchaseRequired: 'Chỉ khách hàng đã mua mới có thể đánh giá.',
    ratingRequired: 'Vui lòng chọn số sao.',
    saved: 'Cảm ơn! Đánh giá của bạn đã được đăng.',
    deleted: 'Đánh giá của bạn đã bị xóa.',
    error: 'Đã xảy ra lỗi. Vui lòng thử lại.',
    deleteConfirm: 'Xóa đánh giá của bạn?',
    anonymous: 'Ẩn danh',
  },
  th: {
    title: 'รีวิว',
    count: (n) => `${n} รีวิว`,
    noReviews: 'ยังไม่มีรีวิว มาเป็นคนแรกกันเถอะ!',
    writeTitle: 'เขียนรีวิว',
    editTitle: 'แก้ไขรีวิวของฉัน',
    placeholder: 'แบ่งปันความคิดเห็นเกี่ยวกับโน้ตเพลงนี้ (ไม่บังคับ)',
    submit: 'ส่ง',
    update: 'อัปเดต',
    deleteBtn: 'ลบ',
    loginRequired: 'กรุณาเข้าสู่ระบบเพื่อเขียนรีวิว',
    purchaseRequired: 'เฉพาะลูกค้าที่ซื้อแล้วเท่านั้นที่รีวิวได้',
    ratingRequired: 'กรุณาเลือกคะแนน',
    saved: 'ขอบคุณ! รีวิวของคุณถูกเผยแพร่แล้ว',
    deleted: 'ลบรีวิวของคุณแล้ว',
    error: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    deleteConfirm: 'ลบรีวิวของคุณหรือไม่?',
    anonymous: 'ไม่ระบุชื่อ',
  },
  hi: {
    title: 'समीक्षाएँ',
    count: (n) => `${n} समीक्षाएँ`,
    noReviews: 'अभी तक कोई समीक्षा नहीं। पहली समीक्षा लिखें!',
    writeTitle: 'समीक्षा लिखें',
    editTitle: 'मेरी समीक्षा संपादित करें',
    placeholder: 'इस शीट संगीत के बारे में अपनी राय साझा करें (वैकल्पिक)',
    submit: 'सबमिट करें',
    update: 'अपडेट करें',
    deleteBtn: 'हटाएँ',
    loginRequired: 'समीक्षा लिखने के लिए साइन इन करें।',
    purchaseRequired: 'केवल खरीदने वाले ग्राहक ही समीक्षा कर सकते हैं।',
    ratingRequired: 'कृपया रेटिंग चुनें।',
    saved: 'धन्यवाद! आपकी समीक्षा पोस्ट हो गई।',
    deleted: 'आपकी समीक्षा हटा दी गई।',
    error: 'कुछ गलत हुआ। कृपया पुनः प्रयास करें।',
    deleteConfirm: 'अपनी समीक्षा हटाएँ?',
    anonymous: 'अज्ञात',
  },
  id: {
    title: 'Ulasan',
    count: (n) => `${n} ulasan`,
    noReviews: 'Belum ada ulasan. Jadilah yang pertama!',
    writeTitle: 'Tulis ulasan',
    editTitle: 'Edit ulasan saya',
    placeholder: 'Bagikan pendapat Anda tentang partitur ini (opsional)',
    submit: 'Kirim',
    update: 'Perbarui',
    deleteBtn: 'Hapus',
    loginRequired: 'Silakan masuk untuk menulis ulasan.',
    purchaseRequired: 'Hanya pelanggan yang membeli yang dapat memberi ulasan.',
    ratingRequired: 'Silakan pilih rating.',
    saved: 'Terima kasih! Ulasan Anda telah diposting.',
    deleted: 'Ulasan Anda telah dihapus.',
    error: 'Terjadi kesalahan. Silakan coba lagi.',
    deleteConfirm: 'Hapus ulasan Anda?',
    anonymous: 'Anonim',
  },
  pt: {
    title: 'Avaliações',
    count: (n) => `${n} avaliações`,
    noReviews: 'Ainda não há avaliações. Seja o primeiro!',
    writeTitle: 'Escrever avaliação',
    editTitle: 'Editar minha avaliação',
    placeholder: 'Compartilhe sua opinião sobre esta partitura (opcional)',
    submit: 'Enviar',
    update: 'Atualizar',
    deleteBtn: 'Excluir',
    loginRequired: 'Faça login para escrever uma avaliação.',
    purchaseRequired: 'Apenas clientes que compraram podem avaliar.',
    ratingRequired: 'Selecione uma classificação.',
    saved: 'Obrigado! Sua avaliação foi publicada.',
    deleted: 'Sua avaliação foi excluída.',
    error: 'Algo deu errado. Tente novamente.',
    deleteConfirm: 'Excluir sua avaliação?',
    anonymous: 'Anônimo',
  },
  ru: {
    title: 'Отзывы',
    count: (n) => `Отзывов: ${n}`,
    noReviews: 'Отзывов пока нет. Будьте первым!',
    writeTitle: 'Написать отзыв',
    editTitle: 'Редактировать мой отзыв',
    placeholder: 'Поделитесь мнением об этих нотах (необязательно)',
    submit: 'Отправить',
    update: 'Обновить',
    deleteBtn: 'Удалить',
    loginRequired: 'Войдите, чтобы оставить отзыв.',
    purchaseRequired: 'Оставлять отзыв могут только покупатели.',
    ratingRequired: 'Пожалуйста, выберите оценку.',
    saved: 'Спасибо! Ваш отзыв опубликован.',
    deleted: 'Ваш отзыв удалён.',
    error: 'Произошла ошибка. Попробуйте ещё раз.',
    deleteConfirm: 'Удалить ваш отзыв?',
    anonymous: 'Аноним',
  },
  it: {
    title: 'Recensioni',
    count: (n) => `${n} recensioni`,
    noReviews: 'Ancora nessuna recensione. Scrivi la prima!',
    writeTitle: 'Scrivi una recensione',
    editTitle: 'Modifica la mia recensione',
    placeholder: 'Condividi la tua opinione su questo spartito (facoltativo)',
    submit: 'Invia',
    update: 'Aggiorna',
    deleteBtn: 'Elimina',
    loginRequired: 'Accedi per scrivere una recensione.',
    purchaseRequired: 'Solo i clienti che hanno acquistato possono recensire.',
    ratingRequired: 'Seleziona una valutazione.',
    saved: 'Grazie! La tua recensione è stata pubblicata.',
    deleted: 'La tua recensione è stata eliminata.',
    error: 'Qualcosa è andato storto. Riprova.',
    deleteConfirm: 'Eliminare la tua recensione?',
    anonymous: 'Anonimo',
  },
  tr: {
    title: 'Değerlendirmeler',
    count: (n) => `${n} değerlendirme`,
    noReviews: 'Henüz değerlendirme yok. İlk değerlendirmeyi sen yap!',
    writeTitle: 'Değerlendirme yaz',
    editTitle: 'Değerlendirmemi düzenle',
    placeholder: 'Bu nota hakkındaki düşüncelerini paylaş (isteğe bağlı)',
    submit: 'Gönder',
    update: 'Güncelle',
    deleteBtn: 'Sil',
    loginRequired: 'Değerlendirme yazmak için giriş yapın.',
    purchaseRequired: 'Yalnızca satın alan müşteriler değerlendirme yapabilir.',
    ratingRequired: 'Lütfen bir puan seçin.',
    saved: 'Teşekkürler! Değerlendirmeniz yayınlandı.',
    deleted: 'Değerlendirmeniz silindi.',
    error: 'Bir şeyler ters gitti. Lütfen tekrar deneyin.',
    deleteConfirm: 'Değerlendirmeniz silinsin mi?',
    anonymous: 'Anonim',
  },
  uk: {
    title: 'Відгуки',
    count: (n) => `Відгуків: ${n}`,
    noReviews: 'Відгуків ще немає. Будьте першим!',
    writeTitle: 'Написати відгук',
    editTitle: 'Редагувати мій відгук',
    placeholder: 'Поділіться думкою про ці ноти (необов’язково)',
    submit: 'Надіслати',
    update: 'Оновити',
    deleteBtn: 'Видалити',
    loginRequired: 'Увійдіть, щоб залишити відгук.',
    purchaseRequired: 'Залишати відгук можуть лише покупці.',
    ratingRequired: 'Будь ласка, оберіть оцінку.',
    saved: 'Дякуємо! Ваш відгук опубліковано.',
    deleted: 'Ваш відгук видалено.',
    error: 'Сталася помилка. Спробуйте ще раз.',
    deleteConfirm: 'Видалити ваш відгук?',
    anonymous: 'Анонім',
  },
};

function normalizeLang(l: string): string {
  if (!l) return 'en';
  if (L[l]) return l;
  const lower = l.toLowerCase();
  if (lower === 'zh-cn') return 'zh-CN';
  if (lower === 'zh-tw') return 'zh-TW';
  const base = lower.split('-')[0];
  return L[base] ? base : 'en';
}

function Stars({
  value,
  onChange,
  size = 'text-base',
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <span className={`inline-flex ${onChange ? 'gap-1' : 'gap-0.5'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i
          key={n}
          onClick={onChange ? () => onChange(n) : undefined}
          className={`${n <= value ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} ${size} ${
            onChange ? 'cursor-pointer hover:scale-110 transition-transform' : ''
          }`}
          role={onChange ? 'button' : undefined}
          aria-label={onChange ? `${n} star` : undefined}
        />
      ))}
    </span>
  );
}

export default function ReviewSection({ sheetId, user }: ReviewSectionProps) {
  const { i18n } = useTranslation();
  const t = L[normalizeLang(i18n.language)] || L.en;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<{ reviewCount: number; avgRating: number }>({
    reviewCount: 0,
    avgRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const [purchased, setPurchased] = useState(false);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?sheetId=${encodeURIComponent(sheetId)}&limit=50`);
      const json = await res.json();
      if (json.success) {
        setReviews(json.reviews);
        setStats(json.stats);
      }
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    let active = true;
    if (user) {
      hasPurchasedSheet(user.id, sheetId)
        .then((ok) => active && setPurchased(ok))
        .catch(() => {});
    } else {
      setPurchased(false);
    }
    return () => {
      active = false;
    };
  }, [user, sheetId]);

  // 내 기존 리뷰가 있으면 폼 프리필
  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment ?? '');
    }
  }, [myReview]);

  const handleSubmit = async () => {
    if (rating < 1) {
      alert(t.ratingRequired);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, rating, comment }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || t.error);
        return;
      }
      alert(t.saved);
      await loadReviews();
    } catch {
      alert(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.deleteConfirm)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews?sheetId=${encodeURIComponent(sheetId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || t.error);
        return;
      }
      setRating(0);
      setComment('');
      alert(t.deleted);
      await loadReviews();
    } catch {
      alert(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t.title}</h2>
        {stats.reviewCount > 0 && (
          <div className="flex items-center gap-2">
            <Stars value={Math.round(stats.avgRating)} />
            <span className="text-sm font-semibold text-gray-700">
              {stats.avgRating.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">({t.count(stats.reviewCount)})</span>
          </div>
        )}
      </div>

      {/* 작성 폼 */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
        {!user ? (
          <p className="text-sm text-gray-500">{t.loginRequired}</p>
        ) : !purchased ? (
          <p className="text-sm text-gray-500">{t.purchaseRequired}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">
                {myReview ? t.editTitle : t.writeTitle}
              </p>
              <Stars value={rating} onChange={setRating} size="text-2xl" />
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t.placeholder}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {myReview ? t.update : t.submit}
              </button>
              {myReview && (
                <button
                  onClick={handleDelete}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-100 disabled:opacity-60 transition-colors"
                >
                  {t.deleteBtn}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 리뷰 목록 */}
      {loading ? (
        <div className="text-sm text-gray-400">…</div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500">{t.noReviews}</p>
      ) : (
        <ul className="space-y-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-gray-100 pb-5 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {r.user_name || t.anonymous}
                  </span>
                  <Stars value={r.rating} size="text-sm" />
                </div>
                <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
              </div>
              {r.comment && (
                <p className="text-sm text-gray-700 whitespace-pre-line">{r.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
