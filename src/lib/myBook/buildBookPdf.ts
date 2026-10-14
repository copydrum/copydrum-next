import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFRef,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { calculateBookLayout, splitTocRows } from './bookLayout';

/**
 * 나만의 악보집 PDF 생성 (서버·브라우저 공용, 네트워크 접근 없음).
 * 곡 PDF 원본 페이지를 그대로 복사하므로 악보 화질은 원본과 같다.
 */

export interface BookFonts {
  regular: Uint8Array | ArrayBuffer;
  bold: Uint8Array | ArrayBuffer;
  extraBold: Uint8Array | ArrayBuffer;
}

export type BookCoverKind = 'jpg' | 'png' | 'pdf';

export interface BuildBookInput {
  title: string;
  buyerName: string;
  createdAt: Date;
  songs: { title: string; artist: string | null; pdf: Uint8Array | ArrayBuffer }[];
  cover: { bytes: Uint8Array | ArrayBuffer; kind: BookCoverKind } | null;
  fonts: BookFonts;
  pageNumbers?: boolean;
}

export interface BuildBookResult {
  bytes: Uint8Array;
  pageCount: number;
  /** 고객 표지를 쓰지 못해 기본 표지로 대신한 경우 등 */
  warnings: string[];
}

export class BookSongLoadError extends Error {
  constructor(
    public readonly songIndex: number,
    public readonly songTitle: string,
    cause: unknown
  ) {
    super(`${songIndex + 1}번 곡 "${songTitle}" PDF 를 읽을 수 없습니다: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'BookSongLoadError';
  }
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN_X = 56;

const COLOR = {
  ink: rgb(0.11, 0.11, 0.16),
  muted: rgb(0.45, 0.46, 0.52),
  faint: rgb(0.78, 0.79, 0.84),
  accent: rgb(0.31, 0.27, 0.9),
  white: rgb(1, 1, 1),
};

/** 표지 그라데이션 (위 → 아래) */
const GRADIENT_STOPS: [number, RGB][] = [
  [0, rgb(0.15, 0.39, 0.92)],
  [0.55, rgb(0.43, 0.25, 0.9)],
  [1, rgb(0.71, 0.2, 0.75)],
];

type FontSet = { regular: PDFFont; bold: PDFFont; extraBold: PDFFont };

/** 폰트에 없는 글자(일본어 가나 등)를 지워 PDF 가 깨지지 않게 한다 */
function createSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) => {
    let out = '';
    for (const ch of text.normalize('NFC')) {
      const code = ch.codePointAt(0) ?? 0;
      if (ch === '\n' || ch === '\t') {
        out += ' ';
      } else if (supported.has(code)) {
        out += ch;
      }
    }
    return out.replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  const pushWord = (word: string) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = '';
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }
    // 띄어쓰기 없이 긴 단어는 글자 단위로 나눈다
    let chunk = '';
    for (const ch of word) {
      if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  };
  text.split(' ').filter(Boolean).forEach(pushWord);
  if (current) lines.push(current);
  return lines;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && font.widthOfTextAtSize(`${chars.join('')}…`, size) > maxWidth) {
    chars.pop();
  }
  return `${chars.join('').trimEnd()}…`;
}

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - width) / 2, y, size, font, color });
}

function drawSpaced(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, spacing: number) {
  const chars = Array.from(text);
  const total =
    chars.reduce((sum, ch) => sum + font.widthOfTextAtSize(ch, size), 0) + spacing * (chars.length - 1);
  let x = (page.getWidth() - total) / 2;
  for (const ch of chars) {
    page.drawText(ch, { x, y, size, font, color });
    x += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
}

function gradientAt(t: number): RGB {
  for (let i = 1; i < GRADIENT_STOPS.length; i += 1) {
    const [pos, color] = GRADIENT_STOPS[i];
    const [prevPos, prevColor] = GRADIENT_STOPS[i - 1];
    if (t <= pos) return lerpColor(prevColor, color, (t - prevPos) / (pos - prevPos));
  }
  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1][1];
}

function drawAutoCover(page: PDFPage, fonts: FontSet, clean: (s: string) => string, title: string, songCount: number) {
  const { width, height } = page.getSize();
  const strips = 140;
  const stripHeight = height / strips;
  for (let i = 0; i < strips; i += 1) {
    page.drawRectangle({
      x: 0,
      y: height - (i + 1) * stripHeight,
      width,
      height: stripHeight + 2,
      color: gradientAt(i / (strips - 1)),
    });
  }

  // 장식 원 (드럼 헤드 느낌)
  page.drawCircle({ x: width * 0.86, y: height * 0.84, size: 170, borderColor: COLOR.white, borderWidth: 1.2, borderOpacity: 0.22 });
  page.drawCircle({ x: width * 0.86, y: height * 0.84, size: 120, color: COLOR.white, opacity: 0.06 });
  page.drawCircle({ x: width * 0.08, y: height * 0.12, size: 210, color: COLOR.white, opacity: 0.05 });
  page.drawCircle({ x: width * 0.08, y: height * 0.12, size: 150, borderColor: COLOR.white, borderWidth: 1, borderOpacity: 0.18 });

  drawSpaced(page, 'MY DRUM BOOK', height * 0.66, fonts.bold, 11, COLOR.white, 4);
  page.drawLine({
    start: { x: width / 2 - 24, y: height * 0.66 - 14 },
    end: { x: width / 2 + 24, y: height * 0.66 - 14 },
    thickness: 1.2,
    color: COLOR.white,
    opacity: 0.7,
  });

  const safeTitle = clean(title) || '나만의 악보집';
  let size = 40;
  let lines = wrapText(safeTitle, fonts.extraBold, size, width - MARGIN_X * 2);
  while (lines.length > 4 && size > 22) {
    size -= 2;
    lines = wrapText(safeTitle, fonts.extraBold, size, width - MARGIN_X * 2);
  }
  const lineHeight = size * 1.3;
  const blockTop = height * 0.56;
  lines.slice(0, 5).forEach((line, i) => {
    drawCentered(page, line, blockTop - i * lineHeight, fonts.extraBold, size, COLOR.white);
  });

  const subtitleY = blockTop - Math.min(lines.length, 5) * lineHeight - 18;
  drawCentered(page, `드럼 악보집 · ${songCount}곡`, subtitleY, fonts.bold, 15, COLOR.white);

  drawSpaced(page, 'COPYDRUM', 70, fonts.extraBold, 16, COLOR.white, 3);
  drawCentered(page, 'copydrum.com', 50, fonts.regular, 9, COLOR.white);
}

async function drawCustomCover(
  doc: PDFDocument,
  page: PDFPage,
  cover: NonNullable<BuildBookInput['cover']>
) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: COLOR.white });

  let contentWidth: number;
  let contentHeight: number;
  let draw: (x: number, y: number, w: number, h: number) => void;

  if (cover.kind === 'pdf') {
    const source = await PDFDocument.load(cover.bytes, { ignoreEncryption: true });
    if (source.getPageCount() === 0) throw new Error('표지 PDF 에 페이지가 없습니다');
    const embedded = await doc.embedPage(source.getPage(0));
    contentWidth = embedded.width;
    contentHeight = embedded.height;
    draw = (x, y, w, h) => page.drawPage(embedded, { x, y, width: w, height: h });
  } else {
    const image = cover.kind === 'png' ? await doc.embedPng(cover.bytes) : await doc.embedJpg(cover.bytes);
    contentWidth = image.width;
    contentHeight = image.height;
    draw = (x, y, w, h) => page.drawImage(image, { x, y, width: w, height: h });
  }

  const pageRatio = width / height;
  const contentRatio = contentWidth / contentHeight;
  // A4 비율에 가까우면 꽉 채우고(약간 잘림), 많이 다르면 잘리지 않게 전체를 보여준다
  const fill = Math.abs(contentRatio - pageRatio) / pageRatio < 0.08;
  const scale = fill
    ? Math.max(width / contentWidth, height / contentHeight)
    : Math.min(width / contentWidth, height / contentHeight);
  const w = contentWidth * scale;
  const h = contentHeight * scale;
  draw((width - w) / 2, (height - h) / 2, w, h);
}

function formatKoreanDate(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function drawInnerTitle(
  page: PDFPage,
  fonts: FontSet,
  clean: (s: string) => string,
  input: BuildBookInput,
  totalPages: number
) {
  const { width, height } = page.getSize();
  drawSpaced(page, 'MY DRUM BOOK', height - 190, fonts.bold, 10, COLOR.accent, 4);

  const title = clean(input.title) || '나만의 악보집';
  const lines = wrapText(title, fonts.extraBold, 26, width - MARGIN_X * 2).slice(0, 4);
  lines.forEach((line, i) => drawCentered(page, line, height - 240 - i * 36, fonts.extraBold, 26, COLOR.ink));

  const afterTitle = height - 240 - lines.length * 36 - 10;
  page.drawLine({
    start: { x: width / 2 - 30, y: afterTitle },
    end: { x: width / 2 + 30, y: afterTitle },
    thickness: 1,
    color: COLOR.faint,
  });

  const buyer = clean(input.buyerName);
  if (buyer) {
    drawCentered(page, `${buyer} 님을 위한 악보집`, afterTitle - 40, fonts.bold, 14, COLOR.ink);
  }
  drawCentered(
    page,
    `총 ${input.songs.length}곡 · ${totalPages}페이지`,
    afterTitle - 66,
    fonts.regular,
    11,
    COLOR.muted
  );
  drawCentered(page, `${formatKoreanDate(input.createdAt)} 제작`, afterTitle - 86, fonts.regular, 11, COLOR.muted);

  drawCentered(
    page,
    '이 악보집은 구매자 개인 연습용입니다. 무단 복제·공유·재판매를 금합니다.',
    92,
    fonts.regular,
    8.5,
    COLOR.muted
  );
  drawSpaced(page, 'COPYDRUM', 62, fonts.extraBold, 12, COLOR.accent, 3);
  drawCentered(page, 'copydrum.com', 46, fonts.regular, 8.5, COLOR.muted);
}

function addLink(doc: PDFDocument, page: PDFPage, rect: [number, number, number, number], target: PDFRef) {
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: rect,
    Border: [0, 0, 0],
    Dest: [target, PDFName.of('Fit')],
  });
  page.node.addAnnot(doc.context.register(annot));
}

function drawToc(
  doc: PDFDocument,
  tocPages: PDFPage[],
  fonts: FontSet,
  clean: (s: string) => string,
  songs: BuildBookInput['songs'],
  startPages: number[],
  songPageRefs: PDFRef[]
) {
  const rowsByPage = splitTocRows(songs.length);
  const rowHeight = 25;
  const numberX = MARGIN_X;
  const titleX = MARGIN_X + 34;
  const pageNumRight = A4.width - MARGIN_X;

  rowsByPage.forEach((rows, pageIndex) => {
    const page = tocPages[pageIndex];
    let y: number;
    if (pageIndex === 0) {
      page.drawText('목차', { x: MARGIN_X, y: A4.height - 96, size: 26, font: fonts.extraBold, color: COLOR.ink });
      page.drawText('CONTENTS', {
        x: MARGIN_X + fonts.extraBold.widthOfTextAtSize('목차', 26) + 12,
        y: A4.height - 92,
        size: 10,
        font: fonts.bold,
        color: COLOR.accent,
      });
      page.drawLine({
        start: { x: MARGIN_X, y: A4.height - 116 },
        end: { x: A4.width - MARGIN_X, y: A4.height - 116 },
        thickness: 1.2,
        color: COLOR.ink,
      });
      y = A4.height - 146;
    } else {
      y = A4.height - 76;
    }

    rows.forEach((songIndex) => {
      const song = songs[songIndex];
      const pageLabel = String(startPages[songIndex]);
      const pageLabelWidth = fonts.bold.widthOfTextAtSize(pageLabel, 11);
      page.drawText(String(songIndex + 1).padStart(2, '0'), {
        x: numberX,
        y,
        size: 10,
        font: fonts.bold,
        color: COLOR.accent,
      });

      const available = pageNumRight - pageLabelWidth - 16 - titleX;
      const title = clean(song.title) || `${songIndex + 1}번 곡`;
      const artist = song.artist ? clean(song.artist) : '';
      const titleText = truncate(title, fonts.bold, 11, available * (artist ? 0.72 : 1));
      page.drawText(titleText, { x: titleX, y, size: 11, font: fonts.bold, color: COLOR.ink });
      let textEnd = titleX + fonts.bold.widthOfTextAtSize(titleText, 11);
      if (artist) {
        const artistText = truncate(artist, fonts.regular, 9, available - (textEnd - titleX) - 8);
        if (artistText !== '…') {
          page.drawText(artistText, { x: textEnd + 8, y: y + 0.5, size: 9, font: fonts.regular, color: COLOR.muted });
          textEnd += 8 + fonts.regular.widthOfTextAtSize(artistText, 9);
        }
      }

      const leaderEnd = pageNumRight - pageLabelWidth - 8;
      for (let x = textEnd + 8; x < leaderEnd; x += 4) {
        page.drawCircle({ x, y: y + 3, size: 0.5, color: COLOR.faint });
      }
      page.drawText(pageLabel, {
        x: pageNumRight - pageLabelWidth,
        y,
        size: 11,
        font: fonts.bold,
        color: COLOR.ink,
      });

      addLink(doc, page, [numberX - 4, y - 7, pageNumRight + 2, y + 15], songPageRefs[songIndex]);
      y -= rowHeight;
    });
  });
}

/** PDF 책갈피 (뷰어·태블릿 악보 앱에서 곡 바로가기) */
function addOutline(doc: PDFDocument, entries: { title: string; ref: PDFRef }[]) {
  if (entries.length === 0) return;
  const outlineRef = doc.context.nextRef();
  const itemRefs = entries.map(() => doc.context.nextRef());
  entries.forEach((entry, i) => {
    const item = doc.context.obj({
      Title: PDFHexString.fromText(entry.title),
      Parent: outlineRef,
      Dest: [entry.ref, PDFName.of('Fit')],
    });
    if (i > 0) item.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < entries.length - 1) item.set(PDFName.of('Next'), itemRefs[i + 1]);
    doc.context.assign(itemRefs[i], item);
  });
  const outline = doc.context.obj({
    Type: 'Outlines',
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: PDFNumber.of(entries.length),
  });
  doc.context.assign(outlineRef, outline);
  doc.catalog.set(PDFName.of('Outlines'), outlineRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

export async function buildBookPdf(input: BuildBookInput): Promise<BuildBookResult> {
  const warnings: string[] = [];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // @pdf-lib/fontkit 1.1.1의 서브셋 기능은 나눔고딕 글리프 일부를 누락시켜 전체 임베드한다 (압축 후 폰트당 약 0.7MB).
  const subset = false;
  const fonts: FontSet = {
    regular: await doc.embedFont(input.fonts.regular, { subset }),
    bold: await doc.embedFont(input.fonts.bold, { subset }),
    extraBold: await doc.embedFont(input.fonts.extraBold, { subset }),
  };
  const clean = createSanitizer(fonts.regular);

  // 곡 PDF 를 먼저 읽어 실제 페이지 수로 목차를 계산한다
  const sources: PDFDocument[] = [];
  for (let i = 0; i < input.songs.length; i += 1) {
    try {
      const source = await PDFDocument.load(input.songs[i].pdf, { ignoreEncryption: true });
      if (source.getPageCount() === 0) throw new Error('페이지가 없습니다');
      sources.push(source);
    } catch (error) {
      throw new BookSongLoadError(i, input.songs[i].title, error);
    }
  }
  const layout = calculateBookLayout(sources.map((source) => ({ pageCount: source.getPageCount() })));

  // 1) 표지
  const coverPage = doc.addPage([A4.width, A4.height]);
  let customCoverDrawn = false;
  if (input.cover) {
    try {
      await drawCustomCover(doc, coverPage, input.cover);
      customCoverDrawn = true;
    } catch (error) {
      warnings.push(`고객 표지를 읽을 수 없어 기본 표지로 만들었습니다 (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  if (!customCoverDrawn) {
    drawAutoCover(coverPage, fonts, clean, input.title, input.songs.length);
  }

  // 2) 안쪽 표지
  const innerPage = doc.addPage([A4.width, A4.height]);
  drawInnerTitle(innerPage, fonts, clean, input, layout.totalPages);

  // 3) 목차 (곡 페이지 참조가 필요하므로 자리만 먼저 만든다)
  const tocPages = Array.from({ length: layout.tocPageCount }, () => doc.addPage([A4.width, A4.height]));

  // 4) 곡 페이지
  const songFirstPageRefs: PDFRef[] = [];
  for (const source of sources) {
    const copied = await doc.copyPages(source, source.getPageIndices());
    copied.forEach((page, i) => {
      doc.addPage(page);
      if (i === 0) songFirstPageRefs.push(page.ref);
    });
  }

  drawToc(doc, tocPages, fonts, clean, input.songs, layout.songStartPages, songFirstPageRefs);

  // 5) 페이지 번호 (표지·안쪽 표지 제외, PDF 뷰어 페이지 번호와 같게)
  if (input.pageNumbers !== false) {
    doc.getPages().forEach((page, index) => {
      if (index < 2) return;
      if (page.getRotation().angle % 360 !== 0) return;
      const label = String(index + 1);
      const size = 8;
      const box = page.getCropBox();
      const labelWidth = fonts.regular.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: box.x + (box.width - labelWidth) / 2,
        y: box.y + 12,
        size,
        font: fonts.regular,
        color: COLOR.muted,
      });
    });
  }

  addOutline(doc, [
    { title: '목차', ref: tocPages[0].ref },
    ...input.songs.map((song, i) => ({
      title: `${String(i + 1).padStart(2, '0')}. ${song.title}${song.artist ? ` - ${song.artist}` : ''}`,
      ref: songFirstPageRefs[i],
    })),
  ]);

  const bookTitle = clean(input.title) || '나만의 악보집';
  doc.setTitle(bookTitle, { showInWindowTitleBar: true });
  doc.setAuthor('COPYDRUM');
  doc.setSubject(`${clean(input.buyerName)} 님을 위한 드럼 악보집 (${input.songs.length}곡)`);
  doc.setCreator('COPYDRUM 나만의 악보집');
  doc.setProducer('COPYDRUM');
  doc.setLanguage('ko-KR');
  doc.setCreationDate(input.createdAt);
  doc.setModificationDate(input.createdAt);

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, pageCount: doc.getPageCount(), warnings };
}

/** 다운로드 파일 이름: 윈도우·맥에서 쓸 수 없는 글자 제거 */
export function getMyBookFileName(title: string) {
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${safe || '나만의 악보집'}_카피드럼 악보집.pdf`;
}
