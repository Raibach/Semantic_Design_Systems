/**
 * LeftColumnHeader — Main Header Frame
 *
 * Lives inside the Main Content Area (right of LeftVerticalMenu), spanning
 * full width. This is the top-level frame for branding, navigation, and
 * prompt management controls.
 *
 * ─────────────────────────────
 * OUTER WRAPPER (flex-row)
 * ├── LeftVerticalMenu        ← far-left nav strip (collapsed by default)
 * └── Main Content (flex-col)
 *     ├── LeftColumnHeader    ← ** THIS COMPONENT **
 *     │   ├── ROW 1: Brand / Navigation (golden bg)
 *     │   │   LEFT:  LOGO_PLACEHOLDER
 *     │   │   RIGHT: NAV_TABS_PLACEHOLDER
 *     │   │
 *     │   └── ROW 2: Prompt Management Bar (white bg)
 *     │       LEFT:  PROMPT_TITLE_PLACEHOLDER
 *     │       RIGHT: PROMPT_CONTROLS → VERSION, TAGS, ID, AUTHOR,
 *     │               SCORE, COLUMN_FLIP
 *     │
 *     └── ResizableSplitter   ← 3 prompt columns
 *         ├── Left Column  (editor / chat when flipped)
 *         ├── Right Column (chat / editor when flipped)
 *         └── Third Column (injectable middle slot)
 * ─────────────────────────────
 *
 * COLUMN_FLIP is the final control in Row 2 — a deliberate config action
 * (not a drag) that swaps left/right column positions via layout state.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ColumnFlipToggle } from "@/components/ColumnFlipToggle";
import VersionManager from "./VersionManager";
import { getStoredUserId } from "@/services/authService";

interface LeftColumnHeaderProps {
  // === ROW 1 PROPS ===
  logo?: React.ReactNode;
  navTabs?: React.ReactNode;

  // === ROW 2 PROPS ===
  promptTitle?: string;
  version?: string;
  tags?: string;
  promptId?: string;
  author?: string;
  score?: string;

  // === LAYOUT CONTROLS ===
  flipped?: boolean;
  onToggleFlip?: () => void;

  // === TITLE EDITING ===
  onTitleChange?: (newTitle: string) => void;
  activeTab?: string | null;
  onTabChange?: (tabId: string | null) => void;
}

export default function LeftColumnHeader({
  logo,
  navTabs,
  promptTitle,
  version,
  tags,
  promptId,
  author,
  score,
  flipped,
  onToggleFlip,
  onTitleChange,
  activeTab: externalActiveTab,
  onTabChange,
}: LeftColumnHeaderProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string | null>("composer");
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(promptTitle || "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const justSavedRef = useRef(false); // Prevents sync from overwriting during save

  // Sync when prop changes externally (but not right after we save)
  useEffect(() => {
    if (!isEditingTitle && !justSavedRef.current) {
      setEditedTitle(promptTitle || "");
    }
    justSavedRef.current = false;
  }, [promptTitle, isEditingTitle]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSave = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== promptTitle && onTitleChange) {
      justSavedRef.current = true; // Block the next sync — our saved value is already in editedTitle
      onTitleChange(trimmed);
    }
  }, [editedTitle, promptTitle, onTitleChange]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
      setEditedTitle(promptTitle || "");
    }
  }, [handleTitleSave, promptTitle]);

  const navTabDefs = [
    { id: 'console', label: 'Console' },
    { id: 'composer', label: 'Composer' },
    { id: 'evaluation', label: 'Evaluation' },
    { id: 'variables', label: 'Variables' },
    { id: 'metadata', label: 'Metadata' },
  ];

  // ── Embla carousel for nav tabs — no dragFree so tabs stay
  //     in place during splitter resize operations ──
  const [navCarouselRef, navApi] = useEmblaCarousel({
    align: "start",
    dragFree: false,
    containScroll: "trimSnaps",
  });
  const [navCanScrollPrev, setNavCanScrollPrev] = useState(false);
  const [navCanScrollNext, setNavCanScrollNext] = useState(false);

  useEffect(() => {
    if (!navApi) return;
    const onSelect = () => {
      setNavCanScrollPrev(navApi.canScrollPrev());
      setNavCanScrollNext(navApi.canScrollNext());
    };
    navApi.on("select", onSelect);
    navApi.on("reInit", onSelect);
    onSelect();
    return () => {
      navApi.off("select", onSelect);
      navApi.off("reInit", onSelect);
    };
  }, [navApi]);

  return (
    <div
      id="left-column-header"
      data-ui-id="main-header-frame"
      data-ui-type="layout"
      data-ui-description="Main header frame — branding, nav, and prompt management controls"
      className="w-full flex-shrink-0 flex flex-col"
      style={{ borderBottom: "1px solid rgba(0,0,0,0.12)" }}
    >
      {/* ════════════════════════════════════════════════════════════
          ROW 1: Brand / Navigation bar (golden/amber background)
          ════════════════════════════════════════════════════════════ */}
      <div
        data-ui-id="brand-nav-bar"
        data-ui-type="navigation"
        data-ui-description="Brand logo and navigation tabs"
        className="flex items-center justify-between px-4"
        style={{
          backgroundColor: "#F2B705",
          minHeight: "56px",
        }}
      >
        {/* LOGO — fixed width, centered below 768px, left-aligned above */}
        <div
          data-lit-id="brand-logo"
          data-lit-type="content-area"
          data-lit-description="Brand logo — fixed width, centers at mobile, left-aligned at desktop"
          className="flex items-center gap-3 select-none md:justify-start justify-center md:pl-0 pl-[48px]"
          style={{ minWidth: "320px", flexShrink: 0 }}
        >
          {logo ?? (
            <div className="flex flex-col leading-tight">
              <span style={{ color: "#1a1a1a", display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontFamily: "Arial Black, sans-serif", fontWeight: 900, letterSpacing: "-0.08em", fontSize: "24px" }}>RAIBACH</span>
                <span style={{ fontWeight: 400, fontFamily: "sans-serif", fontSize: "18px", letterSpacing: "normal" }}>{"{impromptu}"}</span>
              </span>
              <span style={{ color: "rgba(0,0,0,0.55)", letterSpacing: "0.06em", fontSize: "14px", fontWeight: 600 }}>
                INTERACTIVE DESIGN <strong style={{ fontWeight: 800 }}>A2UI</strong> v0.9
              </span>
            </div>
          )}
        </div>

        {/* NAV_TABS — hidden below 768px (rolls into hamburger) */}
        <div
          data-lit-id="nav-tabs-carousel"
          data-lit-type="carousel"
          data-lit-description="Horizontal carousel nav — hidden below 768px, rolls into mobile hamburger"
          className="items-center gap-1 min-w-0 md:flex hidden"
        >
          {navTabs ?? (
            <div className="flex items-center gap-1 min-w-0">
              {/* Left arrow */}
              <button
                data-lit-id="nav-carousel-prev"
                data-lit-type="carousel-arrow"
                onClick={() => navApi?.scrollPrev()}
                disabled={!navCanScrollPrev}
                className="shrink-0 p-1 rounded-full transition-opacity"
                style={{ opacity: navCanScrollPrev ? 0.7 : 0.2 }}
                aria-label="Scroll tabs left"
              >
                <ChevronLeft className="w-4 h-4" style={{ color: "#1a1a1a" }} />
              </button>

              {/* Carousel viewport */}
              <div ref={navCarouselRef} className="overflow-hidden min-w-0">
                <div className="flex gap-1">
                  {navTabDefs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        data-lit-id={`nav-tab-${tab.id}`}
                        data-lit-type="tab"
                        data-lit-parent="nav-tabs-carousel"
                        onClick={() => setActiveTab(isActive ? null : tab.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        style={{
                          color: isActive ? "#1a1a1a" : "rgba(0,0,0,0.65)",
                          backgroundColor: isActive ? "rgba(0,0,0,0.10)" : "transparent",
                        }}
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 opacity-70">
                          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right arrow */}
              <button
                data-lit-id="nav-carousel-next"
                data-lit-type="carousel-arrow"
                onClick={() => navApi?.scrollNext()}
                disabled={!navCanScrollNext}
                className="shrink-0 p-1 rounded-full transition-opacity"
                style={{ opacity: navCanScrollNext ? 0.7 : 0.2 }}
                aria-label="Scroll tabs right"
              >
                <ChevronRight className="w-4 h-4" style={{ color: "#1a1a1a" }} />
              </button>
            </div>
          )}
        </div>

        {/* IDENTITY CHIP — always visible, every tab.
            A2UI honesty: the console assembles packages owned by THIS identity.
            If the console looks empty, check this id against the package owner. */}
        <div
          data-lit-id="identity-chip"
          data-lit-type="content-area"
          data-lit-description="Active user identity — console assembles packages owned by this user"
          className="shrink-0 font-mono text-xs px-2 py-1 rounded select-all md:block hidden"
          style={{ color: "rgba(0,0,0,0.75)", backgroundColor: "rgba(255,255,255,0.35)" }}
          title={`Active identity: ${getStoredUserId()}\nThe console assembles prompt packages owned by this user.`}
        >
          u:{getStoredUserId().slice(0, 8)}…{getStoredUserId().slice(-4)}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ROW 2: Prompt Management Bar (white background)
          Only visible when NOT on Console tab
          ════════════════════════════════════════════════════════════ */}
      {activeTab !== "console" && (
      <div
        data-ui-id="prompt-management-bar"
        data-ui-type="layout"
        data-ui-description="Prompt controls: title, version, tags, ID, author, score, column flip"
        className="flex items-center justify-between px-4 gap-4"
        style={{
          backgroundColor: "#ffffff",
          minHeight: "44px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {/* PROMPT_TITLE_PLACEHOLDER — editable on click */}
        <div
          id="PROMPT_TITLE_PLACEHOLDER"
          data-ui-id="prompt-title"
          data-ui-type="content-area"
          data-ui-description="Active prompt title — click to edit"
          className="flex-1 min-w-0"
        >
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleSave}
              placeholder="Enter prompt title..."
              className="w-full text-sm font-semibold text-gray-900 bg-white border-2 border-[#4e68d2] rounded px-2 py-1 outline-none"
              style={{ boxShadow: "0 0 0 2px rgba(78, 104, 210, 0.15)" }}
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="w-full text-left text-sm font-semibold text-gray-900 truncate bg-transparent border border-transparent hover:border-gray-300 rounded px-2 py-1 cursor-pointer transition-colors"
              title="Click to edit title"
            >
              {promptTitle || (
                <span className="text-gray-500 italic">
                  prompt_title: Placeholder title text goes here...
                </span>
              )}
            </button>
          )}
        </div>

        {/* RIGHT CONTROLS — version, tags, ID, author, score, COLUMN FLIP */}
        <div
          data-ui-id="prompt-controls"
          data-ui-type="layout"
          data-ui-description="Prompt metadata badges + layout controls"
          className="flex items-center gap-3 flex-shrink-0"
        >
          {/* VERSION */}
          <div
            className="relative"
            
            
            
            
          >
            <VersionManager />
          </div>

          {/* TAGS */}
          <div
            id="TAGS_PLACEHOLDER"
            data-ui-id="prompt-tags"
            data-ui-type="button"
            data-ui-description="Prompt tags — click to add/edit tags"
            className="flex items-center gap-1 text-xs text-amber-600 font-medium cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
              <path d="M8 3L14 13H2L8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 7v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {tags ?? "No tags +"}
          </div>

          {/* ID */}
          <div
            id="ID_PLACEHOLDER"
            data-ui-id="prompt-id"
            data-ui-type="content-area"
            data-ui-description="Unique prompt identifier"
            className="text-xs text-gray-600 font-medium"
          >
            ID: {promptId ?? "PR-0000"}
          </div>

          {/* AUTHOR */}
          <div
            id="AUTHOR_PLACEHOLDER"
            data-ui-id="prompt-author"
            data-ui-type="button"
            data-ui-description="Prompt author — click to change"
            className="text-xs text-gray-600 cursor-pointer"
          >
            Author: {author ?? "—"}
          </div>

          {/* SCORE */}
          <button
            id="SCORE_PLACEHOLDER"
            data-ui-id="prompt-score"
            data-ui-type="button"
            data-ui-description="Computed prompt score — click to expand"
            className="flex items-center gap-1 px-3 py-0.5 rounded border text-xs font-medium text-gray-700 border-gray-400 bg-white hover:bg-gray-50 transition-colors"
          >
            {score ?? "Score N/A"}
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 opacity-60">
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* COLUMN FLIP — layout control at far right of Row 2 */}
          {onToggleFlip && (
            <ColumnFlipToggle flipped={flipped ?? false} onToggle={onToggleFlip} />
          )}
        </div>
      </div>
      )}

    </div>
  );
}