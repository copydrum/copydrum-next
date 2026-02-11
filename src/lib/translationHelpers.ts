export type TranslationRecord = Record<string, string> | null | undefined;

const normalizeLanguageCode = (code: string) => code.trim().toLowerCase();

/**
 * Build a list of candidate language codes with graceful fallbacks.
 * Example: `zh-CN` → ["zh-CN", "zh", "en", "ko"].
 */
const buildLanguageCandidates = (lang: string): string[] => {
  const candidates: string[] = [];
  if (lang) {
    candidates.push(lang);

    const normalized = normalizeLanguageCode(lang);
    if (normalized !== lang) {
      candidates.push(normalized);
    }

    // If language has region (e.g., zh-CN), fallback to base (zh)
    if (normalized.includes('-')) {
      const baseLang = normalized.split('-')[0];
      if (!candidates.includes(baseLang)) {
        candidates.push(baseLang);
      }
    }
  }

  // Preferred global fallbacks
  if (!candidates.includes('en')) {
    candidates.push('en');
  }
  if (!candidates.includes('ko')) {
    candidates.push('ko');
  }

  return candidates;
};

export const getTranslatedText = (
  translations: TranslationRecord,
  currentLang: string,
  fallbackText: string,
): string => {
  if (!translations || Object.keys(translations).length === 0) {
    return fallbackText;
  }

  const candidates = buildLanguageCandidates(currentLang);

  for (const candidate of candidates) {
    if (candidate in translations && translations[candidate]) {
      return translations[candidate] ?? fallbackText;
    }
  }

  return fallbackText;
};

export const hasTranslations = (translations: TranslationRecord): boolean => {
  if (!translations) {
    return false;
  }

  return Object.values(translations).some((value) => !!value && value.trim().length > 0);
};































