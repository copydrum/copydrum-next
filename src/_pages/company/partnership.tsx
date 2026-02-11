import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';

interface Partner {
  name: string;
  description: string;
  region: 'domestic' | 'global';
}

const domesticPartners: Partner[] = [];

const globalPartners: Partner[] = [];

export default function PartnershipPage() {
  const { t } = useTranslation();
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <MainHeader user={user} />
      <div>
        <section className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold mb-4">
              {t('companyPartnership.title')}
            </h1>
            <p className="text-lg text-purple-100 leading-relaxed">
              {t('companyPartnership.description')}
            </p>
          </div>
        </section>

        <main className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {t('companyPartnership.benefits.title')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">
                    {t('companyPartnership.benefits.exclusiveLicense.title')}
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {t('companyPartnership.benefits.exclusiveLicense.description')}
                  </p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">
                    {t('companyPartnership.benefits.premiumSupport.title')}
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {t('companyPartnership.benefits.premiumSupport.description')}
                  </p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">
                    {t('companyPartnership.benefits.sharedGrowth.title')}
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {t('companyPartnership.benefits.sharedGrowth.description')}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-gray-900 text-white rounded-2xl p-10 space-y-6">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  {t('companyPartnership.inquiry.title')}
                </h2>
                <p className="text-lg text-gray-200 leading-relaxed">
                  {t('companyPartnership.inquiry.description')}
                </p>
              </div>
              <div className="space-y-3 text-lg">
                <p>
                  {t('companyPartnership.inquiry.emailLabel')}{' '}
                  <a
                    href="mailto:copydrum.hanmail.net"
                    className="text-blue-200 hover:text-white underline underline-offset-4 cursor-pointer"
                  >
                    copydrum.hanmail.net
                  </a>
                </p>
                <p>
                  {t('companyPartnership.inquiry.note')}
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

