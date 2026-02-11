'use client';
import dynamic from 'next/dynamic';

const AdminDashboard = dynamic(() => import('@/_pages/admin/page'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  ),
});

export default function AdminPage() {
  return <AdminDashboard />;
}
