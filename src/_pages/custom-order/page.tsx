
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import MainHeader from '../../components/common/MainHeader';

const CustomOrderPage = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    songTitle: '',
    artist: '',
    songUrl: '',
    memo: ''
  });

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        userId: user.email || user.id
      }));
    }
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert(t('customOrder.errors.loginRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('custom_orders')
        .insert({
          user_id: user.id,
          name: user.user_metadata?.name || user.email,
          email: user.email,
          phone: '',
          song_title: formData.songTitle,
          artist: formData.artist,
          song_url: formData.songUrl,
          requirements: formData.memo,
          status: 'pending',
          max_download_count: 20 // 기본 다운로드 횟수 20회로 설정
        });

      if (error) throw error;

      alert(t('customOrder.messages.submitSuccess'));
      setFormData({
        userId: user.email || user.id,
        songTitle: '',
        artist: '',
        songUrl: '',
        memo: ''
      });
    } catch (error) {
      console.error(t('customOrder.console.submitError'), error);
      alert(t('customOrder.errors.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {t('customOrder.login.required')}
          </h2>
          <p className="text-gray-600 mb-6">
            {t('customOrder.login.description')}
          </p>
          <a href="/auth/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
            {t('customOrder.login.button')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />

      {/* Main Content */}
      <div>
        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-12">
          {/* Hero Section */}
          <div className="text-center mb-10 md:mb-12">
            <h1 className="text-3xl font-bold text-gray-900 mb-3 md:text-4xl md:mb-4">
              {t('customOrder.title')}
            </h1>
            <div className="text-base text-gray-600 max-w-2xl mx-auto space-y-2 md:text-xl">
              <p>{t('customOrder.description.line1')}</p>
              <p>{t('customOrder.description.line2')}</p>
              <p>{t('customOrder.description.line3')}</p>
            </div>
          </div>

          {/* Pricing Info */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-10 border border-blue-100 md:p-8 md:mb-12">
            <h2 className="text-xl font-bold text-gray-900 text-center mb-5 md:text-2xl md:mb-6">
              {t('customOrder.pricing.title')}
            </h2>
            <div className="grid gap-5 md:grid-cols-3 md:gap-6">
              <div className="bg-white rounded-lg p-5 shadow-sm border border-emerald-100 md:p-6">
                <div className="bg-emerald-100 text-emerald-800 text-center py-3 rounded-lg mb-3 md:mb-4">
                  <h3 className="text-lg font-bold md:text-xl">{t('customOrder.pricing.grades.c.name')}</h3>
                  <p className="text-base font-semibold md:text-lg">{t('customOrder.pricing.grades.c.price')}</p>
                </div>
                <p className="text-gray-700 text-center text-sm leading-relaxed md:text-base">
                  {t('customOrder.pricing.grades.c.description')}
                </p>
              </div>

              <div className="bg-white rounded-lg p-5 shadow-sm border border-amber-100 md:p-6">
                <div className="bg-amber-100 text-amber-800 text-center py-3 rounded-lg mb-3 md:mb-4">
                  <h3 className="text-lg font-bold md:text-xl">{t('customOrder.pricing.grades.b.name')}</h3>
                  <p className="text-base font-semibold md:text-lg">{t('customOrder.pricing.grades.b.price')}</p>
                </div>
                <p className="text-gray-700 text-center text-sm leading-relaxed md:text-base">
                  {t('customOrder.pricing.grades.b.description')}
                </p>
              </div>

              <div className="bg-white rounded-lg p-5 shadow-sm border border-rose-100 md:p-6">
                <div className="bg-rose-100 text-rose-800 text-center py-3 rounded-lg mb-3 md:mb-4">
                  <h3 className="text-lg font-bold md:text-xl">{t('customOrder.pricing.grades.a.name')}</h3>
                  <p className="text-base font-semibold md:text-lg">{t('customOrder.pricing.grades.a.price')}</p>
                </div>
                <p className="text-gray-700 text-center text-sm leading-relaxed md:text-base">
                  {t('customOrder.pricing.grades.a.description')}
                </p>
              </div>
            </div>
            <div className="text-center mt-5 md:mt-6">
              <p className="text-xs text-gray-600 md:text-sm">
                {t('customOrder.pricing.note')}
              </p>
            </div>
          </div>

          {/* Order Form */}
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-5 md:text-2xl md:mb-6">
              {t('customOrder.form.title')}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* User ID */}
              <div>
                <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('customOrder.form.applicantId')}
                </label>
                <input
                  type="text"
                  id="userId"
                  name="userId"
                  value={formData.userId}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 text-sm"
                  placeholder={t('customOrder.form.applicantIdPlaceholder')}
                />
              </div>

              {/* Song Information */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('customOrder.form.songInfo')}
                </h3>

                <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                  <div>
                    <label htmlFor="songTitle" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customOrder.form.songTitle')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="songTitle"
                      name="songTitle"
                      value={formData.songTitle}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder={t('customOrder.form.songTitlePlaceholder')}
                    />
                  </div>
                  <div>
                    <label htmlFor="artist" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customOrder.form.artist')}
                    </label>
                    <input
                      type="text"
                      id="artist"
                      name="artist"
                      value={formData.artist}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder={t('customOrder.form.artistPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="songUrl" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('customOrder.form.youtubeUrl')}
                  </label>
                  <input
                    type="url"
                    id="songUrl"
                    name="songUrl"
                    value={formData.songUrl}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder={t('customOrder.form.youtubeUrlPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('customOrder.form.youtubeUrlHint')}
                  </p>
                </div>
              </div>

              {/* Memo */}
              <div>
                <label htmlFor="memo" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('customOrder.form.memo')}
                </label>
                <textarea
                  id="memo"
                  name="memo"
                  value={formData.memo}
                  onChange={handleInputChange}
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                  placeholder={t('customOrder.form.memoPlaceholder')}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.memo.length}/500{t('customOrder.form.characters')}
                </p>
              </div>

              {/* Submit Button */}
              <div className="border-t pt-6">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors duration-200 whitespace-nowrap disabled:bg-gray-400"
                >
                  {isSubmitting
                    ? t('customOrder.form.submitting')
                    : t('customOrder.form.submit')}
                </button>
                <p className="text-sm text-gray-500 text-center mt-4">
                  {t('customOrder.form.note')}
                </p>
              </div>
            </form>
          </div>

          {/* Process Section */}
          <div className="mt-16 bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              {t('customOrder.process.title')}
            </h2>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-orange-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-file-text-line text-2xl text-orange-600"></i>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t('customOrder.process.steps.request.title')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('customOrder.process.steps.request.description')}
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-mail-line text-2xl text-blue-600"></i>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t('customOrder.process.steps.quote.title')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('customOrder.process.steps.quote.description')}
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-bank-card-line text-2xl text-green-600"></i>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t('customOrder.process.steps.payment.title')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('customOrder.process.steps.payment.description')}
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-download-line text-2xl text-purple-600"></i>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t('customOrder.process.steps.completed.title')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('customOrder.process.steps.completed.description')}
                </p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-16 bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              {t('customOrder.faq.title')}
            </h2>

            <div className="space-y-6">
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  <i className="ri-question-line text-blue-600 mr-2"></i>
                  {t('customOrder.faq.questions.quote.question')}
                </h3>
                <p className="text-gray-600 ml-6">
                  {t('customOrder.faq.questions.quote.answer')}
                </p>
              </div>

              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  <i className="ri-question-line text-blue-600 mr-2"></i>
                  {t('customOrder.faq.questions.production.question')}
                </h3>
                <p className="text-gray-600 ml-6">
                  {t('customOrder.faq.questions.production.answer')}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  <i className="ri-question-line text-blue-600 mr-2"></i>
                  {t('customOrder.faq.questions.payment.question')}
                </h3>
                <p className="text-gray-600 ml-6">
                  {t('customOrder.faq.questions.payment.answer')}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CustomOrderPage;
