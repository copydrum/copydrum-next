# 📊 Analytics 어뷰징 방지 가이드

## 개요

관리자 대시보드의 방문자 및 페이지뷰 집계에서 **비정상적인 트래픽(봇, 스크래퍼, 어뷰징)**을 자동으로 탐지하고 필터링하는 시스템입니다.

짧은 시간에 많은 페이지를 조회하는 패턴을 감지하여 통계의 정확성을 높입니다.

---

## 🎯 탐지 대상

### 1. Rate-Based 어뷰징
- **1분에 30페이지 이상** 조회하는 세션
- **평균 페이지뷰 간격이 2초 이하**인 세션
- **세션당 총 500페이지 이상** 조회하는 세션

### 2. Time-Interval 어뷰징
- **연속 5회 이상** 페이지뷰 간격이 **1초 이하**인 패턴
- 기계적이고 일정한 간격으로 페이지를 조회하는 패턴

---

## 🚀 적용 방법

### 1. 자동 활성화
어뷰징 방지 기능은 **기본적으로 활성화**되어 있습니다.

`src/lib/dashboardAnalytics.ts`의 `getDashboardAnalytics()` 함수에서 자동으로 작동합니다.

### 2. 환경 변수 설정

`.env.local` 파일에서 임계값을 조정할 수 있습니다:

```bash
# 어뷰징 필터링 비활성화 (테스트용)
NEXT_PUBLIC_ENABLE_ABUSE_FILTERING=false

# 임계값 조정 예시 (더 엄격하게)
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=20      # 1분에 20페이지로 제한 강화
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=3000     # 평균 간격 3초로 강화

# 임계값 조정 예시 (더 관대하게)
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=50      # 1분에 50페이지까지 허용
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=1000     # 평균 간격 1초까지 허용
```

---

## 📋 설정 옵션 상세

| 환경 변수 | 기본값 | 설명 |
|----------|--------|------|
| `NEXT_PUBLIC_ENABLE_ABUSE_FILTERING` | `true` | 어뷰징 필터링 활성화 여부 |
| `NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE` | `30` | 1분 내 최대 허용 페이지뷰 수 |
| `NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_SESSION` | `500` | 세션당 최대 허용 페이지뷰 수 |
| `NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS` | `2000` | 평균 페이지뷰 간격 임계값 (밀리초) |
| `NEXT_PUBLIC_ABUSE_CONSECUTIVE_FAST_VIEWS` | `5` | 연속 빠른 조회로 간주할 횟수 |
| `NEXT_PUBLIC_ABUSE_FAST_VIEW_THRESHOLD_MS` | `1000` | 빠른 조회로 간주할 간격 (밀리초) |
| `NEXT_PUBLIC_ABUSE_MIN_VIEWS_FOR_ANALYSIS` | `10` | 분석 대상 최소 페이지뷰 수 |

---

## 🔍 모니터링 및 로그

### 콘솔 로그 확인

어뷰징 필터링이 작동하면 서버 콘솔에 다음과 같은 로그가 출력됩니다:

```
[fetchPageViews] Total: 1000, After bot filter: 850 (85.0% real users)
[Abuse Detection] Found 3 abusive sessions with 320 views
[Abuse Detection] Top 5 abusive sessions:
  - Session 1a2b3c4d...: 150 views
    Reasons: 1분 내 최대 45개 페이지뷰 (임계값: 30), 평균 페이지뷰 간격 1.2초 (임계값: 2초)
  - Session 5e6f7g8h...: 100 views
    Reasons: 연속 8개 페이지뷰가 1초 이하 간격
[Abuse Detection] Filtered 320 views from 3 sessions (37.6%)
[fetchPageViews] After abuse filter: 530 views (removed 320 abusive views)
```

### SQL로 어뷰징 세션 직접 확인

```sql
-- 1분에 30페이지 이상 조회한 세션 찾기
WITH session_views AS (
  SELECT
    session_id,
    user_agent,
    created_at,
    COUNT(*) OVER (
      PARTITION BY session_id
      ORDER BY created_at
      RANGE BETWEEN INTERVAL '60 seconds' PRECEDING AND CURRENT ROW
    ) as views_per_minute
  FROM page_views
  WHERE created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  session_id,
  user_agent,
  MAX(views_per_minute) as max_views_per_minute,
  COUNT(*) as total_views
FROM session_views
GROUP BY session_id, user_agent
HAVING MAX(views_per_minute) > 30
ORDER BY max_views_per_minute DESC;

-- 평균 페이지뷰 간격이 2초 이하인 세션 찾기
WITH view_intervals AS (
  SELECT
    session_id,
    user_agent,
    EXTRACT(EPOCH FROM (
      created_at - LAG(created_at) OVER (PARTITION BY session_id ORDER BY created_at)
    )) as interval_seconds
  FROM page_views
  WHERE created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  session_id,
  user_agent,
  COUNT(*) as total_views,
  ROUND(AVG(interval_seconds)::numeric, 2) as avg_interval_sec
FROM view_intervals
WHERE interval_seconds IS NOT NULL
GROUP BY session_id, user_agent
HAVING AVG(interval_seconds) < 2 AND COUNT(*) > 10
ORDER BY avg_interval_sec ASC;
```

