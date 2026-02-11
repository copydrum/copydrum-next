'use client';
import SheetDetailPageContent from '@/_pages/sheet-detail/page';

export default function SheetDetailClient({ id }: { id: string }) {
  // The page component reads the id from useParams() internally
  return <SheetDetailPageContent />;
}
