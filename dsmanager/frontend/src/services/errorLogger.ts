/**
 * Error Logging and Debugging System
 * Captures all errors and provides real-time feedback
 */

export interface ErrorLog {
  id: string;
  timestamp: number;
  type: 'api' | 'runtime' | 'component' | 'network';
  severity: 'error' | 'warning' | 'info';
  message: string;
  endpoint?: string;
  status?: number;
  stack?: string;
  context?: Record<string, any>;
}

const MAX_LOGS = 100;
const LOGS_KEY = 'grace_error_logs';

class ErrorLogger {
  private logs: ErrorLog[] = [];

  constructor() {
    this.loadFromStorage();
    this.setupGlobalErrorHandlers();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(LOGS_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load error logs from storage');
    }
  }

  private saveToStorage() {
    try {
      // Keep only last 100 logs
      const recentLogs = this.logs.slice(-MAX_LOGS);
      localStorage.setItem(LOGS_KEY, JSON.stringify(recentLogs));
    } catch (e) {
      console.error('Failed to save error logs to storage');
    }
  }

  private setupGlobalErrorHandlers() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError('runtime', 'error', `Unhandled Promise Rejection: ${event.reason}`, {
        reason: event.reason,
        promise: event.promise,
      });
    });

    // Catch global errors
    window.addEventListener('error', (event) => {
      this.logError('runtime', 'error', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });
  }

  logAPI(
    endpoint: string,
    status: number,
    message: string,
    context?: Record<string, any>,
  ) {
    const severity = status >= 400 ? 'error' : 'info';
    this.logError('api', severity, `[${status}] ${endpoint}: ${message}`, {
      endpoint,
      status,
      ...context,
    });
  }

  logError(
    type: 'api' | 'runtime' | 'component' | 'network',
    severity: 'error' | 'warning' | 'info',
    message: string,
    context?: Record<string, any>,
  ) {
    const error: ErrorLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      severity,
      message,
      context,
      stack: new Error().stack,
    };

    this.logs.push(error);
    this.saveToStorage();

    // Always log to console with color coding
    const styles = {
      api: 'color: #ff6b6b; font-weight: bold',
      runtime: 'color: #ee5a6f; font-weight: bold',
      component: 'color: #ffa94d; font-weight: bold',
      network: 'color: #748ffc; font-weight: bold',
    };

    const severityEmoji = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };

    console.log(
      `%c[${error.type.toUpperCase()}] ${severityEmoji[severity]} ${message}`,
      styles[type],
    );

    if (context) {
      console.log('Context:', context);
    }

    // Send to error dashboard if available
    this.sendToDebugger(error);
  }

  private sendToDebugger(error: ErrorLog) {
    // Dispatch custom event that error dashboard can listen to
    window.dispatchEvent(
      new CustomEvent('graceError', {
        detail: error,
      }),
    );
  }

  getLogs(type?: string, severity?: string): ErrorLog[] {
    return this.logs.filter((log) => {
      if (type && log.type !== type) return false;
      if (severity && log.severity !== severity) return false;
      return true;
    });
  }

  getRecentErrors(count: number = 10): ErrorLog[] {
    return this.logs.slice(-count);
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(LOGS_KEY);
    console.log('✅ Error logs cleared');
  }

  getReport(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recentErrors: ErrorLog[];
  } {
    return {
      total: this.logs.length,
      byType: {
        api: this.logs.filter((l) => l.type === 'api').length,
        runtime: this.logs.filter((l) => l.type === 'runtime').length,
        component: this.logs.filter((l) => l.type === 'component').length,
        network: this.logs.filter((l) => l.type === 'network').length,
      },
      bySeverity: {
        error: this.logs.filter((l) => l.severity === 'error').length,
        warning: this.logs.filter((l) => l.severity === 'warning').length,
        info: this.logs.filter((l) => l.severity === 'info').length,
      },
      recentErrors: this.logs.slice(-5),
    };
  }
}

export const errorLogger = new ErrorLogger();

// Expose to window for manual debugging
(window as any).graceErrorLogger = errorLogger;
(window as any).graceErrorReport = () => errorLogger.getReport();
