import React, { useState, useEffect } from 'react';

interface CommandCenterData {
  timestamp: string;
  version: string;
  system: {
    status: string;
    health_score: number;
    issues: string[];
  };
  deployment: {
    current: {
      status: string;
      run_id?: string;
      commit?: string;
      started_at?: string;
      duration_seconds?: number;
      failed_step?: string;
      error?: string;
      logs?: string;
    };
    history: Array<{
      run_id: string;
      status: string;
      timestamp: string;
      error?: string;
    }>;
    success_rate_24h: number;
    last_successful_deploy?: string;
  };
  environment: {
    ssh_configured: boolean;
    missing_secrets: string[];
    database_connected: boolean;
    backend_healthy: boolean;
    frontend_deployed: boolean;
  };
  actions_required: Array<{
    priority: string;
    action: string;
    description: string;
    automated: boolean;
    details?: Record<string, string>;
  }>;
  recent_errors: any[];
  logs: Record<string, string>;
}

export const CommandCenter: React.FC = () => {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const response = await fetch('/api/debug/command-center');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading Command Center...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        Error loading Command Center: {error}
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: '20px' }}>No data available</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'success':
        return 'green';
      case 'degraded':
      case 'in_progress':
        return 'orange';
      case 'unhealthy':
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleString();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '1200px' }}>
      <h1>Command Center</h1>

      {/* System Status */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc' }}>
        <h2>System Status</h2>
        <p>
          <strong>Status:</strong>{' '}
          <span style={{ color: getStatusColor(data.system.status) }}>
            {data.system.status.toUpperCase()}
          </span>
          {' '}({Math.round(data.system.health_score * 100)}%)
        </p>
        {data.system.issues.length > 0 && (
          <p>
            <strong>Issues:</strong> {data.system.issues.join(', ')}
          </p>
        )}
      </div>

      {/* Current Deployment */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc' }}>
        <h2>Current Deployment</h2>
        <p>
          <strong>Status:</strong>{' '}
          <span style={{ color: getStatusColor(data.deployment.current.status) }}>
            {data.deployment.current.status?.toUpperCase()}
          </span>
        </p>
        {data.deployment.current.run_id && (
          <p><strong>Run ID:</strong> {data.deployment.current.run_id}</p>
        )}
        {data.deployment.current.commit && (
          <p><strong>Commit:</strong> {data.deployment.current.commit}</p>
        )}
        {data.deployment.current.started_at && (
          <p><strong>Started:</strong> {formatTimestamp(data.deployment.current.started_at)}</p>
        )}
        {data.deployment.current.duration_seconds && (
          <p><strong>Duration:</strong> {data.deployment.current.duration_seconds}s</p>
        )}
        {data.deployment.current.failed_step && (
          <p><strong>Failed Step:</strong> {data.deployment.current.failed_step}</p>
        )}
        {data.deployment.current.error && (
          <p style={{ color: 'red' }}>
            <strong>Error:</strong> {data.deployment.current.error}
          </p>
        )}
        {data.deployment.current.logs && (
          <details>
            <summary>View Full Logs</summary>
            <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
              {data.deployment.current.logs}
            </pre>
          </details>
        )}
      </div>

      {/* Environment */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc' }}>
        <h2>Environment Status</h2>
        <p>
          <span style={{ color: data.environment.database_connected ? 'green' : 'red' }}>
            {data.environment.database_connected ? '✓' : '✗'}
          </span>{' '}
          Database: {data.environment.database_connected ? 'Connected' : 'Not Connected'}
        </p>
        <p>
          <span style={{ color: data.environment.frontend_deployed ? 'green' : 'red' }}>
            {data.environment.frontend_deployed ? '✓' : '✗'}
          </span>{' '}
          Frontend: {data.environment.frontend_deployed ? 'Deployed' : 'Not Deployed'}
        </p>
        <p>
          <span style={{ color: data.environment.backend_healthy ? 'green' : 'red' }}>
            {data.environment.backend_healthy ? '✓' : '✗'}
          </span>{' '}
          Backend: {data.environment.backend_healthy ? 'Healthy' : 'Unhealthy'}
        </p>
        <p>
          <span style={{ color: data.environment.ssh_configured ? 'green' : 'red' }}>
            {data.environment.ssh_configured ? '✓' : '✗'}
          </span>{' '}
          SSH: {data.environment.ssh_configured ? 'Configured' : 'Not Configured'}
        </p>
        {data.environment.missing_secrets.length > 0 && (
          <p style={{ color: 'orange' }}>
            <strong>Missing Secrets:</strong> {data.environment.missing_secrets.join(', ')}
          </p>
        )}
      </div>

      {/* Actions Required */}
      {data.actions_required.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', border: '2px solid orange' }}>
          <h2>Actions Required</h2>
          {data.actions_required.map((action, idx) => (
            <div key={idx} style={{ marginBottom: '15px' }}>
              <p>
                <strong style={{ color: action.priority === 'high' ? 'red' : 'orange' }}>
                  [{action.priority.toUpperCase()}]
                </strong>{' '}
                {action.description}
              </p>
              {action.details && (
                <details>
                  <summary>Show Values</summary>
                  <pre style={{ background: '#f5f5f5', padding: '10px' }}>
                    {Object.entries(action.details).map(([key, value]) => (
                      <div key={key}>{key} = {value}</div>
                    ))}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent Deployments */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc' }}>
        <h2>Recent Deployments</h2>
        <p>
          <strong>Success Rate (24h):</strong> {Math.round(data.deployment.success_rate_24h * 100)}%
        </p>
        {data.deployment.last_successful_deploy && (
          <p>
            <strong>Last Success:</strong> {formatTimestamp(data.deployment.last_successful_deploy)}
          </p>
        )}
        <ul>
          {data.deployment.history.map((deploy, idx) => (
            <li key={idx} style={{ marginBottom: '5px' }}>
              <span style={{ color: getStatusColor(deploy.status) }}>
                {deploy.status === 'success' ? '✓' : deploy.status === 'failed' ? '✗' : '◐'}
              </span>{' '}
              #{deploy.run_id} - {formatTimestamp(deploy.timestamp)}
              {deploy.error && <span> - {deploy.error}</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '30px', padding: '10px', background: '#f5f5f5', fontSize: '12px' }}>
        <p>Last Updated: {lastUpdated.toLocaleTimeString()} (Auto-refreshes every 5 seconds)</p>
        <p>API Version: {data.version}</p>
      </div>
    </div>
  );
};

export default CommandCenter;
