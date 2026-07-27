import { API_BASE } from "@/shared/apiHelper";
import { useState, useEffect } from "react";
import { getStoredUserId } from "@/services/authService";
import raibachLogo from "../assets/raibach-logo.jpg";

interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

interface LeftVerticalMenuProps {
  onNewChat?: () => void;
  onNewProject?: () => void;
  onUploadDocument?: () => void;
  userName?: string;
  userAvatar?: string;
}


// List icon for prompts
const ListIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <path d="M5 5h10M5 10h10M5 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="3" cy="5" r="1" fill="currentColor" />
    <circle cx="3" cy="10" r="1" fill="currentColor" />
    <circle cx="3" cy="15" r="1" fill="currentColor" />
  </svg>
);


// Box/component icon
const ComponentIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <rect x="2" y="2" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="2" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="11" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="11" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

// Raibach Interactive Design logo
const StarburstIcon = ({ logo }: { logo?: string }) => (
  <img 
    src={logo} 
    alt="Raibach" 
    className="w-7 h-7 rounded object-cover"
  />
);

// Plus icon
const PlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Chat icon
const ChatIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <path
      d="M2 6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 3V6z"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// Folder icon
const FolderIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <path
      d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// Document / Upload icon
const UploadIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <path
      d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M12 8l-2-2m0 0L8 8m2-2v8"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// Helper to make authenticated API calls with required X-User-ID header
// Uses the stored user ID via getStoredUserId() — same pattern as every other file
const apiFetch = (url: string, options?: RequestInit): Promise<Response> => {
  const userId = getStoredUserId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-ID': userId,
  };
  if (options?.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }
  return fetch(url, { ...options, headers });
};

