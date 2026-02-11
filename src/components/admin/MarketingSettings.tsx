import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface MarketingSettingsProps {
    onSettingsChange: () => void;
}

interface MarketingSetting {
    id: string;
    platform: 'tistory' | 'pinterest' | 'naver' | 'facebook' | 'google';
    credentials: Record<string, string>;
    is_enabled: boolean;
    daily_limit: number;
}

const PLATFORMS = [
    { id: 'naver', name: '네이버 블로그', color: 'bg-green-500' },
    { id: 'tistory', name: '티스토리', color: 'bg-orange-500' },
    { id: 'facebook', name: '페이스북', color: 'bg-blue-600' },
    { id: 'google', name: '구글 블로그', color: 'bg-red-500' },
    { id: 'pinterest', name: '핀터레스트', color: 'bg-red-600' },
] as const;

export default function MarketingSettings({ onSettingsChange }: MarketingSettingsProps) {
    const [settings, setSettings] = useState<MarketingSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('marketing_settings')
                .select('*')
                .order('platform');

            if (error) throw error;

            // Ensure we have entries for all platforms
            const mergedSettings = PLATFORMS.map(p => {
                const existing = data?.find(s => s.platform === p.id);
                return existing || {
                    id: '', // Will be handled by upsert
                    platform: p.id,
                    credentials: {},
                    is_enabled: false,
                    daily_limit: 1
                };
            });

            setSettings(mergedSettings as MarketingSetting[]);
        } catch (error) {
            console.error('Error fetching marketing settings:', error);
            alert('설정을 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSettingChange = (platform: string, key: keyof MarketingSetting, value: any) => {
        setSettings(prev => prev.map(setting => {
            if (setting.platform === platform) {
                return {
                    ...setting,
                    [key]: value
                };
            }
            return setting;
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const setting of settings) {
                const { error } = await supabase
                    .from('marketing_settings')
                    .upsert({
                        platform: setting.platform,
                        credentials: setting.credentials,
                        is_enabled: setting.is_enabled,
                        daily_limit: setting.daily_limit,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'platform' });

                if (error) throw error;
            }
            alert('설정이 저장되었습니다.');
            onSettingsChange();
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('설정 저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4">로딩 중...</div>;

    return (
        <div className="bg-white rounded-lg shadow p-6 space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">마케팅 자동화 설정</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? '저장 중...' : '설정 저장'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PLATFORMS.map(platform => {
                    const setting = settings.find(s => s.platform === platform.id);
                    if (!setting) return null;

                    return (
                        <div key={platform.id} className="border rounded-lg p-6 space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold flex items-center">
                                    <span className={`w-2 h-2 ${platform.color} rounded-full mr-2`}></span>
                                    {platform.name}
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={setting.is_enabled}
                                        onChange={(e) => handleSettingChange(platform.id, 'is_enabled', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">일일 목표 포스팅 수</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={setting.daily_limit}
                                        onChange={(e) => handleSettingChange(platform.id, 'daily_limit', parseInt(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        이 숫자는 작업 대기열에 표시될 최대 악보 수를 결정합니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
