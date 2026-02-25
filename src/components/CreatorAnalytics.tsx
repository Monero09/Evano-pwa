import type { Video } from '../lib/types';

interface CreatorAnalyticsProps {
    myVideos: Video[];
    totalViews: number;
}

export default function CreatorAnalytics({ myVideos, totalViews }: CreatorAnalyticsProps) {
    // Calculate metrics
    const avgViews = myVideos.length > 0 ? Math.round(totalViews / myVideos.length) : 0;

    // Get top 3 performing videos
    const topVideos = [...myVideos]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 3);

    // Generate mock chart data for last 7 days
    const chartData = Array.from({ length: 7 }, (_, i) => ({
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
        views: Math.floor(Math.random() * (totalViews / 7) * 1.5) // Mock data based on avg
    }));

    const maxChartValue = Math.max(...chartData.map(d => d.views), 1);

    return (
        <div style={{ marginBottom: 60 }}>
            {/* Stats Cards */}
            <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 40 }}>
                <div className="stat-card" style={{
                    background: 'rgba(26, 31, 46, 0.4)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 12,
                    padding: 20,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <div className="stat-label" style={{ fontSize: 12, color: '#B0B8C1', marginBottom: 8 }}>Total Views</div>
                    <div className="stat-value" style={{ fontSize: 32, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>{totalViews.toLocaleString()}</div>
                    <div className="stat-change" style={{ fontSize: 11, color: '#888' }}>↗ Overall performance</div>
                </div>

                <div className="stat-card" style={{
                    background: 'rgba(26, 31, 46, 0.4)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 12,
                    padding: 20,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <div className="stat-label" style={{ fontSize: 12, color: '#B0B8C1', marginBottom: 8 }}>Total Videos</div>
                    <div className="stat-value" style={{ fontSize: 32, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>{myVideos.length}</div>
                    <div className="stat-change" style={{ fontSize: 11, color: '#888' }}>Across all statuses</div>
                </div>

                <div className="stat-card" style={{
                    background: 'rgba(26, 31, 46, 0.4)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 12,
                    padding: 20,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <div className="stat-label" style={{ fontSize: 12, color: '#B0B8C1', marginBottom: 8 }}>Avg Views</div>
                    <div className="stat-value" style={{ fontSize: 32, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>{avgViews.toLocaleString()}</div>
                    <div className="stat-change" style={{ fontSize: 11, color: '#888' }}>Per video</div>
                </div>
            </div>

            {/* Views Chart */}
            <div style={{
                background: 'rgba(26, 31, 46, 0.4)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: 12,
                padding: 24,
                marginBottom: 40
            }}>
                <h3 style={{ fontSize: 16, marginBottom: 20, color: '#22C55E' }}>Views Over Last 7 Days</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, justifyContent: 'space-around' }}>
                    {chartData.map((item) => {
                        const barHeight = (item.views / maxChartValue) * 150;
                        return (
                            <div key={item.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                                <div style={{
                                    background: 'linear-gradient(180deg, #22C55E 0%, #14532d 100%)',
                                    width: '100%',
                                    height: barHeight,
                                    borderRadius: '6px 6px 0 0',
                                    transition: 'all 0.3s ease'
                                }} title={`${item.views} views`}></div>
                                <span style={{ fontSize: 11, color: '#B0B8C1', marginTop: 8 }}>{item.day}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Top Videos */}
            {topVideos.length > 0 && (
                <div style={{
                    background: 'rgba(26, 31, 46, 0.4)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 12,
                    padding: 24
                }}>
                    <h3 style={{ fontSize: 16, marginBottom: 20, color: '#22C55E' }}>Top Performing Videos</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        {topVideos.map((video, index) => (
                            <div key={video.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr 100px',
                                gap: 16,
                                padding: 16,
                                background: 'rgba(34, 197, 94, 0.05)',
                                borderRadius: 8,
                                alignItems: 'center',
                                border: '1px solid rgba(34, 197, 94, 0.1)'
                            }}>
                                <div style={{
                                    fontSize: 18,
                                    fontWeight: 700,
                                    color: '#22C55E',
                                    textAlign: 'center'
                                }}>
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>{video.title}</h4>
                                    <p style={{ margin: 0, fontSize: 12, color: '#B0B8C1' }}>{video.category}</p>
                                </div>
                                <div style={{
                                    textAlign: 'right',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#52c41a'
                                }}>
                                    {(video.views || 0).toLocaleString()} views
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
