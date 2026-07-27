/**
 * ConsolePage - STRICT A2UI ENFORCEMENT
 *
 * NO FALLBACKS. NO HIDDEN FETCHES. NO ERROR SUPPRESSION.
 *
 * This component ONLY renders what the AI assembles.
 * If AI fails, show the error. If no data, show "Waiting for AI Event".
 */
import { Frame29 } from "@/components/PromptDashboardCanvas";
import { getStoredUserId } from "@/services/authService";

/**
 * A2UI re-assembly request — dispatched when the user asks for a fresh
 * assembly. WritingAreaIndex listens and re-runs the render-console intent
 * through the AI. No webpage reloads — navigation is an AI command.
 */
const requestReassembly = () => {
  window.dispatchEvent(new CustomEvent('a2ui:console-command', { detail: { reason: 'user-retry' } }));
};

interface ConsolePageProps {
  onOpenPrompt?: (sessionId: string) => void;
  onCreateNew?: (title: string) => void;
  refreshKey?: number;
  aiAssembledCards?: any[] | null;
  isParentLoading?: boolean;
  errorMessage?: string | null;
  loadingMessage?: string;
}

export default function ConsolePage({
  onOpenPrompt,
  onCreateNew,
  aiAssembledCards = null,
  isParentLoading = false,
  errorMessage = null,
  loadingMessage = "Assembling your console..."
}: ConsolePageProps) {

  // ✅ STRICT A2UI RULE #1: If parent is loading, show spinner INSIDE this surface only
  if (isParentLoading) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#E5E1DD", minHeight: "calc(100vh - 120px)" }}>
        <div className="w-8 h-8 border-3 border-[#507274] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[#507274] text-sm font-medium font-['Inter'] animate-pulse">{loadingMessage}</p>
      </div>
    );
  }

  // ✅ STRICT A2UI RULE #2: If there's an error, SHOW IT with retry option
  if (errorMessage) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center p-4" style={{ backgroundColor: "#E5E1DD", minHeight: "calc(100vh - 120px)" }}>
        <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-8 max-w-4xl w-full text-left">
          <h2 className="text-red-700 text-xl font-bold mb-2">AI Assembly Error</h2>
          <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4 max-h-96 overflow-auto">
            <pre className="text-red-600 font-mono text-xs whitespace-pre-wrap break-words">{errorMessage}</pre>
          </div>
          <div className="text-center">
            <button
              onClick={requestReassembly}
              className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry Assembly
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ STRICT A2UI RULE #3: null cards = the AI event has NOT arrived yet.
  // Never claim "empty" while the surface is still waiting for the AI.
  if (!aiAssembledCards) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#E5E1DD", minHeight: "calc(100vh - 120px)" }}>
        <div className="w-8 h-8 border-3 border-[#507274] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[#507274] text-sm font-medium font-['Inter'] animate-pulse">Waiting for AI assembly…</p>
      </div>
    );
  }

  // ✅ STRICT A2UI RULE #4: The AI assembled successfully and the truth is:
  // this user owns ZERO prompt packages. State it exactly — with the
  // identity that was queried — and offer the two honest intents:
  // create a package (composer intent) or re-assemble (AI command).
  if (aiAssembledCards.length === 0) {
    const uid = getStoredUserId();
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center" style={{ backgroundColor: "#E5E1DD", minHeight: "calc(100vh - 120px)" }}>
        <div className="bg-white border-2 border-[#507274] rounded-2xl p-8 max-w-lg text-center">
          <h2 className="text-[#234354] text-xl font-bold mb-2">AI assembled — 0 packages</h2>
          <p className="text-gray-600 mb-1 text-sm">
            The console assembled successfully. No prompt packages exist for user
            <span className="font-mono text-xs bg-gray-100 px-1 rounded ml-1">{uid.slice(0, 8)}…{uid.slice(-4)}</span>
          </p>
          <p className="text-gray-500 mb-6 text-xs">
            If you expected packages here, you may be signed in as a different identity than the package owner.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => onCreateNew?.(`New Prompt Agent • ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`)}
              className="px-6 py-2 bg-[#234354] text-white font-semibold rounded-lg hover:bg-[#1a2f3d] transition-colors"
            >
              Create in Composer
            </button>
            <button
              onClick={requestReassembly}
              className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
            >
              Re-assemble
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ AI assembled cards successfully - render them
  const handleOpen = (sessionId: string) => {
    console.log('[ConsolePage] Opening session:', sessionId);
    onOpenPrompt?.(sessionId);
  };

  const handleCreateNew = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const defaultTitle = `New Prompt Agent • ${timeStr}`;
    onCreateNew?.(defaultTitle);
  };

  return (
    <div className="flex-1 w-full overflow-x-auto relative min-h-0" style={{ backgroundColor: "#E5E1DD" }}>
      <div className="w-full px-4 pt-[54px] pb-6">
        <Frame29
          onOpenPrompt={handleOpen}
          onCreateNew={handleCreateNew}
          searchValue=""
          onSearchChange={() => {}}
          agents={aiAssembledCards}
        />
      </div>
    </div>
  );
}
