/**
 * 블로그/SNS 홍보글 생성기.
 *
 * 관리자 페이지의 복사 버튼과 로컬 자동 포스팅 CLI(tools/blog-autopost)가 함께 쓰는 모듈이라
 * 브라우저와 Node 양쪽에서 동작해야 한다. 외부 import 없이 순수 TypeScript로만 작성한다.
 */

export type MarketingPlatform = 'naver' | 'tistory' | 'google' | 'facebook' | 'pinterest';

export interface MarketingSheet {
  id: string;
  title: string;
  artist: string;
  slug?: string | null;
  preview_image_url?: string | null;
  youtube_url?: string | null;
  page_count?: number | null;
  tempo?: number | null;
  difficulty?: string | null;
  /** {"ko":"...","en":"..."} 형태의 JSON 문자열 */
  description?: string | null;
  categories?: { name?: string | null } | null;
}

export type PostBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'cta'; url: string; label: string };

export interface GeneratedPost {
  title: string;
  /** 티스토리 HTML 모드 / 구글 블로거 API 용 본문 */
  html: string;
  /** 네이버 스마트에디터처럼 HTML을 못 넣는 곳과 핀터레스트 설명용 */
  text: string;
  /** 에디터를 순서대로 조작해야 하는 자동화용 구조 표현 */
  blocks: PostBlock[];
  tags: string[];
  productUrl: string;
}

export const SITE_URL = 'https://www.copydrum.com';

const KOREAN_PLATFORMS: readonly MarketingPlatform[] = ['naver', 'tistory'];

/** 플랫폼별 상품 링크 locale */
function localeFor(platform: MarketingPlatform): 'ko' | 'en' {
  return KOREAN_PLATFORMS.includes(platform) ? 'ko' : 'en';
}

export function buildProductUrl(sheet: MarketingSheet, platform: MarketingPlatform): string {
  // slug가 없어도 상세 라우트가 UUID를 받아 slug로 리다이렉트해준다.
  const key = sheet.slug || sheet.id;
  return `${SITE_URL}/${localeFor(platform)}/drum-sheet/${key}`;
}

// ── 시드 기반 문구 선택 ────────────────────────────────────────────────
// 같은 악보/플랫폼 조합이면 항상 같은 글이 나오고(재현 가능),
// 플랫폼이 다르면 다른 문장이 뽑히도록 해 블로그 간 본문 중복을 피한다.

function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(pool: readonly T[], seed: number, salt: number): T {
  const mixed = (Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) % pool.length;
  return pool[mixed];
}

// ── 문구 풀 ───────────────────────────────────────────────────────────
// 플랫폼마다 완전히 다른 풀을 써서 네이버와 티스토리가 같은 문장을 쓰지 않게 한다.

interface Pools {
  intro: readonly string[];
  lead: readonly string[];
  about: readonly string[];
  download: readonly string[];
  cta: readonly string[];
  outro: readonly string[];
  specLabels: { genre: string; difficulty: string; tempo: string; pages: string; heading: string };
  previewCaption: string;
  videoLabel: string;
}

