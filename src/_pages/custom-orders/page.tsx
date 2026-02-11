'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';

const CustomOrdersPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useLocaleRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          router.push('/auth/login');
          return;
        }

        setUser(currentUser);
      } catch (error) {
        console.error('인증 확인 오류:', error);
        router.push('/auth/login');
      }
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/auth/login');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const STATUS_META: Record<
    string,
    { label: string; badgeClass: string; infoClass?: string; message?: string; icon?: string }
  > = useMemo(() => ({
    pending: {
      label: t('customOrders.status.pending.label'),
      badgeClass: 'bg-amber-100 text-amber-700',
      infoClass: 'bg-amber-50 border-l-4 border-amber-400 text-amber-800',
      message: t('customOrders.status.pending.message'),
      icon: 'ri-time-line',
    },
    quoted: {
      label: t('customOrders.status.quoted.label'),
      badgeClass: 'bg-sky-100 text-sky-700',
      infoClass: 'bg-sky-50 border-l-4 border-sky-400 text-sky-800',
      message: t('customOrders.status.quoted.message'),
      icon: 'ri-information-line',
    },
    payment_confirmed: {
      label: t('customOrders.status.payment_confirmed.label'),
      badgeClass: 'bg-emerald-100 text-emerald-700',
      infoClass: 'bg-emerald-50 border-l-4 border-emerald-400 text-emerald-800',
      message: t('customOrders.status.payment_confirmed.message'),
      icon: 'ri-check-line',
    },
    in_progress: {
      label: t('customOrders.status.in_progress.label'),
      badgeClass: 'bg-indigo-100 text-indigo-700',
      infoClass: 'bg-indigo-50 border-l-4 border-indigo-400 text-indigo-800',
      message: t('customOrders.status.in_progress.message'),
      icon: 'ri-tools-line',
    },
    completed: {
      label: t('customOrders.status.completed.label'),
      badgeClass: 'bg-purple-100 text-purple-700',
      infoClass: 'bg-green-50 border-l-4 border-green-400 text-green-800',
      message: t('customOrders.status.completed.message'),
      icon: 'ri-star-smile-line',
    },
    cancelled: {
      label: t('customOrders.status.cancelled.label'),
      badgeClass: 'bg-gray-200 text-gray-600',
    },
  }), [t]);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('custom_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (order: any) => {
    if (!order.completed_pdf_url) return;

    const maxDownload = order.max_download_count;
    const usedCount = order.download_count ?? 0;
    const hasLimit = typeof maxDownload === 'number' && maxDownload > 0;
    if (hasLimit && usedCount >= maxDownload) {
      alert(t('customOrders.alerts.downloadLimitExceeded'));
      return;
    }

    if (order.download_expires_at) {
      const expires = new Date(order.download_expires_at);
      if (!Number.isNaN(expires.getTime()) && new Date() > expires) {
        alert(t('customOrders.alerts.downloadExpired'));
        return;
      }
    }

    try {
      // 다운로드 횟수 증가
      const { error: updateError } = await supabase
        .from('custom_orders')
        .update({ 
          download_count: (order.download_count || 0) + 1 
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // 파일 다운로드
      const response = await fetch(order.completed_pdf_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = order.completed_pdf_filename || `${order.song_title}_${t('customOrders.order.sheetMusicSuffix')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // 상태 새로고침
      await fetchOrders();

      alert(t('customOrders.alerts.downloadSuccess'));
    } catch (error) {
      console.error('Error downloading file:', error);
      alert(t('customOrders.alerts.downloadFailed'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="hidden md:block">
          <MainHeader user={user} />
        </div>
        <div className="py-16 text-center text-gray-500">
          <i className="ri-loader-4-line text-4xl animate-spin text-blue-500 mb-4" />
          <p className="font-medium">{t('customOrders.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Header */}
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      {/* Main Content */}
      <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('customOrders.title')}</h1>

            {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">{t('customOrders.loading')}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <i className="ri-file-list-3-line text-4xl text-gray-400 mb-4"></i>
              <p className="text-gray-600">{t('customOrders.empty.message')}</p>
              <a href="/custom-order" className="inline-block mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {t('customOrders.empty.button')}
              </a>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => {
                const meta = STATUS_META[order.status] ?? STATUS_META.pending;
                const maxDownload = order.max_download_count ?? 5;
                const usedCount = order.download_count ?? 0;
                const downloadExpiresAt = order.download_expires_at
                  ? new Date(order.download_expires_at)
                  : null;
                const downloadExpired =
                  downloadExpiresAt && !Number.isNaN(downloadExpiresAt.getTime())
                    ? new Date() > downloadExpiresAt
                    : false;

                return (
                  <div key={order.id} className="border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">{order.song_title}</h3>
                        <p className="text-sm text-gray-600">{t('customOrders.order.artist')}: {order.artist}</p>
                        <p className="text-xs text-gray-500">
                          {t('customOrders.order.applicationDate')}: {new Date(order.created_at).toLocaleDateString()}
                        </p>
                        {typeof order.estimated_price === 'number' && order.estimated_price > 0 && (
                          <p className="mt-1 text-xs text-blue-600">
                            {t('customOrders.order.estimatedPrice')}: ₩{order.estimated_price.toLocaleString('ko-KR')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                        {order.status === 'quoted' && (
                          <p className="text-xs font-semibold text-gray-700">
                            {order.estimated_price && typeof order.estimated_price === 'number' && order.estimated_price > 0
                              ? `${t('customOrders.order.quote')}: ₩${order.estimated_price.toLocaleString('ko-KR')}`
                              : t('customOrders.order.checkQuote')}
                          </p>
                        )}
                        {order.status === 'completed' && !order.estimated_price && (
                          <p className="text-xs font-semibold text-gray-700">{t('customOrders.order.workCompleted')}</p>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>{t('customOrders.order.requirements')}:</strong>
                      </p>
                      <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                        {order.requirements || t('customOrders.order.noRequirements')}
                      </p>
                    </div>

                    {order.song_url && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>{t('customOrders.order.referenceVideo')}:</strong>
                        </p>
                        <a
                          href={order.song_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm break-all"
                        >
                          {order.song_url}
                        </a>
                      </div>
                    )}

                    {order.admin_reply && (
                      <div className="mb-4 bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                        <div className="flex items-start gap-2">
                          <i className="ri-admin-line text-blue-600 text-lg mt-0.5"></i>
                          <div>
                            <p className="text-sm font-medium text-blue-800 mb-1">{t('customOrders.order.adminReply')}</p>
                            <p className="text-sm text-blue-700 whitespace-pre-wrap">
                              {order.admin_reply}
                            </p>
                            <p className="text-xs text-blue-600 mt-2">
                              {t('customOrders.order.replyDate')}:{' '}
                              {order.updated_at
                                ? new Date(order.updated_at).toLocaleDateString()
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {order.status === 'completed' && order.completed_pdf_url && (
                      <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-3">
                            <i className="ri-file-download-line text-green-600 text-lg mt-1"></i>
                            <div>
                              <p className="text-sm font-medium text-green-800 mb-1">{t('customOrders.order.completedSheet')}</p>
                              <p className="text-sm text-green-700">
                                {order.completed_pdf_filename ?? t('customOrders.order.completedSheetFilename')}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-4 text-xs text-green-700">
                                <span>
                                  {t('customOrders.order.downloadCount')} {usedCount}/{maxDownload}{t('customOrders.order.times')}
                                </span>
                                {downloadExpiresAt && !Number.isNaN(downloadExpiresAt.getTime()) && (
                                  <span>{t('customOrders.order.expiryDate')} {downloadExpiresAt.toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownload(order)}
                            disabled={usedCount >= maxDownload || downloadExpired}
                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            <i className="ri-download-line"></i>
                            {t('customOrders.order.download')}
                          </button>
                        </div>

                        {usedCount >= maxDownload && (
                          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            <i className="ri-error-warning-line mr-1"></i>
                            {t('customOrders.warnings.downloadLimitExceeded')}
                          </div>
                        )}

                        {downloadExpired && (
                          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            <i className="ri-time-line mr-1"></i>
                            {t('customOrders.warnings.downloadPeriodExpired')}
                          </div>
                        )}
                      </div>
                    )}

                    {meta.message && meta.infoClass && (
                      <div className={`${meta.infoClass} mt-4 flex items-start gap-2 rounded-lg px-4 py-3`}>
                        {meta.icon ? <i className={`${meta.icon} mt-0.5 text-base`}></i> : null}
                        <p className="text-sm leading-relaxed">{meta.message}</p>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-400">
                        {t('customOrders.order.recentUpdate')}:{' '}
                        {order.updated_at
                          ? new Date(order.updated_at).toLocaleString('ko-KR')
                          : new Date(order.created_at).toLocaleString('ko-KR')}
                      </p>
                      <button
                        onClick={() => router.push(`/custom-order-detail/${order.id}`)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        <i className="ri-chat-1-line"></i>
                        {t('customOrders.order.viewDetails')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer (PC) */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default CustomOrdersPage;