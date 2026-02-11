import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new NextResponse('<rss version="2.0"><channel><title>COPYDRUM</title></channel></rss>', {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: sheets } = await supabase
    .from('drum_sheets')
    .select('id, title, artist, created_at, updated_at, slug')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const items = (sheets || [])
    .map(
      (sheet) => `
    <item>
      <title><![CDATA[${sheet.title} - ${sheet.artist}]]></title>
      <link>https://copydrum.com/drum-sheet/${sheet.slug}</link>
      <guid isPermaLink="true">https://copydrum.com/drum-sheet/${sheet.slug}</guid>
      <pubDate>${new Date(sheet.created_at).toUTCString()}</pubDate>
      <description><![CDATA[Drum sheet music for ${sheet.title} by ${sheet.artist}]]></description>
    </item>`
    )
    .join('');

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>COPYDRUM - Drum Sheet Music</title>
    <link>https://copydrum.com</link>
    <description>Latest drum sheet music from COPYDRUM</description>
    <language>ko</language>
    <atom:link href="https://copydrum.com/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(rssXml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