const NAVER_POOLS: Pools = {
  intro: [
    '안녕하세요, 드럼 악보 전문 카피드럼입니다.',
    '드럼 치는 분들을 위한 악보 소개, 카피드럼입니다.',
    '오늘도 새로운 드럼 악보를 들고 왔습니다. 카피드럼입니다.',
    '반갑습니다. 드럼 악보를 만드는 카피드럼입니다.',
    '연습할 곡 찾고 계신가요? 카피드럼입니다.',
    '드럼 악보 카피 전문, 카피드럼 인사드립니다.',
  ],
  lead: [
    '이번에 소개해드릴 곡은 {{artist}}의 {{title}}입니다.',
    '오늘의 악보는 {{artist}} - {{title}}입니다.',
    '{{artist}}의 {{title}} 드럼 악보를 새로 올렸습니다.',
    '요청이 많았던 {{artist}}의 {{title}}, 드럼 악보로 준비했습니다.',
    '{{title}}, {{artist}}의 곡을 드럼 악보로 옮겨봤습니다.',
    '이번 악보는 {{artist}}의 {{title}}입니다.',
  ],
  about: [
    '실제 음원을 하나하나 들으면서 채보했기 때문에 원곡의 리듬과 필인을 그대로 따라가실 수 있습니다.',
    '원곡을 반복해서 들으며 채보한 악보라 실제 연주 흐름과 어긋나는 부분 없이 연습하실 수 있습니다.',
    '음원 기준으로 정확하게 채보해서, 킥과 스네어 타이밍은 물론 필인 디테일까지 담았습니다.',
    '드럼 파트만 따로 들으며 작업한 악보라 곡의 구성과 필인이 정확하게 표기되어 있습니다.',
    '악보를 보면서 원곡을 틀어놓고 바로 따라 칠 수 있도록 마디 구성을 정리했습니다.',
  ],
  download: [
    '아래 미리보기는 1페이지입니다. 전체 악보는 카피드럼에서 PDF로 바로 다운로드하실 수 있습니다.',
    '미리보기로 1페이지를 올려두었습니다. 전체 페이지는 카피드럼에서 PDF 파일로 받아보실 수 있어요.',
    '1페이지 미리보기를 첨부했습니다. 카피드럼에 오시면 전체 악보를 PDF로 내려받으실 수 있습니다.',
    '먼저 1페이지를 미리 보여드립니다. 나머지 페이지는 카피드럼에서 PDF로 다운로드 가능합니다.',
    '아래 이미지가 악보 1페이지입니다. 전곡 악보는 카피드럼에서 PDF로 받아보세요.',
  ],
  cta: [
    '악보 보러가기',
    '전체 악보 다운로드',
    '카피드럼에서 악보 받기',
    '이 악보 다운로드하기',
    '악보 자세히 보기',
  ],
  outro: [
    '결제하시면 바로 다운로드되고, 필요할 때 다시 받으실 수 있습니다. 즐거운 연습 되세요.',
    '구매 후 바로 내려받을 수 있습니다. 오늘도 신나는 드럼 연습 되시길 바랍니다.',
    '원하시는 곡이 없다면 사이트에서 악보 제작 요청도 가능합니다. 편하게 문의해주세요.',
    '카피드럼에는 이 곡 말고도 다양한 장르의 드럼 악보가 준비되어 있습니다. 둘러보고 가세요.',
    '연습에 도움이 되었으면 좋겠습니다. 다음 악보로 또 찾아뵙겠습니다.',
  ],
  specLabels: { heading: '악보 정보', genre: '장르', difficulty: '난이도', tempo: '템포', pages: '페이지' },
  previewCaption: '드럼 악보 미리보기 1페이지',
  videoLabel: '원곡 영상',
};

