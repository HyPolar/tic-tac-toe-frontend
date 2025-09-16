import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function MysteryBoxes({ lightningAddress, onClose }) {
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingBox, setOpeningBox] = useState(null);
  const [lastReward, setLastReward] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (lightningAddress) {
      fetchBoxes();
      fetchStats();
    }
  }, [lightningAddress]);

  const fetchBoxes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/mystery-boxes/${lightningAddress}`);
      const data = await response.json();
      setBoxes(data.boxes || []);
    } catch (error) {
      console.error('Failed to fetch mystery boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/mystery-boxes/stats/${lightningAddress}`);
      const data = await response.json();
      setStats(data.stats || null);
    } catch (error) {
      console.error('Failed to fetch mystery box stats:', error);
    }
  };

  const openBox = async (boxId) => {
    try {
      setOpeningBox(boxId);
      const response = await fetch(`${BACKEND_URL}/api/mystery-boxes/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lightningAddress, boxId })
      });
      const data = await response.json();
      
      if (data.success) {
        setLastReward(data.reward);
        await fetchBoxes();
        await fetchStats();
      }
    } catch (error) {
      console.error('Failed to open mystery box:', error);
    } finally {
      setOpeningBox(null);
    }
  };

  const getDailyBox = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/mystery-boxes/daily/${lightningAddress}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        await fetchBoxes();
      }
    } catch (error) {
      console.error('Failed to get daily mystery box:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBoxIcon = (type) => {
    switch (type) {
      case 'GOLD': return '🏆';
      case 'SILVER': return '🥈';
      case 'BRONZE': return '🥉';
      default: return '📦';
    }
  };

  const getBoxColor = (type) => {
    switch (type) {
      case 'GOLD': return '#FFD700';
      case 'SILVER': return '#C0C0C0';
      case 'BRONZE': return '#CD7F32';
      default: return '#666';
    }
  };

  const unopenedBoxes = boxes.filter(box => !box.opened);
  const openedBoxes = boxes.filter(box => box.opened);

  return (
    <div className="mystery-boxes-modal">
      <div className="mystery-boxes-content">
        <div className="mystery-boxes-header">
          <h2>🎁 Mystery Boxes</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {lastReward && (
          <div className="reward-notification">
            <h3>🎉 Congratulations!</h3>
            <p>You earned <span className="sats">{lastReward} SATS</span>!</p>
            <button onClick={() => setLastReward(null)}>Awesome!</button>
          </div>
        )}

        {stats && (
          <div className="mystery-stats">
            <div className="stat-item">
              <span>Total Opened:</span>
              <span>{stats.totalOpened}</span>
            </div>
            <div className="stat-item">
              <span>Total Earned:</span>
              <span>{stats.totalEarned} SATS</span>
            </div>
            <div className="stat-item">
              <span>Best Box:</span>
              <span>{stats.bestReward} SATS</span>
            </div>
          </div>
        )}

        <div className="daily-box-section">
          <button className="daily-box-btn" onClick={getDailyBox} disabled={loading}>
            🎁 Get Daily Mystery Box
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading boxes...</div>
        ) : (
          <>
            {unopenedBoxes.length > 0 && (
              <div className="boxes-section">
                <h3>Unopened Boxes ({unopenedBoxes.length})</h3>
                <div className="boxes-grid">
                  {unopenedBoxes.map(box => (
                    <div 
                      key={box.id} 
                      className={`mystery-box ${box.type.toLowerCase()}`}
                      style={{ borderColor: getBoxColor(box.type) }}
                    >
                      <div className="box-icon" style={{ color: getBoxColor(box.type) }}>
                        {getBoxIcon(box.type)}
                      </div>
                      <div className="box-type">{box.type} Box</div>
                      <div className="box-reason">From: {box.reason}</div>
                      <button 
                        className="open-box-btn"
                        onClick={() => openBox(box.id)}
                        disabled={openingBox === box.id}
                      >
                        {openingBox === box.id ? 'Opening...' : 'Open Box'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {openedBoxes.length > 0 && (
              <div className="boxes-section">
                <h3>Recently Opened</h3>
                <div className="opened-boxes">
                  {openedBoxes.slice(0, 5).map(box => (
                    <div key={box.id} className="opened-box">
                      <span className="box-icon">{getBoxIcon(box.type)}</span>
                      <span className="box-type">{box.type}</span>
                      <span className="box-reward">+{box.reward} SATS</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {boxes.length === 0 && (
              <div className="no-boxes">
                <p>No mystery boxes yet!</p>
                <p>Win games to earn mystery boxes with SAT rewards!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
