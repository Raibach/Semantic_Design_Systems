import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, useBlocker } from "react-router-dom";
// pdfService import removed — PDF processing is retired
// import { quarantineService } from "@/services/quarantineService"; // Excluded from production
import {
  conversationStorage,
  type Project,
  type Conversation,
} from "@/services/conversationStorage";
// TODO: Legacy reference cleanup — module no longer exists at this path
// import TeacherEditorChat from "@/components/TeacherChat/TeacherEditorChat";
import { PromptWorkspace } from "@/components/PromptWorkspace";
// import QuarantinePanel from "@/components/QuarantinePanel"; // Excluded from production
// MyStoryEditor + SaveProjectModal imports removed — components are retired
// TODO: Legacy reference cleanup — module no longer exists at this path
// import MemoriesTab from "@/components/MemoriesTab";
// Progress import removed — was only used by retired PDF processing
import { useToast } from "@/hooks/use-toast";
import { getAuthState } from "@/services/authService";
import { promptService, type PromptSession, type PromptSection } from "@/services/promptService";
import { UI_ID } from "@/utils/uiIdentifiers";
import LeftVerticalMenu from "@/components/LeftVerticalMenu";
import LeftColumnHeader from "@/components/LeftColumnHeader";
import { useNotificationGate } from "@/hooks/useNotificationGate";
import ConsolePage from "@/pages/ConsolePage";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
import { InteractiveChatInterface } from "@/components/InteractiveChatInterface";
import MobileLayout from "@/components/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { MinWidthWarning } from "@/components/MinWidthWarning";
import { useLayoutState } from "@/hooks/useLayoutState";
import { useAiOrchestrator, extractCommands } from "@/shared/ai-orchestrator";
import { eventBus } from "@/shared/event-bus";
import SessionLoader from "@/components/SessionLoader";
import { API_BASE } from "@/shared/apiHelper";
import { getStoredUserId } from "@/services/authService";
import { aiOrchestrator } from "@/utils/aiOrchestrator";

interface WritingAreaIndexProps {
  onLogout?: () => void;
  isAuthenticated?: boolean | null;
}

