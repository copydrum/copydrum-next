import { useMemo } from 'react';

const getHostInfo = () => {
  if (typeof window === 'undefined') {
    return { isEnglish: false };
  }
  const host = window.location.hostname.toLowerCase();
  return { isEnglish: host.startsWith('en.') };
};

export default function MaintenanceNotice() {
  const { isEnglish } = getHostInfo();

  const copy = useMemo(() => {
    if (isEnglish) {
      return {
        title: 'Scheduled Site Renewal',
        date: 'November 15 – November 17',
        body: [
          'CopyDrum is temporarily unavailable while we finish a major renewal to make browsing and purchasing even easier.',
          'We sincerely apologize for the inconvenience and appreciate your patience.',
        ],
        contact: 'For urgent inquiries, please contact copydrum@hanmail.net.',
        footer: 'We will be back online as soon as the renewal is complete.',
      };
    }

    return {
      title: '사이트 리뉴얼 안내',
      date: '11월 15일 ~ 11월 17일',
      body: [
        '카피드럼은 더 편리한 이용 환경을 제공해 드리기 위해 현재 리뉴얼 작업을 진행 중입니다.',
        '이 기간 동안 서비스 이용이 제한되는 점 진심으로 양해 부탁드립니다.',
      ],
      contact: '긴급 문의: copydrum@hanmail.net / 고객센터를 통해 연락해 주세요.',
      footer: '리뉴얼 완료 후 즉시 이용 가능하도록 준비하겠습니다.',
    };
  }, [isEnglish]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-2xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-blue-100">
          <i className="ri-information-line text-base" aria-hidden />
          {copy.date}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold">{copy.title}</h1>
        <div className="space-y-3 text-base text-gray-200 leading-relaxed">
          {copy.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="font-semibold text-blue-100">{copy.contact}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 text-sm text-gray-100">
          {copy.footer}
        </div>
      </div>
    </div>
  );
}

