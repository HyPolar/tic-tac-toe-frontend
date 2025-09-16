import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function LeaderboardSystem({ lightningAddress, onClose }) {
  const [activeTab, setActiveTab] = useState('profit');
  const [leaderboards, setLeaderboards] = useState({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [userRank, setUserRank] = useState(null);

  useEffect(() => {
    fetchLeaderboards();
  }, [activeTab, period]);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/leaderboards?type=${activeTab}&period=${period}&limit=50`);
      const data = await response.json();
      
      setLeaderboards(prev => ({
        ...prev,
        [activeTab]: data.leaderboard || []
      }));

      // Find user's rank
      if (lightningAddress && data.leaderboard) {
        const rank = data.leaderboard.findIndex(player => 
          player.lightningAddress === lightningAddress || player.playerId === lightningAddress
        );
        setUserRank(rank >= 0 ? rank + 1 : null);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStreakLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/leaderboards/streaks?limit=50`);
      const data = await response.json();
      
      setLeaderboards(prev => ({
        ...prev,
        streaks: data.leaderboard || []
      }));
    } catch (error) {
      console.error('Failed to fetch streak leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'streaks') {
      fetchStreakLeaderboard();
    }
  };

  const formatValue = (value, type) => {
    switch (type) {
      case 'profit':
      case 'satsEarned':
        return `${value >= 0 ? '+' : ''}${value} SATS`;
      case 'wins':
        return `${value} wins`;
      case 'winrate':
        return `${value}%`;
      case 'streaks':
        return `${value} streak`;
      default:
        return value;
    }
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return '🏆';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1: return '#FFD700';
      case 2: return '#C0C0C0';
      case 3: return '#CD7F32';
      default: return '#666';
    }
  };

  const currentLeaderboard = leaderboards[activeTab] || [];
  const tabs = [
    { id: 'profit', name: 'Profit', icon: '💰' },
    { id: 'wins', name: 'Wins', icon: '🏆' },
    { id: 'winrate', name: 'Win Rate', icon: '📈' },
    { id: 'streaks', name: 'Streaks', icon: '🔥' }
  ];

  const periods = [
    { id: 'all', name: 'All Time' },
    { id: 'week', name: 'This Week' },
    { id: 'month', name: 'This Month' }
  ];

  return (
    <div className="leaderboard-modal">
      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <h2>🏆 Leaderboards</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="leaderboard-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        {activeTab !== 'streaks' && (
          <div className="period-selector">
            {periods.map(p => (
              <button
                key={p.id}
                className={`period-btn ${period === p.id ? 'active' : ''}`}
                onClick={() => setPeriod(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {userRank && (
          <div className="user-rank">
            <span className="rank-icon">{getRankIcon(userRank)}</span>
            <span>Your Rank: #{userRank}</span>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading leaderboard...</div>
        ) : (
          <div className="leaderboard-list">
            {currentLeaderboard.length > 0 ? (
              <>
                <div className="leaderboard-table">
                  <div className="table-header">
                    <span>Rank</span>
                    <span>Player</span>
                    <span>{tabs.find(t => t.id === activeTab)?.name}</span>
                  </div>
                  {currentLeaderboard.map((player, index) => {
                    const rank = index + 1;
                    const isCurrentUser = player.lightningAddress === lightningAddress || player.playerId === lightningAddress;
                    
                    return (
                      <div 
                        key={player.lightningAddress || player.playerId || index} 
                        className={`table-row ${isCurrentUser ? 'current-user' : ''}`}
                        style={{ borderLeft: `3px solid ${getRankColor(rank)}` }}
                      >
                        <span 
                          className="rank-cell"
                          style={{ color: getRankColor(rank) }}
                        >
                          {getRankIcon(rank)}
                        </span>
                        <span className="player-cell">
                          <span className="player-name">
                            {player.lightningAddress || player.playerId || `Player ${index + 1}`}
                          </span>
                          {isCurrentUser && <span className="you-indicator">(You)</span>}
                        </span>
                        <span className="score-cell">
                          {formatValue(player.score, activeTab)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {currentLeaderboard.length === 50 && (
                  <div className="load-more">
                    <p>Showing top 50 players</p>
                  </div>
                )}
              </>
            ) : (
              <div className="no-data">
                <p>No leaderboard data yet!</p>
                <p>Play some games to see rankings!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
