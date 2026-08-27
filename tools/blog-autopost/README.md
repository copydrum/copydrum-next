# CopyDrum Blog Autopost

내 PC에서 네이버 블로그 · 티스토리 · 구글 블로거에 드럼 악보 홍보글을 자동 발행하는 CLI입니다.

- 중복 방지: `marketing_posts` 테이블 (+ 아래 SQL 유니크 인덱스)
- 본문 차별화: 플랫폼마다 다른 문장 풀 (`src/lib/marketing/postTemplate.ts`)
- 네이버/티스토리: Playwright 브라우저 자동화 (세션은 `.profiles/`에 저장)
- 구글 블로거: 공식 Blogger API v3

## 1. 설치

```bash
cd tools/blog-autopost
npm install
npx playwright install chromium
cp .env.example .env
```

`.env`에 Supabase service role 키와 블로그 정보를 채우세요.

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NAVER_BLOG_ID=white0028
TISTORY_BLOG_NAME=your-blog-name
GOOGLE_OAUTH_CLIENT_SECRET_PATH=./client_secret.json
BLOGGER_BLOG_ID=
```

## 2. DB 인덱스 (Supabase SQL Editor에서 1회 실행)

같은 악보를 같은 플랫폼에 두 번 올리지 못하도록 부분 유니크 인덱스를 겁니다.
`failed` 상태는 재시도할 수 있게 제외합니다.

```sql
-- 먼저 기존 중복 확인
SELECT platform, sheet_id, count(*)
FROM marketing_posts
WHERE status IN ('success', 'manual_copy', 'skipped')
GROUP BY platform, sheet_id
HAVING count(*) > 1;

-- 중복이 있으면 최신 1건만 남기고 정리한 뒤 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS marketing_posts_platform_sheet_uniq
  ON marketing_posts (platform, sheet_id)
  WHERE status IN ('success', 'manual_copy', 'skipped');
```

관리자 페이지에서 플랫폼별 **일일 목표 포스팅 수**(`marketing_settings.daily_limit`)도 확인해 두세요.
네이버는 계정 리스크 때문에 **1~2건/일**을 권장합니다.

## 3. 플랫폼별 최초 인증

### 구글 블로거

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. **Blogger API v3** 사용 설정
3. OAuth 동의 화면 구성 (테스트 사용자에 본인 Gmail 추가)
4. 사용자 인증 정보 → **데스크톱 앱** OAuth 클라이언트 만들기
5. JSON 다운로드 → `tools/blog-autopost/client_secret.json` 으로 저장
6. 실행:

```bash
npm run auth:blogger
```

브라우저에서 허용한 뒤 터미널에 나온 `BLOGGER_BLOG_ID`를 `.env`에 넣습니다.

### 티스토리

```bash
npm run login -- --platform=tistory
```

브라우저가 열리면 카카오로 직접 로그인하고, 관리자 화면이 보이면 터미널에서 Enter.

### 네이버 (`white0028`)

```bash
npm run login -- --platform=naver
```

브라우저에서 직접 로그인하고(자동 입력은 캡차 유발), 글쓰기 버튼이 보이면 Enter.

## 4. 실행

미리보기 (실제 발행 없음):

```bash
npm run dry-run
# 또는
npm run post -- --dry-run --platform=all --limit=2
```

실제 발행:

```bash
# 구글만 1건
npm run post -- --platform=google --limit=1

# 3곳 모두 (각 플랫폼 daily_limit 한도 내)
npm run post -- --platform=all

# 네이버만
npm run post -- --platform=naver --limit=1
```

## 5. 주의사항

- 네이버 글쓰기 API는 2020년에 종료되었습니다. 브라우저 자동화는 약관상 회색지대이며 **대량 발행 시 계정 제재** 위험이 있습니다. 하루 1~2건, 랜덤 대기를 지키세요.
- 티스토리 Open API는 2024년에 종료되었습니다. 에디터 UI가 바뀌면 셀렉터 수정이 필요합니다. 실패 시 `.profiles/logs/` 스크린샷을 확인하세요.
- 이 도구는 브라우저를 띄우므로 Vercel에서는 돌릴 수 없습니다. PC에서 직접 실행하세요.
- `.profiles/`, `token.blogger.json`, `client_secret.json`, `.env` 는 git에 올리지 마세요.

## 6. 포스팅 내용

- 제목: `아티스트 - 곡명 드럼악보` (구글은 영어)
- 본문: 미리보기 1페이지 이미지 + 카피드럼 다운로드 안내 + 상품 링크 + https://www.copydrum.com
- 상품 URL: `https://www.copydrum.com/ko/drum-sheet/{slug}` (구글은 `/en/`)
- 플랫폼마다 다른 문장 풀을 써서 본문 중복을 피합니다.