const TISTORY_POOLS: Pools = {
  intro: [
    '드럼 악보 제작소 카피드럼(CopyDrum)입니다.',
    '정확한 채보를 지향하는 카피드럼입니다.',
    '드러머를 위한 악보 아카이브, 카피드럼입니다.',
    '카피드럼에서 새 드럼 악보 소식 전해드립니다.',
    '드럼 악보가 필요한 분들을 위한 카피드럼입니다.',
    '오늘의 신규 채보를 공유합니다. 카피드럼입니다.',
  ],
  lead: [
    '{{artist}} - {{title}} 드럼 악보가 등록되었습니다.',
    '이번 채보 곡은 {{artist}}의 {{title}}입니다.',
    '{{title}}({{artist}}) 드럼 악보를 정리해 올립니다.',
    '신규 등록 악보는 {{artist}}의 {{title}}입니다.',
    '{{artist}}의 대표곡 {{title}}을 드럼 악보로 준비했습니다.',
    '오늘 공개하는 악보는 {{artist}} - {{title}}입니다.',
  ],
  about: [
    '원본 음원을 기준으로 마디별로 채보해, 그루브와 필인을 실제 연주와 동일하게 표기했습니다.',
    '패턴 변화와 필인 위치를 정확히 옮겨 적어, 곡 전체 구성을 파악하기 좋게 만들었습니다.',
    '곡의 인트로부터 아웃트로까지 구간을 나눠 표기해 어디서 무엇이 바뀌는지 바로 보입니다.',
    '드럼 트랙을 집중해서 분석한 뒤 채보했기 때문에 세부 뉘앙스까지 악보에 반영되어 있습니다.',
    '연습 효율을 위해 반복 구간과 변주 구간을 구분해 정리했습니다.',
  ],
  download: [
    '아래에 1페이지 미리보기를 첨부했습니다. 전체 악보 PDF는 카피드럼에서 받아보실 수 있습니다.',
    '악보 첫 페이지를 미리보기로 확인해보세요. 전체 파일은 카피드럼에서 PDF로 제공됩니다.',
    '1페이지 샘플을 먼저 확인하시고, 전체 악보는 카피드럼에서 다운로드하시면 됩니다.',
    '미리보기 이미지는 악보 1페이지입니다. 전체 페이지 PDF는 카피드럼에서 제공하고 있습니다.',
    '샘플 페이지를 아래에 올려두었습니다. 완성본 PDF는 카피드럼에서 내려받으세요.',
  ],
  cta: [
    '악보 다운로드하기',
    '카피드럼에서 확인하기',
    '전체 악보 보러가기',
    '악보 상세 페이지 열기',
    'PDF 악보 받으러 가기',
  ],
  outro: [
    '결제 즉시 PDF가 제공되며, 마이페이지에서 언제든 다시 받을 수 있습니다.',
    '원하는 곡이 목록에 없다면 악보 제작 요청 메뉴를 이용해주세요.',
    '가요, 팝, 락, 재즈 등 다양한 장르의 채보가 계속 업데이트되고 있습니다.',
    '연습에 도움이 되셨다면 다른 악보들도 함께 살펴보시길 추천드립니다.',
    '앞으로도 꾸준히 새로운 채보를 올리겠습니다.',
  ],
  specLabels: { heading: '악보 상세', genre: '장르', difficulty: '난이도', tempo: 'BPM', pages: '분량' },
  previewCaption: '악보 1페이지 미리보기',
  videoLabel: '참고 영상',
};

const EN_POOLS: Pools = {
  intro: [
    'Hello from CopyDrum, a workshop dedicated to drum transcriptions.',
    'Welcome back to CopyDrum, where every chart is transcribed by ear.',
    'This is CopyDrum, your source for accurate drum sheet music.',
    'Greetings from CopyDrum, home of carefully notated drum charts.',
    'CopyDrum here, with another drum transcription for your practice list.',
    'Fresh from the CopyDrum transcription desk.',
  ],
  lead: [
    'Today we are featuring {{title}} by {{artist}}.',
    'The new chart is {{artist}} - {{title}}.',
    'We just added the drum sheet music for {{title}} by {{artist}}.',
    'This release covers {{artist}}\u2019s {{title}}.',
    'Our latest transcription is {{title}}, performed by {{artist}}.',
    'Up next: {{artist}} - {{title}}, transcribed for drum set.',
  ],
  about: [
    'Every bar was transcribed straight from the original recording, so the groove and fills match what you hear.',
    'The chart follows the studio track closely, including the fills and the subtle pattern changes.',
    'Section markers make it easy to see where the groove shifts throughout the song.',
    'We isolated the drum track before notating it, so the details carry over accurately.',
    'Repeats and variations are laid out clearly to make practice sessions more efficient.',
  ],
  download: [
    'The preview below shows page one. The complete PDF is available for download at CopyDrum.',
    'Here is a look at the first page. Grab the full PDF chart over at CopyDrum.',
    'Page one is shown below. The rest of the score can be downloaded from CopyDrum as a PDF.',
    'Check out the first page preview. The full sheet music is ready to download at CopyDrum.',
    'Below is a sample of page one. The complete transcription is available at CopyDrum.',
  ],
  cta: [
    'Get the Sheet Music',
    'Download the Full Chart',
    'View This Drum Sheet',
    'Open on CopyDrum',
    'Download the PDF',
  ],
  outro: [
    'The PDF is delivered instantly after checkout and stays in your account for re-download.',
    'If a song you want is missing, you can request a custom transcription on the site.',
    'CopyDrum carries pop, rock, jazz and K-pop charts, with new titles added regularly.',
    'Browse the catalog for more transcriptions at a similar level.',
    'More charts are on the way. Happy practicing.',
  ],
  specLabels: { heading: 'Chart Details', genre: 'Genre', difficulty: 'Difficulty', tempo: 'Tempo', pages: 'Pages' },
  previewCaption: 'Drum sheet music preview, page 1',
  videoLabel: 'Reference video',
};

