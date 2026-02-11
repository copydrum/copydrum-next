import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface GuideSection {
  title: string;
  icon: string;
  description: string;
  steps: {
    title: string;
    detail: string;
    highlight?: string;
  }[];
  cta?: {
    label: string;
    href: string;
  }[];
}

export default function GuidePage() {
  const [user, setUser] = useState<User | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user ?? null);
    };

    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const guideSections = useMemo<GuideSection[]>(() => [
    {
      title: t('guidePage.sections.firstPurchase.title'),
      icon: 'ri-rocket-line',
      description: t('guidePage.sections.firstPurchase.description'),
      steps: [
        {
          title: t('guidePage.sections.firstPurchase.steps.account.title'),
          detail: t('guidePage.sections.firstPurchase.steps.account.detail'),
          highlight: t('guidePage.sections.firstPurchase.steps.account.highlight')
        },
        {
          title: t('guidePage.sections.firstPurchase.steps.findSheet.title'),
          detail: t('guidePage.sections.firstPurchase.steps.findSheet.detail')
        },
        {
          title: t('guidePage.sections.firstPurchase.steps.payment.title'),
          detail: t('guidePage.sections.firstPurchase.steps.payment.detail')
        }
      ],
      cta: [
        { label: t('guidePage.sections.firstPurchase.cta.register'), href: '/register' },
        { label: t('guidePage.sections.firstPurchase.cta.popular'), href: '/categories' }
      ]
    },
    {
      title: t('guidePage.sections.effectiveSearch.title'),
      icon: 'ri-search-line',
      description: t('guidePage.sections.effectiveSearch.description'),
      steps: [
        {
          title: t('guidePage.sections.effectiveSearch.steps.keyword.title'),
          detail: t('guidePage.sections.effectiveSearch.steps.keyword.detail'),
          highlight: t('guidePage.sections.effectiveSearch.steps.keyword.highlight')
        },
        {
          title: t('guidePage.sections.effectiveSearch.steps.filter.title'),
          detail: t('guidePage.sections.effectiveSearch.steps.filter.detail')
        },
        {
          title: t('guidePage.sections.effectiveSearch.steps.noResults.title'),
          detail: t('guidePage.sections.effectiveSearch.steps.noResults.detail')
        }
      ],
      cta: [
        { label: t('guidePage.sections.effectiveSearch.cta.categories'), href: '/categories' }
      ]
    },
    {
      title: t('guidePage.sections.chooseSheet.title'),
      icon: 'ri-music-2-line',
      description: t('guidePage.sections.chooseSheet.description'),
      steps: [
        {
          title: t('guidePage.sections.chooseSheet.steps.difficulty.title'),
          detail: t('guidePage.sections.chooseSheet.steps.difficulty.detail'),
          highlight: t('guidePage.sections.chooseSheet.steps.difficulty.highlight')
        },
        {
          title: t('guidePage.sections.chooseSheet.steps.preview.title'),
          detail: t('guidePage.sections.chooseSheet.steps.preview.detail')
        },
        {
          title: t('guidePage.sections.chooseSheet.steps.price.title'),
          detail: t('guidePage.sections.chooseSheet.steps.price.detail')
        }
      ],
      cta: []
    },
    {
      title: t('guidePage.sections.purchaseProcess.title'),
      icon: 'ri-shopping-cart-2-line',
      description: t('guidePage.sections.purchaseProcess.description'),
      steps: [
        {
          title: t('guidePage.sections.purchaseProcess.steps.cart.title'),
          detail: t('guidePage.sections.purchaseProcess.steps.cart.detail'),
          highlight: t('guidePage.sections.purchaseProcess.steps.cart.highlight')
        },
        {
          title: t('guidePage.sections.purchaseProcess.steps.paymentInfo.title'),
          detail: t('guidePage.sections.purchaseProcess.steps.paymentInfo.detail')
        },
        {
          title: t('guidePage.sections.purchaseProcess.steps.paymentMethod.title'),
          detail: t('guidePage.sections.purchaseProcess.steps.paymentMethod.detail')
        }
      ],
      cta: [
        { label: t('guidePage.sections.purchaseProcess.cta.cart'), href: '/cart' }
      ]
    },
    {
      title: t('guidePage.sections.download.title'),
      icon: 'ri-download-cloud-2-line',
      description: t('guidePage.sections.download.description'),
      steps: [
        {
          title: t('guidePage.sections.download.steps.immediate.title'),
          detail: t('guidePage.sections.download.steps.immediate.detail')
        },
        {
          title: t('guidePage.sections.download.steps.redownload.title'),
          detail: t('guidePage.sections.download.steps.redownload.detail'),
          highlight: t('guidePage.sections.download.steps.redownload.highlight')
        },
        {
          title: t('guidePage.sections.download.steps.pdf.title'),
          detail: t('guidePage.sections.download.steps.pdf.detail')
        }
      ],
      cta: [
        { label: t('guidePage.sections.download.cta.mypage'), href: '/mypage' },
        { label: t('guidePage.sections.download.cta.orders'), href: '/my-orders' }
      ]
    },
    {
      title: t('guidePage.sections.discounts.title'),
      icon: 'ri-gift-line',
      description: t('guidePage.sections.discounts.description'),
      steps: [
        {
          title: t('guidePage.sections.discounts.steps.event.title'),
          detail: t('guidePage.sections.discounts.steps.event.detail'),
          highlight: t('guidePage.sections.discounts.steps.event.highlight')
        },
        {
          title: t('guidePage.sections.discounts.steps.cash.title'),
          detail: t('guidePage.sections.discounts.steps.cash.detail')
        },
        {
          title: t('guidePage.sections.discounts.steps.customOrder.title'),
          detail: t('guidePage.sections.discounts.steps.customOrder.detail')
        }
      ],
      cta: [
        { label: t('guidePage.sections.discounts.cta.customOrder'), href: '/custom-order' },
        { label: t('guidePage.sections.discounts.cta.customOrders'), href: '/custom-orders' }
      ]
    }
  ], [t]);

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />
      <div>
        <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-white/15 mb-6">
            {t('guidePage.hero.badge')}
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            {t('guidePage.hero.title')}
          </h1>
          <p className="text-lg text-blue-100 leading-relaxed max-w-3xl mx-auto" dangerouslySetInnerHTML={{ __html: t('guidePage.hero.description') }} />
        </div>
      </section>

        <main className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8">
              {guideSections.map((section) => (
                <div
                  key={section.title}
                  className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="p-8 sm:p-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <i className={`${section.icon} text-2xl text-blue-600`}></i>
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 mb-2">{section.title}</h2>
                          <p className="text-gray-600 leading-relaxed">{section.description}</p>
                        </div>
                      </div>
                      {section.cta && (
                        <div className="flex flex-wrap gap-3">
                          {section.cta.map((item) => (
                            <a
                              key={item.label}
                              href={item.href}
                              className="inline-flex items-center px-5 py-2.5 rounded-full bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                            >
                              {item.label}
                              <i className="ri-arrow-right-up-line text-lg ml-2"></i>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      {section.steps.map((step, index) => (
                        <div
                          key={step.title}
                          className="group relative rounded-2xl border border-gray-100 bg-white p-6 hover:border-blue-200 hover:shadow-lg transition-all"
                        >
                          <div className="absolute -top-4 left-6 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-semibold">
                            {index + 1}
                          </div>
                          <div className="mt-4">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3">{step.title}</h3>
                            <p className="text-gray-600 leading-relaxed text-sm">{step.detail}</p>
                            {step.highlight && (
                              <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 font-medium">
                                {step.highlight}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <section className="bg-white py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-8">
                <h3 className="text-2xl font-bold text-blue-900 mb-4">{t('guidePage.searchTips.title')}</h3>
                <ul className="space-y-3 text-sm text-blue-900">
                  <li className="flex items-start">
                    <span className="mt-1 mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white font-semibold text-blue-600">1</span>
                    <div>
                      <p className="font-semibold">{t('guidePage.searchTips.items.keyword.title')}</p>
                      <p className="text-blue-800/80">{t('guidePage.searchTips.items.keyword.description')}</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="mt-1 mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white font-semibold text-blue-600">2</span>
                    <div>
                      <p className="font-semibold">{t('guidePage.searchTips.items.filter.title')}</p>
                      <p className="text-blue-800/80">{t('guidePage.searchTips.items.filter.description')}</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="mt-1 mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white font-semibold text-blue-600">3</span>
                    <div>
                      <p className="font-semibold">{t('guidePage.searchTips.items.noResults.title')}</p>
                      <p className="text-blue-800/80">{t('guidePage.searchTips.items.noResults.description')}</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{t('guidePage.purchaseComparison.title')}</h3>
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-900">{t('guidePage.purchaseComparison.regular.title')}</h4>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600">{t('guidePage.purchaseComparison.regular.badge')}</span>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {t('guidePage.purchaseComparison.regular.items', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-indigo-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-900">{t('guidePage.purchaseComparison.custom.title')}</h4>
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600">{t('guidePage.purchaseComparison.custom.badge')}</span>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {t('guidePage.purchaseComparison.custom.items', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl p-10 sm:p-14 shadow-lg">
              <h2 className="text-3xl font-bold mb-4">{t('guidePage.helpNeeded.title')}</h2>
              <p className="text-lg text-blue-100 mb-8 leading-relaxed">
                {t('guidePage.helpNeeded.description')}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="/categories"
                  className="inline-flex items-center px-6 py-3 rounded-full bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  {t('guidePage.helpNeeded.cta.findSheets')}
                  <i className="ri-arrow-right-up-line text-lg ml-2"></i>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="terms" className="bg-white py-16 border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              {t('guidePage.terms.title')}
            </h2>
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-8 space-y-4 text-gray-700 leading-relaxed">
              {t('guidePage.terms.content', { returnObjects: true }).map((paragraph: string, index: number) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <section id="privacy" className="bg-gray-900 py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-gray-100">
            <h2 className="text-3xl font-bold mb-6">
              {t('guidePage.privacy.title')}
            </h2>
            <div className="bg-white/10 border border-white/10 rounded-3xl p-8 space-y-4 leading-relaxed">
              {t('guidePage.privacy.content', { returnObjects: true }).map((paragraph: string, index: number) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
}
 