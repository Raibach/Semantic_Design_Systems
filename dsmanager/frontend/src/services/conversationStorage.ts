import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/react';
// Conversation data types
export interface Message {
  id: string;
  type: 'question' | 'response';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  projectId: string | null;
  /** Package (prompt_session) this conversation belongs to — conversations are package-owned */
  sessionId?: string | null;
  /** Which chat-column tab this conversation lives in */
  tab?: 'chat' | 'trace' | 'tools';
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  title: string;
  /** Tag indicating which tab/section the conversation originated from */
  tag?: 'trace' | 'variables' | 'tools' | 'general';
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt?: number; // Last modified timestamp - used for sorting
  archives?: Conversation[]; // Archived conversations for this project
}

// ── In-memory state (NO localStorage — PostgreSQL is the only source of truth) ──
let _currentConversationId: string | null = null;
let _currentProjectId: string | null = null;
let _lastModifiedProject: { projectId: string; timestamp: number } | null = null;
let _lastModifiedChat: { conversationId: string; projectId: string; timestamp: number } | null = null;
let _lastModifiedDraft: { draftName: string; timestamp: number } | null = null;
let _lastActiveChats: Record<string, string> = {};

// API Configuration - shared helper: /api in dev, /proxy.php?url=api in prod
import { API_BASE } from "@/shared/apiHelper";
// Default user ID - single user for now
// Matches backend default: "00000000-0000-0000-0000-000000000001"
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// Helper to get user ID from auth service (always returns a user ID)
// For now, we use a single default user ID for all operations
const getUserId = async (): Promise<string> => {
  try {
    // Get user ID from auth service (always returns a user ID, default if none stored)
    const { getStoredUserId } = await import('./authService');

    // getStoredUserId() now always returns a user ID (default if none stored)
    const userId = getStoredUserId();

    // Validate it's a UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(userId)) {
      return userId;
    }

    // If somehow we got an invalid ID, return default
    console.warn('⚠️ Invalid user ID format, using default:', userId);
    return DEFAULT_USER_ID;
  } catch (error) {
    console.error('❌ Error getting user ID:', error);
    // Always return default user ID on error
    return DEFAULT_USER_ID;
  }
};

