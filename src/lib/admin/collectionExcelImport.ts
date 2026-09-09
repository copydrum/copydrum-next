import * as XLSX from 'xlsx';
import { tryGenerateNormalizedKey } from '../utils/normalizedKey';

export type CollectionExcelInputRow = {
  title: string;
  artist: string;
  rowNumber: number;
};

export type CollectionExcelUnmatchedRow = CollectionExcelInputRow & {
  reason: string;
};

export type CollectionExcelMatchableSheet = {
  id: string;
  title: string;
  artist: string;
  price?: number | null;
  is_active?: boolean;
};

export type CollectionExcelMatchResult = {
  matched: CollectionExcelMatchableSheet[];
  unmatched: CollectionExcelUnmatchedRow[];
};

function normalizeLoose(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
}

function pickCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of Object.keys(row)) {
    const normalizedKey = key.replace(/\s+/g, '').toLowerCase();
    if (keys.some((k) => normalizedKey === k.replace(/\s+/g, '').toLowerCase())) {
      const value = row[key];
      if (value == null) return '';
      return String(value).trim();
    }
  }
  return '';
}

/** 엑셀/CSV JSON 행 → 곡명·아티스트 목록 */
export function parseCollectionExcelRows(jsonData: unknown[]): CollectionExcelInputRow[] {
  const rows: CollectionExcelInputRow[] = [];

  jsonData.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const row = raw as Record<string, unknown>;
    const title = pickCell(row, ['곡명', '제목', 'title', 'song', 'songtitle', '악보명']);
    const artist = pickCell(row, ['아티스트', '가수', 'artist', 'singer']);
    if (!title && !artist) return;
    rows.push({
      title,
      artist,
      rowNumber: index + 2, // 헤더 다음부터
    });
  });

  return rows;
}

export function matchCollectionExcelRows(
  inputs: CollectionExcelInputRow[],
  sheets: CollectionExcelMatchableSheet[],
): CollectionExcelMatchResult {
  const byNormalizedKey = new Map<string, CollectionExcelMatchableSheet[]>();
  const byTitleOnly = new Map<string, CollectionExcelMatchableSheet[]>();

  for (const sheet of sheets) {
    const key = tryGenerateNormalizedKey(sheet.artist || '', sheet.title || '');
    if (key) {
      const list = byNormalizedKey.get(key) || [];
      list.push(sheet);
      byNormalizedKey.set(key, list);
    }
    const titleKey = normalizeLoose(sheet.title || '');
    if (titleKey) {
      const list = byTitleOnly.get(titleKey) || [];
      list.push(sheet);
      byTitleOnly.set(titleKey, list);
    }
  }

  const matched: CollectionExcelMatchableSheet[] = [];
  const unmatched: CollectionExcelUnmatchedRow[] = [];
  const seenIds = new Set<string>();

  for (const input of inputs) {
    if (!input.title) {
      unmatched.push({ ...input, reason: '곡명 없음' });
      continue;
    }

    let candidates: CollectionExcelMatchableSheet[] = [];

    if (input.artist) {
      const key = tryGenerateNormalizedKey(input.artist, input.title);
      if (key) {
        candidates = byNormalizedKey.get(key) || [];
      }
      // artist+title 키 실패 시 title만으로 재시도하지 않고, 느슨한 조합 매칭
      if (candidates.length === 0) {
        const titleKey = normalizeLoose(input.title);
        const artistKey = normalizeLoose(input.artist);
        candidates = (byTitleOnly.get(titleKey) || []).filter(
          (s) => normalizeLoose(s.artist || '') === artistKey,
        );
      }
    } else {
      const titleKey = normalizeLoose(input.title);
      candidates = byTitleOnly.get(titleKey) || [];
    }

    if (candidates.length === 0) {
      unmatched.push({ ...input, reason: '사이트에 등록되지 않은 곡' });
      continue;
    }

    if (candidates.length > 1) {
      unmatched.push({
        ...input,
        reason: `동명곡 ${candidates.length}개 (아티스트 확인 필요)`,
      });
      continue;
    }

    const sheet = candidates[0];
    if (seenIds.has(sheet.id)) {
      // 엑셀 중복 — 성공으로 취급하되 한 번만 추가
      continue;
    }
    seenIds.add(sheet.id);
    matched.push(sheet);
  }

  return { matched, unmatched };
}

export function downloadCollectionExcelTemplate() {
  const sample = [
    { 곡명: 'Butter', 아티스트: 'BTS' },
    { 곡명: 'Dynamite', 아티스트: 'BTS' },
    { 곡명: 'OMG', 아티스트: 'NewJeans' },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '모음집곡목록');
  XLSX.writeFile(wb, '악보모음집_곡목록_샘플.xlsx');
}

export function downloadUnmatchedCollectionRows(unmatched: CollectionExcelUnmatchedRow[]) {
  const rows = unmatched.map((row) => ({
    곡명: row.title,
    아티스트: row.artist,
    실패사유: row.reason,
    엑셀행: row.rowNumber,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '미등록곡');
  XLSX.writeFile(wb, `악보모음집_미등록곡_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function readCollectionExcelFile(file: File): Promise<CollectionExcelInputRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);
  return parseCollectionExcelRows(jsonData);
}
