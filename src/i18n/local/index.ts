import deCommon from './de/common';
import enCommon from './en/common';
import esCommon from './es/common';
import frCommon from './fr/common';
import hiCommon from './hi/common';
import idCommon from './id/common';
import itCommon from './it/common';
import jaCommon from './ja/common';
import koCommon from './ko/common';
import ptCommon from './pt/common';
import ruCommon from './ru/common';
import thCommon from './th/common';
import trCommon from './tr/common';
import ukCommon from './uk/common';
import viCommon from './vi/common';
import zhCNCommon from './zh-CN/common';
import zhTWCommon from './zh-TW/common';

const messages: Record<string, { translation: Record<string, string> }> = {
  de: { translation: deCommon },
  en: { translation: enCommon },
  es: { translation: esCommon },
  fr: { translation: frCommon },
  hi: { translation: hiCommon },
  id: { translation: idCommon },
  it: { translation: itCommon },
  ja: { translation: jaCommon },
  ko: { translation: koCommon },
  pt: { translation: ptCommon },
  ru: { translation: ruCommon },
  th: { translation: thCommon },
  tr: { translation: trCommon },
  uk: { translation: ukCommon },
  vi: { translation: viCommon },
  'zh-CN': { translation: zhCNCommon },
  'zh-TW': { translation: zhTWCommon },
};

export default messages;
