# Supabase Disk IO 최적화 — 실행 가이드

이 문서는 2026-05-08 Supabase 의 "Disk IO Budget 고갈" 경고에 대응하기 위해
적용한 6가지 최적화의 **실행 순서**, **검증 방법**, **롤백 절차**를 정리합니다.

> 코드 변경은 이미 커밋되어 있고, **SQL 마이그레이션은 수동 실행이 필요**합니다.

---

## 변경 요약

| # | 항목 | 종류 | 위험도 | 효과 |
|---|---|---|---|---|
| 1 | 핵심 인덱스 추가 | SQL | 매우 낮음 | 모든 분석 쿼리 즉시 가속 |
| 2 | 어드민 폴링 30초 → 5분 | 코드 | 없음 | 어드민 탭당 IO 90% 감소 |
| 3 | `drum_sheets` 조회수 집계 컬럼 + 갱신 함수 | SQL + 코드 | 낮음 | 홈 진입 시 page_views 풀스캔 제거 |
| 4 | page_views 90일 보존 + 일일 cron | SQL | 낮음 | page_views 무한 성장 방지 |
| 5 | 어드민 분석 쿼리 서버화 + 5분 캐시 | 코드 (API route) | 낮음 | 동일 기간 반복 조회 시 IO 0 |
| 6 | recordPageView 봇 필터 + 디바운스 | 코드 | 없음 | 페이지뷰 INSERT 30~50% 감소 |

---

## 실행 순서

### 단계 0 — 사전 준비

1. Supabase Dashboard 에서 현재 Disk IO Budget 그래프 캡처 (전후 비교용)
   - 위치: Project → Reports → Database → "Disk IO Budget"
2. `.env.local` 에 `SUPABASE_SERVICE_ROLE_KEY` 가 설정되어 있는지 확인
   - 5번 항목(서버 캐시)이 RLS 우회로 더 빠르게 동작
   - 미설정 시 anon key 로 fallback (정상 동작하지만 약간 느림)
3. 운영 중 적용이므로 트래픽이 적은 시간대 권장

### 단계 1 — 인덱스 추가 (5~10분)

Supabase Dashboard → SQL Editor 에 아래 파일 내용을 복사해 실행:

```
supabase/migrations/20260508_01_performance_indexes.sql
```

- `CREATE INDEX CONCURRENTLY` 라 락 없음, 운영 중 안전
- `IF NOT EXISTS` 라 재실행해도 부작용 없음
- 완료 확인:
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
  ORDER BY indexname;
  ```

### 단계 2 — drum_sheets 집계 컬럼 + 초기 집계 (1~3분)

```
supabase/migrations/20260508_02_drum_sheets_view_aggregates.sql
```

- 컬럼 추가는 즉시 완료, 함수 정의도 즉시 완료
- 마지막의 `SELECT refresh_drum_sheet_view_counts();` 가 **page_views 스캔 1회**
  를 수행하므로 page_views 행 수만큼 시간이 걸립니다 (수십초 ~ 수분).
- 완료 확인:
  ```sql
  SELECT title, view_count_total, view_count_7d, view_count_updated_at
  FROM drum_sheets
  WHERE view_count_total > 0
  ORDER BY view_count_total DESC
  LIMIT 20;
  ```

### 단계 3 — 보존 정책 + cron 등록

```
supabase/migrations/20260508_03_page_views_retention_and_cron.sql
```

- pg_cron 확장 활성화 후, 3개 cron 작업이 등록됨
  - `cleanup-old-page-views`: 매일 03:30 KST, 90일 이전 page_views 삭제
  - `refresh-drum-sheet-view-counts`: 매일 04:00 KST, 집계 컬럼 갱신
  - `analyze-hot-tables`: 매주 일요일 04:30 KST, 통계 갱신
- 등록 확인:
  ```sql
  SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
  ```
- 다음날 실행 결과 확인:
  ```sql
  SELECT jobid, status, return_message, start_time
  FROM cron.job_run_details
  ORDER BY start_time DESC LIMIT 20;
  ```

### 단계 4 — 코드 배포 (Vercel push)

이미 코드는 변경되어 있습니다. 배포하면:
- 어드민 폴링이 5분 주기로 동작
- 어드민 대시보드 통계가 `/api/admin/dashboard-analytics` 를 통해 5분 캐싱
- 홈페이지가 page_views 풀스캔 대신 `view_count_total` 컬럼 사용
- recordPageView 가 봇 차단 + 디바운스 적용

### 단계 5 — 검증

1. 홈페이지를 시크릿 모드로 열어 인기 악보가 정상 표시되는지 확인
2. 어드민 대시보드에서 통계가 정상 로드되는지 확인 (응답 헤더 `X-Cache: MISS` → `HIT`)
3. 24시간 후 Supabase Reports 의 Disk IO Budget 그래프 확인 — 사용량 감소 추세
4. 일주일 후 cron 정상 동작 여부 재확인

---

## 롤백 절차

### 코드 롤백
- `git revert <commit>` 으로 커밋 단위 되돌리고 재배포

### SQL 롤백 (필요 시)

#### 단계 3 (cron) 해제
```sql
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'cleanup-old-page-views',
  'refresh-drum-sheet-view-counts',
  'analyze-hot-tables'
);
```

#### 단계 2 (집계 컬럼) 제거
```sql
DROP FUNCTION IF EXISTS refresh_drum_sheet_view_counts();
ALTER TABLE drum_sheets
  DROP COLUMN IF EXISTS view_count_total,
  DROP COLUMN IF EXISTS view_count_7d,
  DROP COLUMN IF EXISTS view_count_updated_at;
