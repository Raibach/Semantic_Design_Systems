import { useState, useEffect, useRef } from "react";
import * as Sentry from "@sentry/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ResizableSplitter } from "@/components/ResizableSplitter";
import { InteractiveChatInterface } from "@/components/InteractiveChatInterface";
import { ResponsivePromptBuilderWithDnD } from "@/components/ResponsivePromptBuilderWithDnD";
import "@/components/lit/footer-bar";  // registers <footer-bar>
import { MiddleColumnSlot } from "@/components/MiddleColumnSlot";
import { UI_ID } from "@/utils/uiIdentifiers";
import { toast } from "@/hooks/use-toast";
import type { PromptSession } from "@/services/promptService";

interface PromptWorkspaceProps {
  session: PromptSession | null;
  flipped: boolean;
  isLoading: boolean;
  onSave: (compiledOutput?: string) => void;
  onConversationChange: (id: string | null) => void;
  isSaving?: boolean;
  onTitleChange?: (newTitle: string) => void;
  approvalMode?: boolean;
  onClearApproval?: () => void;
}

export function PromptWorkspace({
  session,
  flipped,
  isLoading,
  onSave,
  onConversationChange,
  isSaving = false,
  onTitleChange,
  approvalMode = false,
  onClearApproval,
}: PromptWorkspaceProps) {
  const [isThirdColumnOpen, setIsThirdColumnOpen] = useState(false);
  
  // Prevent closing third column when output exists
  const handleThirdColumnStateChange = (open: boolean) => {
    if (!open && compiledOutput?.trim()) {
      toast({ title: 'Output exists', description: 'Clear the output before closing this panel.', duration: 3000 });
      return;
    }
    setIsThirdColumnOpen(open);
  };
  const [compiledOutput, setCompiledOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [responseCardModel, setResponseCardModel] = useState("deepseek-chat");
  const [expandedCard, setExpandedCard] = useState<"a" | "b">("a");

  // ── Restore full surface state from session on load ──
  const prevSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (session?.id && session.id !== prevSessionId.current) {
      prevSessionId.current = session.id;

      // Middle column: compiled output
      if (session.compiledOutput) {
        setCompiledOutput(session.compiledOutput);
      }

      // Left column: fill textareas from leftColumnContent after mount
      if (session.leftColumnContent) {
        let sections: Array<{ content?: string; section?: string; role?: string; name?: string }> = [];
        try {
          const parsed = JSON.parse(session.leftColumnContent);
          sections = parsed.sections || [];
        } catch { /* legacy */ }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const s of sections) {
              const name = s.section || s.role || s.name || '';
              const content = s.content || '';
              if (name && content) {
                window.dispatchEvent(new CustomEvent('set-left-column-text', {
                  detail: { content, target: name },
                }));
              }
            }
            // Second pass after renders settle
            setTimeout(() => {
              for (const s of sections) {
                const name = s.section || s.role || s.name || '';
                const content = s.content || '';
                if (name && content) {
                  window.dispatchEvent(new CustomEvent('set-left-column-text', {
                    detail: { content, target: name },
                  }));
                }
              }
            }, 300);
          });
        });
      }
    }
  }, [session?.id, session?.compiledOutput, session?.leftColumnContent]);

  // Backward-compat: allow MiddleColumnSlot Clear button to reset via window
  useEffect(() => {
    const globalWindow = window as Window & {
      __clearCompiledOutput__?: () => void;
    };
    globalWindow.__clearCompiledOutput__ = () => setCompiledOutput("");
    return () => {
      delete globalWindow.__clearCompiledOutput__;
    };
  }, []);

  // ── Section CRUD listeners (AI-driven add/remove prompt sections) ──
  useEffect(() => {
    const handleAddRole = (e: Event) => {
      const { roleName, placeholder } = (e as CustomEvent).detail;
      // Check if section already exists
      if (document.querySelector(`[data-section-name="${roleName}"]`)) return;
      // Find the prompt builder container
      const container = document.querySelector('[data-prompt-builder]');
      if (!container) return;
      // Create new section element matching the existing pattern
      const section = document.createElement('div');
      section.className = 'mb-4';
      section.setAttribute('data-section-container', '');
      section.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-semibold text-gray-700">${roleName}</label>
          <button class="text-xs text-gray-400 hover:text-red-500" onclick="this.closest('[data-section-container]').remove()">Remove</button>
        </div>
        <textarea
          data-section-name="${roleName}"
          placeholder="${placeholder || `Enter ${roleName.toLowerCase()} content...`}"
          class="w-full min-h-[80px] p-3 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:border-blue-400"
        ></textarea>
      `;
      container.appendChild(section);
      // Focus the new textarea
      setTimeout(() => section.querySelector('textarea')?.focus(), 100);
    };
    const handleRemoveRole = (e: Event) => {
      const { roleName } = (e as CustomEvent).detail;
      const el = document.querySelector(`[data-section-name="${roleName}"]`);
      if (el) {
        el.closest('[data-section-container]')?.remove();
      }
    };
    window.addEventListener('add-prompt-role', handleAddRole);
    window.addEventListener('remove-prompt-role', handleRemoveRole);
    return () => {
      window.removeEventListener('add-prompt-role', handleAddRole);
      window.removeEventListener('remove-prompt-role', handleRemoveRole);
    };
  }, []);

  const handleClearOutput = () => {
    setCompiledOutput("");
  };

  // ── Milvus auto-save: persist prompt config + output after every RUN ──
  const saveToMilvus = async (output: string) => {
    try {
      const coreRoles: Record<string, string> = {};
      document.querySelectorAll('textarea[data-section-name]').forEach((el) => {
        const ta = el as HTMLTextAreaElement;
        let parent = ta.parentElement;
        let hidden = false;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') { hidden = true; break; }
          parent = parent.parentElement;
        }
        if (hidden) return;
        const name = ta.getAttribute('data-section-name') || '';
        const content = ta.value?.trim();
        if (name && content) coreRoles[name] = content;
      });
      await fetch('/api/milvus/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_config: JSON.stringify(coreRoles),
          output,
          session_id: session?.id || 'unknown',
        }),
      });
    } catch (e) {
      console.error('Milvus auto-save failed:', e);
    }
  };

  // Auto-save to Milvus after Run completes
  const prevRunningForSave = useRef(isRunning);
  useEffect(() => {
    if (prevRunningForSave.current && !isRunning && compiledOutput?.trim()) {
      saveToMilvus(compiledOutput);
    }
    prevRunningForSave.current = isRunning;
     
  }, [isRunning, compiledOutput]);

  const handleRegenerate = async (model: string) => {
    setResponseCardModel(model);
    // Re-run with the selected model
    await handleRun(model);
  };

  const handleRun = async (overrideModel?: string) => {
    const selectedModel = overrideModel || responseCardModel;

    return Sentry.startSpan({ name: "prompt.execute", op: "prompt.run" }, async () => {
    const startTime = performance.now();
    setIsRunning(true);
    setCompiledOutput("");
    
    // Collect only VISIBLE role content — skip hidden/removed panels
    const coreRoles: Record<string, string> = {};
    const customRoles: Array<{ name: string; content: string }> = [];
    const emptySections: string[] = [];
    
    document.querySelectorAll('textarea[data-section-name]').forEach((el) => {
      const ta = el as HTMLTextAreaElement;
      let parent = ta.parentElement;
      let hidden = false;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') { hidden = true; break; }
        parent = parent.parentElement;
      }
      if (hidden) return;
      
      const name = ta.getAttribute('data-section-name') || '';
      const content = ta.value?.trim();
      if (!name) return;
      
      if (!content) {
        emptySections.push(name);
        return;
      }
      
      const coreNames = ['System Role', 'User Role', 'Tool Call', 'Few Shot', 'Context', 'Constraints'];
      if (coreNames.includes(name)) {
        coreRoles[name] = content;
      } else {
        customRoles.push({ name, content });
      }
    });

    // ── Validation: HARD STOP ──
    if (emptySections.length > 0) {
      const sectionList = emptySections.map(s => `"${s}"`).join(', ');
      setIsRunning(false);
      setIsThirdColumnOpen(false);
      setCompiledOutput("");

      window.dispatchEvent(new CustomEvent('run-blocked', {
        detail: { emptySections, sectionList }
      }));
      toast({
        title: `Run blocked — ${emptySections.length} empty section${emptySections.length > 1 ? 's' : ''}`,
        description: `${sectionList} ${emptySections.length > 1 ? 'are' : 'is'} empty.`,
        variant: 'destructive',
        duration: 0,
      });
      return;
    }

    setIsThirdColumnOpen(true);

    const payload = JSON.stringify({ core_roles: coreRoles, custom_roles: customRoles });
    
    try {
      const { getApiKey } = await import('@/services/authService');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = getApiKey();
      if (apiKey) headers['X-API-Key'] = apiKey;
      
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/teacher/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: "Execute the prompt configuration.", context: payload, mode: 'prompt_output', temperature: 0.45, model: selectedModel }),
      });
      
      if (!resp.ok) {
        setCompiledOutput(`Error: ${resp.status} ${await resp.text()}`);
        setIsRunning(false);
  
        return;
      }
      
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let output = '';
      let rawBody = '';
      const firstTokenTimeRef = { value: 0 };
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstTokenTimeRef.value) firstTokenTimeRef.value = performance.now();
          const chunk = decoder.decode(value, { stream: true });
          rawBody += chunk;
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                output += parsed.content || parsed.choices?.[0]?.delta?.content || '';
              } catch { output += line.slice(6); }
            }
          }
          setCompiledOutput(output);
        }
        if (!output && rawBody.trim()) {
          try {
            const data = JSON.parse(rawBody.trim());
            output = data.content || "No output returned.";
            setCompiledOutput(output);
          } catch { /* not JSON */ }
        }
      } else {
        const data = await resp.json();
        output = data.content || "No output returned.";
        setCompiledOutput(output);
      }

      // ── Performance metrics ────────────────────────────────────────
      const totalDuration = Math.round(performance.now() - startTime);
      const ttft = firstTokenTimeRef.value ? Math.round(firstTokenTimeRef.value - startTime) : totalDuration;
      Sentry.setMeasurement("prompt.total_ms", totalDuration, "millisecond");
      Sentry.setMeasurement("prompt.ttft_ms", ttft, "millisecond");
      Sentry.setMeasurement("prompt.output_chars", output.length, "char");
      
      window.dispatchEvent(new CustomEvent("prompt-executed", {
        detail: { model: selectedModel, duration: totalDuration, ttft, outputLength: output.length, timestamp: Date.now() },
      }));
    } catch (e) {
      setCompiledOutput(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      Sentry.captureException(e, { tags: { phase: "prompt_execution" } });
    } finally {
      setIsRunning(false);
    }
    
    window.dispatchEvent(new CustomEvent("reset-columns-to-equal-widths", {
      detail: { isThirdColumnOpening: true },
    }));
    });
  };

  // Keep a ref to the latest handleRun so the event listener isn't stale
  const handleRunRef = useRef(handleRun);
  handleRunRef.current = handleRun;

  // Listen for run-prompt event from ResponsivePromptBuilder's RUN button
  useEffect(() => {
    const handler = () => { handleRunRef.current(); };
    window.addEventListener('run-prompt', handler);
    window.addEventListener('ai-run-prompt', handler);
    return () => {
      window.removeEventListener('run-prompt', handler);
      window.removeEventListener('ai-run-prompt', handler);
    };
  }, []);

  // Restore compiledOutput from the loaded session on mount.
  // This runs BEFORE the restore-output event (which fires ~100ms later).
  // We track that we've already restored to prevent a subsequent empty
  // restore-output event from wiping the data (race-condition guard).
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (session?.compiledOutput && !sessionRestoredRef.current) {
      setCompiledOutput(session.compiledOutput);
      setIsThirdColumnOpen(true);
      sessionRestoredRef.current = true;
    }
  }, [session?.compiledOutput]);

  // Listen for restore-output event — opens third column with saved output.
  // Only applies if we didn't already restore from the session prop, or if
  // the event carries newer content that differs from what we already have.
  useEffect(() => {
    const handler = (e: Event) => {
      const { content } = (e as CustomEvent).detail;
      if (content) {
        // If we already restored from session and the event content is
        // identical, skip the redundant update.
        if (sessionRestoredRef.current && content === compiledOutput) return;
        setCompiledOutput(content);
        setIsThirdColumnOpen(true);
        sessionRestoredRef.current = false; // event wins over session
      }
    };
    window.addEventListener('restore-output', handler);
    return () => window.removeEventListener('restore-output', handler);
  }, [compiledOutput]);

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Approval Mode Banner */}
      {approvalMode && (
        <div className="flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-500 text-white px-5 py-3 rounded-xl mb-2 shadow-md animate-in slide-in-from-top-3 duration-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
              MS
            </div>
            <div>
              <p className="font-semibold text-sm">Approval Mode — Mustang Sally's Prompt</p>
              <p className="text-xs text-white/80">Reviewing: Multi-Agent Reasoning Framework</p>
            </div>
          </div>
          <button
            onClick={onClearApproval}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Exit Approval
          </button>
        </div>
      )}

      {/* Loading Indicator for entire A2UI surface */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
          <div className="bg-white p-8 rounded-xl shadow-xl max-w-md text-center">
            <div className="mb-4">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Session</h3>
            <p className="text-sm text-gray-600">Restoring your A2UI surface with all three columns...</p>
            <div className="mt-4 flex justify-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-75"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
            </div>
          </div>
        </div>
      )}

      {/* Rigid height anchor — gives ResizableSplitter's h-full a definite parent height
          to resolve against. flex: 1 1 0% + min-h-0 forces the wrapper to fill remaining
          space in PromptWorkspace's flex column, then ResizableSplitter's h-full resolves
          against this computed height. Do NOT remove this wrapper. */}
      <div style={{ position: 'relative', flex: '1 1 0%', minHeight: 0 }}>
      <ResizableSplitter
        leftInitialWidth={960}
        minLeftWidth={400}
        minRightWidth={0}
        isLightMode={false}
        isThirdColumnOpen={isThirdColumnOpen}
        onThirdColumnStateChange={handleThirdColumnStateChange}
      >
        {/* Left Column — Editor (or Chat when flipped) */}
        <div
          {...UI_ID.LAYOUT.LEFT_COLUMN}
          className="w-full flex-[1.2] min-w-[400px] flex flex-col rounded-[10px] shadow-lg min-h-[600px] h-full"
        >
          <div className="flex-1 min-h-0 h-full flex flex-col">
            {flipped ? (
              <InteractiveChatInterface
                onConversationChange={onConversationChange}
                sessionId={session?.id || null}
                compiledOutput={compiledOutput}
                isRunning={isRunning}
              />
            ) : (
              <DndProvider backend={HTML5Backend}>
                <ResponsivePromptBuilderWithDnD />
              </DndProvider>
            )}
          </div>
        </div>

        {/* Right Column — Chat (or Editor when flipped) */}
        <div
          {...UI_ID.LAYOUT.RIGHT_COLUMN}
          className="w-full flex-[0.8] flex flex-col min-h-[600px] h-full min-w-0"
        >
          <div className="flex-1 min-h-0 h-full flex flex-col">
            {flipped ? (
              <DndProvider backend={HTML5Backend}>
                <ResponsivePromptBuilderWithDnD />
              </DndProvider>
            ) : (
              <InteractiveChatInterface
                onConversationChange={onConversationChange}
                sessionId={session?.id || null}
                compiledOutput={compiledOutput}
                isRunning={isRunning}
              />
            )}
          </div>
        </div>

        {/* Third Column - Injectable Middle Slot */}
        <div className="w-full flex-[0.8] min-w-[400px] flex flex-col min-h-[600px] h-full overflow-hidden">
          <MiddleColumnSlot
            sessionId={session?.id || null}
            responseCardModel={responseCardModel}
            onResponseCardModelChange={setResponseCardModel}
            expandedCard={expandedCard}
            onToggleExpandedCard={setExpandedCard}
            compiledOutput={compiledOutput}
            isRunning={isRunning}
            onClearOutput={handleClearOutput}
            onRegenerate={handleRegenerate}
          />
        </div>
      </ResizableSplitter>
      </div>

      {/* Control Bar — Lit Web Component (P3: ported from React, CustomEvents for shell integration) */}
      <footer-bar
        version-text={session ? `Saved: ${session.title}` : "Editing Version 1"}
        is-saving={isSaving ? '' : undefined}
        ref={(el) => {
          if (!el) return;
          // Attach CustomEvent listeners once (Lit dispatches save-click, run-click)
          const handleSave = () => onSave(compiledOutput);
          const handleRunClick = () => handleRun();
          el.addEventListener('save-click', handleSave);
          el.addEventListener('run-click', handleRunClick);
          (el as any).__cleanup = () => {
            el.removeEventListener('save-click', handleSave);
            el.removeEventListener('run-click', handleRunClick);
          };
        }}
      />
    </div>
  );
}