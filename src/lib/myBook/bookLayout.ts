/** 첫 목차 페이지는 제목 영역이 있어서 줄 수가 적다 */
export const TOC_ROWS_FIRST_PAGE = 22;
export const TOC_ROWS_NEXT_PAGE = 28;

/** 표지 1장 + 안쪽 표지 1장 */
export const FRONT_MATTER_PAGES = 2;

export interface BookLayoutSong {
  /** 곡 PDF 의 실제 페이지 수 */
  pageCount: number;
}

export interface BookLayout {
  tocPageCount: number;
  /** 목차 첫 페이지 (1부터 시작하는 전체 PDF 기준 번호) */
  tocStartPage: number;
  /** 곡별 시작 페이지 (1부터 시작하는 전체 PDF 기준 번호). PDF 뷰어의 페이지 번호와 같다 */
  songStartPages: number[];
  totalPages: number;
}

export function getTocPageCount(songCount: number): number {
  if (songCount <= TOC_ROWS_FIRST_PAGE) return 1;
  return 1 + Math.ceil((songCount - TOC_ROWS_FIRST_PAGE) / TOC_ROWS_NEXT_PAGE);
}

/** 목차 페이지별로 곡 인덱스를 나눈다 */
export function splitTocRows(songCount: number): number[][] {
  const pages: number[][] = [];
  let index = 0;
  let capacity = TOC_ROWS_FIRST_PAGE;
  while (index < songCount) {
    const rows: number[] = [];
    for (let i = 0; i < capacity && index < songCount; i += 1) {
      rows.push(index);
      index += 1;
    }
    pages.push(rows);
    capacity = TOC_ROWS_NEXT_PAGE;
  }
  return pages.length > 0 ? pages : [[]];
}

export function calculateBookLayout(songs: BookLayoutSong[]): BookLayout {
  const tocPageCount = getTocPageCount(songs.length);
  const tocStartPage = FRONT_MATTER_PAGES + 1;
  let nextPage = FRONT_MATTER_PAGES + tocPageCount + 1;
  const songStartPages = songs.map((song) => {
    const start = nextPage;
    nextPage += Math.max(1, Math.floor(song.pageCount));
    return start;
  });
  return {
    tocPageCount,
    tocStartPage,
    songStartPages,
    totalPages: nextPage - 1,
  };
}
