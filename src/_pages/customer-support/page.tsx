'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useSearchParams} from 'next/navigation';
import { useTranslation } from 'react-i18next';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function CustomerSupport() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const router = useLocaleRouter();

  // 한국어 여부 확인 (ko 또는 ko-KR)
  const isKorean = i18n.language === 'ko' || i18n.language === 'ko-KR';
  const [activeTab, setActiveTab] = useState<'faq' | 'contact'>(() =>
    searchParams.get('tab') === 'contact' ? 'contact' : 'faq',
  );
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: '',
    subject: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);

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

  useEffect(() => {
    const tabParam = searchParams.get('tab');

    if (tabParam === 'contact' && activeTab !== 'contact') {
      setActiveTab('contact');
      return;
    }

    if (!tabParam && activeTab !== 'faq') {
      setActiveTab('faq');
    }
  }, [activeTab, searchParams]);

  const handleTabChange = useCallback(
    (tab: 'faq' | 'contact') => {
      setActiveTab(tab);

      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (tab === 'faq') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.push(qs ? `/customer-support?${qs}` : '/customer-support');
    },
    [searchParams, router],
  );

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: prev.name || (user.user_metadata?.name as string) || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user]);

  const faqs = useMemo(() => [
    {
      category: t('customerSupport.faq.categories.orderPayment.name'),
      items: [
        {
          question: t('customerSupport.faq.categories.orderPayment.items.download.question'),
          answer: t('customerSupport.faq.categories.orderPayment.items.download.answer')
        },
        {
          question: t('customerSupport.faq.categories.orderPayment.items.payment.question'),
          answer: t('customerSupport.faq.categories.orderPayment.items.payment.answer')
        },
        {
          question: t('customerSupport.faq.categories.orderPayment.items.refund.question'),
          answer: t('customerSupport.faq.categories.orderPayment.items.refund.answer')
        }
      ]
    },
    {
      category: t('customerSupport.faq.categories.sheetDownload.name'),
      items: [
        {
          question: t('customerSupport.faq.categories.sheetDownload.items.format.question'),
          answer: t('customerSupport.faq.categories.sheetDownload.items.format.answer')
        },
        {
          question: t('customerSupport.faq.categories.sheetDownload.items.print.question'),
          answer: t('customerSupport.faq.categories.sheetDownload.items.print.answer')
        },
        {
          question: t('customerSupport.faq.categories.sheetDownload.items.difficulty.question'),
          answer: t('customerSupport.faq.categories.sheetDownload.items.difficulty.answer')
        }
      ]
    },
    {
      category: t('customerSupport.faq.categories.customOrder.name'),
      items: [
        {
          question: t('customerSupport.faq.categories.customOrder.items.what.question'),
          answer: t('customerSupport.faq.categories.customOrder.items.what.answer')
        },
        {
          question: t('customerSupport.faq.categories.customOrder.items.duration.question'),
          answer: t('customerSupport.faq.categories.customOrder.items.duration.answer')
        },
        {
          question: t('customerSupport.faq.categories.customOrder.items.cost.question'),
          answer: t('customerSupport.faq.categories.customOrder.items.cost.answer')
        }
      ]
    }
  ], [t]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.category || !formData.subject || !formData.message) {
      alert(t('customerSupport.errors.fillAllFields'));
      return;
    }

    try {
      setSubmitting(true);
      const trimmedName = formData.name.trim();
      const trimmedEmail = formData.email.trim();
      const trimmedSubject = formData.subject.trim();
      const trimmedMessage = formData.message.trim();

      const { error: insertError } = await supabase.from('customer_inquiries').insert({
        user_id: user?.id ?? null,
        name: trimmedName,
        email: trimmedEmail,
        category: formData.category,
        subject: trimmedSubject,
        message: trimmedMessage,
        status: 'pending',
      });

      if (insertError) {
        throw insertError;
      }

      alert(t('customerSupport.messages.submitSuccess'));
      setFormData({
        name: user
          ? ((user.user_metadata?.name as string) ?? trimmedName)
          : '',
        email: user ? user.email ?? trimmedEmail : '',
        category: '',
        subject: '',
        message: ''
      });
    } catch (error) {
      console.error(t('customerSupport.console.inquiryError'), error);
      alert(t('customerSupport.errors.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenKakaoChannel = useCallback(() => {
    window.open('https://pf.kakao.com/_Hbxezxl/chat', '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="min-h-screen bg-white pb-24 md:pb-0">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>
      <div className="pt-0 md:pt-0">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white pt-24 pb-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3 md:space-y-4">
          <h1 className="text-3xl font-bold md:text-4xl">{t('customerSupport.title')}</h1>
          <p className="text-sm text-blue-100 md:text-xl">
            {t('customerSupport.subtitle')}
          </p>
        </div>
        </section>

        {/* Tab Navigation */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex justify-center mb-6 md:mb-8">
          <div className="bg-gray-100 rounded-xl p-1 flex gap-1">
            <button
              onClick={() => handleTabChange('faq')}
              className={`px-4 py-2 md:px-6 md:py-3 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer text-sm md:text-base ${
                activeTab === 'faq'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('customerSupport.tabs.faq')}
            </button>
            <button
              onClick={() => handleTabChange('contact')}
              className={`px-6 py-3 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'contact'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('customerSupport.tabs.contact')}
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        {activeTab === 'faq' && (
          <div className="max-w-4xl mx-auto">
            <div className="space-y-6 md:space-y-8">
              {faqs.map((category, categoryIndex) => (
                <div key={categoryIndex} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 md:px-6 md:py-4 border-b border-gray-200">
                    <h3 className="text-base font-semibold text-gray-900 md:text-lg">{category.category}</h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {category.items.map((faq, faqIndex) => (
                      <div key={faqIndex} className="p-4 md:p-6">
                        <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-start md:text-base">
                          <span className="bg-blue-100 text-blue-600 text-[11px] px-2 py-1 rounded-full mr-3 mt-0.5 flex-shrink-0">
                            Q
                          </span>
                          {faq.question}
                        </h4>
                        <div className="ml-7 md:ml-8">
                          <p className="text-sm text-gray-600 leading-relaxed md:text-base">{faq.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Form Section */}
        {activeTab === 'contact' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
              <div className="text-center mb-6 md:mb-8">
                <h2 className="text-xl font-bold text-gray-900 md:text-2xl md:mb-2">{t('customerSupport.contact.title')}</h2>
                <p className="text-gray-600">
                  {t('customerSupport.contact.description')}
                </p>
              </div>

              <form id="customer-inquiry" data-readdy-form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customerSupport.contact.form.name')} *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('customerSupport.contact.form.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customerSupport.contact.form.email')} *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('customerSupport.contact.form.emailPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('customerSupport.contact.form.inquiryType')} *
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">{t('customerSupport.contact.form.inquiryTypePlaceholder')}</option>
                    <option value="주문/결제">{t('customerSupport.contact.categories.orderPayment')}</option>
                    <option value="악보/다운로드">{t('customerSupport.contact.categories.sheetDownload')}</option>
                    <option value="주문제작">{t('customerSupport.contact.categories.customOrder')}</option>
                    <option value="기술지원">{t('customerSupport.contact.categories.technical')}</option>
                    <option value="기타">{t('customerSupport.contact.categories.other')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('customerSupport.contact.form.subject')} *
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('customerSupport.contact.form.subjectPlaceholder')}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('customerSupport.contact.form.message')} *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    required
                    rows={6}
                    maxLength={500}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder={t('customerSupport.contact.form.messagePlaceholder')}
                  />
                  <div className="text-right text-sm text-gray-500 mt-1">
                    {formData.message.length}/500{t('customerSupport.contact.form.characters')}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 font-medium transition-colors whitespace-nowrap cursor-pointer disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    {submitting 
                      ? t('customerSupport.contact.form.submitting')
                      : t('customerSupport.contact.form.submit')}
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    {t('customerSupport.contact.form.note')}
                  </p>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Contact Info */}
      <section className="bg-gray-50 py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 md:space-y-12">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">{t('customerSupport.contactInfo.title')}</h2>
            <p className="mt-2 text-sm text-gray-600 md:text-lg">
              {t('customerSupport.contactInfo.subtitle')}
            </p>
          </div>
          
          <div className={`grid grid-cols-1 gap-6 md:gap-8 ${isKorean ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <div className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-col md:items-center md:text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xl md:text-2xl">
                <i className="ri-mail-line" />
              </div>
              <div className="md:space-y-2">
                <h3 className="text-base font-semibold text-gray-900 md:text-lg">{t('customerSupport.contactInfo.email.title')}</h3>
                <p className="text-sm text-gray-600">{t('customerSupport.contactInfo.email.address')}</p>
                <p className="text-xs text-gray-500 md:text-sm">{t('customerSupport.contactInfo.email.description')}</p>
              </div>
            </div>

            {/* 카카오톡 상담 - 한국어일 때만 표시 */}
            {isKorean && (
              <div className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-col md:items-center md:text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 text-xl md:text-2xl">
                  <i className="ri-kakao-talk-fill" />
                </div>
                <div className="md:space-y-2">
                  <h3 className="text-base font-semibold text-gray-900 md:text-lg">{t('customerSupport.contactInfo.kakao.title')}</h3>
                  <p className="text-sm text-gray-600">{t('customerSupport.contactInfo.kakao.description')}</p>
                  <button
                    onClick={handleOpenKakaoChannel}
                    className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-xs font-semibold rounded-lg text-gray-900 bg-yellow-400 hover:bg-yellow-500 shadow-sm transition-colors md:text-sm"
                  >
                    {t('customerSupport.contactInfo.kakao.button')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-col md:items-center md:text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xl md:text-2xl">
                <i className="ri-time-line" />
              </div>
              <div className="md:space-y-2">
                <h3 className="text-base font-semibold text-gray-900 md:text-lg">{t('customerSupport.contactInfo.hours.title')}</h3>
                <p className="text-sm text-gray-600">{t('customerSupport.contactInfo.hours.weekdays')}</p>
                <p className="text-xs text-gray-500 md:text-sm">{t('customerSupport.contactInfo.hours.closed')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="hidden md:block">
        <Footer />
      </div>
      </div>
    </div>
  );
}