```

#### 단계 1 (인덱스) 제거 — 이건 권장하지 않음
인덱스는 유지해도 부작용이 없으므로 롤백 불필요.

```sql
-- 정말 제거해야 한다면
DROP INDEX IF EXISTS idx_orders_status_created_at;
DROP INDEX IF EXISTS idx_order_items_drum_sheet_id;
DROP INDEX IF EXISTS idx_order_items_created_at;
DROP INDEX IF EXISTS idx_page_views_session_id;
DROP INDEX IF EXISTS idx_drum_sheets_active_category;
DROP INDEX IF EXISTS idx_drum_sheets_popularity_rank;
DROP INDEX IF EXISTS idx_drum_sheet_categories_category;
DROP INDEX IF EXISTS idx_profiles_created_at;
DROP INDEX IF EXISTS idx_customer_inquiries_created_at;
DROP INDEX IF EXISTS idx_drum_sheets_view_count_total;
DROP INDEX IF EXISTS idx_drum_sheets_view_count_7d;
```

---

## 변경 파일 목록

### 새로 추가
- `supabase/migrations/20260508_01_performance_indexes.sql`
- `supabase/migrations/20260508_02_drum_sheets_view_aggregates.sql`
- `supabase/migrations/20260508_03_page_views_retention_and_cron.sql`
- `src/app/api/admin/dashboard-analytics/route.ts`
- `docs/DISK_IO_OPTIMIZATION_GUIDE.md` (이 문서)

### 수정
- `src/_pages/admin/page.tsx`
  - 폴링 주기 30s/60s → 5min
  - 분석 호출을 API route 로 변경
- `src/_pages/home/page.tsx`
  - page_views 풀스캔 쿼리 제거
  - drum_sheets 의 새 집계 컬럼 사용
- `src/lib/dashboardAnalytics.ts`
  - `runDashboardAnalytics(client, period)` 추가 (서버/클라 양쪽 사용)
  - `isBotUserAgent` export 추가
  - `recordPageView` 가 봇 차단 후 INSERT 건너뜀
- `src/app/[locale]/layout-client.tsx`
  - 페이지뷰 트래커에 봇 필터 + 디바운스 + 800ms 지연 추가

---

## 주요 메트릭 예상치

| 항목 | 적용 전 | 적용 후 |
|---|---|---|
| 홈 진입 1회당 page_views 읽기 행 수 | 전체 (예: 50만) | 0 |
| 어드민 탭 1시간당 분석 쿼리 횟수 | 120회 | 12회 (그중 ~11회 캐시 HIT) |
| page_views 테이블 크기 추이 | 무한 증가 | 90일 rolling (상한 존재) |
| 봇 page_views INSERT | 발생 | 차단 |
| 사용자 빠른 연속 navigation 기록 | 모두 | 마지막 1건 |

---

## FAQ

**Q. 인기 악보 순위가 바뀌나요?**
A. 거의 바뀌지 않습니다. 조회수 가중(0.1/0.2)이 구매수 가중(1.0/2.0)보다
훨씬 작고, 관리자가 `popularity_rank` 로 직접 지정한 곡은 영향을 받지 않습니다.
또한 page_views 90일 retention 이후에는 누적 조회수가 90일 rolling 으로
바뀌는데, 이는 "최근 인기"를 더 정확히 반영하는 효과가 있어 오히려 자연스럽습니다.

**Q. 어드민에서 새로 발생한 데이터가 즉시 안 보입니다.**
A. 5분 캐시 때문입니다. 즉시 갱신이 필요하면 페이지를 새로고침하기 전에
`DELETE /api/admin/dashboard-analytics` 를 호출하거나, 잠시 기다리면 됩니다.
필요하면 어드민 UI 에 "수동 새로고침" 버튼을 추가하여 `force=1` 파라미터로
호출하도록 확장 가능합니다.

**Q. SUPABASE_SERVICE_ROLE_KEY 가 없으면 어떻게 되나요?**
A. anon key 로 fallback 합니다. RLS 를 통해 동일하게 동작하지만 약간 느릴 수
있고, RLS 정책에 따라 일부 데이터에 접근 제한될 수 있습니다.

**Q. 만약 24시간 후에도 Disk IO Budget 이 회복 안 되면?**
A. Compute 인스턴스 업그레이드(Micro → Small)를 검토하세요. 현재 트래픽 수준이
이미 Micro baseline 을 넘는 것일 수 있습니다.
