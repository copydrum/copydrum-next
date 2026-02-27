# DB 마이그레이션 가이드: expected_completion_date 컬럼 추가

## 문제 상황
주문 목록이 로드되지 않는 경우, `expected_completion_date` 컬럼이 DB에 없어서 발생할 수 있습니다.

## 해결 방법

### Supabase에서 직접 실행

1. Supabase Dashboard에 로그인
2. SQL Editor로 이동
3. 아래 SQL을 실행:

```sql
-- orders 테이블에 expected_completion_date 컬럼 추가
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

-- 컬럼에 대한 설명 추가 (선택사항)
COMMENT ON COLUMN orders.expected_completion_date IS '선주문 상품의 예상 제작 완료일 (한국 시간 기준)';
```

### 또는 Supabase CLI 사용

```bash
# 마이그레이션 파일 생성
supabase migration new add_expected_completion_date_to_orders

# 생성된 마이그레이션 파일에 아래 SQL 추가
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

# 마이그레이션 실행
supabase db push
```

## 확인 방법

마이그레이션 후 아래 쿼리로 확인:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' 
AND column_name = 'expected_completion_date';
```

결과가 나오면 성공입니다.

## 주의사항

- 기존 데이터는 모두 `NULL`로 설정됩니다 (정상)
- 선주문 상품 결제 시 자동으로 값이 채워집니다
- 일반 다운로드 상품은 항상 `NULL`입니다 (정상)