export default function Index({
  onLogout: _onLogout,
  isAuthenticated: _isAuthenticated,
}: WritingAreaIndexProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id: routeSessionId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { flipped, toggleFlip } = useLayoutState();
  const [activeTab, setActiveTab] = useState("composer");
  const {
    tabLoading: _tabLoading,
    approvalMode,
    headerTab,
    setHeaderTab,
    clearApprovalMode,
    handleHeaderTabChange,
    handleNotificationAction: _handleNotificationAction,
    finishTabChange: _finishTabChange,
    handleSuppressNotification: _handleSuppressNotification,
    isNotificationSuppressed: _isNotificationSuppressed,
  // A2UI: Removed onNavigate - AI controls surfaces, not URL routing
  } = useNotificationGate({ initialTab: routeSessionId ? "composer" : "console" });
  const [consoleRefreshKey, setConsoleRefreshKey] = useState(0);
  const pendingExitTabRef = useRef<string | null>(null);

  // ── Console Chat Panel State (matches ConsolePageWithNavigate) ──
  const COLLAPSED_WIDTH = 75;
  const DEFAULT_EXPANDED_WIDTH = 380;
  const SIDEBAR_GRIP_OFFSET = 40;
  const [consoleChatWidth, setConsoleChatWidth] = useState(COLLAPSED_WIDTH);
  const [isConsoleChatResizing, setIsConsoleChatResizing] = useState(false);
  const preCollapseWidthRef = useRef(DEFAULT_EXPANDED_WIDTH);
  const consoleChatContainerRef = useRef<HTMLDivElement>(null);
  const isSidebarDraggingRef = useRef(false);
  const isConsoleChatCollapsed = consoleChatWidth <= COLLAPSED_WIDTH;

  // ── Request deduplication: abort previous request if new one comes in ──
  const consoleAssemblyControllerRef = useRef<AbortController | null>(null);
  const isConsoleAssemblyInFlightRef = useRef(false);
  const spinnerStartRef = useRef<number>(0);

  // ── Session loading state (must be declared here, BEFORE any early returns) ──
  const [sessionLoadingState, setSessionLoadingState] = useState<{
    isLoading: boolean;
    progress: number;
    error: string | null;
    sessionName?: string;
  }>({ isLoading: false, progress: 0, error: null });

  // ── AI Assembly state ──
  // The header tabs are AI COMMANDS, not webpage links.
  // When user clicks Console, AI assembles the console surface.
  // STRICT A2UI: If AI fails, the surface CANNOT render - NO FALLBACKS
  const [isAIAssembling, setIsAIAssembling] = useState(false);
  const [aiAssemblyMessage, setAiAssemblyMessage] = useState("Assembling your console...");
  const [aiAssemblyFailed, setAiAssemblyFailed] = useState(false); // STRICT: blocks rendering when true
  const [assembledConsoleCards, setAssembledConsoleCards] = useState<any[] | null>(null); // null = not loaded, [] would be fallback

  const [_rightColumnView, _setRightColumnView] = useState<"chat" | "trace">("chat"); // Chat = TeacherEditorChat, Trace = SCE panel
  const [_isPromptPortalOpen, _setIsPromptPortalOpen] = useState<boolean>(false); // Show prompt portal in first column
  const [_selectedPrompt, _setSelectedPrompt] = useState<{
    title: string;
    content: string;
  } | null>(null); // Selected prompt from portal
  
  // ResponseCard state
  const [_responseCardModel, _setResponseCardModel] = useState<string>("GPT-4.1");
  const [_expandedCard, _setExpandedCard] = useState<"a" | "b">("a");

  // ── Prompt Session state (Create → Edit → Save → Reopen → Delete) ──
  const [_promptSessions, setPromptSessions] = useState<PromptSession[]>([]);
  const [currentPromptSession, setCurrentPromptSession] = useState<PromptSession | null>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const isSavingRef = useRef(false); // Serialization guard: prevents concurrent save operations
  // Key that changes on each prompt load — forces full unmount/remount of all three columns
  const [promptLoadKey, setPromptLoadKey] = useState(0);
  // Ref for currentPromptSession ID — avoids stale closure in event listeners
  const currentPromptSessionRef = useRef<string | null>(null);
  // Ref for handleSavePrompt — always points to latest function, used by event listeners
  const handleSavePromptRef = useRef<() => Promise<void>>(async () => {});
  // Tracks whether the user has unsaved changes since the last save.
  // Used to suppress the exit confirmation when the user just saved.
  const hasUnsavedChangesRef = useRef(false);
  // Ref for pending action to execute after exit confirmation
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  // Keep refs in sync with state
  useEffect(() => {
    currentPromptSessionRef.current = currentPromptSession?.id ?? null;
  }, [currentPromptSession]);

  // My Story Editor state — NOTE: MyStory editor and SaveProjectModal are retired.
  // State kept for legacy compatibility with remaining save function references.
  const [_myStoryContent, _setMyStoryContent] = useState<string>("");
  const [_hasUnsavedChanges, _setHasUnsavedChanges] = useState(false);
  const [editorSuggestions, _setEditorSuggestions] = useState<unknown[]>([]);
  const [_activeSuggestion, setActiveSuggestion] = useState<unknown | null>(
    null,
  );

  // PDF Summary state for highlights and suggestions
  // Chat mode is always 'grace' - Keeper removed from chat interface
  // Karen/Mistral is only used for grammar checking (separate feature, not chat)

  const _handleQuestionSubmit = useCallback(() => {
    // Clear active suggestion when user submits a new question
    setActiveSuggestion(null);
  }, []); // No dependencies - stable function
  const [_isLightMode, _setIsLightMode] = useState(false); // Dark mode is default
  const [_isTeacher, setIsTeacher] = useState(false); // Teacher role state

  // Projects management state
  const [projects, setProjects] = useState<Project[]>([]);
  const [_editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [_showNewProjectInput, setShowNewProjectInput] =
    useState<boolean>(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [_projectConversations, setProjectConversations] = useState<
    Conversation[]
  >([]);
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    Set<string>
  >(new Set());
  const [_isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);

  // Clear active suggestion when suggestions are cleared
  useEffect(() => {
    if (editorSuggestions.length === 0) {
      setActiveSuggestion(null);
    }
  }, [editorSuggestions]);

  // ── Session loading state listener (MUST be before any early returns) ──
  useEffect(() => {
    const handleLoadingState = (e: CustomEvent) => {
      setSessionLoadingState(e.detail);
    };

    window.addEventListener('session-loading-state', handleLoadingState as EventListener);
    return () => {
      window.removeEventListener('session-loading-state', handleLoadingState as EventListener);
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  // A2UI EVENT LISTENERS — Bridge aiOrchestrator events to React state
  // These are the "ears" that hear when the AI has assembled something
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // SINGLE handler for ALL a2ui events - uses the generic surface-update
    const handleSurfaceUpdate = (e: CustomEvent) => {
      const cmd = e.detail.command;
      console.log("[WritingAreaIndex] A2UI surface update:", cmd.component, cmd.props);

      // Handle console/agent-card - these contain the cards array
      if (cmd.component === 'console' || cmd.component === 'agent-card' || cmd.component === 'featured-card') {
        if (cmd.props.cards) {
          console.log("[WritingAreaIndex] Setting console cards:", cmd.props.cards.length);
          setAssembledConsoleCards(cmd.props.cards);
        }
        setIsAIAssembling(false);
      }
      // Handle composer-related components - stop spinner
      else if (cmd.component === 'composer' || cmd.component === 'left-column' ||
               cmd.component === 'middle-column' || cmd.component === 'right-column') {
        console.log("[WritingAreaIndex] Composer update - stopping spinner");
        setIsAIAssembling(false);
      }
    };

    // Handler for errors
    const handleError = (e: CustomEvent) => {
      console.error("[WritingAreaIndex] A2UI error", e.detail.props);
      setAiAssemblyMessage(e.detail.props?.message || "Assembly failed");
      setIsAIAssembling(false);
    };

    // Attach the generic surface update listener - catches ALL commands
    window.addEventListener('a2ui:surface-update', handleSurfaceUpdate as EventListener);
    window.addEventListener('a2ui-update-error-banner', handleError as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('a2ui:surface-update', handleSurfaceUpdate as EventListener);
      window.removeEventListener('a2ui-update-error-banner', handleError as EventListener);
    };
  }, []);


  const loadProjects = useCallback(async () => {
    // Load projects from API (use cache first, only refresh if needed)
    // Don't force refresh on every load to avoid API spam
    let allProjects = await conversationStorage.getAllProjects(false);

    // Find "Archived Unassigned Chats" project (the default project)
    let defaultProject = allProjects.find(
      (p) => p.name === "Archived Unassigned Chats",
    );

    // If default project doesn't exist, create it
    if (!defaultProject) {
      console.log("⚠️ [WritingAreaIndex] Default project not found, searching for existing one...");

      // Search for any project named "Archived Unassigned Chats" in the list
      const existingDefault = allProjects.find(
        (p) => p.name === "Archived Unassigned Chats",
      );

      if (existingDefault) {
        console.log("✅ [WritingAreaIndex] Found existing default project:", existingDefault.id);
        defaultProject = existingDefault;
      } else {
        try {
          console.log("📁 [WritingAreaIndex] Creating default 'Archived Unassigned Chats' project...");
          defaultProject = await conversationStorage.createProject(
            "Archived Unassigned Chats",
          );
          console.log("✅ [WritingAreaIndex] Created default project:", defaultProject);

          // Reload projects to include the newly created one
          allProjects = await conversationStorage.getAllProjects(true);
          defaultProject = allProjects.find(
            (p) => p.name === "Archived Unassigned Chats",
          );

          if (!defaultProject) {
            console.error("❌ [WritingAreaIndex] Failed to find newly created project in project list");
            // Add it manually to the list
            allProjects.push(defaultProject);
          }
        } catch (error) {
          console.error("❌ [WritingAreaIndex] Failed to create default project:", error);
          // Create a fallback project in memory
          defaultProject = {
            id: 'fallback-' + Math.random().toString(36).substr(2, 9),
            name: "Archived Unassigned Chats",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          allProjects.push(defaultProject);
          console.warn("⚠️ [WritingAreaIndex] Using fallback project:", defaultProject);
        }
      }
    }

    // Ensure default project is in the list (in case it was created but not in the array)
    if (
      defaultProject &&
      !allProjects.find((p) => p.id === defaultProject!.id)
    ) {
      allProjects.push(defaultProject);
    }

    // Set projects (allow multiple projects - don't auto-delete)
    setProjects(allProjects);

    // Determine which project to select (handle async operations first)
    // CRITICAL: Prioritize last modified project (most recent activity)
    let projectIdToSelect: string | null = null;

    // Check if a project is already selected
    const currentSelectedId = selectedProjectId;
    if (
      currentSelectedId &&
      allProjects.find((p) => p.id === currentSelectedId)
    ) {
      // Keep the currently selected project
      console.log(`✅ Keeping user-selected project: ${currentSelectedId}`);
      projectIdToSelect = currentSelectedId;
    } else {
      // PRIORITY 1: Restore last modified project (most recent activity)
      const lastModified = conversationStorage.getLastModifiedProject();
      if (lastModified && lastModified.projectId) {
        const project = allProjects.find(
          (p) => p.id === lastModified.projectId,
        );
        if (project) {
          conversationStorage.setCurrentProjectId(project.id);
          console.log(
            `✅ Restored last modified project: ${project.id} (modified at ${new Date(lastModified.timestamp).toLocaleString()})`,
          );
          projectIdToSelect = project.id;
        }
      }

      // PRIORITY 2: If no last modified, check saved project from localStorage
      if (!projectIdToSelect) {
        const savedProjectId = conversationStorage.getCurrentProjectId();
        if (
          savedProjectId &&
          allProjects.find((p) => p.id === savedProjectId)
        ) {
          console.log(
            `✅ Restored saved project from localStorage: ${savedProjectId}`,
          );
          projectIdToSelect = savedProjectId;
        }
      }

      // PRIORITY 3: Use first available project (user's actual projects take priority)
      if (!projectIdToSelect && allProjects.length > 0) {
        const firstProject = allProjects[0];
        conversationStorage.setCurrentProjectId(firstProject.id);
        console.log(`✅ Using first available project: ${firstProject.id}`);
        projectIdToSelect = firstProject.id;
      } else if (!projectIdToSelect && defaultProject) {
        // PRIORITY 4: Fallback to "Archived Unassigned Chats" only if no other projects exist
        conversationStorage.setCurrentProjectId(defaultProject.id);
        console.log(
          `⚠️ No user projects found, using fallback (Archived Unassigned Chats): ${defaultProject.id}`,
        );
        projectIdToSelect = defaultProject.id;
      } else if (!projectIdToSelect) {
        // PRIORITY 5: No projects exist - user must create one
        console.log("📝 No projects found - user must create a project");
        projectIdToSelect = null;
      }
    }

    // Set the selected project ID (now that async operations are complete)
    if (projectIdToSelect) {
      setSelectedProjectId(projectIdToSelect);
    }

    // Load conversations for the selected project (use cache, don't force refresh)
    const currentProjectId =
      projectIdToSelect || conversationStorage.getCurrentProjectId();
    if (currentProjectId) {
      const conversations = await conversationStorage.getProjectConversations(
        currentProjectId,
        false,
      );
      setProjectConversations(
        conversations.sort((a, b) => b.updatedAt - a.updatedAt),
      );

      // PRIORITY: Restore last modified chat for this project
      const lastModifiedChat = conversationStorage.getLastModifiedChat();
      if (lastModifiedChat && lastModifiedChat.projectId === currentProjectId) {
        const chat = conversations.find(
          (c) => c.id === lastModifiedChat.conversationId,
        );
        if (chat) {
          // The chat exists - it will be selected when the user opens the chat tab
          console.log(
            `✅ Found last modified chat: ${chat.id} (modified at ${new Date(lastModifiedChat.timestamp).toLocaleString()})`,
          );
          // Note: Chat selection is handled by TeacherEditorChat component
        }
      }
    }

    console.log(
      `✅ Loaded ${allProjects.length} project(s), current project: ${currentProjectId}`,
    );
  }, [selectedProjectId]);

  // Load projects from localStorage on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Check if user is a teacher (only on mount - role won't change unless user logs out/in)
  useEffect(() => {
    const authState = getAuthState();
    const teacherStatus = authState.isTeacher || false;
    setIsTeacher(teacherStatus);
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const project = await conversationStorage.createProject(
      newProjectName.trim(),
    );
    setProjects([...projects, project]);
    setNewProjectName("");
    setShowNewProjectInput(false);
    setSelectedProjectId(project.id);
    conversationStorage.setCurrentProjectId(project.id);
  };

  const _handleStartEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const _handleSaveEditProject = async (projectId: string) => {
    if (!editingProjectName.trim()) {
      setEditingProjectId(null);
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      project.name = editingProjectName.trim();
      try {
        const saveResult = await conversationStorage.saveProject(project);
        if (saveResult.success) {
          setProjects([...projects]);
          setEditingProjectId(null);
          setEditingProjectName("");
          if (saveResult.error) {
            // Show warning if saved locally
            alert(`Saved Locally: ${saveResult.error}`);
          }
        } else {
          // Show error if save failed
          alert(
            `Failed to save project: ${saveResult.error || "Unknown error"}`,
          );
        }
      } catch (error) {
        console.error("Error saving project:", error);
        alert(
          `Error saving project: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  };

  const _handleCancelEditProject = () => {
    setEditingProjectId(null);
    setEditingProjectName("");
  };

  // ── Prompt Session CRUD Handlers ──
  const loadPromptSessions = async () => {
    try {
      const sessions = await promptService.getPromptSessions({ includeArchived: false });
      setPromptSessions(sessions);
    } catch (error) {
      console.warn('Failed to load prompt sessions:', error);
    }
  };

  const handleCreateNewPrompt = async (_title?: string) => {
    // ══════════════════════════════════════════════════════════════════════════
    // A2UI v0.9: "Create New" → AI assembles blank composer surface
    // Uses the unified assembleSurfaceWithAI function with render-composer intent
    // ══════════════════════════════════════════════════════════════════════════
    console.log('🤖 [A2UI] Creating new prompt → intent: render-composer');
    await assembleSurfaceWithAI('render-composer');
  };

  const handleSavePrompt = async (compiledOutput?: string) => {
    console.log('🔵 [SAVE] Save button clicked! Current session:', currentPromptSession?.id);
    // Serialization guard: prevent concurrent save operations
    if (isSavingRef.current) {
      console.log('⏸️ [CRUD] Save already in flight, skipping');
      return;
    }
    isSavingRef.current = true;
    setIsSavingPrompt(true);

    // ══════════════════════════════════════════════════════════════════════
    // A2UI: IMMEDIATE GRACE FEEDBACK — User sees response the moment they click
    // This is Grace acknowledging the command, not a static spinner.
    // Dispatches event so ResponsivePromptBuilder shows spinner on button.
    // ══════════════════════════════════════════════════════════════════════
    window.dispatchEvent(new CustomEvent('save-template-start'));

    try {
      // ── Collect ALL sections from textareas by name, including empty ones ──
      // No required roles for Save Template - we capture everything as-is
      const allSections: { name: string; content: string; el: HTMLTextAreaElement }[] = [];

      // CRITICAL FIX: Force React to flush any pending state updates to DOM before querying
      // This ensures controlled components have synchronized their state
      await new Promise(resolve => setTimeout(resolve, 10));

      // DEBUG: Show all textareas in the DOM
      console.log('🔍 [SAVE DEBUG] All textareas in DOM:', document.querySelectorAll('textarea').length);
      document.querySelectorAll('textarea').forEach((ta, i) => {
        console.log(`  Textarea ${i}:`, {
          'data-section-name': ta.getAttribute('data-section-name'),
          'aria-label': ta.getAttribute('aria-label'),
          'placeholder': ta.getAttribute('placeholder'),
          'value': ta.value.substring(0, 30),
          'parent data-section-name': ta.closest('[data-section-name]')?.getAttribute('data-section-name')
        });
      });

      // ══════════════════════════════════════════════════════════════════════
      // COLLECT SECTION CONTENT FROM REACT STATE
      // Uses event system to get current values from controlled components
      // ══════════════════════════════════════════════════════════════════════

      const collectedSections: { name: string; content: string }[] = [];
      const collectPromise = new Promise<void>((resolve) => {
        const handleCollectResponse = (e: CustomEvent) => {
          const { sectionName, content } = e.detail;
          if (sectionName && typeof content === 'string') {
            // Avoid duplicates
            if (!collectedSections.find(s => s.name === sectionName)) {
              collectedSections.push({ name: sectionName, content });
              console.log(`📝 [SAVE] Collected from React state: "${sectionName}" = "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
            }
          }
        };

        window.addEventListener('prompt-section-response' as any, handleCollectResponse as any);

        // Request content from all sections
        console.log('📤 [SAVE] Dispatching collect-prompt-sections event...');
        window.dispatchEvent(new CustomEvent('collect-prompt-sections'));

        // Wait for responses - increased timeout for reliability
        setTimeout(() => {
          window.removeEventListener('prompt-section-response' as any, handleCollectResponse as any);
          console.log(`📥 [SAVE] Collection complete. Got ${collectedSections.length} sections via events.`);
          resolve();
        }, 200); // Increased from 50ms to 200ms for reliability
      });

      await collectPromise;

      // ALWAYS also check DOM as backup - merge both sources
      console.log('🔍 [SAVE] Also checking DOM for textareas...');
      document.querySelectorAll('textarea[data-section-name]').forEach((el) => {
        const ta = el as HTMLTextAreaElement;
        const name = ta.getAttribute('data-section-name') || '';
        if (!name) return;

        // Check if we already got this section via events
        const existingFromEvent = collectedSections.find(s => s.name === name);

        if (existingFromEvent) {
          // Prefer React state if available, but log if they differ
          if (existingFromEvent.content !== ta.value) {
            console.log(`⚠️ [SAVE] Content mismatch for "${name}": React="${existingFromEvent.content.length}chars" vs DOM="${ta.value.length}chars" - using React state`);
          }
          allSections.push({ name, content: existingFromEvent.content, el: ta });
        } else {
          // Fallback to DOM value if not collected via events
          console.log(`📝 [SAVE] Using DOM value for "${name}": "${ta.value.substring(0, 50)}${ta.value.length > 50 ? '...' : ''}"`);
          allSections.push({ name, content: ta.value, el: ta });
        }
      });

      console.log('📦 [SAVE] Total sections captured:', {
        count: allSections.length,
        sections: allSections.map(s => `${s.name}(${s.content.length}chars)`)
      });

      // ══════════════════════════════════════════════════════════════════════
      // SAVE TEMPLATE = CAPTURE ENTIRE SURFACE STATE (NO VALIDATION)
      // Validation only happens on RUN, not on Save Template.
      // Empty sections are valid state - we capture everything as-is.
      // ══════════════════════════════════════════════════════════════════════

      // Build sections array - include ALL sections, even empty ones
      // This is a "photograph" of the surface state at this moment
      const sections: PromptSection[] = [];
      let position = 0;
      for (const s of allSections) {
        sections.push({
          id: crypto.randomUUID?.() || s.name,
          type: s.name as PromptSection['type'],
          content: s.content, // Keep content exactly as-is, including whitespace
          // Future: position: position++ for ordering
        });
      }

      console.log('📸 [SAVE] Capturing surface state:', {
        totalSections: sections.length,
        sectionNames: sections.map(s => s.type),
        contentLengths: sections.map(s => `${s.type}: ${s.content.length} chars`)
      });

      // ══════════════════════════════════════════════════════════════════════
      // GUARD: Do not send CRUD requests with a null session ID.
      // The backend CREATE path is functional, but we must not hit the
      // UPDATE path (PUT /api/prompt-sessions/null) which crashes PostgreSQL.
      // If no valid session ID exists, the save will use the CREATE path.
      // ══════════════════════════════════════════════════════════════════════
      const sessionId = currentPromptSessionRef.current;
      const isValidSessionId = sessionId && sessionId !== 'null' && sessionId.length > 0;
      const title = currentPromptSession?.title || `Prompt - ${new Date().toLocaleString()}`;

      console.log('🤖 [AI] Calling AI save endpoint...');

      const savePayload = {
        session_id: isValidSessionId ? sessionId : undefined,
        title,
        left_column: {
          sections: sections.map((s, index) => ({
            section: s.type,
            role: s.type,
            content: s.content,
            position: index,
            visible: true,
          })),
        },
        middle_column: {
          compiled_output: compiledOutput || '',
        },
        right_column: {
          conversation_id: currentPromptSession?.conversationId || null,
        },
      };

      const response = await fetch(`${API_BASE}/ai/save-surface`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getStoredUserId(),
        },
        body: JSON.stringify(savePayload),
      });

      if (!response.ok) {
        throw new Error(`AI save failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`🤖 [AI] ${result.ai_message}`);

      // Update local state with the saved session
      if (result.session_id) {
        setCurrentPromptSession((prev) => ({
          ...prev,
          id: result.session_id,
          title,
          isActive: true,
          isArchived: false,
        } as typeof prev));
        currentPromptSessionRef.current = result.session_id;
      }

      hasUnsavedChangesRef.current = false;
      await loadPromptSessions();
      setConsoleRefreshKey(k => k + 1);
    } catch (error) {
      console.error('❌ [CRUD] Save failed:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      window.dispatchEvent(new CustomEvent('a2ui:system-message', {
        detail: { role: 'assistant', content: `⚠️ Save failed: ${errMsg}` }
      }));
    } finally {
      isSavingRef.current = false;
      setIsSavingPrompt(false);
      // Signal to ResponsivePromptBuilder that save is complete
      window.dispatchEvent(new CustomEvent('save-template-end'));
    }
  };
  // Keep ref in sync for event listeners
  handleSavePromptRef.current = handleSavePrompt;

  // ── AI Orchestrator — listens for XML tags in chat responses ──
  const sessionId = currentPromptSession?.id ?? null;
  const { lastCommand } = useAiOrchestrator({ sessionId });

  // Wire AI commands to actual component actions
  useEffect(() => {
    if (!currentPromptSession) return;

    // <save-button/> → save
    const unsubSave = eventBus.on('save-button', () => {
      handleSavePromptRef.current();
    });

    // <prompt-section type="..." content="..."> → insert section
    const unsubSection = eventBus.on('prompt-section', (cmd) => {
      const { type, content } = cmd.props || {};
      if (!type) return;
      // Dispatch DOM event that ResponsivePromptBuilder listens for
      window.dispatchEvent(new CustomEvent('add-prompt-role', {
        detail: { roleName: type, placeholder: content || '' }
      }));
    });

    return () => {
      unsubSave();
      unsubSection();
    };
  }, [currentPromptSession]);

  // Track changes to prompt content
  useEffect(() => {
    // Remove the session check - we want to track changes even without a session
    const handleContentChange = () => {
      console.log('📝 [SAVE] Content changed, marking as unsaved');
      hasUnsavedChangesRef.current = true;
    };

    // Listen for any changes in the prompt builder
    const handleInputEvent = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        // Check if it's in the prompt builder area
        if (target.closest('[data-section-name]') || target.getAttribute('data-section-name')) {
          handleContentChange();
        }
      }
    };

    // CRITICAL: Handle loading content from database into textareas
    const handleLoadSectionContent = (e: CustomEvent) => {
      const { target, content, sessionId } = e.detail;
      console.log('🔄 [LOAD] Received load-section-content event:', { target, contentLength: content?.length, sessionId });

      // Use the proper event system to set content in React components
      // The force-set-section event is handled by AutoResizeTextarea component
      window.dispatchEvent(new CustomEvent('force-set-section', {
        detail: {
          sectionName: target,
          content: content || '',
          override: true
        }
      }));
      console.log(`✅ [LOAD] Dispatched force-set-section event for "${target}" with ${content?.length || 0} chars`);
    };

    // Add listeners for input changes
    document.addEventListener('input', handleInputEvent);
    window.addEventListener('load-section-content', handleLoadSectionContent as EventListener);

    // Also listen for custom events that indicate changes
    window.addEventListener('prompt-content-changed', handleContentChange);
    window.addEventListener('add-prompt-role', handleContentChange);
    window.addEventListener('remove-prompt-role', handleContentChange);

    return () => {
      document.removeEventListener('input', handleInputEvent);
      window.removeEventListener('load-section-content', handleLoadSectionContent as EventListener);
      window.removeEventListener('prompt-content-changed', handleContentChange);
      window.removeEventListener('add-prompt-role', handleContentChange);
      window.removeEventListener('remove-prompt-role', handleContentChange);
    };
  }, []); // Empty dependency array - always listen

  // Log last AI command for debugging (toast on blocked commands)
  useEffect(() => {
    if (!lastCommand) return;
    console.log('[AI Orchestrator] Last command:', lastCommand.tag, lastCommand.props);
  }, [lastCommand]);

  const handlePromptTitleChange = async (newTitle: string) => {
    // Serialization guard: share mutex with handleSavePrompt to prevent double-record race
    if (isSavingRef.current) {
      console.log('⏸️ [CRUD] Title change skipped — save already in flight');
      return;
    }
    if (!currentPromptSession?.id) {
      // No session with a valid ID — create one first with the new title
      const sections: PromptSection[] = [];
      document.querySelectorAll('textarea[data-section-name]').forEach((el) => {
        const ta = el as HTMLTextAreaElement;
        const name = ta.getAttribute('data-section-name') || '';
        const content = ta.value?.trim();
        if (name && content) {
          sections.push({ id: crypto.randomUUID?.() || name, type: name as PromptSection['type'], content });
        }
      });
      try {
        const result = await promptService.savePromptTemplate(
          newTitle,
          sections,
          { title: newTitle, description: `Prompt with ${sections.length} sections` }
        );
        if (result.session) {
          setCurrentPromptSession(result.session);
          console.log('✅ [CRUD] Created session from title:', result.session?.id);
          await loadPromptSessions();
        }
      } catch (error) {
        console.error('❌ [CRUD] Failed to create prompt from title:', error);
      }
      return;
    }
    try {
      console.log('📝 [CRUD] Renaming session:', currentPromptSession.id, '→', newTitle);
      // Direct PUT to backend — don't use updatePromptSession which
      // constructs a return value that wipes leftColumnContent etc.
      await fetch(`${API_BASE}/prompt-sessions/${currentPromptSession.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getStoredUserId(),
        },
        body: JSON.stringify({ title: newTitle }),
      });
      // Merge new title into existing session — don't replace entire object
      setCurrentPromptSession(prev => prev ? { ...prev, title: newTitle, updatedAt: new Date().toISOString() } : prev);
      // Update the console card title so it reflects immediately
      setAssembledConsoleCards(prev => {
        if (!prev) return prev;
        return prev.map(card =>
          card.id === currentPromptSession.id ? { ...card, title: newTitle } : card
        );
      });
      console.log('✅ [CRUD] Renamed session:', currentPromptSession.id);
    } catch (error) {
      console.error('❌ [CRUD] Failed to update prompt title:', error);
    }
  };

  // Store loaded sections for injection after remount
  const pendingSectionsRef = useRef<Array<{ content: string; target: string }>>([]);

  // Dispatch pending sections into existing textareas when workspace mounts.
  // Do NOT arm the exit gate here — only user edits should trigger that.
  useEffect(() => {
    if (headerTab !== "composer") return;
    if (promptLoadKey === 0) return;

    if (pendingSectionsRef.current.length === 0) return;

    const dispatchSections = () => {
      for (const section of pendingSectionsRef.current) {
        if (section.target && section.content) {
          window.dispatchEvent(new CustomEvent('set-left-column-text', {
            detail: { content: section.content, target: section.target },
          }));
        }
      }
    };

    // Wait for React to mount textareas and register listeners
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dispatchSections();
        setTimeout(dispatchSections, 300);
      });
    });
    pendingSectionsRef.current = [];
  }, [promptLoadKey, headerTab]);

  const handleOpenPromptFromConsole = async (sessionId: string) => {
    // ══════════════════════════════════════════════════════════════════════════
    // A2UI v0.9: Open session via unified surface assembly
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`🤖 [A2UI] Opening session → intent: render-session:${sessionId}`);
    await assembleSurfaceWithAI(`render-session:${sessionId}`);

    // Force full re-render to dispatch sections to textareas
    setPromptLoadKey(k => k + 1);
  };

  const handleLoadPromptSession = async (sessionId: string) => {
    setIsLoadingPrompt(true);
    try {
      // Use preloaded data if available (loaded behind the entry overlay)
      const preloaded = (window as Window & { __preloadedSession?: PromptSession | null }).__preloadedSession;
      const session = (preloaded?.id === sessionId) ? preloaded : await promptService.getPromptSession(sessionId);
      (window as Window & { __preloadedSession?: PromptSession | null }).__preloadedSession = null;
      setCurrentPromptSession(session);

      // Parse stored JSON sections — stored in pendingSectionsRef for the
      // useEffect above to dispatch once the workspace has mounted.
      pendingSectionsRef.current = [];
      if (session.leftColumnContent) {
        try {
          const parsed = JSON.parse(session.leftColumnContent);
          if (parsed && Array.isArray(parsed.sections)) {
            pendingSectionsRef.current = parsed.sections.map((s: { content?: string; section?: string; name?: string }) => ({
              content: s.content || '',
              target: s.section || s.name || '',
            }));
          }
        } catch {
          // Legacy bracketed format — fall back to parsePromptSections
          pendingSectionsRef.current = promptService
            .parsePromptSections(session.leftColumnContent)
            .map(s => ({ content: s.content, target: s.type.replace(/_/g, ' ') }));
        }
      }

      // Remount workspace — the useEffect above handles dispatch.
      setPromptLoadKey(prev => prev + 1);
      try {
        const mvResp = await fetch('/api/milvus/versions');
        const mvData = await mvResp.json();
        if (mvData?.versions?.length > 0) {
          const latest = mvData.versions[mvData.versions.length - 1];
          if (latest?.content_full) {
            const outputMatch = latest.content_full.match(/=== OUTPUT ===\n([\s\S]*)/);
            if (outputMatch) {
              window.dispatchEvent(new CustomEvent('restore-output', {
                detail: { content: outputMatch[1].trim() }
              }));
            }
          }
        }
      } catch { /* Milvus may not be available */ }
    } catch (error) {
      console.error('Failed to load prompt session:', error);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Load session data when route param changes
  useEffect(() => {
    if (routeSessionId) {
      handleLoadPromptSession(routeSessionId);
    }
  }, [routeSessionId]);

  // Load session from database when route changes (e.g., clicking a card in Console)
  useEffect(() => {
    if (!routeSessionId || routeSessionId === 'new') return;

    // Only load if this is a different session than currently loaded
    if (currentPromptSession?.id === routeSessionId) {
      console.log('[ROUTE] Session already loaded:', routeSessionId);
      return;
    }

    console.log('[ROUTE] Loading session from database:', routeSessionId);
    setIsLoadingPrompt(true);

    // Dispatch loading state event
    window.dispatchEvent(new CustomEvent('session-loading-state', {
      detail: {
        isLoading: true,
        progress: 10,
        error: null,
        sessionName: 'Loading session...'
      }
    }));

    promptService.getPromptSession(routeSessionId)
      .then((sessionData) => {
        console.log('[ROUTE] Session loaded from database:', sessionData);

        window.dispatchEvent(new CustomEvent('session-loading-state', {
          detail: { isLoading: true, progress: 50, error: null, sessionName: sessionData.title }
        }));

        // Set current session
        setCurrentPromptSession(sessionData);

        // Parse and dispatch sections to textareas
        if (sessionData.leftColumnContent) {
          try {
            const parsed = JSON.parse(sessionData.leftColumnContent);
            const sections = parsed.sections || [];

            window.dispatchEvent(new CustomEvent('session-loading-state', {
              detail: { isLoading: true, progress: 75, error: null, sessionName: sessionData.title }
            }));

            // Wait for DOM to be ready
            setTimeout(() => {
              sections.forEach((section: any) => {
                const target = section.section || section.role || section.type;
                const content = section.content || '';

                if (target) {
                  console.log(`[ROUTE] Loading section "${target}" with ${content.length} chars`);
                  window.dispatchEvent(new CustomEvent('load-section-content', {
                    detail: { target, content, sessionId: routeSessionId }
                  }));
                }
              });

              window.dispatchEvent(new CustomEvent('session-loading-state', {
                detail: { isLoading: false, progress: 100, error: null, sessionName: sessionData.title }
              }));

              setIsLoadingPrompt(false);
            }, 150);
          } catch (error) {
            console.error('[ROUTE] Failed to parse session content:', error);
            window.dispatchEvent(new CustomEvent('session-loading-state', {
              detail: { isLoading: false, progress: 0, error: 'Failed to parse session content' }
            }));
            setIsLoadingPrompt(false);
          }
        } else {
          window.dispatchEvent(new CustomEvent('session-loading-state', {
            detail: { isLoading: false, progress: 100, error: null, sessionName: sessionData.title }
          }));
          setIsLoadingPrompt(false);
        }
      })
      .catch((error) => {
        console.error('[ROUTE] Failed to load session:', error);
        window.dispatchEvent(new CustomEvent('session-loading-state', {
          detail: { isLoading: false, progress: 0, error: `Failed to load session: ${error.message}` }
        }));
        setIsLoadingPrompt(false);
      });
  }, [routeSessionId]);

  // Auto-create prompt from title query param (e.g., /prompts?title=My+Prompt)
  useEffect(() => {
    const titleParam = searchParams.get('title');
    // No longer using /prompts/new - AI handles initialization
    if (titleParam && !currentPromptSession) {
      handleCreateNewPrompt(titleParam);
      // Clear the param so it doesn't re-trigger on remount
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // A2UI: AI-driven decision dialog state
  const [aiDecision, setAiDecision] = useState<{
    show: boolean;
    message: string;
    actions: Array<{ id: string; label: string; variant: string }>;
    pending_intent: string;
    decision_type: string;
    session_id: string | null;
  } | null>(null);

  // ── Console Chat Panel Resize Helpers (matches ConsolePageWithNavigate) ──
  const getMaxChatWidth = useCallback(() => {
    if (!consoleChatContainerRef.current) return DEFAULT_EXPANDED_WIDTH;
    const containerW = consoleChatContainerRef.current.getBoundingClientRect().width;
    return Math.max(COLLAPSED_WIDTH, Math.floor(containerW * 0.95));
  }, []);

  const clampChatWidth = useCallback((w: number) => {
    const max = getMaxChatWidth();
    if (w < 100) return COLLAPSED_WIDTH;
    return Math.max(COLLAPSED_WIDTH, Math.min(w, max));
  }, [getMaxChatWidth]);

  const handleConsoleChatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsConsoleChatResizing(true);
  }, []);

  const handleConsoleChatResizeDoubleClick = useCallback(() => {
    if (isConsoleChatCollapsed) {
      setConsoleChatWidth(clampChatWidth(preCollapseWidthRef.current));
    } else {
      preCollapseWidthRef.current = consoleChatWidth;
      setConsoleChatWidth(COLLAPSED_WIDTH);
    }
  }, [isConsoleChatCollapsed, consoleChatWidth, clampChatWidth]);

  // Console chat resize mouse move/up handlers
  useEffect(() => {
    if (!isConsoleChatResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (isSidebarDraggingRef.current) return;
      if (!consoleChatContainerRef.current) return;
      const rect = consoleChatContainerRef.current.getBoundingClientRect();
      const newWidth = clampChatWidth(rect.right - e.clientX);
      setConsoleChatWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isSidebarDraggingRef.current) return;
      setIsConsoleChatResizing(false);
      setConsoleChatWidth((w) => {
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
  }, [isConsoleChatResizing, clampChatWidth]);

  // Console chat sidebar gripper drag handlers
  useEffect(() => {
    const handleSidebarDragStart = () => {
      isSidebarDraggingRef.current = true;
      setIsConsoleChatResizing(true);
    };
    const handleSidebarDrag = (event: Event) => {
      const customEvent = event as CustomEvent<{ clientX?: number }>;
      if (typeof customEvent.detail?.clientX !== 'number') return;
      if (!consoleChatContainerRef.current) return;
      const rect = consoleChatContainerRef.current.getBoundingClientRect();
      const newWidth = clampChatWidth(rect.right - customEvent.detail.clientX + SIDEBAR_GRIP_OFFSET);
      setConsoleChatWidth(newWidth);
    };
    const handleSidebarDragEnd = () => {
      isSidebarDraggingRef.current = false;
      setIsConsoleChatResizing(false);
      setConsoleChatWidth((w) => {
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

  // Console chat double-click to snap to center
  useEffect(() => {
    const handleGripperDoubleClickToCenter = () => {
      if (!consoleChatContainerRef.current) return;
      const rect = consoleChatContainerRef.current.getBoundingClientRect();
      const centerWidth = Math.floor(rect.width / 2);
      const snappedWidth = clampChatWidth(Math.max(COLLAPSED_WIDTH, centerWidth));
      setConsoleChatWidth(snappedWidth);
      preCollapseWidthRef.current = snappedWidth;
    };
    window.addEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    return () => {
      window.removeEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    };
  }, [clampChatWidth]);

  // ═══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9 UNIFIED SURFACE ASSEMBLY
  // ═══════════════════════════════════════════════════════════════════════════
  // The AI is the ARCHITECT. This single function handles ALL surface rendering.
  // Intents: "render-console", "render-composer", "render-session:{id}"
  // NO FALLBACKS: If AI fails, the surface CANNOT render.
  // ═══════════════════════════════════════════════════════════════════════════
  const assembleSurfaceWithAI = useCallback(async (intent: string, context?: {
    current_surface?: string;
    has_unsaved_changes?: boolean;
    session_id?: string | null;
    session_title?: string;
    category?: string;
  }) => {
    // ✅ DEDUP: If already in flight, skip (user spamming refresh)
    if (isConsoleAssemblyInFlightRef.current) {
      console.log('🤖 [A2UI] Request already in flight - skipping duplicate');
      return;
    }

    // ✅ ABORT: Cancel any previous request that might still be pending
    if (consoleAssemblyControllerRef.current) {
      console.log('🤖 [A2UI] Aborting previous request');
      consoleAssemblyControllerRef.current.abort();
    }

    console.log(`🤖 [A2UI] Assembling surface with intent: ${intent}`, context ? `context: ${JSON.stringify(context)}` : '');
    isConsoleAssemblyInFlightRef.current = true;
    spinnerStartRef.current = Date.now();
    setIsAIAssembling(true);
    setAiAssemblyFailed(false);

    // Set appropriate spinner message based on intent and context
    if (context?.has_unsaved_changes) {
      setAiAssemblyMessage("Hold on — Grace is checking your unsaved work...");
    } else if (intent === 'render-console') {
      setAiAssemblyMessage("Hold on — Grace is assembling your console...");
    } else if (intent === 'render-composer') {
      setAiAssemblyMessage("Hold on — Grace is preparing a fresh workspace...");
    } else if (intent.startsWith('render-session:')) {
      setAiAssemblyMessage("Hold on — Grace is assembling your workspace...");
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    consoleAssemblyControllerRef.current = controller;

    // Client-side timeout: hard 10s wall — fail fast, fail loud
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      timeoutId = setTimeout(() => controller.abort(), 10000);

      // ═══════════════════════════════════════════════════════════════════
      // SINGLE UNIFIED ENDPOINT - A2UI v0.9 COMPLIANT
      // Include context so AI knows about unsaved changes
      // ═══════════════════════════════════════════════════════════════════
      const response = await fetch(`${API_BASE}/ai/assemble-surface`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getStoredUserId(),
        },
        body: JSON.stringify({ intent, context }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetail = `${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || errorDetail;
          console.error('🔴 [A2UI] Backend error:', errorData);
        } catch {}
        throw new Error(`A2UI Assembly Failed: ${errorDetail}`);
      }

      const rawData = await response.json();

      // ═══════════════════════════════════════════════════════════════════
      // A2UI v0.9 ENVELOPE PARSER
      // Response is an array of protocol messages
      // ═══════════════════════════════════════════════════════════════════
      const envelope = Array.isArray(rawData) ? rawData : [rawData];

      // Extract data from A2UI envelope operations
      let surface = 'console';
      let dataModel: any = {};

      for (const operation of envelope) {
        if (operation.updateComponents) {
          surface = operation.updateComponents.surface || 'console';
          console.log(`🤖 [A2UI] Surface type from envelope: ${surface}`);
        }
        if (operation.updateDataModel) {
          dataModel = operation.updateDataModel.value || {};
          console.log(`🤖 [A2UI] Data model received:`, Object.keys(dataModel));
        }
      }

      const assemblyTime = dataModel.assembly_time_ms || 0;
      const aiMessage = dataModel.ai_message || '';
      console.log(`🤖 [A2UI] Surface assembled in ${assemblyTime}ms`);
      console.log(`🤖 [A2UI] Grace says: ${aiMessage}`);

      // ═══════════════════════════════════════════════════════════════════
      // Process based on surface type
      // ═══════════════════════════════════════════════════════════════════
      if (surface === 'console') {
        const cards = dataModel.cards || [];
        if (!Array.isArray(cards)) {
          throw new Error("AI did not return valid cards - surface cannot render without AI");
        }
        setAssembledConsoleCards(cards);
        setHeaderTab('console');
        console.log(`✅ [A2UI] Console assembled with ${cards.length} cards`);

      } else if (surface === 'composer') {
        // Extract session from data model
        const session = dataModel.session || {};
        const sections = session.left_column?.sections || [];
        const metadata = dataModel.metadata || {};

        // Map raw_content if available, otherwise construct from sections
        const leftColumnContent = session.left_column?.raw_content || JSON.stringify({
          sections: sections.map((s: any, i: number) => ({
            section: s.name || s.section,
            role: s.name || s.role,
            content: s.content || '',
            position: i,
            visible: true,
          }))
        });

        const assembledSession = {
          id: session.id || null,
          userId: 'default-user',
          title: session.title || dataModel.suggested_title || 'New Prompt Agent',
          leftColumnContent,
          compiledOutput: session.middle_column?.compiled_output || '',
          conversationId: session.right_column?.conversation_id || null,
          isActive: true,
          isArchived: false,
          currentVersion: metadata.version || 1,
          createdAt: metadata.created_at || new Date().toISOString(),
          updatedAt: metadata.updated_at || new Date().toISOString(),
          lastAccessedAt: metadata.last_accessed_at || new Date().toISOString(),
          metadata: {},
          is_unsaved: session.is_unsaved ?? !session.id,
        };

        setCurrentPromptSession(assembledSession as any);
        hasUnsavedChangesRef.current = assembledSession.is_unsaved;
        setHeaderTab('composer');

        console.log(`✅ [A2UI] Composer assembled with ${sections.length} sections`);

      } else if (surface === 'decision') {
        // ═══════════════════════════════════════════════════════════════════
        // A2UI v0.9: AI-driven decision dialog
        // AI returns a decision surface when user action requires confirmation
        // ═══════════════════════════════════════════════════════════════════
        const decisionType = dataModel.decision_type;
        const actions = dataModel.actions || [];
        const aiMessage = dataModel.ai_message || 'Please make a choice.';
        const pendingIntent = dataModel.pending_intent || '';
        const sessionId = dataModel.session_id || null;

        console.log(`🤖 [A2UI] Decision surface: ${decisionType}`, { actions, pendingIntent });

        setAiDecision({
          show: true,
          message: aiMessage,
          actions,
          pending_intent: pendingIntent,
          decision_type: decisionType,
          session_id: sessionId,
        });
      }

      setAiAssemblyFailed(false);

    } catch (error) {
      clearTimeout(timeoutId);
      setIsAIAssembling(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === 'AbortError') {
        if (consoleAssemblyControllerRef.current === controller) {
          console.error('🤖 [A2UI] Assembly timed out');
          setAiAssemblyMessage('AI OFFLINE: Request timed out after 30 seconds. Please try again.');
          setAiAssemblyFailed(true);
        } else {
          console.log('🤖 [A2UI] Request superseded by newer request');
        }
      } else {
        console.error('🤖 [A2UI] Assembly FAILED - Surface cannot render:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setAiAssemblyMessage(`AI OFFLINE: ${errorMessage}`);
        setAiAssemblyFailed(true);
      }
    } finally {
      isConsoleAssemblyInFlightRef.current = false;
      consoleAssemblyControllerRef.current = null;
      setIsAIAssembling(false);
    }
  }, [setHeaderTab]);

  // ── Legacy function wrappers for backward compatibility ──
  const assembleConsoleWithAI = useCallback(() => assembleSurfaceWithAI('render-console'), [assembleSurfaceWithAI]);
  const assembleComposerWithAI = useCallback((sessionId?: string) => {
    if (sessionId) {
      return assembleSurfaceWithAI(`render-session:${sessionId}`);
    }
    return assembleSurfaceWithAI('render-composer');
  }, [assembleSurfaceWithAI]);

  // ══════════════════════════════════════════════════════════════════════════
  // A2UI: Chat commands the console surface via XML tags in AI responses
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleConsoleCommand = (e: CustomEvent) => {
      const { sort, filter } = e.detail || {};
      console.log('[WritingAreaIndex] Console command from chat:', { sort, filter });
      // Re-assemble console — AI will sort/filter fresh from DB
      assembleSurfaceWithAI('render-console');
    };
    window.addEventListener('a2ui:console-command', handleConsoleCommand as EventListener);
    return () => window.removeEventListener('a2ui:console-command', handleConsoleCommand as EventListener);
  }, [assembleSurfaceWithAI]);

  // ══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9: TAB CLICKS ARE AI COMMANDS, NOT WEBPAGE LINKS
  // ══════════════════════════════════════════════════════════════════════════
  // Every tab click sends an INTENT to the AI. The AI decides what to render.
  // STRICT: No caching, no fallbacks - AI ALWAYS assembles the surface.
  // ══════════════════════════════════════════════════════════════════════════
  const handleTabChangeWithGate = useCallback(async (tabId: string | null) => {
    // ══════════════════════════════════════════════════════════════════════
    // A2UI v0.9: Tab clicks are AI commands
    // Send document state to AI - AI decides how to handle unsaved changes
    // ══════════════════════════════════════════════════════════════════════

    // Build context for AI - includes unsaved changes state
    const context = {
      current_surface: headerTab || 'console',
      has_unsaved_changes: hasUnsavedChangesRef.current,
      session_id: currentPromptSession?.id || null,
      session_title: currentPromptSession?.title || '',
    };

    if (tabId === 'console') {
      // Move the header tab indicator INSTANTLY — don't wait for AI assembly
      handleHeaderTabChange('console');
      // Console is read-only — unsaved changes in the composer do not block navigation.
      console.log('🤖 [A2UI] Console clicked → intent: render-console (direct, no gate)');
      await assembleSurfaceWithAI('render-console', {
        current_surface: 'composer',
        has_unsaved_changes: false,  // ← Console is safe navigation, no decision dialog
        session_id: currentPromptSession?.id || null,
        session_title: currentPromptSession?.title || '',
      });
      setConsoleRefreshKey((k) => k + 1);
      return;
    }

    if (tabId === 'composer') {
      // Move the header tab indicator INSTANTLY — don't wait for AI assembly
      handleHeaderTabChange('composer');
      // If there's a current session, reload it; otherwise render blank composer
      const intent = currentPromptSession?.id
        ? `render-session:${currentPromptSession.id}`
        : 'render-composer';
      console.log(`🤖 [A2UI] Composer clicked → intent: ${intent}`, context);
      await assembleSurfaceWithAI(intent, context);
      return;
    }

    // Other tabs - just switch for now (TODO: wire to AI assembly)
    handleHeaderTabChange(tabId);
  }, [handleHeaderTabChange, assembleSurfaceWithAI, currentPromptSession?.id, currentPromptSession?.title, headerTab]);

  // ══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9: INITIAL MOUNT - AI ALWAYS ASSEMBLES THE INITIAL SURFACE
  // The AI is the ARCHITECT. On mount, call AI to determine what to render.
  // STRICT: No fallbacks, no cache, no static rendering.
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // Determine initial intent based on context
    let initialIntent = 'render-console'; // Default to console

    // If there's a session ID in the URL (from bookmark/link), load that session
    if (routeSessionId) {
      initialIntent = `render-session:${routeSessionId}`;
      console.log(`🤖 [A2UI] Initial mount with session ID: ${routeSessionId}`);
    } else if (headerTab === 'composer') {
      initialIntent = 'render-composer';
      console.log('🤖 [A2UI] Initial mount on Composer tab');
    } else {
      console.log('🤖 [A2UI] Initial mount on Console - commanding AI to assemble surface');
    }

    assembleSurfaceWithAI(initialIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run only on mount

  const navigateAway = () => {
    setCurrentPromptSession(null);
    hasUnsavedChangesRef.current = false; // Clear unsaved flag
    const targetTab = pendingExitTabRef.current;
    pendingExitTabRef.current = null;

    // Execute any pending action (like opening a different prompt)
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;

    if (pendingAction) {
      pendingAction();
    } else if (targetTab) {
      handleHeaderTabChange(targetTab);
    } else {
      navigate('/');
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    navigateAway();
  };

  const handleSaveAndExit = async () => {
    setShowExitConfirm(false);
    // Save the prompt before navigating away
    try {
      await handleSavePromptRef.current();
    } catch {
      // Save failed — still proceed with exit; the user chose to leave
    }
    navigateAway();
  };

  const handleCancelExit = () => {
    setShowExitConfirm(false);
    pendingExitTabRef.current = null;
    setHeaderTab("composer");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9: Handle AI Decision Dialog Actions
  // User selects an action, AI executes it
  // ═══════════════════════════════════════════════════════════════════════════
  const handleAIDecisionAction = useCallback(async (actionId: string) => {
    if (!aiDecision) return;

    const pendingIntent = aiDecision.pending_intent;
    console.log(`🤖 [A2UI] Decision action: ${actionId}, pending intent: ${pendingIntent}`);

    // Close the dialog
    setAiDecision(null);

    if (actionId === 'save') {
      // Save first, then proceed with the pending intent
      try {
        await handleSavePromptRef.current();
        hasUnsavedChangesRef.current = false;
        // Now execute the original intent without unsaved changes context
        await assembleSurfaceWithAI(pendingIntent);
      } catch (error) {
        console.error('🤖 [A2UI] Save failed:', error);
        // Stay on current surface - save failed
      }
    } else if (actionId === 'discard') {
      // Discard changes and proceed with the pending intent
      hasUnsavedChangesRef.current = false;
      await assembleSurfaceWithAI(pendingIntent);
    } else if (actionId === 'cancel') {
      // Do nothing - user cancelled, stay on current surface
      console.log('🤖 [A2UI] User cancelled navigation');
    } else if (aiDecision.decision_type === 'select_category') {
      // Category selection gate — pass chosen category back to render-composer
      console.log(`🤖 [A2UI] Category selected: ${actionId}`);
      await assembleSurfaceWithAI(pendingIntent, { category: actionId });
    }
  }, [aiDecision, assembleSurfaceWithAI]);

  const _handleDeletePromptSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this prompt? This will remove all versions and the linked chat.')) return;
    try {
      await promptService.deletePromptSession(sessionId, true);
      if (currentPromptSession?.id === sessionId) {
        setCurrentPromptSession(null);
      }
      await loadPromptSessions();
      setConsoleRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Failed to delete prompt session:', error);
    }
  };

  const handleConversationChange = useCallback((conversationId: string | null) => {
    if (currentPromptSession && conversationId && currentPromptSession.conversationId !== conversationId) {
      // Update local state only. Conversations are package-owned: the conversation
      // row already carries session_id — prompt_sessions.conversation_id was dropped.
      setCurrentPromptSession(prev => prev ? { ...prev, conversationId } : null);
    }
  }, [currentPromptSession]);

  const _handleDeleteProject = (projectId: string) => {
    // Prevent deletion of the only project
    if (projects.length <= 1) {
      alert(
        "Cannot delete the only project. At least one project is required.",
      );
      return;
    }
    if (
      confirm(
        "Are you sure you want to delete this project? This will also delete all prompts in this project.",
      )
    ) {
      conversationStorage.deleteProject(projectId);
      const updatedProjects = projects.filter((p) => p.id !== projectId);
      setProjects(updatedProjects);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(
          updatedProjects.length > 0 ? updatedProjects[0].id : null,
        );
        if (updatedProjects.length > 0) {
          conversationStorage.setCurrentProjectId(updatedProjects[0].id);
        }
      }
    }
  };

  const _handleSelectProject = async (projectId: string) => {
    setSelectedProjectId(projectId);
    conversationStorage.setCurrentProjectId(projectId);
    // Load conversations for the selected project
    const conversations =
      await conversationStorage.getProjectConversations(projectId, true);
    setProjectConversations(
      conversations.sort((a, b) => b.updatedAt - a.updatedAt),
    );
    setIsMultiSelectMode(false);
    setSelectedConversationIds(new Set());
  };

  const _handleToggleConversationSelect = (conversationId: string) => {
    const newSelected = new Set(selectedConversationIds);
    if (newSelected.has(conversationId)) {
      newSelected.delete(conversationId);
    } else {
      newSelected.add(conversationId);
    }
    setSelectedConversationIds(newSelected);
  };

  const _handleDeleteSelectedConversations = async () => {
    if (selectedConversationIds.size === 0) return;

    if (
      confirm(
        `Are you sure you want to delete ${selectedConversationIds.size} prompt(s)?`,
      )
    ) {
      for (const id of selectedConversationIds) {
        await conversationStorage.deleteConversation(id);
      }
      setSelectedConversationIds(new Set());
      setIsMultiSelectMode(false);
      // Reload conversations
      if (selectedProjectId) {
        const conversations =
          await conversationStorage.getProjectConversations(selectedProjectId);
        setProjectConversations(
          conversations.sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    }
  };

  const _handleDeleteSingleConversation = async (
    conversationId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this prompt?")) {
      await conversationStorage.deleteConversation(conversationId);
      // Reload conversations
      if (selectedProjectId) {
        const conversations =
          await conversationStorage.getProjectConversations(selectedProjectId);
        setProjectConversations(
          conversations.sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    }
  };

  const _handleProjectsClick = async () => {
    setActiveTab("projects");
    await loadProjects(); // Refresh projects when tab is opened
  };

  // Listen for conversation updates to refresh the list
  useEffect(() => {
    const handleConversationUpdate = async () => {
      // Always refresh projects list when conversationUpdated event fires
      // This ensures deleted projects are removed from the list
      // Force refresh to get latest data from API
      const allProjects = await conversationStorage.getAllProjects(true);
      setProjects(allProjects);

      // If the currently selected prompt was deleted, switch to default or all prompts
      const currentProjectId = conversationStorage.getCurrentProjectId();
      if (
        currentProjectId &&
        !allProjects.find((p) => p.id === currentProjectId)
      ) {
        // Selected prompt was deleted, switch to all prompts view
        setSelectedProjectId(null);
        conversationStorage.setCurrentProjectId("");
      }

      if (selectedProjectId && activeTab === "projects") {
        const conversations =
          await conversationStorage.getProjectConversations(selectedProjectId);
        setProjectConversations(
          conversations.sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    };

    window.addEventListener("conversationUpdated", handleConversationUpdate);

    // Listen for switchToMemoriesTab event (from TeacherChat project label click)
    const handleSwitchToMemoriesTab = () => {
      setActiveTab("memories");
    };

    // Listen for switchToChatTab event (from MemoriesTab when clicking a conversation)
    // NOTE: This should NOT trigger when clicking conversations in the projects tab
    // The projects tab should just load the conversation without switching tabs
    const handleSwitchToChatTab = (event: Event) => {
      // Check if event came from projects tab - if so, NEVER switch tabs
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.fromProjectsTab) {
        console.log(
          "🚫 [Projects Tab] Ignoring switchToChatTab - chat panel is always visible",
        );
        return;
      }
      // Also check if we're currently on projects tab - don't switch if we are
      if (activeTab === "projects") {
        console.log(
          "🚫 [Projects Tab] Blocking switchToChatTab - staying on projects tab",
        );
        return;
      }
      // Chat is always visible in the right column — no tab switch needed
    };

    // Listen for editor-send-to-model event (from MyStoryEditor) — REMOVED: MyStory is retired

  // Listen for toggle-third-column event (from ResponsivePromptBuilder RUN button)
  const handleToggleThirdColumn = () => {
    console.log('📥 [WritingAreaIndex] Received toggle-third-column event - resetting all columns to equal widths');
    
    // Dispatch event to reset columns to equal widths
    const resetEvent = new CustomEvent('reset-columns-to-equal-widths', {
      detail: { isThirdColumnOpening: true }
    });
    window.dispatchEvent(resetEvent);
  };

    console.log('✅ [WritingAreaIndex] Setting up event listeners');
    window.addEventListener("switchToMemoriesTab", handleSwitchToMemoriesTab);
    window.addEventListener("switchToChatTab", handleSwitchToChatTab);
    window.addEventListener("toggle-third-column", handleToggleThirdColumn);

    // Listen for save-template event from ResponsivePromptBuilder's Save Template button
    // Uses handleSavePromptRef to avoid stale closure
    const handleSaveTemplateEvent = () => {
      handleSavePromptRef.current();
    };
    window.addEventListener("save-template", handleSaveTemplateEvent);

    // Listen for prompt-session-loaded from LeftVerticalMenu
    const handlePromptSessionLoaded = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.sessionId) {
        handleLoadPromptSession(detail.sessionId);
      }
    };
    window.addEventListener("prompt-session-loaded", handlePromptSessionLoaded);

    // Listen for prompt-session-deleted from LeftVerticalMenu
    // Uses ref to avoid stale closure (effect deps don't change on prompt load)
    const handlePromptSessionDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.id && currentPromptSessionRef.current === detail.id) {
        setCurrentPromptSession(null);
      }
    };
    window.addEventListener("prompt-session-deleted", handlePromptSessionDeleted);

    // Listen for start-new-prompt from LeftVerticalMenu — clear workspace without DB save
    const handleStartNewPrompt = () => {
      setCurrentPromptSession(null);
      setPromptLoadKey(prev => prev + 1);
    };
    window.addEventListener("start-new-prompt", handleStartNewPrompt);
    console.log('✅ [WritingAreaIndex] Event listeners set up');

    return () => {
      window.removeEventListener(
        "conversationUpdated",
        handleConversationUpdate,
      );
      window.removeEventListener(
        "switchToMemoriesTab",
        handleSwitchToMemoriesTab,
      );
      window.removeEventListener("switchToChatTab", handleSwitchToChatTab);
      window.removeEventListener("toggle-third-column", handleToggleThirdColumn);
      window.removeEventListener("save-template", handleSaveTemplateEvent);
      window.removeEventListener("prompt-session-loaded", handlePromptSessionLoaded);
      window.removeEventListener("prompt-session-deleted", handlePromptSessionDeleted);
      window.removeEventListener("start-new-prompt", handleStartNewPrompt);
    };
  }, [selectedProjectId, activeTab]);

  // When a project is selected/activated in Projects tab, default to Keeper chat
  // NOTE: Chat mode switching is now handled in onProjectChange callback based on user clicks
  // This ensures Grace remains default until user explicitly clicks a project

  // NOTE: Mobile layout now uses the same shell with responsive card grid.
  // The left nav collapses to hamburger via LeftVerticalMenu responsiveness.

  // ══════════════════════════════════════════════════════════════════════
  // A2UI: Shell ALWAYS renders. Loading/error states render INSIDE surfaces.
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div
      {...UI_ID.LAYOUT.MAIN_CONTAINER}
      className="h-screen flex flex-row overflow-hidden font-manrope"
      style={{ backgroundColor: "#E5E1DD" }}
    >
      {/* Real loading state indicator - shows actual database activity */}
      {sessionLoadingState.isLoading && (
        <SessionLoader
          isLoading={sessionLoadingState.isLoading}
          progress={sessionLoadingState.progress}
          error={sessionLoadingState.error}
          sessionName={sessionLoadingState.sessionName}
        />
      )}

      {/* Min-width warning overlay for desktop */}
      {!isMobile && <MinWidthWarning />}

      {/* A2UI v0.9: AI Decision Dialog - AI drives this interaction */}
      {aiDecision?.show && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#E5E1DD]/95 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#234354] flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-semibold">G</span>
              </div>
              <div>
                <p className="text-[#1a1a1a] text-sm font-medium mb-1">Grace</p>
                <p className="text-[#1a1a1a] text-base">{aiDecision.message}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end flex-wrap">
              {aiDecision.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleAIDecisionAction(action.id)}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                    action.variant === 'primary'
                      ? 'bg-[#234354] text-white hover:bg-[#1a2f3d]'
                      : action.variant === 'destructive'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legacy exit confirm dialog - kept for backward compatibility */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#E5E1DD]/95 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 animate-in zoom-in-95 duration-300">
            <p className="text-[#1a1a1a] text-lg font-semibold mb-2">Leave composer?</p>
            <p className="text-gray-500 text-sm mb-6">You have an open session. Save your work before leaving, or discard changes.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={handleCancelExit} className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
              <button onClick={handleConfirmExit} className="px-5 py-2.5 text-sm font-semibold bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors">Leave without saving</button>
              <button onClick={handleSaveAndExit} className="px-5 py-2.5 text-sm font-semibold bg-[#234354] text-white rounded-xl hover:bg-[#1a2f3d] transition-colors">Save &amp; leave</button>
            </div>
          </div>
        </div>
      )}

      {/* Left Vertical Menu — full-height icon strip */}
      <LeftVerticalMenu
        onNewChat={() => window.dispatchEvent(new CustomEvent("new-chat"))}
        onNewProject={handleCreateProject}
      />

      {/* Main content area — flex column so header stacks above columns */}
      <div
        className="flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{ boxSizing: "border-box" }}
      >
        {/* ── HEADER FRAME — spans full width above all columns ── */}
        <LeftColumnHeader
          flipped={flipped}
          onToggleFlip={toggleFlip}
          promptTitle={currentPromptSession?.title}
          version={currentPromptSession ? `Saved v${currentPromptSession.currentVersion || 1}` : undefined}
          tags={currentPromptSession?.metadata?.tags?.join(', ') || undefined}
          promptId={currentPromptSession?.id}
          author={currentPromptSession?.metadata?.author || undefined}
          onTitleChange={handlePromptTitleChange}
          activeTab={headerTab}
          onTabChange={handleTabChangeWithGate}
        />

        {/* ── OPERATOR SHELL + AI SURFACE — 2UI architecture ── */}
        <div ref={consoleChatContainerRef} className="flex-1 flex flex-row overflow-hidden min-h-0">
          {/* ── AI SURFACE — Lit Shadow DOM sandbox for A2UI content rendering ── */}
          <SentryErrorBoundary scope="ai-surface" onError={(error) => console.error("AI Surface error:", error.message)}>
            {/* P1+MIGRATION: React AISurfaceSandbox → Lit <ai-surface-sandbox>.
                Properties map to HTML attributes; children use named slots for
                Shadow DOM projection. React components MUST be wrapped in DOM
                elements — the browser assigns slots based on the slot="..."
                HTML attribute, which React components do not render on their
                root elements. */}
            <ai-surface-sandbox
              key={isAIAssembling ? "assembling" : "idle-or-failed"}
              is-ai-assembling={isAIAssembling ? '' : undefined}
              header-tab={headerTab}
            >
              {/* slot="spinner" — shown when is-ai-assembling is true */}
              <div slot="spinner" className="flex flex-col items-center justify-center gap-4 size-full" style={{ backgroundColor: "#E5E1DD" }}>
                <div className="w-8 h-8 border-4 border-[#507274] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[#507274] text-sm font-medium font-['Inter'] animate-pulse">{aiAssemblyMessage}</p>
              </div>
              {/* slot="console" — shown when header-tab is "console" */}
              <div slot="console" style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
                <ConsolePage
                  refreshKey={consoleRefreshKey}
                  aiAssembledCards={assembledConsoleCards}
                  isParentLoading={isAIAssembling}
                  loadingMessage={aiAssemblyMessage}
                  errorMessage={aiAssemblyFailed ? aiAssemblyMessage : null}
                  onCreateNew={async (_title) => {
                    await assembleSurfaceWithAI('render-composer', {
                      current_surface: headerTab || 'console',
                      has_unsaved_changes: hasUnsavedChangesRef.current,
                      session_id: currentPromptSession?.id || null,
                      session_title: currentPromptSession?.title || '',
                    });
                  }}
                  onOpenPrompt={async (sessionId) => {
                    await assembleSurfaceWithAI(`render-session:${sessionId}`, {
                      current_surface: headerTab || 'console',
                      has_unsaved_changes: hasUnsavedChangesRef.current,
                      session_id: currentPromptSession?.id || null,
                      session_title: currentPromptSession?.title || '',
                    });
                  }}
                />
              </div>
              {/* slot="workspace" — shown for composer, evaluation, variables, metadata tabs */}
              <div slot="workspace" style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
                <PromptWorkspace
                  key={promptLoadKey}
                  session={currentPromptSession}
                  flipped={flipped}
                  isLoading={isLoadingPrompt}
                  onSave={handleSavePrompt}
                  onConversationChange={handleConversationChange}
                  isSaving={isSavingPrompt}
                  approvalMode={approvalMode}
                  onClearApproval={clearApprovalMode}
                />
              </div>
            </ai-surface-sandbox>
          </SentryErrorBoundary>

          {/* ── OPERATOR SHELL: Resize handle + Chat panel — outside AI Surface ── */}
          {headerTab === "console" && !isAIAssembling && (
            <>
              <div
                onMouseDown={handleConsoleChatResizeStart}
                onDoubleClick={handleConsoleChatResizeDoubleClick}
                className={`shrink-0 cursor-col-resize transition-colors flex items-center justify-center ${
                  isConsoleChatResizing ? "bg-[#507274]" : "bg-transparent hover:bg-[#507274]/20"
                }`}
                style={{ width: 6, userSelect: "none" }}
                title="Drag to resize · Double-click to collapse"
              >
                {isConsoleChatCollapsed && (
                  <div className="w-[3px] h-8 rounded-full bg-[#507274]/30" />
                )}
              </div>
              <div
                className="shrink-0 h-full overflow-hidden"
                style={{
                  width: consoleChatWidth,
                  transition: isConsoleChatResizing ? 'none' : 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <InteractiveChatInterface />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