// API Client
const apiCall = async (endpoint: string, options?: RequestInit): Promise<any> => {
  // Get user ID (must be UUID from database)
  const userId = await getUserId();
  const url = `${API_BASE}${endpoint}`;

  // Get API key from auth service
  const { getApiKey } = await import('./authService');
  const apiKey = getApiKey();

  // Build headers - CRITICAL: Always include X-User-ID
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Always add X-User-ID header - this is REQUIRED for the API to work
    'X-User-ID': userId,
  };

  // Don't spread in options headers - they might override our X-User-ID
  // Instead, selectively add non-conflicting headers from options
  if (options?.headers && typeof options.headers === 'object') {
    for (const [key, value] of Object.entries(options.headers)) {
      if (key !== 'X-User-ID' && key !== 'Content-Type') {
        headers[key] = String(value);
      }
    }
  }

  // Add API key if available (optional - Railway handles authentication)
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  // DEBUG: Log API calls

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Try to get error message from response (read body once)
      let errorMessage = `API error: ${response.status} ${response.statusText}`;
      let errorData: Record<string, unknown> = {};
      let errorCode: string | undefined;

      try {
        // Clone response to read body without consuming it
        const responseClone = response.clone();
        errorData = await responseClone.json();
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
        if (typeof errorData.code === 'string') {
          errorCode = errorData.code;
        }
      } catch {
        // If JSON parsing fails, try text
        try {
          const responseClone = response.clone();
          const text = await responseClone.text();
          if (text) {
            errorMessage = `${errorMessage}: ${text.substring(0, 200)}`;
          }
        } catch {
          // Use default message
        }
      }

      // Log the full error for debugging
      console.error(`API Error [${response.status}]:`, errorMessage, errorData);
      
      // Log to error logger
      logger.error(`API Error [${response.status}]: ${errorMessage}`, { endpoint, responseData: errorData, method: options?.method || 'GET' });

      // Authentication errors
      if (response.status === 401) {
        // Clear invalid user ID and force re-login
        const { clearApiKey } = await import('./authService');
        clearApiKey();
        throw new Error(errorMessage || 'Authentication required. Please log in with an API key.');
      }

      // Invalid UUID errors (400) - clear invalid user ID
      if (response.status === 400) {
        if (errorCode === 'INVALID_UUID' ||
            errorMessage.toLowerCase().includes('uuid') ||
            errorMessage.toLowerCase().includes('invalid input') ||
            errorMessage.toLowerCase().includes('syntax for type')) {
          // Clear invalid user ID and API key to force re-login
          const { clearApiKey, clearInvalidUserIds } = await import('./authService');
          clearInvalidUserIds();
          clearApiKey();
          throw new Error(`Invalid user ID detected. Please refresh the page and log in again. ${errorMessage}`);
        }
      }

      // Database/API not available
      if (response.status === 503) {
        throw new Error(errorMessage || 'Database not available. Please check your connection and Railway deployment.');
      }

      // Server errors - show the actual error message
      if (response.status === 500) {
        // Check if it's a UUID validation error
        if (errorMessage.toLowerCase().includes('uuid') ||
            errorMessage.toLowerCase().includes('invalid input') ||
            errorMessage.toLowerCase().includes('syntax for type')) {
          // Clear invalid user ID
          const { clearInvalidUserIds } = await import('./authService');
          clearInvalidUserIds();
          throw new Error(`Database error: Invalid user ID. Please refresh the page and log in again. ${errorMessage}`);
        }
        // Check if it's a foreign key constraint violation (user doesn't exist)
        if (errorMessage.includes('foreign key constraint') ||
            errorMessage.includes('is not present in table')) {
          throw new Error(`Database error: User or project not found. ${errorMessage}`);
        }
        // Check if it's a connection error
        if (errorMessage.toLowerCase().includes('connection') ||
            errorMessage.toLowerCase().includes('offline') ||
            errorMessage.toLowerCase().includes('unable to connect')) {
          throw new Error(`Database connection error: ${errorMessage}`);
        }
        // Generic server error
        throw new Error(`Server error: ${errorMessage}`);
      }

      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    // Network error - only show "offline" message for actual network errors
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      // Actual network error - server is unreachable
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }
    // For authentication errors, connection errors, etc. - just re-throw with the actual error message
    // Don't mention "saved locally" - we're online, there's just an error
    throw error;
  }
};

// Check if API is available
// Health check ping removed — API calls will fail gracefully via try/catch if backend is down
const isApiAvailable = async (): Promise<boolean> => {
  return true;
};

// ── Deprecated: offline queue is no longer used. Functions kept as no-ops ──
//     for compilation compatibility. All operations now go directly to the API.
const addToOfflineQueue = (_action: string, _data: unknown): void => {};

// Convert backend message format to frontend format
const backendMessageToFrontend = (backendMsg: any): Message => {
  return {
    id: backendMsg.id,
    type: backendMsg.role === 'user' ? 'question' : 'response',
    content: backendMsg.content,
    timestamp: new Date(backendMsg.created_at).getTime(),
  };
};

// Convert frontend message format to backend format
const frontendMessageToBackend = (frontendMsg: Message): any => {
  return {
    role: frontendMsg.type === 'question' ? 'user' : 'assistant',
    content: frontendMsg.content,
    metadata: {},
  };
};

// Convert backend conversation format to frontend format
// Lightweight version - doesn't load messages (for lists)
const backendConversationToFrontendLightweight = (backendConv: any): Conversation => {
  return {
    id: backendConv.id,
    projectId: backendConv.project_id || null,
    sessionId: backendConv.session_id || null,
    tab: backendConv.tab || 'chat',
    messages: [], // Empty messages array - will be loaded on demand
    createdAt: new Date(backendConv.created_at).getTime(),
    updatedAt: new Date(backendConv.updated_at).getTime(),
    title: backendConv.title || 'Untitled Prompt',
  };
};