export default function LeftVerticalMenu({
  onNewChat,
  onNewProject,
  onUploadDocument,
  userName = "User",
  userAvatar,
}: LeftVerticalMenuProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [promptList, setPromptList] = useState<Array<{id:string;title:string;updated_at:string}>>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [componentList, setComponentList] = useState<Array<{name:string;id:string;description?:string}>>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);

  // Detect mobile breakpoint — collapse to hamburger below 768px (2-card break)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Hamburger icon
  const HamburgerIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const handleItemClick = (id: string, callback?: () => void) => {
    if (expandedItem === id) {
      setExpandedItem(null);
      setIsExpanded(false);
    } else {
      setExpandedItem(id);
      setIsExpanded(true);
      callback?.();
    }
  };

  // Fetch prompts when prompts panel opens
  useEffect(() => {
    if (expandedItem === "prompts") {
      setPromptsLoading(true);
      apiFetch(`${API_BASE}/prompts`)
        .then(r => r.json())
        .then(d => setPromptList((d.prompts || d.sessions || []).slice(0, 30)))
        .catch((err) => console.error('[LeftVerticalMenu] Failed to fetch prompts:', err))
        .finally(() => setPromptsLoading(false));
    }
    if (expandedItem === "components") {
      setComponentsLoading(true);
      fetch(`${API_BASE}/figma/config`)
        .then(r => r.json())
        .then(fc => {
          if (fc.connected && fc.file_key) {
            return fetch(`${API_BASE}/figma/file`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file_key:fc.file_key})});
          }
          throw new Error("not connected");
        })
        .then(r => r.json())
        .then(d => {
          const comps = d.components ? Object.values(d.components) : [];
          setComponentList(comps.map((c:any) => ({name:c.name,id:c.key||c.node_id||c.id,description:c.description})));
        })
        .catch((err) => console.error('[LeftVerticalMenu] Failed to fetch components:', err))
        .finally(() => setComponentsLoading(false));
    }
  }, [expandedItem]);

  const handleDeletePrompt = async (e: React.MouseEvent, promptId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this prompt?')) return;
    const r = await apiFetch('/api/prompt-sessions/' + promptId + '?permanent=true', { method: 'DELETE' });
    if (!r.ok) {
      alert('Failed to delete prompt. Please try again.');
      return;
    }
    setPromptList(prev => prev.filter(p => p.id !== promptId));
    // Notify WritingAreaIndex so it clears currentPromptSession if the deleted prompt is the one currently open
    window.dispatchEvent(new CustomEvent('prompt-session-deleted', { detail: { id: promptId } }));
    window.dispatchEvent(new CustomEvent('prompt-version-updated', { detail: { type: 'deleted', id: promptId } }));
  };

  const handleCreateNewPrompt = () => {
    // "New Prompt" clears the workspace WITHOUT saving to the database.
    // The user starts with a blank slate. Only "Save Template" creates a DB row.
    handleCollapse();
    window.dispatchEvent(new CustomEvent('start-new-prompt'));
  };

  const handleCollapse = () => {
    setExpandedItem(null);
    setIsExpanded(false);
  };

  const menuItems: MenuItem[] = [
    {
      id: "new-chat",
      icon: <ChatIcon />,
      label: "New Chat",
      onClick: onNewChat,
    },
    {
      id: "prompts",
      icon: <ListIcon />,
      label: "Saved Prompts",
    },
    {
      id: "components",
      icon: <ComponentIcon />,
      label: "Components",
    },
    {
      id: "new-project",
      icon: <FolderIcon />,
      label: "New Project",
      onClick: onNewProject,
    },
    {
      id: "upload",
      icon: <UploadIcon />,
      label: "Upload Document",
      onClick: onUploadDocument,
    },
  ];

  return (
    <div
      id="left-vertical-menu"
      className="relative flex flex-row h-full flex-shrink-0"
      style={{ zIndex: 50 }}
    >
      {/* Narrow icon strip — hidden at mobile, hamburger replaces it */}
      <div
        data-lit-id="left-vertical-menu"
        data-lit-type="navigation"
        data-lit-description="Left vertical nav — collapses to hamburger below 768px"
        className="flex-col items-center py-4 gap-3 h-full flex-shrink-0"
        style={{
          display: isMobile ? "none" : "flex",
          width: "56px",
          backgroundColor: "#12101f",
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Raibach Logo at top */}
        <div className="mb-2" style={{ marginTop: "-3px" }}>
          <StarburstIcon logo={raibachLogo} />
        </div>

        {/* Action buttons */}
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item.id, item.onClick)}
            className={`
              w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200
              ${expandedItem === item.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                : "bg-white/8 text-gray-300 hover:bg-white/15 hover:text-white border border-white/10"
              }
            `}
            title={item.label}
            style={{ backgroundColor: expandedItem === item.id ? undefined : "rgba(255,255,255,0.06)" }}
          >
            <PlusIcon />
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all flex-shrink-0"
          style={{ backgroundColor: "#6b4fa0" }}
          title={userName}
        >
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
          ) : (
            userName.charAt(0).toUpperCase()
          )}
        </div>
      </div>

      {/* Expanded flyout panel */}
      <div
        className="h-full flex flex-col overflow-hidden transition-all duration-250 ease-out"
        style={{
          width: isExpanded ? "200px" : "0px",
          backgroundColor: "#1a1730",
          borderRight: isExpanded ? "1px solid rgba(255,255,255,0.08)" : "none",
          overflow: "hidden",
        }}
      >
        {isExpanded && expandedItem && (
          <div className="flex flex-col h-full p-3 gap-1" style={{ minWidth: "200px" }}>
            {/* Panel header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {menuItems.find((m) => m.id === expandedItem)?.label}
              </span>
              <button
                onClick={handleCollapse}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/10 mb-2" />

            {/* Content based on active item */}
            {expandedItem === "new-chat" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { onNewChat?.(); handleCollapse(); }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                >
                  <span className="text-base">💬</span>
                  <span>Start New Chat</span>
                </button>
                <button
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                  onClick={handleCollapse}
                >
                  <span className="text-base">📋</span>
                  <span>Recent Chats</span>
                </button>
              </div>
            )}

            {expandedItem === "prompts" && (
              <div className="flex flex-col gap-1 overflow-y-auto flex-1">
                <button
                  onClick={handleCreateNewPrompt}
                  className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded text-xs text-white bg-[#4066e3] hover:bg-[#3655c3] transition-colors text-center justify-center font-semibold"
                >
                  + New Prompt
                </button>
                {promptsLoading ? (
                  <div className="text-xs text-gray-400 px-3 py-2 italic">Loading...</div>
                ) : promptList.length === 0 ? (
                  <div className="text-xs text-gray-400 px-3 py-2 italic">No saved prompts yet</div>
                ) : (
                  promptList.map(p => (
                    <div key={p.id} className="flex items-center gap-1 group">
                      <button
                        onClick={() => {
                          setLoadingPromptId(p.id);
                          // Only dispatch session-loaded — WritingAreaIndex handles all data fetching
                          window.dispatchEvent(new CustomEvent("prompt-session-loaded", {
                            detail: { sessionId: p.id }
                          }));
                          setLoadingPromptId(null);
                          handleCollapse();
                        }}
                        className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-left"
                      >
                        {loadingPromptId === p.id ? (
                          <span className="animate-spin shrink-0 text-gray-400">⟳</span>
                        ) : (
                          <span className="text-gray-500 shrink-0">◆</span>
                        )}
                        <span className="truncate">{p.title || "Untitled"}</span>
                      </button>
                      <button
                        onClick={(e) => handleDeletePrompt(e, p.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-red-400 hover:text-red-300 text-base leading-none px-1 py-0.5 transition-opacity"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {expandedItem === "components" && (
              <div className="flex flex-col gap-1 overflow-y-auto flex-1">
                {componentsLoading ? (
                  <div className="text-xs text-gray-400 px-3 py-2 italic">Loading...</div>
                ) : componentList.length === 0 ? (
                  <div className="text-xs text-gray-400 px-3 py-2 italic">No components found</div>
                ) : (
                  componentList.map(comp => (
                    <button
                      key={comp.id}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("figma-component-selected", {
                          detail: { component: comp, fileKey: localStorage.getItem("figma-file-key") || "" }
                        }));
                        handleCollapse();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-left"
                    >
                      <span className="text-gray-500 shrink-0">◇</span>
                      <span className="truncate">{comp.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {expandedItem === "new-project" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { onNewProject?.(); handleCollapse(); }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                >
                  <span className="text-base">📁</span>
                  <span>New Project</span>
                </button>
                <button
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                  onClick={handleCollapse}
                >
                  <span className="text-base">🗂️</span>
                  <span>All Projects</span>
                </button>
              </div>
            )}

            {expandedItem === "upload" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { onUploadDocument?.(); handleCollapse(); }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                >
                  <span className="text-base">📄</span>
                  <span>Upload PDF</span>
                </button>
                <button
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                  onClick={handleCollapse}
                >
                  <span className="text-base">📎</span>
                  <span>Attach File</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile hamburger + slide-out drawer (below 768px) ── */}
      {isMobile && (
        <>
          {/* Hamburger button — positioned over yellow header */}
          <button
            data-lit-id="mobile-hamburger"
            data-lit-type="navigation-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="fixed top-2 left-2 z-[60] w-10 h-10 flex items-center justify-center rounded-lg bg-[#12101f] text-white hover:bg-[#1a1730] transition-colors shadow-lg"
            title="Menu"
          >
            {mobileMenuOpen ? (
              <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
                <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <HamburgerIcon />
            )}
          </button>

          {/* Slide-out drawer */}
          <div
            data-lit-id="mobile-nav-drawer"
            data-lit-type="navigation-drawer"
            className="fixed top-0 left-0 h-full z-[55] flex flex-col overflow-y-auto transition-transform duration-250 ease-out shadow-2xl"
            style={{
              width: "260px",
              backgroundColor: "#12101f",
              transform: mobileMenuOpen ? "translateX(0)" : "translateX(-100%)",
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 pt-5">
              <StarburstIcon logo={raibachLogo} />
              <span className="text-xs font-bold text-white tracking-wider ml-2">RAIBACH</span>
              <div className="flex-1" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-white/10" />

            {/* Nav tabs */}
            <div className="p-3 flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-2 mb-1">Navigate</p>
              {["console","composer","evaluation","variables","metadata"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setMobileMenuOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left capitalize"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  {tab}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-white/10" />

            {/* Actions */}
            <div className="p-3 flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-2 mb-1">Actions</p>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { handleItemClick(item.id, item.onClick); setMobileMenuOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-200 hover:bg-white/10 hover:text-white transition-colors text-left"
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Backdrop */}
          {mobileMenuOpen && (
            <div
              data-lit-id="mobile-nav-backdrop"
              className="fixed inset-0 bg-black/50 z-[54]"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
