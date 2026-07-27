import { useState, useCallback, useRef, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { aiOrchestrator } from "@/utils/aiOrchestrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConsolePage from "@/pages/ConsolePage";
import WritingAreaIndex from "@/pages/WritingAreaIndex";
import PinGate from "@/components/PinGate";
import FigmaCard from "@/components/FigmaCard";
import LeftVerticalMenu from "@/components/LeftVerticalMenu";
import LeftColumnHeader from "@/components/LeftColumnHeader";
import CommandCenter from "@/pages/CommandCenter";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
import { InteractiveChatInterface } from "@/components/InteractiveChatInterface";
import "./global.css";

const queryClient = new QueryClient();

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("grace_is_authenticated") === "true";
  });

  const handleLoginSuccess = () => {
    localStorage.setItem("grace_is_authenticated", "true");
    setIsAuthenticated(true);
  };

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner 
            position="top-center" 
            richColors 
            toastOptions={{
              style: {
                background: '#166534',
                color: '#fff',
                border: '1px solid #15803d',
                fontSize: '15px',
                fontWeight: 600,
                padding: '14px 20px',
                minWidth: '320px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              },
            }}
          />
          <PinGate onLoginSuccess={handleLoginSuccess} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Show main app if authenticated
  try {
    return (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner 
              position="top-center" 
              richColors 
              toastOptions={{
                style: {
                  background: '#166534',
                  color: '#fff',
                  border: '1px solid #15803d',
                  fontSize: '15px',
                  fontWeight: 600,
                  padding: '14px 20px',
                  minWidth: '320px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                },
              }}
            />
            <div className="min-h-screen bg-grace-bg">
              <SentryErrorBoundary
                scope="app-root"
                onError={(error, componentStack) => {
                  console.error("App-level error:", error.message);
                }}
              >
                <Routes>
                  {/* A2UI: Single root route - AI assembles all surfaces dynamically */}
                  <Route
                    path="/"
                    element={<WritingAreaIndex isAuthenticated={true} />}
                  />
                  <Route
                    path="/debug/command-center"
                    element={<CommandCenter />}
                  />
                  {/* All other paths redirect to root - AI controls navigation */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </SentryErrorBoundary>
            </div>
          </TooltipProvider>
        </QueryClientProvider>
      </BrowserRouter>
    );
  } catch (error) {
    console.error("App render error:", error);
    return (
      <div style={{ color: "red", padding: "20px" }}>
        Error: {String(error)}
      </div>
    );
  }
}

// A2UI: ComposerNavigate removed - navigation is AI-driven, not URL-based

function ConsolePageWithNavigate() {
  const COLLAPSED_WIDTH = 75;
  const DEFAULT_EXPANDED_WIDTH = 380;
  const SIDEBAR_GRIP_OFFSET = 40; // Half of 75px sidebar width — accounts for dots being inside the rail
  const [chatWidth, setChatWidth] = useState(COLLAPSED_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const preCollapseWidthRef = useRef(DEFAULT_EXPANDED_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidebarDraggingRef = useRef(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 480);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // A2UI v0.9: Load existing session via unified surface assembly
  const handleOpenPrompt = useCallback(async (sessionId: string) => {
    const response = await fetch('/api/ai/assemble-surface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: `render-session:${sessionId}` }),
    });
    const data = await response.json();
    await aiOrchestrator.assemble(JSON.stringify(data));
    // DO NOT navigate - stay on current view
  }, []);

  // A2UI v0.9: Create new composer surface via unified endpoint
  const handleCreateNew = useCallback(async (_title: string) => {
    const response = await fetch('/api/ai/assemble-surface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'render-composer' }),
    });
    const data = await response.json();
    await aiOrchestrator.assemble(JSON.stringify(data));
    // DO NOT navigate - stay on current view
  }, []);

  // A2UI v0.9: Switch tabs via unified surface assembly
  const handleTabChangeWithOverlay = useCallback(async (tabId: string | null) => {
    const intent = tabId === "composer" ? 'render-composer' : 'render-console';
    const response = await fetch('/api/ai/assemble-surface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    const data = await response.json();
    await aiOrchestrator.assemble(JSON.stringify(data));
    // DO NOT navigate - stay on current view
  }, []);

  const isCollapsed = chatWidth <= COLLAPSED_WIDTH;

  // Helper: max chat width — at mobile can overlay full container
  const getMaxChatWidth = useCallback(() => {
    if (!containerRef.current) return DEFAULT_EXPANDED_WIDTH;
    const containerW = containerRef.current.getBoundingClientRect().width;
    // Allow chat to take up to 95% of container (full overlay at mobile)
    return Math.max(COLLAPSED_WIDTH, Math.floor(containerW * 0.95));
  }, []);

  // Helper: clamp chatWidth to valid range
  const clampChatWidth = useCallback((w: number) => {
    const max = getMaxChatWidth();
    if (w < 100) return COLLAPSED_WIDTH;
    return Math.max(COLLAPSED_WIDTH, Math.min(w, max));
  }, [getMaxChatWidth]);

  // ── Chat resize handlers ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Double-click to toggle collapse/expand
  const handleResizeDoubleClick = useCallback(() => {
    if (isCollapsed) {
      setChatWidth(clampChatWidth(preCollapseWidthRef.current));
    } else {
      preCollapseWidthRef.current = chatWidth;
      setChatWidth(COLLAPSED_WIDTH);
    }
  }, [isCollapsed, chatWidth, clampChatWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Skip — sidebar gripper drag handles its own positioning via custom events
      if (isSidebarDraggingRef.current) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = clampChatWidth(rect.right - e.clientX);
      setChatWidth(newWidth);
    };
    const handleMouseUp = () => {
      // Skip — sidebar gripper handles its own cleanup
      if (isSidebarDraggingRef.current) return;
      setIsResizing(false);
      setChatWidth((w) => {
        if (w > COLLAPSED_WIDTH) preCollapseWidthRef.current = w;
        return w;
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, clampChatWidth]);

  // ── Sidebar gripper (four-dot) drag → resize chat column ──
  useEffect(() => {
    const handleSidebarDragStart = () => {
      isSidebarDraggingRef.current = true;
      setIsResizing(true);
    };

    const handleSidebarDrag = (event: Event) => {
      const customEvent = event as CustomEvent<{ clientX?: number }>;
      if (typeof customEvent.detail?.clientX !== 'number') return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = clampChatWidth(rect.right - customEvent.detail.clientX + SIDEBAR_GRIP_OFFSET);
      setChatWidth(newWidth);
    };

    const handleSidebarDragEnd = () => {
      isSidebarDraggingRef.current = false;
      setIsResizing(false);
      setChatWidth((w) => {
        if (w > COLLAPSED_WIDTH) preCollapseWidthRef.current = w;
        return w;
      });
    };

    window.addEventListener('right-column-drag-start', handleSidebarDragStart);
    window.addEventListener('right-column-drag', handleSidebarDrag as EventListener);
    window.addEventListener('right-column-drag-end', handleSidebarDragEnd);

    return () => {
      window.removeEventListener('right-column-drag-start', handleSidebarDragStart);
      window.removeEventListener('right-column-drag', handleSidebarDrag as EventListener);
      window.removeEventListener('right-column-drag-end', handleSidebarDragEnd);
    };
  }, [clampChatWidth]);

  // ── Double-click sidebar gripper dots → snap chat to center ──
  useEffect(() => {
    const handleGripperDoubleClickToCenter = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Center = half the container, but capped to max chat width
      const centerWidth = Math.floor(rect.width / 2);
      const snappedWidth = clampChatWidth(Math.max(COLLAPSED_WIDTH, centerWidth));
      setChatWidth(snappedWidth);
      preCollapseWidthRef.current = snappedWidth;
    };

    window.addEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    return () => {
      window.removeEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    };
  }, []);

  return (
    <div
      className={`h-screen flex flex-row overflow-hidden font-manrope ${isMobile ? '[&::-webkit-scrollbar]:hidden' : ''}`}
      style={{ backgroundColor: "#E5E1DD", scrollbarWidth: isMobile ? 'none' : 'auto' }}
    >
      <LeftVerticalMenu />
      <div ref={containerRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <LeftColumnHeader
          activeTab="console"
          onTabChange={handleTabChangeWithOverlay}
        />
        <div className="flex-1 flex flex-row overflow-hidden min-h-0" style={isMobile ? { scrollbarWidth: 'none' } as React.CSSProperties : undefined}>
          {/* Console — cards & toolbar. Hidden when chat is open at mobile */}
          <div
            className="flex-1 overflow-auto min-w-0"
            style={{
              display: (isMobile && !isCollapsed) ? 'none' : 'block',
              overflow: (isMobile && !isCollapsed) ? 'hidden' : 'auto',
              scrollbarWidth: isMobile ? 'none' : 'auto',
              msOverflowStyle: isMobile ? 'none' : 'auto',
            }}
          >
            <ConsolePage onOpenPrompt={handleOpenPrompt} onCreateNew={handleCreateNew} />
          </div>

          {/* Resize handle — drag to resize, double-click to toggle collapse */}
          <div
            onMouseDown={handleResizeStart}
            onDoubleClick={handleResizeDoubleClick}
            className={`shrink-0 cursor-col-resize transition-colors flex items-center justify-center ${
              isResizing ? "bg-[#507274]" : "bg-transparent hover:bg-[#507274]/20"
            }`}
            style={{ width: 6, userSelect: "none" }}
            title="Drag to resize · Double-click to collapse"
          >
            {isCollapsed && (
              <div className="w-[3px] h-8 rounded-full bg-[#507274]/30" />
            )}
          </div>

          {/* Chat panel — always rendered */}
          <div
            className="shrink-0 h-full overflow-hidden"
            style={{
              width: chatWidth,
              transition: isResizing ? 'none' : 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <InteractiveChatInterface />
          </div>
        </div>
      </div>
    </div>
  );
}

export { App };
// Force rebuild 1763609400
