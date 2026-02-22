import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface MarketingPost {
    id: string;
    sheet_id: string;
    platform: string;
    status: 'success' | 'failed' | 'manual_copy' | 'skipped';
    post_url: string | null;
    error_message: string | null;
    posted_at: string;
    drum_sheets?: {
        title: string;
        artist: string;
    };
}

interface DrumSheet {
    id: string;
    title: string;
    artist: string;
    preview_image_url: string;
    pdf_url: string;
    youtube_url: string;
    slug?: string;
}

const PLATFORMS = [
    { id: 'naver', name: '네이버 블로그', color: 'bg-green-500', text: 'text-green-600' },
    { id: 'tistory', name: '티스토리', color: 'bg-orange-500', text: 'text-orange-600' },
    { id: 'facebook', name: '페이스북', color: 'bg-blue-600', text: 'text-blue-600' },
    { id: 'google', name: '구글 블로그', color: 'bg-red-500', text: 'text-red-600' },
    { id: 'pinterest', name: '핀터레스트', color: 'bg-red-600', text: 'text-red-700' },
] as const;

export default function MarketingStatus() {
    const [activeTab, setActiveTab] = useState<string>('naver');
    const [posts, setPosts] = useState<MarketingPost[]>([]);
    const [queue, setQueue] = useState<DrumSheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [queueLoading, setQueueLoading] = useState(false);
    const [dailyLimit, setDailyLimit] = useState(1);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    // const [searchResults, setSearchResults] = useState<DrumSheet[]>([]); // Removed
    // const [isSearching, setIsSearching] = useState(false); // Removed

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 15;

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        // Reset page to 1 when tab changes
        setPage(1);
    }, [activeTab]);

    useEffect(() => {
        fetchData();
    }, [activeTab, selectedCategory, page, searchQuery]); // Added searchQuery dependency

    const fetchCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('id, name')
                .order('name');

            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setQueueLoading(true);
        try {
            // 1. Fetch posts for this platform with pagination
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data: postsData, error: postsError, count } = await supabase
                .from('marketing_posts')
                .select(`
                    *,
                    drum_sheets (title, artist)
                `, { count: 'exact' })
                .eq('platform', activeTab)
                .order('posted_at', { ascending: false })
                .range(from, to);

            if (postsError) throw postsError;
            setPosts(postsData as unknown as MarketingPost[]);
            setTotalCount(count || 0);

            // 2. Fetch daily limit setting
            const { data: settingsData } = await supabase
                .from('marketing_settings')
                .select('daily_limit')
                .eq('platform', activeTab)
                .single();

            const limit = settingsData?.daily_limit || 1;
            setDailyLimit(limit);

            // 3. Fetch Queue (Unposted sheets)
            // First get IDs of posted sheets
            const { data: postedSheets } = await supabase
                .from('marketing_posts')
                .select('sheet_id')
                .eq('platform', activeTab);

            const postedIds = postedSheets?.map(p => p.sheet_id) || [];

            // Fetch candidates
            let query = supabase
                .from('drum_sheets')
                .select('*')
                .order('created_at', { ascending: false });

            if (searchQuery) {
                // If searching, ignore category and daily limit (show top 15 matches)
                query = query.or(`title.ilike.%${searchQuery}%,artist.ilike.%${searchQuery}%`);
                // Still exclude posted ones? Yes, usually.
                if (postedIds.length > 0) {
                    query = query.not('id', 'in', `(${postedIds.join(',')})`);
                }
                const { data: queueData, error: queueError } = await query.limit(15);
                if (queueError) throw queueError;
                setQueue(queueData || []);
            } else {
                // Normal queue logic
                if (selectedCategory) {
                    query = query.eq('category_id', selectedCategory);
                }

                if (postedIds.length > 0) {
                    query = query.not('id', 'in', `(${postedIds.join(',')})`);
                }

                const { data: queueData, error: queueError } = await query.limit(limit);

                if (queueError) throw queueError;
                setQueue(queueData || []);
            }

        } catch (error) {
            console.error('Error fetching marketing data:', error);
        } finally {
            setLoading(false);
            setQueueLoading(false);
        }
    };

    const handleCopyTitle = (sheet: DrumSheet) => {
        const isNaver = activeTab === 'naver';
        const suffix = isNaver ? '드럼악보' : 'DRUM SHEET MUSIC';
        const text = `${sheet.artist} - ${sheet.title} - ${suffix}`;
        navigator.clipboard.writeText(text).then(() => {
            alert((isNaver ? '제목이 복사되었습니다: ' : 'Title copied: ') + text);
        });
    };

    const handleCopyTags = (sheet: DrumSheet) => {
        const isNaver = activeTab === 'naver';

        // Remove special characters for tags
        const cleanArtist = sheet.artist.replace(/[^\w가-힣]/g, '');
        const cleanTitle = sheet.title.replace(/[^\w가-힣]/g, '');

        let tags: string[] = [];

        if (isNaver) {
            tags = [
                '드럼악보',
                '드럼커버',
                '드럼연주',
                '악보제작',
                '카피드럼',
                'CopyDrum',
                'DrumSheet',
                'DrumCover',
                'DrumScore',
                `${sheet.artist}`,
                `${sheet.title}`,
                `${cleanArtist}드럼`,
                `${cleanTitle}드럼`
            ];
        } else {
            tags = [
                'DrumSheet',
                'DrumCover',
                'DrumScore',
                'DrumMusic',
                'SheetMusic',
                'CopyDrum',
                'Drummer',
                'Drums',
                `${sheet.artist}`,
                `${sheet.title}`,
                `${cleanArtist}Drum`,
                `${cleanTitle}Drum`
            ];
        }

        const tagString = tags.map(t => `#${t}`).join(' ');

        navigator.clipboard.writeText(tagString).then(() => {
            alert((isNaver ? '태그가 복사되었습니다: ' : 'Tags copied: ') + tagString);
        });
    };

    const handleDownloadImage = async (sheet: DrumSheet) => {
        if (!sheet.preview_image_url) {
            alert('이미지 URL이 없습니다.');
            return;
        }
        try {
            const response = await fetch(sheet.preview_image_url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sheet.artist} - ${sheet.title}.jpg`; // Set filename
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Image download failed:', error);
            alert('이미지 다운로드에 실패했습니다.');
        }
    };

    const handleCopyLink = (sheet: DrumSheet) => {
        const url = activeTab === 'naver'
            ? `https://copydrum.com/drum-sheet/${sheet.slug}`
            : `https://en.copydrum.com/drum-sheet/${sheet.slug}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('상품 링크가 복사되었습니다: ' + url);
        });
    };

    const handleCopyBody = (sheet: DrumSheet) => {
        const isNaver = activeTab === 'naver';
        const isPinterest = activeTab === 'pinterest';
        const isTistory = activeTab === 'tistory';

        const sheetUrl = isNaver
            ? `https://copydrum.com/drum-sheet/${sheet.slug}`
            : `https://en.copydrum.com/drum-sheet/${sheet.slug}`;

        const imageHtml = sheet.preview_image_url
            ? `<img src="${sheet.preview_image_url}" alt="${sheet.title} ${isNaver ? '드럼 악보 미리보기' : 'Drum Sheet Music Preview'}" style="max-width:100%;height:auto;display:block;margin:10px auto;" />`
            : '';

        // 네이버/티스토리용: table 기반 버튼 (bgcolor 속성은 대부분의 블로그 에디터에서 지원)
        const tableButton = (label: string) => `
<div style="text-align:center;margin:25px 0;">
<table border="0" cellspacing="0" cellpadding="0" align="center" style="border-collapse:separate;">
<tr>
<td align="center" bgcolor="#2563eb" style="border-radius:10px;padding:18px 40px;">
<a href="${sheetUrl}" target="_blank" style="text-decoration:none;color:#ffffff;font-size:20px;font-weight:bold;">🥁 ${label}</a>
</td>
</tr>
</table>
</div>`;

        // 구글 블로거용: 인라인 CSS 버튼 (구글 블로거는 인라인 스타일 완벽 지원)
        const inlineButton = (label: string) => `
<p style="text-align:center;margin:30px 0;">
<a href="${sheetUrl}" target="_blank" style="background-color:#2563eb;color:#ffffff;padding:20px 40px;text-decoration:none;border-radius:8px;font-size:20px;font-weight:bold;display:inline-block;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
🥁 ${label}
</a>
</p>`;

        let content = '';

        if (isPinterest) {
            // 핀터레스트: 플레인 텍스트 + URL 포함
            content = `🥁 ${sheet.artist} - ${sheet.title} | Drum Sheet Music

Get this drum sheet music at CopyDrum!
👉 ${sheetUrl}
${sheet.youtube_url ? `\n🎬 Watch: ${sheet.youtube_url}` : ''}`;

            navigator.clipboard.writeText(content.trim()).then(() => {
                alert('설명이 복사되었습니다.');
            });
            return;
        }

        if (isNaver) {
            content = `
<p>안녕하세요! CopyDrum입니다.</p>
<p>오늘 소개해드릴 드럼 악보는 <strong>${sheet.artist}</strong>의 <strong>${sheet.title}</strong>입니다.</p>
<br/>
${imageHtml}
<br/>
<p>이 악보는 CopyDrum에서 구매하실 수 있습니다.</p>
${tableButton('악보 보러가기')}
<br/>
${sheet.youtube_url ? `<p>관련 영상: <a href="${sheet.youtube_url}">${sheet.youtube_url}</a></p>` : ''}
`;
        } else if (isTistory) {
            content = `
<p>Hello! This is CopyDrum.</p>
<p>Today we are introducing drum sheet music for <strong>${sheet.artist}</strong> - <strong>${sheet.title}</strong>.</p>
<br/>
${imageHtml}
<br/>
<p>You can purchase this sheet music at CopyDrum.</p>
${tableButton('Get Sheet Music')}
<br/>
${sheet.youtube_url ? `<p>Related Video: <a href="${sheet.youtube_url}">${sheet.youtube_url}</a></p>` : ''}
`;
        } else {
            // 구글 블로거, 페이스북 등: 인라인 CSS 버튼
            content = `
<p>Hello! This is CopyDrum.</p>
<p>Today we are introducing drum sheet music for <strong>${sheet.artist}</strong> - <strong>${sheet.title}</strong>.</p>
<br/>
${imageHtml}
<br/>
<p>You can purchase this sheet music at CopyDrum.</p>
${inlineButton('Get Sheet Music')}
<br/>
${sheet.youtube_url ? `<p>Related Video: <a href="${sheet.youtube_url}">${sheet.youtube_url}</a></p>` : ''}
`;
        }

        // DOM 기반 복사: 이미지가 포함된 리치 텍스트를 안정적으로 복사
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = content;
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        tempContainer.style.opacity = '0';
        document.body.appendChild(tempContainer);

        const range = document.createRange();
        range.selectNodeContents(tempContainer);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (err) {
            console.warn('execCommand copy failed:', err);
        }

        if (selection) {
            selection.removeAllRanges();
        }
        document.body.removeChild(tempContainer);

        if (copied) {
            alert(isNaver ? '본문 내용이 복사되었습니다. 블로그 에디터에 붙여넣기 하세요.' : 'Content copied. Paste it into your blog editor.');
        } else {
            // Fallback: ClipboardItem API
            const blob = new Blob([content], { type: 'text/html' });
            const strippedText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const textBlob = new Blob([strippedText], { type: 'text/plain' });
            const item = new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            });

            navigator.clipboard.write([item]).then(() => {
                alert(isNaver ? '본문 내용이 복사되었습니다. 블로그 에디터에 붙여넣기 하세요.' : 'Content copied. Paste it into your blog editor.');
            }).catch(err => {
                console.error('Clipboard write failed:', err);
                alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
            });
        }
    };

    const handleMarkAsPosted = async (sheet: DrumSheet) => {
        if (!confirm(`'${sheet.title}' 악보를 ${activeTab}에 포스팅 완료 처리하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('marketing_posts')
                .insert({
                    platform: activeTab,
                    sheet_id: sheet.id,
                    status: 'manual_copy',
                    posted_at: new Date().toISOString()
                });

            if (error) throw error;

            // Remove from queue locally
            setQueue(prev => prev.filter(s => s.id !== sheet.id));
            // Add to posts locally
            setPosts(prev => [{
                id: 'temp-' + Date.now(),
                sheet_id: sheet.id,
                platform: activeTab,
                status: 'manual_copy',
                post_url: null,
                error_message: null,
                posted_at: new Date().toISOString(),
                drum_sheets: {
                    title: sheet.title,
                    artist: sheet.artist
                }
            }, ...prev]);

        } catch (error) {
            console.error('Error marking as posted:', error);
            alert('처리 중 오류가 발생했습니다.');
        }
    };

    const handleSkip = async (sheet: DrumSheet) => {
        if (!confirm(`'${sheet.title}' 악보를 대기열에서 제외하시겠습니까?\n(이 작업은 취소할 수 없으며, 해당 플랫폼의 대기열에 다시 나타나지 않습니다.)`)) return;

        try {
            const { error } = await supabase
                .from('marketing_posts')
                .insert({
                    platform: activeTab,
                    sheet_id: sheet.id,
                    status: 'skipped',
                    posted_at: new Date().toISOString()
                });

            if (error) throw error;

            // Remove from queue locally
            setQueue(prev => prev.filter(s => s.id !== sheet.id));

            // Add to history
            setPosts(prev => [{
                id: 'temp-skip-' + Date.now(),
                sheet_id: sheet.id,
                platform: activeTab,
                status: 'skipped',
                post_url: null,
                error_message: null,
                posted_at: new Date().toISOString(),
                drum_sheets: {
                    title: sheet.title,
                    artist: sheet.artist
                }
            }, ...prev]);

        } catch (error) {
            console.error('Error skipping sheet:', error);
            alert('처리 중 오류가 발생했습니다.');
        }
    };

    // Removed handleSearch and handleAddToQueue


    const activePlatform = PLATFORMS.find(p => p.id === activeTab);
    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="space-y-6">
            {/* Platform Tabs */}
            <div className="bg-white rounded-lg shadow p-2">
                <div className="flex space-x-2 overflow-x-auto pb-2 md:pb-0">
                    {PLATFORMS.map(platform => (
                        <button
                            key={platform.id}
                            onClick={() => setActiveTab(platform.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === platform.id
                                ? `${platform.color} text-white`
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {platform.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search & Register Removed */}


            {/* Work Queue */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <i className="ri-list-check"></i>
                            작업 대기열 ({activePlatform?.name})
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            일일 목표({dailyLimit}개)에 따라 아직 포스팅되지 않은 악보를 보여줍니다.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="제목/아티스트 검색..."
                                className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 w-48 md:w-64"
                            />
                            <i className="ri-search-line absolute left-2.5 top-2.5 text-gray-400"></i>
                        </div>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            disabled={!!searchQuery} // Disable category filter when searching
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                            <option value="">모든 장르</option>
                            {categories.map(category => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={fetchData}
                            className="text-gray-500 hover:text-gray-700 p-2"
                            title="새로고침"
                        >
                            <i className="ri-refresh-line text-xl"></i>
                        </button>
                    </div>
                </div>

                {queueLoading ? (
                    <div className="text-center py-8 text-gray-500">대기열을 불러오는 중...</div>
                ) : queue.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <i className="ri-check-double-line text-3xl text-green-500 mb-2"></i>
                        <p className="text-gray-600 font-medium">오늘의 작업이 모두 완료되었습니다!</p>
                        <p className="text-sm text-gray-500">설정된 일일 목표만큼 포스팅을 완료했거나, 더 이상 포스팅할 악보가 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {queue.map(sheet => (
                            <div key={sheet.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors bg-blue-50/30">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        {sheet.preview_image_url ? (
                                            <img src={sheet.preview_image_url} alt={sheet.title} className="w-16 h-20 object-cover rounded shadow-sm bg-white" />
                                        ) : (
                                            <div className="w-16 h-20 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                                                <i className="ri-music-2-line text-2xl"></i>
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-bold text-gray-900">{sheet.title}</h3>
                                            <p className="text-sm text-gray-600">{sheet.artist}</p>
                                            <div className="mt-2 flex gap-2 text-xs text-gray-500">
                                                <span>{new Date().toLocaleDateString()} 기준 미발행</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleCopyTitle(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                        >
                                            <i className="ri-file-copy-line"></i>
                                            제목 복사
                                        </button>
                                        <button
                                            onClick={() => handleCopyBody(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                        >
                                            <i className="ri-file-code-line"></i>
                                            {activeTab === 'pinterest' ? '설명 복사' : '본문 복사'}
                                        </button>
                                        <button
                                            onClick={() => handleCopyTags(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                        >
                                            <i className="ri-hashtag"></i>
                                            태그 복사
                                        </button>
                                        <button
                                            onClick={() => handleDownloadImage(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                        >
                                            <i className="ri-download-line"></i>
                                            이미지 다운
                                        </button>
                                        <button
                                            onClick={() => handleCopyLink(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                                        >
                                            <i className="ri-link"></i>
                                            링크 복사
                                        </button>
                                        <button
                                            onClick={() => handleMarkAsPosted(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
                                        >
                                            <i className="ri-check-line"></i>
                                            완료 처리
                                        </button>
                                        <button
                                            onClick={() => handleSkip(sheet)}
                                            className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                                            title="대기열에서 제외 (포스팅 안함)"
                                        >
                                            <i className="ri-close-circle-line"></i>
                                            제외
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent History */}
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">최근 완료 내역 ({activePlatform?.name})</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">일시</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">악보</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">로딩 중...</td>
                                </tr>
                            ) : posts.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">완료된 내역이 없습니다.</td>
                                </tr>
                            ) : (
                                posts.map((post) => (
                                    <tr key={post.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(post.posted_at).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {post.drum_sheets ? `${post.drum_sheets.title} - ${post.drum_sheets.artist}` : '삭제된 악보'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${post.status === 'success' ? 'bg-green-100 text-green-800' :
                                                post.status === 'manual_copy' ? 'bg-blue-100 text-blue-800' :
                                                    post.status === 'skipped' ? 'bg-gray-100 text-gray-800' :
                                                        'bg-red-100 text-red-800'
                                                }`}>
                                                {post.status === 'success' ? '성공' :
                                                    post.status === 'manual_copy' ? '수동 완료' :
                                                        post.status === 'skipped' ? '제외됨' : '실패'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalCount > 0 && (
                    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
                        <div className="flex flex-1 justify-between sm:hidden">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                이전
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                다음
                            </button>
                        </div>
                        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm text-gray-700">
                                    총 <span className="font-medium">{totalCount}</span>개 중 <span className="font-medium">{(page - 1) * pageSize + 1}</span> - <span className="font-medium">{Math.min(page * pageSize, totalCount)}</span> 표시
                                </p>
                            </div>
                            <div>
                                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Previous</span>
                                        <i className="ri-arrow-left-s-line text-lg"></i>
                                    </button>
                                    {[...Array(totalPages)].map((_, i) => {
                                        const p = i + 1;
                                        // Show limited page numbers logic could be added here if needed, 
                                        // but for now simple list is fine or we can just show current/total.
                                        // Let's show max 5 pages around current page for better UX if many pages.
                                        if (totalPages > 7 && (p < page - 2 || p > page + 2) && p !== 1 && p !== totalPages) {
                                            if (p === page - 3 || p === page + 3) return <span key={p} className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">...</span>;
                                            return null;
                                        }
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => setPage(p)}
                                                aria-current={page === p ? 'page' : undefined}
                                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${page === p
                                                    ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0'
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Next</span>
                                        <i className="ri-arrow-right-s-line text-lg"></i>
                                    </button>
                                </nav>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