// Full version - loads all messages (only use when actually viewing a conversation)
const backendConversationToFrontend = async (backendConv: any, loadMessages: boolean = false): Promise<Conversation> => {
  // Safety check: ensure backendConv exists
  if (!backendConv || !backendConv.id) {
    throw new Error('Invalid conversation data received from API');
  }

  // Only fetch messages if explicitly requested (for viewing a conversation)
  let messages: Message[] = [];
  if (loadMessages) {
    try {
      const messagesResponse = await apiCall(`/conversations/${backendConv.id}/messages`);
      // Ensure messagesResponse.messages is an array
      if (messagesResponse && Array.isArray(messagesResponse.messages)) {
        messages = messagesResponse.messages.map(backendMessageToFrontend);
      } else {
        console.warn(`Invalid messages response for conversation ${backendConv.id}:`, messagesResponse);
        messages = [];
      }
    } catch (error) {
      console.error('Failed to fetch messages for conversation:', error);
      messages = [];
    }
  }

  return {
    id: backendConv.id,
    projectId: backendConv.project_id || null, // Allow null for unassigned conversations
    messages,
    createdAt: new Date(backendConv.created_at).getTime(),
    updatedAt: new Date(backendConv.updated_at).getTime(),
    title: backendConv.title || 'Untitled Prompt',
  };
};

