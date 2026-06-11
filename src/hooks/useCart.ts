
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from 'react-i18next';
import { useDialogStore } from '../stores/dialogStore';
import { useGuestCartStore } from '../stores/guestCartStore';

export interface CartItem {
  id: string;
  sheet_id: string;
  title: string;
  artist: string;
  price: number;
  image?: string;
  category: string;
  sales_type?: 'INSTANT' | 'PREORDER';
}

// useCart 는 여러 컴포넌트(헤더/하단바/사이드바/장바구니)에서 동시에 마운트되므로,
// 로그인 시 게스트 장바구니 병합이 동시에 여러 번 실행되지 않도록 모듈 단위로 1회만 수행한다.
const guestMergeInFlight = new Map<string, Promise<void>>();

export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { showAlert, showConfirm } = useDialogStore();
  // 비회원 장바구니(localStorage). ids 가 바뀌면 목록을 다시 로드한다.
  const guestIds = useGuestCartStore((s) => s.ids);

  // 비회원 장바구니 로드: localStorage 의 id 로 DB 에서 상세 정보를 조회
  const loadGuestCartItems = async () => {
    if (guestIds.length === 0) {
      setCartItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('drum_sheets')
        .select(`
          id,
          title,
          artist,
          price,
          thumbnail_url,
          sales_type,
          categories (
            name
          )
        `)
        .in('id', guestIds);

      if (error) throw error;

      // localStorage 에 담은 순서를 유지
      const byId = new Map((data || []).map((row: any) => [row.id, row]));
      const items: CartItem[] = guestIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((row: any) => ({
          id: row.id, // 비회원은 cart row 가 없으므로 sheet id 를 식별자로 사용
          sheet_id: row.id,
          title: row.title,
          artist: row.artist,
          price: row.price,
          image: row.thumbnail_url,
          category: row.categories?.name || '기타',
          sales_type: row.sales_type || 'INSTANT',
        }));

      setCartItems(items);
    } catch (error) {
      console.error('게스트 장바구니 로드 실패:', error);
      setCartItems([]);
    } finally {
      setLoading(false);
    }
  };

  // 로그인 시점에 비회원 장바구니(localStorage)를 DB 로 병합한다(중복 제외).
  // 결제 외의 경로(일반 로그인 등)로 로그인해도 담아둔 항목이 사라지지 않도록 하는 안전장치.
  const mergeGuestCartIntoDb = async (userId: string): Promise<void> => {
    const guestCart = useGuestCartStore.getState();
    const ids = guestCart.ids;
    if (ids.length === 0) return;

    // 동시에 마운트된 다른 useCart 인스턴스가 이미 병합 중이면 그 작업을 기다린다.
    const existingMerge = guestMergeInFlight.get(userId);
    if (existingMerge) return existingMerge;

    const run = (async () => {
      try {
        const { data: existing } = await supabase
          .from('cart_items')
          .select('sheet_id')
          .eq('user_id', userId);
        const existingIds = new Set((existing || []).map((r: any) => r.sheet_id));
        const toInsert = ids
          .filter((id) => !existingIds.has(id))
          .map((id) => ({ user_id: userId, sheet_id: id }));
        if (toInsert.length > 0) {
          await supabase.from('cart_items').insert(toInsert);
        }
      } catch (error) {
        console.error('게스트 장바구니 병합 실패:', error);
      } finally {
        // 성공/실패와 무관하게 비워 중복 병합 시도를 막는다.
        guestCart.clear();
        guestMergeInFlight.delete(userId);
      }
    })();

    guestMergeInFlight.set(userId, run);
    return run;
  };

  // 장바구니 아이템 로드
  const loadCartItems = async () => {
    if (!user) {
      await loadGuestCartItems();
      return;
    }

    setLoading(true);
    try {
      // 비회원으로 담아둔 항목이 있으면 먼저 DB 로 병합
      await mergeGuestCartIntoDb(user.id);

      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          id,
          sheet_id,
          created_at,
          drum_sheets (
            id,
            title,
            artist,
            price,
            thumbnail_url,
            category_id,
            sales_type,
            categories (
              name
            )
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const items = data?.map(item => ({
        id: item.id,
        sheet_id: item.sheet_id,
        title: item.drum_sheets.title,
        artist: item.drum_sheets.artist,
        price: item.drum_sheets.price,
        image: item.drum_sheets.thumbnail_url,
        category: item.drum_sheets.categories?.name || '기타',
        sales_type: item.drum_sheets.sales_type || 'INSTANT'
      })) || [];

      setCartItems(items);
    } catch (error) {
      console.error('장바구니 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 장바구니에 아이템 추가
  const addToCart = async (sheetId: string) => {
    // 비회원: localStorage 게스트 장바구니에 담는다(로그인 불필요)
    if (!user) {
      const guestCart = useGuestCartStore.getState();
      if (guestCart.has(sheetId)) {
        await showAlert(t('cart.alreadyInCart'));
        return;
      }
      guestCart.add(sheetId);
      const goToCart = await showConfirm(t('cart.addedConfirm'));
      if (goToCart) {
        const locale = i18n.language || 'ko';
        window.location.href = `/${locale}/cart`;
      }
      return;
    }

    try {
      // 1. 현재 장바구니 아이템 조회
      const { data: existingItems, error: fetchError } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('sheet_id', sheetId);

      if (fetchError) throw fetchError;

      // 2. 이미 장바구니에 있는지 확인
      if (existingItems && existingItems.length > 0) {
        await showAlert(t('cart.alreadyInCart'));
        return;
      }

      // 3. 장바구니에 추가
      const { error: insertError } = await supabase
        .from('cart_items')
        .insert([
          {
            user_id: user.id,
            sheet_id: sheetId,
          },
        ]);

      if (insertError) throw insertError;

      // 4. 커스텀 확인 다이얼로그 (번역된 버튼 표시)
      const goToCart = await showConfirm(t('cart.addedConfirm'));
      if (goToCart) {
        const locale = i18n.language || 'ko';
        window.location.href = `/${locale}/cart`;
      }
    } catch (error) {
      console.error('장바구니 추가 실패:', error);
      await showAlert(t('cart.addFailed'));
    }
  };

  // 장바구니에서 아이템 제거
  const removeFromCart = async (cartItemId: string) => {
    if (!user) {
      // 비회원은 cartItemId == sheet_id
      useGuestCartStore.getState().remove(cartItemId);
      return true;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', cartItemId)
        .eq('user_id', user.id);

      if (error) throw error;

      await loadCartItems();
      return true;
    } catch (error) {
      console.error('장바구니 제거 실패:', error);
      return false;
    }
  };

  // 선택된 아이템들 제거
  const removeSelectedItems = async (cartItemIds: string[]) => {
    if (cartItemIds.length === 0) return false;
    if (!user) {
      useGuestCartStore.getState().removeMany(cartItemIds);
      return true;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .in('id', cartItemIds)
        .eq('user_id', user.id);

      if (error) throw error;

      await loadCartItems();
      return true;
    } catch (error) {
      console.error('선택 아이템 제거 실패:', error);
      return false;
    }
  };

  // 장바구니 전체 비우기
  const clearCart = async () => {
    if (!user) {
      useGuestCartStore.getState().clear();
      setCartItems([]);
      return true;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setCartItems([]);
      return true;
    } catch (error) {
      console.error('장바구니 비우기 실패:', error);
      return false;
    }
  };

  // 장바구니에 있는지 확인
  const isInCart = (sheetId: string) => {
    return cartItems.some(item => item.sheet_id === sheetId);
  };

  // 총 가격 계산
  const getTotalPrice = (selectedItems?: string[]) => {
    const items = selectedItems
      ? cartItems.filter(item => selectedItems.includes(item.id))
      : cartItems;
    return items.reduce((total, item) => total + item.price, 0);
  };

  useEffect(() => {
    loadCartItems();
    // user 가 바뀌거나(로그인/로그아웃) 비회원 장바구니(guestIds)가 바뀌면 다시 로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, guestIds]);

  return {
    cartItems,
    loading,
    addToCart,
    removeFromCart,
    removeSelectedItems,
    clearCart,
    isInCart,
    getTotalPrice,
    loadCartItems
  };
};
