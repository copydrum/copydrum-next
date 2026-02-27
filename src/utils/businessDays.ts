/**
 * 영업일 계산 유틸리티
 * 한국 시간(KST) 기준으로 마감 시간과 영업일을 계산
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// dayjs 플러그인 초기화
dayjs.extend(utc);
dayjs.extend(timezone);

// 한국 시간대 상수
const KST_TIMEZONE = 'Asia/Seoul';

/**
 * 주어진 날짜가 주말인지 확인 (한국 시간 기준)
 * @param date - 확인할 날짜 (Date 객체 또는 ISO 문자열)
 * @returns 주말이면 true, 평일이면 false
 */
export function isWeekend(date: Date | string): boolean {
  const kstDate = dayjs(date).tz(KST_TIMEZONE);
  const day = kstDate.day();
  return day === 0 || day === 6; // 일요일(0) 또는 토요일(6)
}

/**
 * 선주문 상품의 예상 완료일을 계산
 * 
 * 규칙:
 * - 월~목요일: 17:00 이전 결제 → 다음 날 완성, 17:00 이후 → 다음 날 완성
 * - 금요일: 14:00 이전 결제 → 다음 날 완성, 14:00 이후 → 다음 주 월요일 완성
 * - 토~일요일: 시간 관계없이 모두 다음 주 월요일 완성
 * 
 * @param paymentDate - 결제일 (Date 객체 또는 ISO 문자열)
 * @returns 예상 완료일 (Date 객체, 한국 시간 기준)
 */
export function calculateExpectedCompletionDate(
  paymentDate: Date | string
): Date {
  // 결제일을 한국 시간으로 변환
  const paymentKST = dayjs(paymentDate).tz(KST_TIMEZONE);
  const hour = paymentKST.hour();
  const day = paymentKST.day(); // 0=일요일, 1=월요일, ..., 6=토요일

  let completionDate: dayjs.Dayjs;

  if (day === 0 || day === 6) {
    // 토~일요일: 시간 관계없이 모두 다음 주 월요일 완성
    completionDate = paymentKST.add(1, 'day'); // 다음 날로 이동
    // 다음 월요일까지 이동
    while (completionDate.day() !== 1) {
      completionDate = completionDate.add(1, 'day');
    }
  } else if (day === 5) {
    // 금요일
    if (hour < 14) {
      // 14:00 이전: 다음 날 완성
      // 다음 날은 토요일이므로, 월요일까지 이동
      completionDate = paymentKST.add(1, 'day'); // 토요일
      // 다음 월요일까지 이동
      while (completionDate.day() !== 1) {
        completionDate = completionDate.add(1, 'day');
      }
    } else {
      // 14:00 이후: 다음 주 월요일 완성
      completionDate = paymentKST.add(1, 'day'); // 토요일
      // 다음 월요일까지 이동
      while (completionDate.day() !== 1) {
        completionDate = completionDate.add(1, 'day');
      }
    }
  } else {
    // 월~목요일: 17:00 이전/이후 모두 다음 날 완성
    completionDate = paymentKST.add(1, 'day');
    
    // 다음 날이 주말이면 월요일로 이동
    if (completionDate.day() === 0) {
      // 일요일이면 하루 더 추가해서 월요일로
      completionDate = completionDate.add(1, 'day');
    } else if (completionDate.day() === 6) {
      // 토요일이면 이틀 더 추가해서 월요일로
      completionDate = completionDate.add(2, 'day');
    }
  }

  // 한국 시간으로 설정된 날짜를 Date 객체로 변환
  // 시간은 00:00:00으로 설정 (날짜만 중요)
  return completionDate.startOf('day').toDate();
}

/**
 * 결제일 기준으로 다음 영업일을 계산 (기존 함수, 호환성 유지)
 * @param paymentDate - 결제일 (Date 객체 또는 ISO 문자열)
 * @param businessDaysToAdd - 추가할 영업일 수 (기본값: 1)
 * @returns 다음 영업일 (Date 객체)
 */
export function calculateNextBusinessDay(
  paymentDate: Date | string,
  businessDaysToAdd: number = 1
): Date {
  // 새로운 함수를 사용하되, businessDaysToAdd가 1인 경우에만
  if (businessDaysToAdd === 1) {
    return calculateExpectedCompletionDate(paymentDate);
  }

  // 1이 아닌 경우 기존 로직 사용 (하지만 한국 시간 기준으로)
  const kstDate = dayjs(paymentDate).tz(KST_TIMEZONE).startOf('day');
  let currentDate = kstDate;
  let daysAdded = 0;
  
  while (daysAdded < businessDaysToAdd) {
    currentDate = currentDate.add(1, 'day');
    
    // 주말이 아니면 영업일로 카운트
    if (currentDate.day() !== 0 && currentDate.day() !== 6) {
      daysAdded++;
    }
  }
  
  return currentDate.toDate();
}

/**
 * 날짜를 YYYY-MM-DD 형식의 문자열로 변환
 * @param date - 변환할 날짜
 * @returns YYYY-MM-DD 형식의 문자열
 */
export function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 날짜를 YYYY. M. D 형식의 문자열로 변환 (한국어 형식)
 * @param date - 변환할 날짜
 * @returns YYYY. M. D 형식의 문자열
 */
export function formatDateToKorean(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${year}. ${month}. ${day}`;
}