// Conversation Storage Service
export const conversationStorage = {
  // ── PACKAGE-SCOPED: conversations belong to a prompt_session (package) ──
  // tab: omit or 'chat' = ALL of the package's conversations; 'trace'/'tools' = only that tab's
  getSessionConversations: async (sessionId: string, tab?: 'chat' | 'trace' | 'tools'): Promise<Conversation[]> => {
    if (!sessionId || !conversationStorage.isValidUUID(sessionId)) {
      console.warn('[ConversationStorage] BLOCKED: invalid session ID:', sessionId);
      return [];
    }
    try {
      const params = new URLSearchParams();
      if (tab && tab !== 'chat') params.append('tab', tab);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await apiCall(`/sessions/${sessionId}/conversations${queryString}`);
      const backendConvs = response.conversations || [];
      return backendConvs.map(backendConversationToFrontendLightweight);
    } catch (error) {
      console.error('[ConversationStorage] Failed to load session conversations:', error);
      Sentry.captureException(error, {
        tags: { context: 'getSessionConversations:api-call' },
        extra: { sessionId, tab },
      });
      throw error;
    }
  },

  // Get all conversations (API-first with localStorage fallback)
  getAllConversations: async (projectId?: string, _forceRefresh: boolean = false, limit?: number): Promise<Conversation[]> => {
    // BLOCK invalid project IDs from making API calls
    if (projectId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        console.warn('[ConversationStorage] BLOCKED: invalid project ID:', projectId);
        return [];
      }
    }

    const available = await isApiAvailable();
    if (!available) {
      const err = new Error('API unavailable — cannot load conversations');
      console.error('[ConversationStorage]', err.message);
      Sentry.captureException(err, { tags: { context: 'getAllConversations:api-unavailable' } });
      return [];
    }

    try {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (limit) params.append('limit', limit.toString());
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await apiCall(`/conversations${queryString}`);
      const backendConvs = response.conversations || [];
      return backendConvs.map(backendConversationToFrontendLightweight);
    } catch (error) {
      console.error('[ConversationStorage] Failed to load conversations:', error);
      Sentry.captureException(error, {
        tags: { context: 'getAllConversations:api-call' },
        extra: { projectId, limit },
      });
      return [];
    }
  },

  // Get a specific conversation (API-only — PostgreSQL is source of truth)
  getConversation: async (id: string): Promise<Conversation | null> => {
    if (!id || !conversationStorage.isValidUUID(id)) {
      return null;
    }

    const available = await isApiAvailable();
    if (!available) {
      logger.error('API unavailable — cannot load conversation', { conversationId: id });
      return null;
    }

    try {
      const response = await apiCall(`/conversations/${id}`);
      return await backendConversationToFrontend(response, true);
    } catch (error) {
      if ((error as Error).message?.includes('404')) {
        logger.warn('Conversation not found', { conversationId: id });
        return null;
      }
      logger.error('Failed to load conversation', { conversationId: id });
      Sentry.captureException(error, { tags: { context: 'getConversation' }, extra: { conversationId: id } });
      return null;
    }
  },

  // Save a conversation (API-only — PostgreSQL is source of truth)
  saveConversation: async (conversation: Conversation): Promise<{ success: boolean; error?: string; savedLocally: boolean }> => {
    try {
      if (!conversation || !conversation.id) {
        return { success: false, error: 'Invalid conversation object', savedLocally: false };
      }

      if (!conversationStorage.isValidUUID(conversation.id)) {
        return { success: false, error: 'Invalid conversation ID', savedLocally: false };
      }

      if (!conversation.title || conversation.title.trim() === '') {
        conversation.title = 'Untitled Prompt';
      }

      const available = await isApiAvailable();
      if (!available) {
        return { success: false, error: 'API unavailable', savedLocally: false };
      }

      const updateData: Record<string, unknown> = {
        title: conversation.title,
        message_count: (conversation.messages || []).length,
      };
      if (conversation.projectId && conversationStorage.isValidUUID(conversation.projectId)) {
        updateData.project_id = conversation.projectId;
      }

      await apiCall(`/conversations/${conversation.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      if (conversation.projectId) {
        conversationStorage.setLastModifiedProject(conversation.projectId);
      }

      return { success: true, savedLocally: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to save conversation', { conversationId: conversation?.id, error: msg });
      Sentry.captureException(error, { tags: { context: 'saveConversation' }, extra: { conversationId: conversation?.id } });
      return { success: false, error: msg, savedLocally: false };
    }
  },

  // Delete a conversation (API-only)
  deleteConversation: async (id: string): Promise<void> => {
    if (!id || !conversationStorage.isValidUUID(id)) return;

    const available = await isApiAvailable();
    if (!available) {
      logger.error('API unavailable — cannot delete conversation', { conversationId: id });
      return;
    }

    try {
      await apiCall(`/conversations/${id}`, { method: 'DELETE' });
    } catch (error) {
      logger.error('Failed to delete conversation', { conversationId: id });
      Sentry.captureException(error, { tags: { context: 'deleteConversation' }, extra: { conversationId: id } });
    }
  },

  // Get conversations for a project (API-first with localStorage fallback)
  getProjectConversations: async (projectId: string | null, forceRefresh: boolean = false, chatMode?: 'grace' | 'keeper'): Promise<Conversation[]> => {
    // Allow null/undefined to get all conversations
    if (projectId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        console.warn('🚨 BLOCKED: getProjectConversations called with invalid project ID:', projectId);
        return []; // Return empty instead of making invalid API call
      }
    }
    const allConversations = await conversationStorage.getAllConversations(projectId || undefined, forceRefresh);

    // Filter by chat mode if specified
    if (chatMode) {
      return allConversations.filter(conv => {
        // Check if conversation title starts with "Keeper Chat:" for keeper mode
        // or doesn't start with it for grace mode
        if (chatMode === 'keeper') {
          return conv.title.startsWith('Keeper Chat:');
        } else {
          return !conv.title.startsWith('Keeper Chat:');
        }
      });
    }

    return allConversations;
  },

  // Get the "Archived Unassigned Chats" project if it exists (API-only)
  getUnassignedProject: async (): Promise<Project | null> => {
    const UNASSIGNED_PROJECT_NAME = 'Archived Unassigned Chats';
    try {
      const allProjects = await conversationStorage.getAllProjects(false);
      const unassignedProjects = allProjects.filter(p => p.name === UNASSIGNED_PROJECT_NAME);
      if (unassignedProjects.length > 0) {
        return unassignedProjects.sort((a, b) => a.createdAt - b.createdAt)[0];
      }
    } catch (error) {
      console.error('[GET_UNASSIGNED] API failed:', error);
      throw error; // Fail loud — no localStorage fallback
    }
    return null;
  },

  // Get unassigned conversations (API-only — no localStorage)
  getUnassignedConversations: async (_forceRefresh: boolean = false): Promise<Conversation[]> => {

    // Get unassigned project ID once (cache it to avoid multiple API calls)
    let unassignedProjectId: string | undefined = undefined;
    try {
      const unassignedProject = await conversationStorage.getUnassignedProject();
      unassignedProjectId = unassignedProject?.id;
    } catch (error) {
      // If we can't get the project, continue without it (will only show truly unassigned)
      console.warn('⚠️ [GET_UNASSIGNED_CONV] Failed to get unassigned project:', error);
    }

    try {
      // Try API first
      const available = await isApiAvailable();
      if (available) {
        try {
          // Get all conversations and filter for unassigned ones
          const response = await apiCall('/conversations', {
            method: 'GET',
          });

          if (Array.isArray(response)) {
            // Filter for conversations without projectId, with null projectId, or in unassigned project (if it exists)
            const unassignedPromises = response
              .filter((conv: any) =>
                !conv.project_id ||
                conv.project_id === null ||
                conv.project_id === '' ||
                (unassignedProjectId && conv.project_id === unassignedProjectId)
              )
              .map((conv: any) => backendConversationToFrontendLightweight(conv));

            const unassigned = await Promise.all(unassignedPromises);
            return unassigned;
          }
        } catch (error) {
          console.error('[GET_UNASSIGNED_CONV] API call failed:', error);
          throw error; // Fail loud — no localStorage fallback
        }
      }
    } catch (error) {
      console.error('[GET_UNASSIGNED_CONV] API check failed:', error);
      throw error;
    }
  },

  // Assign a conversation to a project (API-only — throws on failure)
  assignConversationToProject: async (conversationId: string, projectId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiCall(`/conversations/${conversationId}`, {
        method: 'PUT',
        body: JSON.stringify({ project_id: projectId }),
      });
      if (response && response.success) {
        return { success: true };
      }
      return { success: false, error: 'API returned unexpected response' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ASSIGN] Failed:', msg);
      throw error;
    }
  },

  // Project management (API-only — PostgreSQL is source of truth)
  cleanupDuplicateDefaultProjects: async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const response = await apiCall('/projects/cleanup-duplicates', { method: 'POST' });
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[CLEANUP] Failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  },

  getAllProjects: async (_forceRefresh: boolean = false): Promise<Project[]> => {
    try {
      const response = await apiCall('/projects', { method: 'GET' });
      const projects: Project[] = (response.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : new Date(p.created_at).getTime(),
        archives: [],
      }));
      return projects;
    } catch (error) {
      console.error('[PROJECTS] API failed to load projects:', error);
      throw error; // Fail loud — no localStorage fallback
    }
  },

  saveProject: async (project: Project): Promise<{ success: boolean; error?: string; savedLocally: boolean }> => {
    try {
      await apiCall(`/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: project.name,
          description: project.description ?? null,
          is_archived: false,
        }),
      });
      conversationStorage.setLastModifiedProject(project.id);
      return { success: true, savedLocally: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SAVE_PROJECT] Failed:', msg);
      throw error; // Fail loud — no localStorage fallback
    }
  },

  deleteProject: async (id: string): Promise<void> => {
    const projectName = (await conversationStorage.getAllProjects().catch(() => [])).find(p => p.id === id)?.name || 'Unknown';
    if (projectName === 'Archived Unassigned Chats') {
      alert('Cannot delete "Archived Unassigned Chats". This is a required system project.');
      return;
    }
    try {
      await apiCall(`/projects/${id}`, { method: 'DELETE' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[DELETE_PROJECT] Failed:', msg);
      throw error; // Fail loud
    }
  },

  // Current conversation tracking (in-memory only — session-scoped)
  getCurrentConversationId: (): string | null => {
    return _currentConversationId;
  },

  setCurrentConversationId: (id: string): void => {
    _currentConversationId = id;
  },

  clearInvalidConversationId: async (): Promise<void> => {
    if (!_currentConversationId) return;
    try {
      await apiCall(`/conversations/${_currentConversationId}`);
    } catch {
      console.warn(`Clearing invalid conversation ID: ${_currentConversationId}`);
      _currentConversationId = null;
    }
  },

  // Current project tracking (in-memory only — session-scoped)
  getCurrentProjectId: (): string | null => {
    return _currentProjectId;
  },

  setCurrentProjectId: (id: string): void => {
    _currentProjectId = id;
    conversationStorage.setLastModifiedProject(id);
  },

  // Last modified tracking (in-memory only)
  setLastModifiedProject: (projectId: string): void => {
    _lastModifiedProject = { projectId, timestamp: Date.now() };
  },

  getLastModifiedProject: (): { projectId: string; timestamp: number } | null => {
    return _lastModifiedProject;
  },

  setLastModifiedChat: (conversationId: string, projectId: string): void => {
    _lastModifiedChat = { conversationId, projectId, timestamp: Date.now() };
  },

  getLastModifiedChat: (): { conversationId: string; projectId: string; timestamp: number } | null => {
    return _lastModifiedChat;
  },

  setLastModifiedDraft: (draftName: string): void => {
    _lastModifiedDraft = { draftName, timestamp: Date.now() };
  },

  getLastModifiedDraft: (): { draftName: string; timestamp: number } | null => {
    return _lastModifiedDraft;
  },

  setLastActiveChatForProject: (projectId: string, conversationId: string): void => {
    _lastActiveChats[projectId] = conversationId;
  },

  getLastActiveChatForProject: (projectId: string): string | null => {
    return _lastActiveChats[projectId] || null;
  },

  // Create a new conversation (API-first with localStorage sync)
  createConversation: async (projectId: string, title: string = 'New Conversation', chatMode: 'grace' | 'keeper' = 'grace', tag?: 'trace' | 'variables' | 'tools' | 'general'): Promise<Conversation> => {
    const finalTitle = chatMode === 'keeper' ? `Keeper Chat: ${title}` : title;

    // ── API-first: PostgreSQL is the source of truth ──
    const available = await isApiAvailable();
    if (!available) {
      const err = new Error('API unavailable — cannot create conversation');
      console.error('[ConversationStorage]', err.message);
      Sentry.captureException(err, { tags: { context: 'createConversation:api-unavailable' } });
      throw err;
    }

    try {
      const response = await apiCall('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          title: finalTitle,
          metadata: { chat_mode: chatMode },
        }),
      });

      if (!response || !response.id) {
        const err = new Error('API did not return a valid conversation ID');
        console.error('[ConversationStorage]', err.message, response);
        Sentry.captureException(err, { tags: { context: 'createConversation:invalid-response' }, extra: { response } });
        throw err;
      }

      const conversation: Conversation = {
        id: response.id,
        projectId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title,
        tag: tag || 'general',
      };

      if (projectId) {
        conversationStorage.setLastModifiedProject(projectId);
      }

      return conversation;
    } catch (error) {
      console.error('[ConversationStorage] Failed to create conversation:', error);
      Sentry.captureException(error, {
        tags: { context: 'createConversation:api-call' },
        extra: { projectId, title: finalTitle },
      });
      throw error;
    }
  },

  // Create a new project (API-first with localStorage sync)
  createProject: async (name: string, options?: { description?: string }): Promise<Project> => {
    // Get stack trace to see who called this
    const stack = new Error().stack;
    const caller = stack?.split('\n')[2]?.trim() || 'unknown';

    // BLOCK "Default Project" creation - only "Archived Unassigned Chats" is allowed
    if (name === 'Default Project') {
      console.error('🚨🚨🚨 BLOCKED: "Default Project" creation attempted 🚨🚨🚨');
      console.error('🚨 [PROJECT CREATION] "Default Project" should NOT be created!');
      console.error('🚨 [PROJECT CREATION] All unassigned conversations go to "Archived Unassigned Chats"');
      console.error('🚨 [PROJECT CREATION] Caller:', caller);
      console.error('🚨 [PROJECT CREATION] Stack:', stack);
      throw new Error('Cannot create "Default Project". Use "Archived Unassigned Chats" for unassigned conversations.');
    }

    // Special handling for "Archived Unassigned Chats" - prevent duplicates (API check only)
    if (name === 'Archived Unassigned Chats') {
      try {
        const dbProjectsResp = await apiCall('/projects', { method: 'GET' });
        const dbProjects = dbProjectsResp.projects || [];
        const existingDb = dbProjects.find((p: { name?: string }) => p.name === 'Archived Unassigned Chats');
        if (existingDb) return existingDb;
      } catch (error) {
        console.warn('[PROJECT CREATION] Could not check database for duplicate:', error);
      }
    }

    // ── API-only: PostgreSQL is the source of truth ──
    try {
      const response = await apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description: options?.description || null }),
      });
      if (!response || !response.id) {
        throw new Error('API did not return a valid project ID');
      }
      return {
        id: response.id,
        name,
        description: options?.description || undefined,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error('[CREATE_PROJECT] API failed:', error);
      throw error; // Fail loud — no localStorage fallback
    }
  },

  // Add message to conversation (API-first with localStorage sync)
  addMessage: async (conversationId: string, type: 'question' | 'response', content: string): Promise<void> => {
    try {
      if (!content || !content.trim()) {
        return;
      }

      if (!conversationId || !conversationStorage.isValidUUID(conversationId)) {
        const err = new Error(`Cannot add message: invalid conversation ID "${conversationId}"`);
        console.error('[ConversationStorage]', err.message);
        Sentry.captureException(err, { tags: { context: 'addMessage' }, extra: { conversationId } });
        return;
      }

      const message: Message = {
        id: crypto.randomUUID(),
        type,
        content: content.trim(),
        timestamp: Date.now(),
      };

      // ── API-first: PostgreSQL is the source of truth ──
      const available = await isApiAvailable();
      if (!available) {
        const err = new Error(`API unavailable — cannot persist message to conversation ${conversationId}`);
        console.error('[ConversationStorage]', err.message);
        Sentry.captureException(err, { tags: { context: 'addMessage:api-unavailable' }, extra: { conversationId, type } });
        throw err;
      }

      try {
        const backendMessage = frontendMessageToBackend(message);
        await apiCall(`/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify(backendMessage),
        });
      } catch (apiError) {
        console.error('[ConversationStorage] API failed to add message:', apiError);
        Sentry.captureException(apiError, {
          tags: { context: 'addMessage:api-call' },
          extra: { conversationId, type, messageId: message.id },
        });
        throw apiError;
      }
    } catch (error) {
      console.error(`[ConversationStorage] Failed to add message to conversation ${conversationId}:`, error);
      Sentry.captureException(error, {
        tags: { context: 'addMessage:fatal' },
        extra: { conversationId, type },
      });
    }
  },

  // Get conversation navigation (previous, next, current)
  getConversationNavigation: async (projectId: string, currentConvId?: string) => {
    const conversations = await conversationStorage.getProjectConversations(projectId);
    const sorted = conversations.sort((a, b) => b.createdAt - a.createdAt);

    const currentIndex = currentConvId
      ? sorted.findIndex((c) => c.id === currentConvId)
      : 0;

    return {
      current: currentIndex >= 0 ? sorted[currentIndex] : sorted[0] || null,
      previous: currentIndex > 0 ? sorted[currentIndex - 1] : null,
      next: currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null,
      all: sorted,
    };
  },

  // Archive management (API-only — PostgreSQL is_archived flag)
  getArchives: (_projectId: string): Conversation[] => {
    return []; // Archives are tracked server-side via is_archived flag
  },

  archiveConversation: async (projectId: string, conversationId: string): Promise<void> => {
    try {
      await apiCall(`/conversations/${conversationId}/archive`, { method: 'POST' });
    } catch (error) {
      console.error('[ARCHIVE] Failed:', error);
      throw error;
    }
  },

  unarchiveConversation: async (projectId: string, conversationId: string): Promise<void> => {
    try {
      await apiCall(`/conversations/${conversationId}/unarchive`, { method: 'POST' });
    } catch (error) {
      console.error('[UNARCHIVE] Failed:', error);
      throw error;
    }
  },

  // Utility functions
  isValidUUID: (id: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  },

  generateUUID: (): string => {
    return crypto.randomUUID();
  },

  // ── Deprecated: auto-fix and cleanup functions are no-ops (no localStorage) ──
  autoFixCachedData: async (): Promise<void> => {},
  cleanupInvalidConversationIds: (): void => {},
  clearOldConversations: (): void => {},

  // ── Deprecated: offline queue is no longer used ──
  forceProcessOfflineQueue: async (): Promise<void> => {},
  forceSyncLocalConversations: async (): Promise<void> => {},

  // Generate auto name for conversation based on first question
  generateAutoName: (conversation: Conversation): string => {
    const firstQuestion = conversation.messages?.find(m => m.type === 'question')?.content;
    if (firstQuestion) {
      // Remove common prefixes like "Regarding this specific text from my draft:"
      let cleanedQuestion = firstQuestion.replace(/^Regarding this specific text from my draft:\s*".*?"\s*\n\n/, '');
      cleanedQuestion = cleanedQuestion.replace(/^Regarding this specific text from my draft:\s*/, '');

      // Truncate to a reasonable length, ensuring it ends at a word boundary
      const maxLength = 50;
      if (cleanedQuestion.length > maxLength) {
        let truncated = cleanedQuestion.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 20) { // Ensure we don't cut off too much
          truncated = truncated.substring(0, lastSpace);
        }
        return truncated + '...';
      }
      return cleanedQuestion;
    }
    return 'New Chat';
  },

  // Autosave conversation with auto-generated name (only if it's a new/default conversation)
  autosaveConversation: async (conversationId: string): Promise<void> => {
    try {
      const conversation = await conversationStorage.getConversation(conversationId);
      if (!conversation) {
        console.warn(`⚠️ Autosave failed: Conversation ${conversationId} not found.`);
        return;
      }

      // Only autosave if the conversation still has a default-like title
      const defaultTitles = ['New Prompt', 'New Conversation', 'Keeper Chat: New Conversation', 'Keeper Chat: New Prompt', 'Untitled Prompt'];
      const isDefaultTitle = defaultTitles.some(dt => conversation.title.startsWith(dt));

      if (isDefaultTitle) {
        const autoName = conversationStorage.generateAutoName(conversation);
        if (autoName !== conversation.title) { // Only update if the name is different
          const updatedConversation = { ...conversation, title: autoName };
          await conversationStorage.saveConversation(updatedConversation);

          // Dispatch event to refresh activity lists
          window.dispatchEvent(new Event('conversationUpdated'));
        } else {
        }
      } else {
      }
    } catch (error) {
      console.error(`❌ Failed to autosave conversation ${conversationId}:`, error);
      // Don't re-throw, autosave should be non-blocking
    }
  },
};