---

## ⚙️ 임계값 조정 가이드

### 웹사이트 특성에 따른 권장 설정

#### 📰 콘텐츠 사이트 (뉴스, 블로그)
사용자가 여러 글을 빠르게 훑어볼 수 있음
```bash
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=40
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=1500
```

#### 🛒 이커머스 사이트 (쇼핑몰)
사용자가 상품을 빠르게 비교할 수 있음
```bash
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=35
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=2000
```

#### 📚 교육 플랫폼 (악보 사이트 등)
사용자가 자료를 천천히 확인함
```bash
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=25
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=3000
```

#### 🎮 SPA (Single Page Application)
페이지 전환이 많지 않음
```bash
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=20
NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS=4000
```

---

## 🧪 테스트 방법

### 1. 로컬 환경에서 테스트

```bash
# 어뷰징 필터링 비활성화
NEXT_PUBLIC_ENABLE_ABUSE_FILTERING=false npm run dev

# 임계값을 매우 낮게 설정하여 테스트
NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE=5 npm run dev
```

### 2. 어뷰징 시뮬레이션 스크립트

테스트용 페이지뷰 데이터 생성:

```javascript
// 관리자 대시보드에서 실행
async function simulateAbusiveTraffic() {
  const sessionId = 'test-abuse-' + Date.now();

  // 10초 동안 50개 페이지뷰 생성
  for (let i = 0; i < 50; i++) {
    await fetch('/api/track-pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        page_url: `/test-page-${i}`,
      }),
    });
    await new Promise(r => setTimeout(r, 200)); // 0.2초 간격
  }

  console.log('Abusive traffic simulation completed');
}
```

---

## 🛠️ 트러블슈팅

### 정상 사용자가 필터링되는 경우

**증상**: 파워 유저나 빠른 네비게이션을 사용하는 사용자가 어뷰징으로 분류됨

**해결책**:
1. `NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE`를 40-50으로 상향
2. `NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS`를 1000-1500으로 하향

### 봇 트래픽이 여전히 집계되는 경우

**증상**: 어뷰징 필터링 후에도 비정상적으로 높은 페이지뷰 수

**해결책**:
1. SQL 쿼리로 어뷰징 패턴 직접 확인
2. 임계값을 더 엄격하게 조정
3. `user_agent` 봇 필터링 패턴 추가 (`src/lib/dashboardAnalytics.ts:327-340`)

### 성능 문제

**증상**: 대시보드 로딩이 느려짐

**해결책**:
1. `NEXT_PUBLIC_ABUSE_MIN_VIEWS_FOR_ANALYSIS`를 20으로 상향 (적은 페이지뷰는 분석 생략)
2. 필요시 임시로 필터링 비활성화: `NEXT_PUBLIC_ENABLE_ABUSE_FILTERING=false`

---

## 📈 효과 측정

### 필터링 전후 비교

```sql
-- 필터링 전 (봇 트래픽 포함)
SELECT COUNT(*) as total_views
FROM page_views
WHERE created_at >= NOW() - INTERVAL '7 days';

-- 필터링 후 예상 (정상 트래픽만)
-- 관리자 대시보드에서 표시되는 수치 확인
```

**기대 효과**:
- 봇 트래픽 제거: 70-90%
- 방문자 수/페이지뷰 비율 정상화: 1:3 ~ 1:10
- 통계 신뢰도 향상

---

## 🔐 보안 고려사항

- 어뷰징 탐지 로직은 **백엔드 (서버 사이드)**에서 실행됩니다
- 클라이언트에서 우회할 수 없습니다
- 필터링된 세션 정보는 로그에만 기록되며 DB에 저장되지 않습니다
- 개인정보 보호: session_id의 일부만 로그에 출력 (8자리)

---

## 📚 관련 파일

- `src/lib/dashboardAnalytics.ts` - 핵심 로직
- `.env.example` - 환경 변수 예시
- `docs/ABUSE_PREVENTION.md` - 이 문서

---

## 💡 추가 개선 방안 (향후)

1. **IP 기반 필터링**: 동일 IP에서 과도한 트래픽 차단
2. **Honeypot 기법**: 숨겨진 링크로 봇 탐지
3. **머신러닝**: 비정상 패턴 자동 학습
4. **실시간 차단**: recordPageView에서 사전 차단
5. **관리자 대시보드**: 어뷰징 세션 목록 UI 제공

---

## 📞 문의 및 피드백

어뷰징 방지 로직 관련 이슈나 개선 제안은:
- GitHub Issues에 등록
- 또는 개발팀에 직접 연락
