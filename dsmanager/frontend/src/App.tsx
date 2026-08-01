import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import WritingAreaIndex from "@/pages/WritingAreaIndex";
import PinGate from "@/components/PinGate";
import CommandCenter from "@/pages/CommandCenter";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
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
            <div className="h-screen bg-grace-bg overflow-hidden">
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

export { App };
// Force rebuild 1763609400
