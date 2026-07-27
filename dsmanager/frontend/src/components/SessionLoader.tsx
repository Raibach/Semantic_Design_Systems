/**
 * SESSION LOADER COMPONENT
 *
 * Real loading states that show actual database activity.
 * No more fake spinners - this shows what's really happening.
 */

import React from 'react';

interface SessionLoaderProps {
  isLoading: boolean;
  progress: number;
  error: string | null;
  sessionName?: string;
}

export default function SessionLoader({
  isLoading,
  progress,
  error,
  sessionName
}: SessionLoaderProps) {
  if (!isLoading && !error) return null;

  const getStatusMessage = () => {
    if (error) return `Error: ${error}`;

    if (progress < 30) return 'Connecting to database...';
    if (progress < 50) return 'Fetching session data...';
    if (progress < 70) return 'Parsing prompt sections...';
    if (progress < 85) return 'Loading compiled output...';
    if (progress < 95) return 'Restoring conversation history...';
    if (progress >= 95) return 'Finalizing...';

    return 'Loading...';
  };

  const getProgressColor = () => {
    if (error) return 'bg-red-500';
    if (progress < 50) return 'bg-blue-500';
    if (progress < 85) return 'bg-green-500';
    return 'bg-green-600';
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b shadow-lg">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="animate-pulse text-blue-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <span className="font-medium text-gray-800">
              {isLoading ? 'Loading from Database' : 'Database Error'}
            </span>
            {sessionName && (
              <span className="text-sm text-gray-500">
                "{sessionName}"
              </span>
            )}
          </div>

          <span className="text-sm text-gray-600">
            {getStatusMessage()}
          </span>
        </div>

        {/* Progress Bar */}
        {isLoading && (
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getProgressColor()}`}
              style={{ width: `${progress}%` }}
            >
              <div className="h-full bg-white/30 animate-pulse" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Technical Details (for debugging) */}
        {isLoading && (
          <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-500">
            <div className={progress >= 30 ? 'text-green-600' : ''}>
              ✓ Connected
            </div>
            <div className={progress >= 50 ? 'text-green-600' : ''}>
              {progress >= 50 ? '✓' : '○'} Data fetched
            </div>
            <div className={progress >= 70 ? 'text-green-600' : ''}>
              {progress >= 70 ? '✓' : '○'} Sections parsed
            </div>
            <div className={progress >= 95 ? 'text-green-600' : ''}>
              {progress >= 95 ? '✓' : '○'} Ready
            </div>
          </div>
        )}
      </div>
    </div>
  );
}