function poolsFor(platform: MarketingPlatform): Pools {
  if (platform === 'naver') return NAVER_POOLS;
  if (platform === 'tistory') return TISTORY_POOLS;
  return EN_POOLS;
}

// ── 값 정규화 ─────────────────────────────────────────────────────────

const DIFFICULTY_EN: Record<string, string> = {
  '초급': 'Beginner',
  '중급': 'Intermediate',
  '고급': 'Advanced',
};

const GENRE_EN: Record<string, string> = {
  '가요': 'K-Pop',
  '팝': 'Pop',
  '락': 'Rock',
  'CCM': 'CCM',
  '트로트/성인가요': 'Trot',
  '재즈': 'Jazz',
  'J-POP': 'J-Pop',
  'OST': 'OST',
  '드럼솔로': 'Drum Solo',
  '드럼커버': 'Drum Cover',
  '악보집': 'Sheet Book',
  '드럼레슨': 'Drum Lesson',
};

function localizeDifficulty(value: string | null | undefined, korean: boolean): string | null {
  if (!value) return null;
  if (korean) return value;
  return DIFFICULTY_EN[value] || value;
}

function localizeGenre(value: string | null | undefined, korean: boolean): string | null {
  if (!value) return null;
  if (korean) return value;
  return GENRE_EN[value] || value;
}

