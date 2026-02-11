import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';

export default function CompanyAboutPage() {
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <MainHeader user={user} />
      <div>
        <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold mb-4">
              {t('companyAbout.title')}
            </h1>
            <p className="text-lg text-blue-100 leading-relaxed">
              {t('companyAbout.intro')}
            </p>
          </div>
        </section>

        <main className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {t('companyAbout.mission.title')}
              </h2>
              <p className="text-lg leading-relaxed text-gray-700">
                {t('companyAbout.mission.description')}
              </p>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">
                  {t('companyAbout.expertise.title')}
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  {t('companyAbout.expertise.description')}
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">
                  {t('companyAbout.network.title')}
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  {t('companyAbout.network.description')}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                <h4 className="text-xl font-semibold text-blue-900 mb-3">
                  {t('companyAbout.features.notationTeam.title')}
                </h4>
                <p className="text-blue-800 leading-relaxed">
                  {t('companyAbout.features.notationTeam.description')}
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
                <h4 className="text-xl font-semibold text-purple-900 mb-3">
                  {t('companyAbout.features.genres.title')}
                </h4>
                <p className="text-purple-800 leading-relaxed">
                  {t('companyAbout.features.genres.description')}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
                <h4 className="text-xl font-semibold text-emerald-900 mb-3">
                  {t('companyAbout.features.updates.title')}
                </h4>
                <p className="text-emerald-800 leading-relaxed">
                  {t('companyAbout.features.updates.description')}
                </p>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-lg p-10 border border-gray-100">
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">
                {t('companyAbout.values.title')}
              </h3>
              <ul className="space-y-4 text-gray-700 leading-relaxed">
                <li>
                  <span className="font-semibold text-blue-600">
                    {t('companyAbout.values.accuracy.label')}
                  </span>{' '}
                  {t('companyAbout.values.accuracy.description')}
                </li>
                <li>
                  <span className="font-semibold text-blue-600">
                    {t('companyAbout.values.accessibility.label')}
                  </span>{' '}
                  {t('companyAbout.values.accessibility.description')}
                </li>
                <li>
                  <span className="font-semibold text-blue-600">
                    {t('companyAbout.values.connectivity.label')}
                  </span>{' '}
                  {t('companyAbout.values.connectivity.description')}
                </li>
              </ul>
            </section>

            <section>
              <div className="bg-gray-900 text-white rounded-2xl p-10">
                <h3 className="text-2xl font-semibold mb-4">
                  {t('companyAbout.partner.title')}
                </h3>
                <p className="text-gray-200 leading-relaxed">
                  {t('companyAbout.partner.description')}
                </p>
              </div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}


