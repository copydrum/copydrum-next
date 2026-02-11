'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

const infoRows = [
  { label: '회사명', value: 'COPYDRUM' },
  { label: '대표자', value: '강만수' },
  { label: '사업자등록번호', value: '307-07-86155' },
  { label: '통신판매업 신고', value: '제2020세종0099호' },
  { label: '주소', value: '세종 남세종로 454 강남제일타워 8층 836호' },
  { label: '연락처', value: '070-7570-0028' },
];

const supportLinks = [
  { label: '이용 가이드', href: '/guide' },
  { label: '자주 묻는 질문', href: '/customer-support' },
  { label: '문의하기', href: '/customer-support?tab=contact' },
  { label: '환불 정책', href: '/customer-support?tab=faq' },
];

const companyLinks = [
  { label: '회사 소개', href: '/company/about' },
  { label: '이용약관', href: '/guide#terms' },
  { label: '개인정보처리방침', href: '/guide#privacy' },
  { label: '파트너십', href: '/company/partnership' },
];

export default function BusinessInfoPage() {
  const router = useLocaleRouter();

  const handleNav = (href: string) => () => {
    router.push(href);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">카피드럼 사업자 정보</h1>
          <p className="text-gray-600">
            카피드럼의 필수 사업자 정보 및 고객 안내 사항을 확인하실 수 있습니다.
          </p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {infoRows.map((row) => (
              <div key={row.label} className="flex flex-col sm:flex-row sm:items-center px-6 py-4">
                <span className="sm:w-48 text-sm font-semibold text-gray-500">{row.label}</span>
                <span className="text-base text-gray-900">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 text-sm text-gray-500 border-t border-gray-100">
            작업 중에는 전화 응대가 어려울 수 있습니다. 1:1 문의 또는 카카오톡 채팅을 이용해주세요.
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-200 p-6 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">고객 지원</h2>
            <ul className="space-y-3 text-sm text-gray-700">
              {supportLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={handleNav(link.href)}
                    className="text-left text-blue-600 hover:text-blue-700"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 p-6 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">회사 정보</h2>
            <ul className="space-y-3 text-sm text-gray-700">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={handleNav(link.href)}
                    className="text-left text-blue-600 hover:text-blue-700"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 p-6 bg-white shadow-sm text-sm text-gray-500">
          <p>© {currentYear} COPYDRUM. All rights reserved.</p>
        </section>
      </div>
    </div>
  );
}





