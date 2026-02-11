import { supabase } from './supabase';

export interface FavoriteSheet {
  id: string;
  sheet_id: string;
  created_at: string;
  sheet?: {
    id: string;
    title: string;
    artist: string;
    price: number;
    thumbnail_url: string | null;
    category_id?: string | null;
    slug: string | null;
  } | null;
}

interface FavoriteRow {
  id: string;
  sheet_id: string;
  created_at: string;
  drum_sheets?: FavoriteSheet['sheet'];
}

async function getCurrentUserId(explicitUserId?: string): Promise<string | null> {
  if (explicitUserId) {
    return explicitUserId;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('현재 사용자 조회 오류:', error);
    return null;
  }

  return user?.id ?? null;
}

export async function fetchUserFavorites(userId?: string): Promise<FavoriteSheet[]> {
  const uid = await getCurrentUserId(userId);
  if (!uid) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_favorites')
    .select(
      `id,
       sheet_id,
       created_at,
       drum_sheets (
         id,
         title,
         artist,
         price,
         thumbnail_url,
         category_id,
         slug
       )`
    )
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('찜한 악보 조회 오류:', error);
    throw error;
  }

  const favorites = (data ?? []) as FavoriteRow[];

  return favorites.map((favorite) => ({
    id: favorite.id,
    sheet_id: favorite.sheet_id,
    created_at: favorite.created_at,
    sheet: favorite.drum_sheets ?? null,
  }));
}

export async function addFavorite(sheetId: string, userId?: string) {
  const uid = await getCurrentUserId(userId);
  if (!uid) {
    throw new Error('로그인이 필요합니다.');
  }

  const { error } = await supabase.from('user_favorites').insert({
    user_id: uid,
    sheet_id: sheetId,
  });

  if (error) {
    if (error.code === '23505') {
      // unique violation -> 이미 찜되어 있음
      return;
    }
    console.error('찜하기 등록 오류:', error);
    throw error;
  }
}

export async function removeFavorite(sheetId: string, userId?: string) {
  const uid = await getCurrentUserId(userId);
  if (!uid) {
    throw new Error('로그인이 필요합니다.');
  }

  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', uid)
    .eq('sheet_id', sheetId);

  if (error) {
    console.error('찜하기 삭제 오류:', error);
    throw error;
  }
}

export async function isFavorite(sheetId: string, userId?: string): Promise<boolean> {
  const uid = await getCurrentUserId(userId);
  if (!uid) {
    return false;
  }

  const { count, error } = await supabase
    .from('user_favorites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('sheet_id', sheetId);

  if (error) {
    console.error('찜하기 상태 확인 오류:', error);
    throw error;
  }

  return (count ?? 0) > 0;
}

export async function toggleFavorite(sheetId: string, userId?: string): Promise<boolean> {
  const favorite = await isFavorite(sheetId, userId);

  if (favorite) {
    await removeFavorite(sheetId, userId);
    return false;
  }

  await addFavorite(sheetId, userId);
  return true;
}
