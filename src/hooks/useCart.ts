
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useTranslation } from 'react-i18next';
import { useDialogStore } from '../stores/dialogStore';

export interface CartItem {
  id: string;
  sheet_id: string;
  title: string;
  artist: string;
  price: number;
  image?: string;
  category: string;
}

export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { showAlert, showConfirm } = useDialogStore();

  // 장바구니 아이템 로드
  const loadCartItems = async () => {
    if (!user) return;

    setLoading(true);
    try {
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
        category: item.drum_sheets.categories?.name || '기타'
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
    if (!user) {
      await showAlert(t('cart.loginRequired'));
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
    if (!user) return false;

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
    if (!user || cartItemIds.length === 0) return false;

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
    if (!user) return false;

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
  }, [user]);

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
