import React, { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { MiddleSlotType, MiddleSlotMeta } from "@/hooks/useLayoutState";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { A2UISurfaceContainer } from "@/components/A2UISurfaceContainer";
import { LexicalEditor } from "@/editor";
import type { LexicalEditorRef } from "@/editor";

type InjectedContent =
  | { type: "ab-test" }
  | { type: "content"; title: string; body: React.ReactNode; source?: string }
  | { type: "lexical-editor"; content?: string };

interface MiddleColumnSlotProps {
  sessionId?: string | null;
  responseCardModel: string;
  onResponseCardModelChange: (model: string) => void;
  expandedCard: "a" | "b";
  onToggleExpandedCard: (card: "a" | "b") => void;
  /** Report slot type changes to the layout registry */
  onSlotChange?: (slot: MiddleSlotType, meta?: MiddleSlotMeta | null) => void;
  compiledOutput?: string;
  isRunning?: boolean;
  onClearOutput?: () => void;
  onRegenerate?: (model: string) => void;
}

const AVAILABLE_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek V4" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
  { value: "claude-3-opus", label: "Claude 3 Opus" },
];

export const MiddleColumnSlot: React.FC<MiddleColumnSlotProps> = ({
  sessionId,
  responseCardModel,
  onResponseCardModelChange,
  onToggleExpandedCard: _onToggleExpandedCard,
  onSlotChange,
  compiledOutput,
  isRunning,
  onClearOutput,
  onRegenerate,
}) => {
  const [injectedContent, setInjectedContent] = useState<InjectedContent | null>(null);
  const [selectedModel, setSelectedModel] = useState(responseCardModel || "deepseek-chat");
  const [editedOutput, setEditedOutput] = useState("");
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [activeTool, setActiveTool] = useState<"output" | "lexical-editor">("output");
  const [surfaceHasContent, setSurfaceHasContent] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<LexicalEditorRef>(null);
  const { toast } = useToast();

  // Sync edited output with compiled output when it streams in,
  // stripping any A2UI protocol XML so only conversational text displays
  useEffect(() => {
    if (compiledOutput !== undefined) {
      let cleaned = compiledOutput
        .replace(/<a2ui_surface>[\s\S]*?<\/a2ui_surface>/gi, '')
        .replace(/<tool_use[\s\S]*?<\/tool_use>/gi, '')
        .replace(/<param[\s\S]*?\/>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
      setEditedOutput(cleaned);
    }
  }, [compiledOutput]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isRunning && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [editedOutput, isRunning]);

  // Sync model changes back to parent
  useEffect(() => {
    onResponseCardModelChange(selectedModel);
  }, [selectedModel, onResponseCardModelChange]);

  // Listen for content injection events from other panels
  const handleInjectContent = useCallback((event: Event) => {
    const evt = event as CustomEvent<{ 
      title?: string; 
      body?: React.ReactNode; 
      source?: string;
      type?: string;
      content?: string;
    }>;
    const detail = evt.detail;
    
    // Tool-switching: load_tool / close_tool
    if (detail.type === 'lexical-editor' || detail.type === 'load_tool') {
      setInjectedContent({
        type: "lexical-editor",
        content: detail.content || editedOutput || "",
      });
      setActiveTool("lexical-editor");
      return;
    }
    if (detail.type === 'close_tool') {
      setInjectedContent(null);
      setActiveTool("output");
      return;
    }
    
    // Default content injection
    setInjectedContent({
      type: "content",
      title: detail.title || "Content",
      body: detail.body,
      source: detail.source,
    });
  }, [editedOutput]);

  const handleClearInjection = useCallback(() => {
    setInjectedContent(null);
  }, []);

  // Listen for reset-middle-column event — also resets tool
  const handleResetMiddleColumn = useCallback(() => {
    setInjectedContent(null);
    setActiveTool("output");
  }, []);

  // ── A2UI ai-command listener — handles load_tool / close_tool tags from AI chat ──
  useEffect(() => {
    const handleAiCommand = (e: Event) => {
      const { tag, props: p = {} } = (e as CustomEvent).detail || {};
      if (tag === 'load_tool' && p.name === 'lexical-editor') {
        setInjectedContent({ type: "lexical-editor", content: p.content || editedOutput || "" });
        setActiveTool("lexical-editor");
      }
      if (tag === 'close_tool') {
        setInjectedContent(null);
        setActiveTool("output");
      }
    };
    window.addEventListener('ai-command', handleAiCommand);
    return () => window.removeEventListener('ai-command', handleAiCommand);
  }, [editedOutput]);

  // Report slot type changes to the layout registry
  useEffect(() => {
    if (injectedContent && injectedContent.type === "content") {
      onSlotChange?.("content", {
        title: injectedContent.title,
        source: injectedContent.source,
        injectedAt: Date.now(),
      });
    } else if (compiledOutput || editedOutput) {
      onSlotChange?.("output");
    } else {
      onSlotChange?.(null);
    }
  }, [injectedContent, compiledOutput, editedOutput, onSlotChange]);

  useEffect(() => {
    window.addEventListener("inject-middle-content", handleInjectContent);
    window.addEventListener("reset-middle-column", handleResetMiddleColumn);

    return () => {
      window.removeEventListener("inject-middle-content", handleInjectContent);
      window.removeEventListener("reset-middle-column", handleResetMiddleColumn);
    };
  }, [handleInjectContent, handleResetMiddleColumn]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editedOutput).then(() => {
      toast({ title: "Copied", description: "Output copied to clipboard" });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not copy to clipboard" });
    });
  };

  const handleClear = () => {
    setEditedOutput("");
    onClearOutput?.();
  };

  const handleRegenerateClick = () => {
    onRegenerate?.(selectedModel);
  };

  // ── Lexical Editor Tool ──────────────────────────────────────────
  if (activeTool === "lexical-editor") {
    const editorContent = injectedContent?.type === "lexical-editor" ? injectedContent.content || "" : editedOutput;
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: "#f5f5f5" }}>
        {/* Editor header with tool selector */}
        <div className="shrink-0 bg-[#234354] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm font-semibold font-manrope">
            <span className="text-[#45D690]">📝 Lexical Editor</span>
            <span className="text-white/50 text-xs">— AI-controlled rich text</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Export current content
                const content = editorRef.current?.getContent() || "";
                navigator.clipboard.writeText(content);
                toast({ title: "Copied", description: "Editor content copied to clipboard" });
              }}
              className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              Copy All
            </button>
            <button
              onClick={() => {
                setInjectedContent(null);
                setActiveTool("output");
              }}
              className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
              title="Return to output view"
            >
              ← Back to Output
            </button>
          </div>
        </div>
        {/* Editor body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <LexicalEditor
            ref={editorRef}
            initialContent={editorContent}
            isLightMode={false}
            toolbar="full"
            minHeight="100%"
            placeholder="Edit your document here…"
            onContentChange={(content) => {
              setEditedOutput(content);
            }}
          >
            {/* Toolbar rendered as child inside LexicalComposer */}
          </LexicalEditor>
        </div>
      </div>
    );
  }

  // Show injected content when present
  if (injectedContent && injectedContent.type === "content") {
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: "#f5f5f5" }}>
        <div className="shrink-0 bg-[#222936] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm font-semibold font-manrope truncate">
            <span className="text-[#45D690] text-xs opacity-70">
              {injectedContent.source ? `From: ${injectedContent.source}` : "Injected Content"}
            </span>
            <span>→</span>
            <span className="truncate">{injectedContent.title}</span>
          </div>
          <button
            onClick={handleClearInjection}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
            title="Restore default output view"
          >
            Clear
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {injectedContent.body}
        </div>
      </div>
    );
  }

  // ── Default: Output Workspace ──────────────────────────────────────
  const hasOutput = !!(compiledOutput || editedOutput);
  const hasSession = !!sessionId;

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden" data-compiled-output={hasOutput ? "true" : undefined}>
      {/* Header */}
      <div className="bg-[#234354] text-white px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Output</span>
          {hasSession && (
            <span className="text-xs text-[#45D690] border border-[#45D690]/30 rounded px-1.5 py-0.5">A2UI Live</span>
          )}
          {isRunning && (
            <span className="text-xs animate-pulse text-[#45D690]">Streaming…</span>
          )}
          {!isRunning && hasOutput && (
            <span className="text-xs text-white/50">editable</span>
          )}
        </div>

        {/* View mode toggle + Model selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(v => v === "rendered" ? "raw" : "rendered")}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              viewMode === "rendered"
                ? "bg-[#45D690] text-[#1a2d3d] border-[#45D690]"
                : "bg-transparent text-white/60 border-white/20 hover:text-white hover:border-white/40"
            }`}
            title={viewMode === "rendered" ? "Showing rendered — click for raw" : "Showing raw — click for rendered"}
          >
            {viewMode === "rendered" ? "Rendered" : "Raw"}
          </button>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-[#1a2d3d] text-white text-xs border border-white/20 rounded px-2 py-1 focus:outline-none focus:border-[#45D690]"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── A2UI Surface (Lit components) — primary AI-controlled output ── */}
      {/* When the surface is empty it must not hog the column and push the
          text output down — it collapses and the output takes the space. */}
      <div className={surfaceHasContent ? "flex-1 min-h-0 overflow-auto" : "shrink-0"}>
        <A2UISurfaceContainer
          sessionId={sessionId || null}
          column="middle"
          onComponentMounted={(tag, props) => {
            setSurfaceHasContent(true);
            console.log('[A2UI] Component mounted:', tag, props);
          }}
          onSurfaceCleared={() => {
            setSurfaceHasContent(false);
            console.log('[A2UI] Surface cleared');
          }}
        />
      </div>

      {/* Fallback: Markdown text output (fills the column when the surface is empty) */}
      {hasOutput ? (
        <div className={surfaceHasContent ? "border-t border-gray-200 shrink-0 max-h-[40%] overflow-hidden" : "border-t border-gray-200 flex-1 min-h-0 overflow-hidden flex flex-col"}>
          {viewMode === "raw" ? (
            <textarea
              ref={outputRef}
              value={editedOutput}
              onChange={(e) => setEditedOutput(e.target.value)}
              placeholder="Run the prompt to generate output here…"
              className={`w-full resize-none p-3 font-mono text-sm leading-relaxed bg-gray-50 text-[#171717] placeholder:text-gray-400 focus:outline-none ${surfaceHasContent ? "h-32" : "flex-1 min-h-0"}`}
              readOnly={isRunning}
            />
          ) : (
            <div className={`w-full overflow-auto p-3 bg-gray-50 text-[#171717] ${surfaceHasContent ? "h-32" : "flex-1 min-h-0"}`}>
              <MarkdownRenderer text={editedOutput} />
            </div>
          )}
        </div>
      ) : isRunning ? (
        /* Streaming has started but no output yet — show spinner */
        <div className="border-t border-gray-200 flex-1 min-h-0 flex flex-col items-center justify-center gap-3 bg-gray-50">
          <div className="w-6 h-6 border-2 border-[#234354] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500 font-medium animate-pulse">Grace is compiling your output…</p>
        </div>
      ) : null}

      {/* Footer actions */}
      <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center justify-between shrink-0 mt-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!editedOutput}
            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Copy
          </button>
          <button
            onClick={() => {
              // Dispatch save-output event so PromptWorkspace can persist it
              window.dispatchEvent(new CustomEvent('save-output', { detail: { content: editedOutput } }));
              toast({ title: 'Output saved', description: 'Output has been saved with the prompt.', duration: 4000 });
            }}
            disabled={!editedOutput}
            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => {
              const blob = new Blob([editedOutput], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `prompt-output-${new Date().toISOString().slice(0, 10)}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              toast({ title: 'Exported', description: 'Output downloaded as .txt file.', duration: 3000 });
            }}
            disabled={!editedOutput}
            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
          <button
            onClick={handleClear}
            disabled={!editedOutput}
            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Clear
          </button>
        </div>
        <button
          onClick={handleRegenerateClick}
          disabled={isRunning}
          className="text-xs px-4 py-1.5 rounded bg-[#234354] text-white hover:bg-[#1a2d3d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isRunning ? "Running…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
};

export default MiddleColumnSlot;