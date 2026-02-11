import Home from '@/_pages/home/page';

export default async function LocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return <Home />;
}
