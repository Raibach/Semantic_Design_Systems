import { API_BASE } from "@/shared/apiHelper";
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

interface Version {
  id: string;
  version_number: number;
  change_description: string;
  change_type: 'manual' | 'autosave';
  created_at: string;
  overall_score?: number | null;
}

export default function VersionManager() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const eventCountRef = useRef(0);
  const AUTO_SAVE_THRESHOLD = 10;

  const { id: routeSessionId } = useParams<{ id: string }>();

  // Load versions on mount if route has a session ID
  useEffect(() => {
    if (routeSessionId && routeSessionId !== 'new') {
      setSessionId(routeSessionId);
      loadVersions(routeSessionId);
    }
  }, [routeSessionId]);

  const loadVersions = (sid: string) => {
    fetch(`${API_BASE}/prompt-sessions/${sid}/versions`)
      .then(r => r.json())
      .then(d => setVersions(d.versions || []))
      .catch((err) => console.error('[VersionManager] Failed to fetch versions:', err));
  };

  // AUTO-SAVE DISABLED — versions are now manual-only via Save Template button
  // Event listener: increment counter on textarea input (left column) and chat sends
  // DISABLED: useEffect(() => { ... trig gerAutosave ... }, [sessionId]);
  // DISABLED: const triggerAutosave = async () => { ... };


  const handleManualSave = async () => {
    if (!sessionId || !saveName.trim()) return;
    const textareas = document.querySelectorAll('[data-section-container] textarea');
    let leftContent = '';
    textareas.forEach(el => { leftContent += (el as HTMLTextAreaElement).value + '\n'; });
    try {
      await fetch(`${API_BASE}/prompt-sessions/${sessionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left_column_content: leftContent }),
      });
      const r = await fetch(`${API_BASE}/prompt-sessions/${sessionId}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change_description: saveName, left_column_content: leftContent }),
      });
      const d = await r.json();
      // API returns {"version": {...}} not {"success": true}
      if (d.version || d.success) {
        setSaveName('');
        setShowSaveInput(false);
        loadVersions(sessionId);
      }
    } catch {}
  };

  // Selecting a version opens it in the right column Trace tab
  const handleSelectVersion = (v: Version) => {
    window.dispatchEvent(new CustomEvent('version-selected', { detail: v }));
    setShowDropdown(false);
  };

  // Restore puts the version content back in the left column textareas
  const handleRestore = async (e: React.MouseEvent, version: Version) => {
    e.stopPropagation();
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/prompt-sessions/${sessionId}/versions/${version.version_number}/restore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (d.version) {
        // Restore left column content
        if (d.version.left_column_content) {
          const textareas = document.querySelectorAll('[data-section-container] textarea');
          const sections = d.version.left_column_content.split('\n');
          textareas.forEach((el, i) => {
            const ta = el as HTMLTextAreaElement;
            if (sections[i]) {
              const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
              if (nativeSetter) nativeSetter.call(ta, sections[i]);
              else ta.value = sections[i];
              ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        }

        // Restore compiled output to middle column
        if (d.version.compiled_output) {
          window.dispatchEvent(new CustomEvent('restore-output', {
            detail: { content: d.version.compiled_output }
          }));
        }

        setShowDropdown(false);
      }
    } catch {}
  };

  const latestVersion = versions.find(v => v.change_type === 'manual') || versions[0];
  const displayLabel = latestVersion ? `v${latestVersion.version_number}` : 'Editing Version —';
  const autoSaveCount = versions.filter(v => v.change_type === 'autosave').length;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-3 py-0.5 rounded-full border text-xs font-medium text-gray-700 border-gray-400 bg-transparent cursor-pointer hover:border-gray-500 transition-colors"
      >
        {displayLabel}
        {autoSaveCount > 0 && <span className="ml-1 text-green-600">●</span>}
      </button>
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 w-72 max-h-[400px] overflow-y-auto">
          <div className="p-2 border-b border-gray-100">
            <div className="text-xs text-gray-400 mb-1">Manual save only</div>
            {!showSaveInput ? (
              <button
                onClick={() => setShowSaveInput(true)}
                className="w-full text-left px-2 py-1 rounded text-xs font-medium bg-[#507274] text-white hover:bg-[#5e8486]"
              >
                + Save Version
              </button>
            ) : (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Version name…"
                  className="flex-1 px-2 py-1 rounded text-xs border border-gray-200"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleManualSave()}
                />
                <button onClick={handleManualSave} className="px-2 py-1 rounded text-xs bg-[#507274] text-white">Save</button>
                <button onClick={() => setShowSaveInput(false)} className="px-2 py-1 rounded text-xs bg-gray-200">✕</button>
              </div>
            )}
          </div>
          {versions.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No versions yet. Type in the left column, then save.</div>
          )}
          {versions.map(v => (
            <div
              key={v.id}
              onClick={() => handleSelectVersion(v)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-b-0 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{v.change_description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {v.overall_score != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">
                        {v.overall_score.toFixed(1)}
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.change_type === 'autosave' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {v.change_type === 'autosave' ? 'auto' : `v${v.version_number}`}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(v.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={(e) => handleRestore(e, v)}
                title="Restore this version to left column"
                className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[#507274] text-white hover:bg-[#5e8486] transition-colors"
              >
                ↩
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}