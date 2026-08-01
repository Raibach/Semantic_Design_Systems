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
// PromptWorkspace import removed — replaced by model-driven Lit tree (prompt-section-editor + compiled-output-viewer + workspace-layout) inside slot="workspace"
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
  const promptSectionEditorRef = useRef<any>(null);

  // Composer-specific running state (controls middle column visibility during Run)
  const [isComposerRunning, setIsComposerRunning] = useState(false);

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERSTITIAL LOADING — AI-NATIVE BEST PRACTICE
  // ═══════════════════════════════════════════════════════════════════════════════
  // The 10-second loading floor is NOT a bug — it's a feature.
  // During that time, the interstitial communicates with the user:
  //   - What the AI is doing right now
  //   - What A2UI is (educational)
  //   - What happens next
  // This is the AI-native pattern: loading time IS communication time.
  // Games do this. Slack does this. Now we do this.
  // ═══════════════════════════════════════════════════════════════════════════════
  const INTERSTITIAL_MIN_MS = 10_000; // 10-second floor — user sees the full message sequence
  const INTERSTITIAL_TICK_MS = 2_200; // Time between message rotations

  // Interstitial messages: rotate every ~2.2s during the 10s load.
  // Each message is a step in the communication layer.
  // The user learns what's happening, what A2UI is, and what to expect.
  const INTERSTITIAL_MESSAGES = [
    "Connecting to Grace...",
    "Reading your Figma design spec...",
    "Grace is analyzing the layout structure...",
    "Matching design tokens to components...",
    "Building the A2UI surface — slots first, then content...",
    "In A2UI, the React Shell is always visible. AI fills the slots.",
    "Grace is choosing which prompt blocks go where...",
    "Assembling your console cards...",
    "Almost there — Grace is doing final quality checks...",
    "Surface ready. Welcome to A2UI.",
  ];

  // ── AI Assembly state ──
  // The header tabs are AI COMMANDS, not webpage links.
  // When user clicks Console, AI assembles the console surface.
  // If AI fails, the surface shows the failure — NO FAKE RENDERING.
  const [isAIAssembling, setIsAIAssembling] = useState(false);
  const [aiAssemblyMessage, setAiAssemblyMessage] = useState("Assembling your console...");
  const [aiAssemblyFailed, setAiAssemblyFailed] = useState(false); // STRICT: blocks rendering when true
  const [assembledConsoleCards, setAssembledConsoleCards] = useState<any[] | null>(null); // null = not loaded, [] would be fallback

  // ── Interstitial rotation state ──
  // Tracks which message in the INTERSTITIAL_MESSAGES sequence is currently shown.
  // Rotates forward every INTERSTITIAL_TICK_MS while isAIAssembling is true.
  const [interstitialIndex, setInterstitialIndex] = useState(0);

  // ── Pending result from fast AI response ──
  // If the AI responds in <10s, we hold the result here and only apply it
  // after the interstitial floor is reached. The user sees the full message
  // sequence, and the surface appears at the end of the sequence — not before.
  const pendingResultRef = useRef<{
    resolve: (value: void) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // ── Interstitial rotation effect ──
  // While isAIAssembling is true, rotate through the message sequence
  // every INTERSTITIAL_TICK_MS. When assembly stops, reset to 0.
  useEffect(() => {
    if (!isAIAssembling) {
      setInterstitialIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setInterstitialIndex(prev => {
        const next = prev + 1;
        // Don't go past the last message — hold on it until assembly finishes
        return next >= INTERSTITIAL_MESSAGES.length ? prev : next;
      });
    }, INTERSTITIAL_TICK_MS);
    return () => clearInterval(interval);
  }, [isAIAssembling]);

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
  // Accepts optional compiledOutput + optional sections (from Lit editor) so Save after Run persists full state.
  const handleSavePromptRef = useRef<(compiledOutput?: string, providedSections?: any[]) => Promise<void>>(async () => {});
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

  const handleSavePrompt = async (compiledOutput?: string, providedSections?: any[]) => {
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
      let allSections: { name: string; content: string }[] = [];

      if (providedSections && providedSections.length > 0) {
        // ══════════════════════════════════════════════════════════════════════
        // ONLY PATH: sections from the Lit <prompt-section-editor>.
        // The Lit editor is the source of truth — it owns the shadow DOM textareas.
        // Both save-template and save-requested events pass sections here.
        // ══════════════════════════════════════════════════════════════════════
        allSections = providedSections.map((s: any) => ({
          name: s.name || s.section || s.role || s.type || 'Section',
          content: s.content || ''
        }));
        console.log('📦 [SAVE] Using sections from Lit editor:', allSections.length);
      } else {
        // ── NO SECTIONS: The Lit editor ref is empty or not mounted.
        // This means the composer surface hasn't loaded yet — bail out.
        console.warn('⚠️ [SAVE] No sections available — Lit editor not mounted or empty. Aborting save.');
        window.dispatchEvent(new CustomEvent('a2ui:system-message', {
          detail: { role: 'assistant', content: '⚠️ Nothing to save — the composer has no sections yet.' }
        }));
        isSavingRef.current = false;
        setIsSavingPrompt(false);
        window.dispatchEvent(new CustomEvent('save-template-end'));
        return;
      }

      // Build sections array - include ALL sections, even empty ones
      const sections: PromptSection[] = allSections.map((s, index) => ({
        id: crypto.randomUUID?.() || s.name,
        type: s.name as PromptSection['type'],
        content: s.content,
      }));

      console.log('📸 [SAVE] Capturing surface state:', {
        totalSections: sections.length,
        sectionNames: sections.map(s => s.type),
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

      // ── Collect column widths from PromptWorkspace ──
      let columnWidths: { left: number | null; chat: number } | undefined;
      const widthPromise = new Promise<void>((resolve) => {
        const handler = (e: Event) => {
          columnWidths = (e as CustomEvent).detail;
          window.removeEventListener('column-widths-response' as any, handler);
          resolve();
        };
        window.addEventListener('column-widths-response' as any, handler);
        window.dispatchEvent(new CustomEvent('collect-column-widths'));
        setTimeout(() => { if (!columnWidths) { resolve(); } }, 100);
      });
      await widthPromise;

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
        column_widths: columnWidths,
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

      if (!result.session_id) {
        throw new Error('AI save response missing session_id');
      }

      const savedSession = await promptService.getPromptSession(result.session_id);
      setCurrentPromptSession(savedSession);
      currentPromptSessionRef.current = savedSession.id;

      hasUnsavedChangesRef.current = false;
      await loadPromptSessions();

      // If user is on console, re-assemble to show updated cards.
      // If on composer, just update the session state (already done above).
      if (headerTab === 'console') {
        assembleSurfaceWithAI('render-console');
      }

      // ✅ Toast: save succeeded
      toast({
        title: "Template saved",
        description: result.ai_message || `Saved with ${allSections.length} sections`,
        duration: 3000,
      });
    } catch (error) {
      console.error('❌ [CRUD] Save failed:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      // ✅ Toast: save failed
      toast({
        title: "Save failed",
        description: errMsg,
        variant: "destructive",
        duration: 5000,
      });
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

    // <save-button/> → save (reads sections from Lit editor ref)
    const unsubSave = eventBus.on('save-button', () => {
      const editor = promptSectionEditorRef.current as any;
      const sections = (editor && (editor._sections || editor.sections)) || [];
      const compiledOutput = currentPromptSession?.compiledOutput || '';
      handleSavePromptRef.current?.(compiledOutput, sections);
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
      // No session with a valid ID — create one via the AI save pipeline
      // (reads sections from Lit editor ref, same as save-template)
      const editor = promptSectionEditorRef.current as any;
      const sections = (editor && (editor._sections || editor.sections)) || [];
      try {
        const result = await promptService.savePromptTemplate(
          newTitle,
          sections.map((s: any) => ({ id: s.id || s.name, type: s.name || s.role, content: s.content || '' })),
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

  // ── A2UI: Push sections to Lit <prompt-section-editor> imperatively
  // Declarative prop passing to custom elements can be unreliable for complex arrays.
  // This ensures the editor always receives the normalized sections when data changes.
  useEffect(() => {
    if (!promptSectionEditorRef.current) return;
    if (headerTab !== 'composer') return;
    try {
      const raw = currentPromptSession?.leftColumnContent 
        ? JSON.parse(currentPromptSession.leftColumnContent).sections || [] 
        : [];
      const normalized = raw
        .map((s: any) => s && typeof s === 'object' ? {
          name: s.name || s.section || s.role || s.type || 'Section',
          content: s.content || '',
          type: s.type || s.role || s.name || 'custom',
          position: s.position,
          visible: s.visible !== false,
        } : null)
        .filter(Boolean);
      // Only override if we have real data; let the component keep its seeded defaults otherwise
      if (normalized.length > 0) {
        console.log('[A2UI] Imperatively setting sections on <prompt-section-editor>:', normalized.length);
        (promptSectionEditorRef.current as any).sections = normalized;
      }
    } catch (e) {
      console.warn('[A2UI] Failed to set sections on editor', e);
    }
  }, [currentPromptSession?.leftColumnContent, promptLoadKey, headerTab]);

  const handleOpenPromptFromConsole = async (sessionId: string) => {
    // ══════════════════════════════════════════════════════════════════════════
    // A2UI v0.9: Open session via unified surface assembly
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`🤖 [A2UI] Opening session → intent: render-session:${sessionId}`);
    await assembleSurfaceWithAI(`render-session:${sessionId}`);

    // Force full re-render to dispatch sections to textareas
    setPromptLoadKey(k => k + 1);
  };

  // DELETED: handleLoadPromptSession - was database fallback bypassing AI assembly
  // All session loads MUST go through AI assembly via handleOpenPromptFromConsole

  // DELETED: Load session from route - was database fallback bypassing AI assembly
  // All session loads MUST go through AI assembly via handleOpenPromptFromConsole
  useEffect(() => {
    if (routeSessionId) {
      handleOpenPromptFromConsole(routeSessionId);
    }
  }, [routeSessionId, handleOpenPromptFromConsole]);

  // ══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9 STRICT: NO LEGACY DIRECT DB LOADS
  // All surface loads (including routeSessionId) MUST go through assembleSurfaceWithAI.
  // The effect below that called promptService.getPromptSession directly has been removed.
  // It was a bypass that fought the model-orchestrated path and caused state races.
  // ══════════════════════════════════════════════════════════════════════════
  // (Legacy direct fetch removed per A2UI compliance. See handleOpenPromptFromConsole + initial mount.)

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

  const handleConsoleChatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsConsoleChatResizing(true);
  }, []);

  const handleConsoleChatResizeDoubleClick = useCallback(() => {
    if (isConsoleChatCollapsed) {
      setConsoleChatWidth(preCollapseWidthRef.current);
    } else {
      preCollapseWidthRef.current = consoleChatWidth;
      setConsoleChatWidth(COLLAPSED_WIDTH);
    }
  }, [isConsoleChatCollapsed, consoleChatWidth]);

  // Console chat resize mouse move/up handlers
  useEffect(() => {
    if (!isConsoleChatResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (isSidebarDraggingRef.current) return;
      if (!consoleChatContainerRef.current) return;
      const rect = consoleChatContainerRef.current.getBoundingClientRect();
      setConsoleChatWidth(rect.right - e.clientX);
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
  }, [isConsoleChatResizing]);

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
      setConsoleChatWidth(rect.right - customEvent.detail.clientX + SIDEBAR_GRIP_OFFSET);
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
  }, []);

  // Console chat double-click to snap to center
  useEffect(() => {
    const handleGripperDoubleClickToCenter = () => {
      if (!consoleChatContainerRef.current) return;
      const rect = consoleChatContainerRef.current.getBoundingClientRect();
      const centerWidth = Math.floor(rect.width / 2);
      setConsoleChatWidth(Math.max(COLLAPSED_WIDTH, centerWidth));
      preCollapseWidthRef.current = Math.max(COLLAPSED_WIDTH, centerWidth);
    };
    window.addEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    return () => {
      window.removeEventListener('right-column-gripper-doubleclick', handleGripperDoubleClickToCenter);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // A2UI v0.9 UNIFIED SURFACE ASSEMBLY
  // ═══════════════════════════════════════════════════════════════════════════
  // AI ASSEMBLY — current state (2026-08-01 honest audit):
  //
  // TRUE:  AI decides *data* for each intent (cards, sections, messages).
  // TRUE:  On AI failure, the surface returns 503 — no fake fallback rendering.
  //
  // NOT TRUE YET: "AI is the ARCHITECT" — AI cannot reorganize the surface.
  //   The slot="workspace" JSX below HARDCODES:
  //     - <workspace-layout> three-column frame (left/middle/right)
  //     - <prompt-section-editor> in slot="left"
  //     - <compiled-output-viewer> in slot="middle"
  //     - <InteractiveChatInterface> in slot="right"
  //     - <control-bar> always at bottom of left column
  //   AI can only *populate data into* this frame. It cannot:
  //     - Add a 4th column, remove a column, or swap positions
  //     - Choose different components than the hardcoded ones
  //     - Decide "this task needs no output viewer" and skip it
  //
  // DISCOVERY GOAL: For A2UI to be real, AI must control the *component tree*
  //   (which components, in what arrangement), not just the *data* inside a
  //   fixed frame. The hardcoded JSX is a scaffold during development —
  //   the AI should eventually emit the component tree itself.
  //
  // Intents: "render-console", "render-composer", "render-session:{id}"
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

    // Set the initial interstitial message (index 0)
    // The rotation effect will advance through the sequence automatically.
    setInterstitialIndex(0);
    if (context?.has_unsaved_changes) {
      setAiAssemblyMessage("Checking your unsaved work before connecting to Grace...");
    } else if (intent === 'render-console') {
      setAiAssemblyMessage(INTERSTITIAL_MESSAGES[0]);
    } else if (intent === 'render-composer') {
      setAiAssemblyMessage(INTERSTITIAL_MESSAGES[0]);
    } else if (intent.startsWith('render-session:')) {
      setAiAssemblyMessage(INTERSTITIAL_MESSAGES[0]);
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    consoleAssemblyControllerRef.current = controller;

    // Client-side timeout: 10s hard cap (user requirement — no indefinite hangs)
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
      // Response is an array of protocol messages.
      // The MODEL is the architect — we now capture BOTH updateComponents and updateDataModel.
      // We no longer ignore the components list returned by the LLM.
      // ═══════════════════════════════════════════════════════════════════
      const envelope = Array.isArray(rawData) ? rawData : [rawData];

      // Extract from A2UI envelope operations
      let dataModel: any = {};
      let assembledComponents: any[] = [];

      for (const operation of envelope) {
        if (operation.updateComponents) {
          assembledComponents = operation.updateComponents.components || [];
          console.log(`🤖 [A2UI] Model-supplied components:`, assembledComponents.map((c: any) => c.component || c.id));
        }
        if (operation.updateDataModel) {
          dataModel = operation.updateDataModel.value || {};
          console.log(`🤖 [A2UI] Data model received:`, Object.keys(dataModel));
        }
      }

      // Store the model-driven component tree for future dynamic rendering.
      // (Currently the main layout is still headerTab-driven, but we now respect the model's output.)
      if (assembledComponents.length > 0) {
        (window as any).__lastA2UIComponents = assembledComponents;
      }

      // A2UI v0.9.1: the envelope carries no non-spec "surface" key.
      // The view is inferred from the data model itself: decision payload →
      // decision dialog, cards → console grid, session payload → composer.
      const surface = dataModel.decision_type
        ? 'decision'
        : Array.isArray(dataModel.cards)
          ? 'console'
          : dataModel.session
            ? 'composer'
            : 'console';
      console.log(`🤖 [A2UI] Surface inferred from data model: ${surface}`);

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
            name: s.name || s.section || s.role || 'Section',
            content: s.content || '',
            type: s.type || s.role || s.name || 'custom',
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

      // ═══════════════════════════════════════════════════════════════════
      // INTERSTITIAL FLOOR: Wait until the 10s minimum is reached.
      // The user sees the full message sequence. The surface appears
      // at the END of the interstitial — not before.
      // This is the AI-native loading pattern: load time = communication time.
      // ═══════════════════════════════════════════════════════════════════
      const elapsed = Date.now() - spinnerStartRef.current;
      const remaining = INTERSTITIAL_MIN_MS - elapsed;
      if (remaining > 0) {
        console.log(`🤖 [A2UI] AI responded in ${elapsed}ms — holding ${remaining}ms for interstitial floor`);
        await new Promise<void>(resolve => {
          pendingResultRef.current = {
            resolve,
            timer: setTimeout(() => {
              pendingResultRef.current = null;
              setIsAIAssembling(false); // Clear assembling state when floor is reached
              resolve();
            }, remaining),
          };
        });
      }

    } catch (error) {
      clearTimeout(timeoutId);
      setIsAIAssembling(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      const isAbort = error instanceof Error && (
        error.name === 'AbortError' ||
        errMsg.toLowerCase().includes('aborted') ||
        errMsg.toLowerCase().includes('signal')
      );
      if (isAbort) {
        if (consoleAssemblyControllerRef.current === controller) {
          // This request itself timed out (10s hard cap)
          console.error(
            `[A2UI] ASSEMBLY TIMED OUT\n` +
            `  intent: ${intent}\n` +
            `  timeout: 10000ms\n` +
            `  error.name: ${error instanceof Error ? error.name : 'N/A'}\n` +
            `  error.message: ${errMsg}\n` +
            `  timestamp: ${new Date().toISOString()}\n` +
            `  CAUSE: Backend did not respond within 10s. Either Z.ai is slow, the Figma spec is empty (causing LLM confusion), or the backend is down.\n` +
            `  FIX: Check backend logs for the request matching this timestamp. Look for "A2UI FAILURE" or "Figma node" messages.`
          );
          setAiAssemblyMessage('Assembly timed out (10s). The AI may be slow or the backend may be unreachable. Check the server logs for details.');
          setAiAssemblyFailed(true);
          setCurrentPromptSession(null);
          setAssembledConsoleCards(null);
        } else {
          // Previous request was aborted because a newer user action (tab click, etc.) superseded it
          console.log('[A2UI] Previous assembly superseded by newer request (normal)');
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[A2UI] ASSEMBLY FAILED\n` +
          `  intent: ${intent}\n` +
          `  error.type: ${error instanceof Error ? error.constructor.name : typeof error}\n` +
          `  error.name: ${error instanceof Error ? error.name : 'N/A'}\n` +
          `  error.message: ${errorMessage}\n` +
          `  error.stack: ${error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 5).join('\n    ') : 'N/A'}\n` +
          `  timestamp: ${new Date().toISOString()}\n` +
          `  state: aiAssemblyFailed=true, currentPromptSession=null, assembledConsoleCards=null`
        );
        // If the backend gave us a structured 503 detail (starts with "A2UI FAILURE:"),
        // show it directly — it already says exactly what went wrong.
        // Otherwise, prefix with context about what failed.
        const displayMessage = errorMessage.startsWith('A2UI FAILURE:')
          ? errorMessage
          : `Assembly failed: ${errorMessage}`;
        setAiAssemblyMessage(displayMessage);
        setAiAssemblyFailed(true);
        setCurrentPromptSession(null);
        setAssembledConsoleCards(null);
      }
    } finally {
      isConsoleAssemblyInFlightRef.current = false;
      consoleAssemblyControllerRef.current = null;
      // Only clear the assembling state if there's no pending interstitial floor.
      // If the floor timer is still running, it will clear the state when it fires.
      if (!pendingResultRef.current) {
        setIsAIAssembling(false);
      }
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
  // Every tab click sends an INTENT to the AI. The AI decides what DATA to
  // return. On failure: 503 hard fail, no fake rendering — correct.
  //
  // BUT: AI does NOT decide the *frame*. The slot routing in
  // <ai-surface-sandbox> is hardcoded: console→slot="console",
  // everything else→slot="workspace". AI cannot create new surface types
  // or reorganize which slots exist. See assembly audit above.
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

  // ── A2UI: Wire run-requested / save-requested from Lit <prompt-section-editor> ──
  // The Lit editor (AI-emitted) is now the source of truth for sections in the AI surface.
  // Run executes the prompt (real backend call) and streams into compiledOutput.
  // Middle column appears on Run (even while streaming) and stays if output exists.
  // Clear-output collapses the middle column. Save persists both left content + compiled output.
  const handleRunRequested = async (e: Event) => {
    const { sections = [] } = (e as CustomEvent).detail || {};
    console.log('[WritingAreaIndex] run-requested from <prompt-section-editor>', sections.length, 'sections');

    if (!currentPromptSession) {
      console.warn('[WritingAreaIndex] No active prompt session — cannot run');
      return;
    }

    const leftColumnContent = JSON.stringify({ sections });

    // Reset output for fresh run; show middle immediately via isComposerRunning
    setCurrentPromptSession((prev: any) =>
      prev ? { ...prev, leftColumnContent, compiledOutput: '' } : prev
    );
    setIsComposerRunning(true);

    try {
      const { getApiKey } = await import('@/services/authService');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = getApiKey();
      if (apiKey) headers['X-API-Key'] = apiKey;

      // Build prompt context exactly like the legacy composer did
      const promptContext = sections
        .map((s: any) => {
          const n = s.name || s.section || s.role || s.type || 'Section';
          const c = (s.content || '').trim();
          return `## ${n}\n${c}`;
        })
        .join('\n\n');

      const apiBase = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${apiBase}/api/teacher/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: 'Execute the prompt configuration.',
          context: promptContext,
          mode: 'prompt_output',
          temperature: 0.45,
          model: 'deepseek-chat',
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        setCurrentPromptSession((prev: any) =>
          prev ? { ...prev, compiledOutput: `Error: ${resp.status} ${errText}` } : prev
        );
        setIsComposerRunning(false);
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let output = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.content) {
                  output += parsed.content;
                  // Live update so the viewer streams and layout keeps middle visible
                  setCurrentPromptSession((prev: any) =>
                    prev ? { ...prev, compiledOutput: output } : prev
                  );
                }
              } catch {
                // non-JSON data lines are ignored
              }
            }
          }
        }
      }

      if (!output.trim()) {
        setCurrentPromptSession((prev: any) =>
          prev ? { ...prev, compiledOutput: '(No output returned.)' } : prev
        );
      }
    } catch (err: any) {
      console.error('[WritingAreaIndex] Run execution failed', err);
      setCurrentPromptSession((prev: any) =>
        prev ? { ...prev, compiledOutput: `Error: ${err?.message || String(err)}` } : prev
      );
    } finally {
      setIsComposerRunning(false);
      // Optional: give the layout a hint to equalize widths when middle appears
      window.dispatchEvent(new CustomEvent('reset-columns-to-equal-widths', { detail: { isThirdColumnOpening: true } }));
    }
  };

  const handleSaveRequested = (e: Event) => {
    const { sections = [] } = (e as CustomEvent).detail || {};
    console.log('[WritingAreaIndex] save-requested from <prompt-section-editor>', sections.length, 'sections');

    const leftColumnContent = JSON.stringify({ sections });
    const compiledOutput = currentPromptSession?.compiledOutput || '';

    setCurrentPromptSession((prev: any) =>
      prev ? { ...prev, leftColumnContent } : prev
    );

    // Pass BOTH compiledOutput AND the authoritative sections from the Lit editor.
    // This bypasses the broken DOM query inside handleSavePrompt (textareas are in open shadow DOM).
    handleSavePromptRef.current?.(compiledOutput, sections);
  };

  // Clear from the compiled-output-viewer "Clear" button → collapse middle column
  const handleClearOutput = () => {
    console.log('[WritingAreaIndex] clear-output — collapsing middle column');
    setCurrentPromptSession((prev: any) =>
      prev ? { ...prev, compiledOutput: '' } : prev
    );
  };

    console.log('✅ [WritingAreaIndex] Setting up event listeners');
    window.addEventListener("switchToMemoriesTab", handleSwitchToMemoriesTab);
    window.addEventListener("switchToChatTab", handleSwitchToChatTab);
    window.addEventListener("toggle-third-column", handleToggleThirdColumn);

    // Listen for save-template event from ResponsivePromptBuilder's Save Template button.
    // Reads sections from the Lit <prompt-section-editor> ref (source of truth).
    // This is the SAME path as save-requested — no broken DOM fallback.
    const handleSaveTemplateEvent = () => {
      const editor = promptSectionEditorRef.current as any;
      const sections = (editor && (editor._sections || editor.sections)) || [];
      const compiledOutput = currentPromptSession?.compiledOutput || '';
      console.log('[save-template] Reading', sections.length, 'sections from Lit editor ref');
      handleSavePromptRef.current?.(compiledOutput, sections);
    };
    window.addEventListener("save-template", handleSaveTemplateEvent);

    window.addEventListener("run-requested", handleRunRequested);
    window.addEventListener("save-requested", handleSaveRequested);
    window.addEventListener("clear-output", handleClearOutput);

    // Wire the bottom control bar (control-bar from Figma node 40000761:261) to the *existing* CRUD paths only.
    // No new save/run/version logic — re-uses handleSavePromptRef + run-requested dispatch exactly as the Lit editor does.
    // Control-bar save: reads sections from Lit editor ref (same as save-template).
    const handleControlBarSave = () => {
      const editor = promptSectionEditorRef.current as any;
      const sections = (editor && (editor._sections || editor.sections)) || [];
      const compiledOutput = currentPromptSession?.compiledOutput || '';
      console.log('[control-bar] save-click →', sections.length, 'sections from Lit editor ref');
      handleSavePromptRef.current?.(compiledOutput, sections);
    };
    const handleControlBarRun = () => {
      const editor = promptSectionEditorRef.current as any;
      const sections = (editor && (editor._sections || editor.sections)) || [];
      console.log('[control-bar] run-click → dispatching run-requested (existing path)');
      window.dispatchEvent(new CustomEvent('run-requested', { detail: { sections } }));
    };
    window.addEventListener('save-click', handleControlBarSave as EventListener);
    window.addEventListener('run-click', handleControlBarRun as EventListener);

    // Wire undo-click from control-bar (Figma node 40000761:271 "undo-last-state-milivis")
    // TODO: undo-last-state-milivis has no backend handler yet. Wire the event now,
    // implement the Milvus state rollback when the backend supports it.
    const handleControlBarUndo = () => {
      console.log('[control-bar] undo-click → undo-last-state-milivis (no backend handler yet)');
      // Future: dispatch undo to Milvus state manager
      // window.dispatchEvent(new CustomEvent('undo-last-state'));
    };
    window.addEventListener('undo-click', handleControlBarUndo as EventListener);

    // DELETED: prompt-session-loaded listener - was database fallback bypassing AI assembly
    // All session loads MUST go through AI assembly via handleOpenPromptFromConsole
    const handlePromptSessionLoaded = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.sessionId) {
        handleOpenPromptFromConsole(detail.sessionId);
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
      window.removeEventListener("run-requested", handleRunRequested);
      window.removeEventListener("save-requested", handleSaveRequested);
      window.removeEventListener("clear-output", handleClearOutput);
      window.removeEventListener('save-click', handleControlBarSave as EventListener);
      window.removeEventListener('run-click', handleControlBarRun as EventListener);
      window.removeEventListener('undo-click', handleControlBarUndo as EventListener);
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

      {/* Main content area — flex column that takes remaining height after header.
          Uses flex-1 + min-h-0 so the operator shell row below the header can grow
          to fill the viewport. No more vh calc hacks. */}
      <div
        className="flex flex-col flex-1 min-w-0 overflow-hidden"
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
        <div ref={consoleChatContainerRef} className="flex flex-row overflow-hidden flex-1 min-h-0" style={{ minWidth: 0 }}>
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
                {/* slot="spinner" — INTERSTITIAL LOADING: AI-NATIVE BEST PRACTICE
                     The 10s loading floor is a feature, not a bug.
                     During that time, this panel communicates with the user:
                     what the AI is doing, what A2UI is, what happens next.
                     The message rotates every ~2.2s through INTERSTITIAL_MESSAGES.
                     A progress bar shows elapsed time toward the 10s floor. */}
                <div slot="spinner" className="flex flex-col items-center justify-center gap-5 size-full" style={{ backgroundColor: "#E5E1DD" }}>
                  <div className="w-8 h-8 border-4 border-[#507274] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[#507274] text-sm font-medium font-['Inter'] transition-all duration-300">{INTERSTITIAL_MESSAGES[interstitialIndex] || aiAssemblyMessage}</p>
                  {/* Progress bar: fills over 10s to show the interstitial floor */}
                  <div className="w-48 h-1 bg-[#507274]/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#507274] rounded-full transition-all duration-[2200ms] ease-linear"
                      style={{ width: `${Math.min(100, ((interstitialIndex + 1) / INTERSTITIAL_MESSAGES.length) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[#507274]/60 text-xs font-['Inter']">{interstitialIndex + 1} / {INTERSTITIAL_MESSAGES.length}</p>
                </div>
                {/* slot="console" — shown when header-tab is "console" */}
                <div slot="console" style={{ display: 'flex', flex: '1 1 0%', height: '100%', minHeight: 0, minWidth: 0, overflow: 'auto' }}>
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
                {/* slot="workspace" — AI-driven Lit tree (A2UI v0.9.1).
                    Slots are the loading contract. AI fills them with prompt blocks.
                    When assembly FAILS, show the error — no hiding. */}
                <div slot="workspace" style={{ display: 'flex', flex: '1 1 0%', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                  {aiAssemblyFailed ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'auto' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#991B1B', margin: '0 0 8px' }}>Assembly failed</h3>
                      <pre style={{ fontSize: '11px', fontFamily: 'monospace', color: '#7F1D1D', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiAssemblyMessage}</pre>
                    </div>
                  ) : (
                  <workspace-layout 
                    show-middle={isComposerRunning || !!currentPromptSession?.compiledOutput ? '' : undefined}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <div 
                      slot="left"
                      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}
                    >
                      <prompt-section-editor
                        ref={promptSectionEditorRef}
                        style={{ flex: '1 1 0%', minHeight: 0, overflow: 'auto' }}
                        sections={( () => {
                        try { 
                          const raw = currentPromptSession?.leftColumnContent 
                            ? JSON.parse(currentPromptSession.leftColumnContent).sections || [] 
                            : []; 
                          return raw
                            .map((s: any) => s && typeof s === 'object' ? {
                              name: s.name || s.section || s.role || s.type || 'Section',
                              content: s.content || '',
                              type: s.type || s.role || s.name || 'custom',
                              position: s.position,
                              visible: s.visible !== false,
                            } : null)
                            .filter(Boolean);
                        } catch { return []; } 
                      })()}
                      session-id={currentPromptSession?.id || undefined}
                    />
                    <control-bar
                      version-text={currentPromptSession ? `Editing Version ${currentPromptSession.currentVersion || 1}` : 'Editing Version 1'}
                      is-saving={isSavingPrompt ? '' : undefined}
                      is-running={isComposerRunning ? '' : undefined}
                    />
                  </div>
                    <compiled-output-viewer
                      slot="middle"
                      content={currentPromptSession?.compiledOutput || ''}
                      session-id={currentPromptSession?.id || undefined}
                      is-running={isComposerRunning ? '' : undefined}
                    />
                    <div slot="right" style={{ height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {/* chat-panel target for the AI layout; bridge existing chat for composer surfaces.
                          Pass sessionId so conversations are strictly scoped to this prompt package (prompt_session).
                          Pass compiledOutput + isRunning so the assistant can auto-analyze on Run.
                          overflow: hidden constrains the chat within the workspace-layout right pane —
                          prevents the chat column from pushing past the browser right edge. */}
                      <InteractiveChatInterface 
                      sessionId={currentPromptSession?.id || null}
                      compiledOutput={currentPromptSession?.compiledOutput || ''}
                      isRunning={false}
                    />
                  </div>
                  </workspace-layout>
                  )}
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
