import React, { useState, useEffect } from 'react';

interface TaskSynchronizerProps {
  waypoints: [number, number][]; // [lat, lng]
  corridorNm: number;
}

type TabType = 'weglide' | 'clouddrive' | 'share';

export const TaskSynchronizer: React.FC<TaskSynchronizerProps> = ({ waypoints, corridorNm }) => {
  const [activeTab, setActiveTab] = useState<TabType>('weglide');
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // WeGlide State
  const [weglideKey, setWeglideKey] = useState<string>('');
  const [pilotDob, setPilotDob] = useState<string>('');
  const [taskName, setTaskName] = useState<string>('NOTAM Workstation Task');
  const [weglideMock, setWeglideMock] = useState<boolean>(true);

  // Cloud Drive State
  const [provider, setProvider] = useState<'google_drive' | 'dropbox'>('dropbox');
  const [accessToken, setAccessToken] = useState<string>('');
  const [cloudMock, setCloudMock] = useState<boolean>(true);

  // Share State
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Load saved configuration from localStorage
  useEffect(() => {
    const savedWeglideKey = localStorage.getItem('notam_weglide_key');
    const savedPilotDob = localStorage.getItem('notam_pilot_dob');
    const savedProvider = localStorage.getItem('notam_cloud_provider');
    const savedToken = localStorage.getItem('notam_cloud_token');

    if (savedWeglideKey) setWeglideKey(savedWeglideKey);
    if (savedPilotDob) setPilotDob(savedPilotDob);
    if (savedProvider) setProvider(savedProvider as any);
    if (savedToken) setAccessToken(savedToken);
  }, []);

  const handleWeglideSync = async () => {
    if (!weglideMock && !weglideKey) {
      alert('Please enter your WeGlide API Key.');
      return;
    }
    setLoading(true);
    setSyncStatus(null);
    setLogs(['Initiating sync process...', 'Converting waypoints to ICAO WGS84 standard...']);

    // Persist keys for convenience
    if (weglideKey) localStorage.setItem('notam_weglide_key', weglideKey);
    if (pilotDob) localStorage.setItem('notam_pilot_dob', pilotDob);

    const lngLatWaypoints = waypoints.map(wp => [wp[1], wp[0]]);

    try {
      const response = await fetch('/api/sync/weglide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: lngLatWaypoints,
          weglide_api_key: weglideKey || 'MOCK_KEY_12345',
          pilot_dob: pilotDob || null,
          task_name: taskName,
          mock: weglideMock
        })
      });

      const data = await response.json();
      if (response.ok) {
        setSyncStatus({ success: true, message: data.message });
        if (data.logs) {
          setLogs(data.logs);
        } else {
          setLogs(prev => [...prev, 'Verification successful!', 'Task declared on WeGlide ecosystem.', 'Sync complete.']);
        }
      } else {
        setSyncStatus({ success: false, message: data.detail || 'Sync failed' });
        setLogs(prev => [...prev, `❌ Error: ${data.detail || 'Response error'}`]);
      }
    } catch (err: any) {
      setSyncStatus({ success: false, message: err.message || 'Network error' });
      setLogs(prev => [...prev, `❌ Network error occurred: ${err.message || err}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleCloudSync = async () => {
    if (!cloudMock && !accessToken) {
      alert('Please enter your Cloud Access Token.');
      return;
    }
    setLoading(true);
    setSyncStatus(null);
    setLogs([`Connecting to ${provider === 'dropbox' ? 'Dropbox' : 'Google Drive'}...`, 'Preparing export payloads...']);

    if (accessToken) localStorage.setItem('notam_cloud_token', accessToken);
    localStorage.setItem('notam_cloud_provider', provider);

    const lngLatWaypoints = waypoints.map(wp => [wp[1], wp[0]]);

    try {
      const response = await fetch('/api/sync/cloud-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: lngLatWaypoints,
          corridor_nm: corridorNm,
          provider: provider,
          access_token: accessToken || 'MOCK_TOKEN_12345',
          mock: cloudMock
        })
      });

      const data = await response.json();
      if (response.ok) {
        setSyncStatus({ success: true, message: data.message });
        if (data.logs) {
          setLogs(data.logs);
        } else {
          setLogs(prev => [...prev, 'Task .cup file generated successfully.', 'Corridor-filtered NOTAM .openair airspace compiled.', 'Uploads completed.', 'Sync finished.']);
        }
      } else {
        setSyncStatus({ success: false, message: data.detail || 'Cloud sync failed' });
        setLogs(prev => [...prev, `❌ Error: ${data.detail || 'Response error'}`]);
      }
    } catch (err: any) {
      setSyncStatus({ success: false, message: err.message || 'Network error' });
      setLogs(prev => [...prev, `❌ Network error occurred: ${err.message || err}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateShare = async () => {
    setLoading(true);
    setShareId(null);
    setShareUrl(null);

    const lngLatWaypoints = waypoints.map(wp => [wp[1], wp[0]]);

    try {
      const response = await fetch('/api/task/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: lngLatWaypoints,
          corridor_nm: corridorNm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setShareId(data.share_id);
        const origin = window.location.origin;
        setShareUrl(`${origin}${data.share_url}`);
      } else {
        alert('Failed to generate share link.');
      }
    } catch (err) {
      console.error(err);
      alert('Error generating share.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-synchronizer-container" style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>📡 Task & Airspace Synchronizer</h4>
      
      {/* Tab Selectors */}
      <div className="sync-tabs" style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
        <button 
          className={`sync-tab-btn ${activeTab === 'weglide' ? 'active' : ''}`}
          onClick={() => { setActiveTab('weglide'); setSyncStatus(null); setLogs([]); }}
          type="button"
        >
          WeGlide
        </button>
        <button 
          className={`sync-tab-btn ${activeTab === 'clouddrive' ? 'active' : ''}`}
          onClick={() => { setActiveTab('clouddrive'); setSyncStatus(null); setLogs([]); }}
          type="button"
        >
          LXNAV Connect
        </button>
        <button 
          className={`sync-tab-btn ${activeTab === 'share' ? 'active' : ''}`}
          onClick={() => { setActiveTab('share'); setSyncStatus(null); setLogs([]); }}
          type="button"
        >
          Share & QR
        </button>
      </div>

      {/* Tab Panels */}
      <div className="sync-tab-content" style={{ marginTop: '12px' }}>
        
        {/* WEGLIDE PANEL */}
        {activeTab === 'weglide' && (
          <div className="sync-panel-layout" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>WeGlide API Key</label>
              <input 
                type="password" 
                placeholder="Enter X-API-Key..." 
                value={weglideKey}
                onChange={(e) => setWeglideKey(e.target.value)}
                disabled={weglideMock}
                style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
              />
            </div>
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>Task Name</label>
              <input 
                type="text" 
                placeholder="Enter task name..." 
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
              />
            </div>
            <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <input 
                type="checkbox" 
                id="weglide-mock-chk" 
                checked={weglideMock}
                onChange={(e) => setWeglideMock(e.target.checked)}
              />
              <label htmlFor="weglide-mock-chk" style={{ cursor: 'pointer', fontSize: '12px' }}>Simulator / Mock Mode</label>
            </div>

            <button 
              className="action-btn declare-btn" 
              onClick={handleWeglideSync}
              disabled={loading}
              type="button"
              style={{ marginTop: '4px', width: '100%', padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? 'Declaring...' : 'Declare Task on WeGlide'}
            </button>
          </div>
        )}

        {/* CLOUD DRIVE PANEL */}
        {activeTab === 'clouddrive' && (
          <div className="sync-panel-layout" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>Cloud Provider</label>
              <select 
                value={provider} 
                onChange={(e) => setProvider(e.target.value as any)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'inherit' }}
              >
                <option value="dropbox">Dropbox (/Apps/LXNAV Connect/)</option>
                <option value="google_drive">Google Drive (/LXNAV Connect/)</option>
              </select>
            </div>
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>Access Token</label>
              <input 
                type="password" 
                placeholder="OAuth token..." 
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={cloudMock}
                style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
              />
            </div>
            <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <input 
                type="checkbox" 
                id="cloud-mock-chk" 
                checked={cloudMock}
                onChange={(e) => setCloudMock(e.target.checked)}
              />
              <label htmlFor="cloud-mock-chk" style={{ cursor: 'pointer', fontSize: '12px' }}>Simulator / Mock Mode</label>
            </div>

            <button 
              className="action-btn cloud-btn" 
              onClick={handleCloudSync}
              disabled={loading}
              type="button"
              style={{ marginTop: '4px', width: '100%', padding: '10px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? 'Uploading...' : 'Sync to LXNAV Connect'}
            </button>
          </div>
        )}

        {/* SHARE LINK & QR CODE */}
        {activeTab === 'share' && (
          <div className="sync-panel-layout text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {!shareUrl ? (
              <button 
                className="action-btn share-btn" 
                onClick={handleGenerateShare}
                disabled={loading}
                type="button"
                style={{ width: '100%', padding: '10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {loading ? 'Generating...' : '🔗 Generate Share Link & QR'}
              </button>
            ) : (
              <div className="share-results" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                <div className="share-link-box" style={{ width: '100%', padding: '8px', border: '1px dashed var(--border-color)', borderRadius: '4px', overflowWrap: 'anywhere', fontSize: '11px', background: 'var(--bg-card)', boxSizing: 'border-box' }}>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">{shareUrl}</a>
                </div>

                <div className="qr-container" style={{ background: '#fff', padding: '10px', borderRadius: '8px', display: 'inline-block', border: '1px solid #ddd' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(shareUrl)}`} 
                    alt="Scan to import task" 
                    style={{ display: 'block', width: '130px', height: '130px' }}
                  />
                  <span style={{ fontSize: '10px', color: '#666', marginTop: '4px', display: 'block' }}>Scan in Cockpit</span>
                </div>

                <div className="share-exporters" style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  <a href={`/api/task/share/${shareId}/cup`} download className="action-btn sm-btn" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', padding: '6px', borderRadius: '4px', fontSize: '12px', background: 'var(--bg-hover)', color: 'inherit', border: '1px solid var(--border-color)' }}>
                    📥 Download .cup (SeeYou)
                  </a>
                  <a href={`/api/task/share/${shareId}/tsk`} download className="action-btn sm-btn" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', padding: '6px', borderRadius: '4px', fontSize: '12px', background: 'var(--bg-hover)', color: 'inherit', border: '1px solid var(--border-color)' }}>
                    📥 Download .tsk (XCSoar XML)
                  </a>
                  <a href={`/api/task/share/${shareId}/openair`} download className="action-btn sm-btn secondary-btn" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', padding: '6px', borderRadius: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: 'none' }}>
                    📥 Download .openair (Corridor NOTAMs)
                  </a>
                </div>
                
                <button 
                  className="clear-btn" 
                  onClick={() => { setShareUrl(null); setShareId(null); }}
                  type="button"
                  style={{ fontSize: '11px', marginTop: '4px', background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--primary-color)', cursor: 'pointer' }}
                >
                  Create New Share
                </button>
              </div>
            )}
          </div>
        )}

        {/* LOG TERMINAL PANELS FOR WEGLIDE/CLOUD DRIVE SIMULATIONS */}
        {logs.length > 0 && (
          <div className="sync-terminal-log" style={{ marginTop: '14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div className="terminal-header" style={{ padding: '4px 8px', background: 'var(--bg-hover)', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)' }}>
              <span>🖥️ Connection Sync Terminal</span>
            </div>
            <div className="terminal-body" style={{ maxHeight: '120px', overflowY: 'auto', padding: '8px', background: '#090d16', color: '#10b981', fontFamily: 'Courier New, Courier, monospace', fontSize: '11px', borderRadius: '0 0 6px 6px', textAlign: 'left', lineHeight: '1.4' }}>
              {logs.map((log, index) => (
                <div key={index} className="log-line" style={{ margin: '2px 0' }}>&gt; {log}</div>
              ))}
              {loading && <div className="log-line blinking-cursor">&gt; _</div>}
            </div>
            {syncStatus && (
              <div className={`sync-status-badge ${syncStatus.success ? 'success' : 'error'}`} style={{ marginTop: '6px', fontSize: '12px', padding: '6px', borderRadius: '4px', fontWeight: '500', background: syncStatus.success ? '#d1fae5' : '#fee2e2', color: syncStatus.success ? '#065f46' : '#991b1b', border: `1px solid ${syncStatus.success ? '#a7f3d0' : '#fca5a5'}`, textAlign: 'center' }}>
                {syncStatus.success ? '✅' : '❌'} {syncStatus.message}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