/** description 컬럼은 {"ko":"...","en":"..."} JSON 문자열로 저장된다. */
function readDescription(raw: string | null | undefined, korean: boolean): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 예전에 평문으로 저장된 값
    return korean ? trimmed : null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const map = parsed as Record<string, unknown>;
  const order = korean ? ['ko', 'en'] : ['en', 'ko'];
  for (const key of order) {
    const value = map[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function fill(template: string, sheet: MarketingSheet): string {
  return template
    .replace(/\{\{title\}\}/g, sheet.title)
    .replace(/\{\{artist\}\}/g, sheet.artist);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 제목 / 태그 ───────────────────────────────────────────────────────

export function generateTitle(sheet: MarketingSheet, platform: MarketingPlatform): string {
  const korean = KOREAN_PLATFORMS.includes(platform);
  return korean
    ? `${sheet.artist} - ${sheet.title} 드럼악보`
    : `${sheet.artist} - ${sheet.title} Drum Sheet Music`;
}

export function generateTags(sheet: MarketingSheet, platform: MarketingPlatform): string[] {
  const korean = KOREAN_PLATFORMS.includes(platform);
  const cleanArtist = sheet.artist.replace(/[^\w가-힣]/g, '');
  const cleanTitle = sheet.title.replace(/[^\w가-힣]/g, '');
  const genre = sheet.categories?.name || '';

  const base = korean
    ? ['드럼악보', '드럼커버', '드럼연주', '악보제작', '카피드럼', 'CopyDrum', `${cleanArtist}드럼`, `${cleanTitle}드럼`]
    : ['DrumSheet', 'DrumCover', 'DrumScore', 'SheetMusic', 'CopyDrum', 'Drummer', `${cleanArtist}Drum`, `${cleanTitle}Drum`];

  const localizedGenre = localizeGenre(genre, korean);
  const tags = [sheet.artist, sheet.title, ...base];
  if (localizedGenre) tags.push(localizedGenre.replace(/[^\w가-힣]/g, ''));

  // 빈 값과 중복 제거
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
}

// ── 본문 ──────────────────────────────────────────────────────────────

function buildBlocks(sheet: MarketingSheet, platform: MarketingPlatform, productUrl: string): PostBlock[] {
  const korean = KOREAN_PLATFORMS.includes(platform);
  const pools = poolsFor(platform);
  const seed = hashSeed(`${sheet.id}::${platform}`);
  const labels = pools.specLabels;

  const blocks: PostBlock[] = [];

  blocks.push({ type: 'text', text: pick(pools.intro, seed, 1) });
  blocks.push({ type: 'text', text: fill(pick(pools.lead, seed, 2), sheet) });
  blocks.push({ type: 'text', text: pick(pools.about, seed, 3) });

  const description = readDescription(sheet.description, korean);
  if (description) {
    blocks.push({ type: 'text', text: description });
  }

  const specs: string[] = [];
  const genre = localizeGenre(sheet.categories?.name, korean);
  if (genre) specs.push(`${labels.genre}: ${genre}`);
  const difficulty = localizeDifficulty(sheet.difficulty, korean);
  if (difficulty) specs.push(`${labels.difficulty}: ${difficulty}`);
  if (sheet.tempo) specs.push(`${labels.tempo}: ${sheet.tempo} BPM`);
  if (sheet.page_count) specs.push(`${labels.pages}: ${sheet.page_count}${korean ? '페이지' : ''}`);
  if (specs.length > 0) {
    blocks.push({ type: 'text', text: `[${labels.heading}] ${specs.join(' / ')}` });
  }

  blocks.push({ type: 'text', text: pick(pools.download, seed, 4) });

  if (sheet.preview_image_url) {
    blocks.push({
      type: 'image',
      url: sheet.preview_image_url,
      alt: `${sheet.artist} ${sheet.title} ${pools.previewCaption}`,
    });
  }

  blocks.push({ type: 'cta', url: productUrl, label: pick(pools.cta, seed, 5) });
  blocks.push({ type: 'text', text: pick(pools.outro, seed, 6) });
  blocks.push({
    type: 'text',
    text: korean ? `카피드럼 바로가기: ${SITE_URL}` : `Visit CopyDrum: ${SITE_URL}`,
  });

  if (sheet.youtube_url) {
    blocks.push({ type: 'text', text: `${pools.videoLabel}: ${sheet.youtube_url}` });
  }

  return blocks;
}

function renderHtml(blocks: PostBlock[], platform: MarketingPlatform): string {
  // 네이버/티스토리 에디터는 인라인 CSS를 일부 걷어내므로 table + bgcolor 버튼을 쓰고,
  // 구글 블로거는 인라인 CSS를 그대로 살려준다.
  const useTableButton = KOREAN_PLATFORMS.includes(platform);

  const parts = blocks.map((block) => {
    if (block.type === 'text') {
      return `<p>${escapeHtml(block.text)}</p>`;
    }
    if (block.type === 'image') {
      return `<p style="text-align:center;"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="max-width:100%;height:auto;" /></p>`;
    }
    if (useTableButton) {
      return [
        '<div style="text-align:center;margin:25px 0;">',
        '<table border="0" cellspacing="0" cellpadding="0" align="center" style="border-collapse:separate;">',
        '<tr>',
        '<td align="center" bgcolor="#2563eb" style="border-radius:10px;padding:18px 40px;">',
        `<a href="${escapeHtml(block.url)}" target="_blank" style="text-decoration:none;color:#ffffff;font-size:20px;font-weight:bold;">${escapeHtml(block.label)}</a>`,
        '</td>',
        '</tr>',
        '</table>',
        '</div>',
      ].join('');
    }
    return `<p style="text-align:center;margin:30px 0;"><a href="${escapeHtml(block.url)}" target="_blank" style="background-color:#2563eb;color:#ffffff;padding:20px 40px;text-decoration:none;border-radius:8px;font-size:20px;font-weight:bold;display:inline-block;">${escapeHtml(block.label)}</a></p>`;
  });

  return parts.join('\n');
}

function renderText(blocks: PostBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'cta') return `${block.label}: ${block.url}`;
      return null;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

export function generateMarketingPost(sheet: MarketingSheet, platform: MarketingPlatform): GeneratedPost {
  const productUrl = buildProductUrl(sheet, platform);
  const blocks = buildBlocks(sheet, platform, productUrl);

  return {
    title: generateTitle(sheet, platform),
    html: renderHtml(blocks, platform),
    text: renderText(blocks),
    blocks,
    tags: generateTags(sheet, platform),
    productUrl,
  };
}

/** 핀터레스트는 이미지가 본체라 짧은 설명만 쓴다. */
export function generatePinterestDescription(sheet: MarketingSheet): string {
  const productUrl = buildProductUrl(sheet, 'pinterest');
  const lines = [
    `${sheet.artist} - ${sheet.title} | Drum Sheet Music`,
    '',
    'Download the full PDF transcription at CopyDrum.',
    productUrl,
  ];
  if (sheet.youtube_url) lines.push(`Watch: ${sheet.youtube_url}`);
  return lines.join('\n');
}
