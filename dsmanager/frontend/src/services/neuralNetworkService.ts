// Neural Network Service - LM Studio Connection via Backend Proxy
const BACKEND_URL = `${import.meta.env.VITE_API_URL || ''}/api/teacher/query`;

/**
 * Strip system scaffolding from AI responses.
 *
 * IMPORTANT: This only strips system scaffolding tags that are NEVER meant for UI processing:
 * - <a2ui_surface> wrappers (console/session assembly format)
 * - <system_instructions> blocks (echoed system prompts)
 * - <execution_context> blocks (internal context markers)
 *
 * Workspace control tags like <update_agent>, <update_user>, <update_tool>, etc.
 * are PRESERVED here so InteractiveChatInterface can process them before displaying.
 */
function stripSystemScaffolding(content: string): string {
  if (!content) return content;

  // Remove <a2ui_surface>...</a2ui_surface> wrapper blocks (assembly format)
  let cleaned = content.replace(/<a2ui_surface>[\s\S]*?<\/a2ui_surface>/gi, '');

  // Remove system instruction blocks that shouldn't be visible (echoed prompts)
  cleaned = cleaned.replace(/<system_instructions>[\s\S]*?<\/system_instructions>/gi, '');
  cleaned = cleaned.replace(/<execution_context>[\s\S]*?<\/execution_context>/gi, '');

  // Remove update_components tags (used by assembly endpoints, not chat)
  cleaned = cleaned.replace(/<update_components[^>]*\/>/gi, '');
  cleaned = cleaned.replace(/<update_components[^>]*>[\s\S]*?<\/update_components>/gi, '');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

export interface LMResponse {
  content: string;
  error?: string;
  conversation_id?: string;
}

export interface QueryOptions {
  temperature?: number;
  mode?: 'chat' | 'prompt_output';
  reasoningStyle?: 'chain_of_thought' | 'reflexion' | 'zero_shot' | 'default';
  selfReflection?: boolean;
  includeMemory?: boolean;
  projectId?: string;  // Project ID for memory retrieval
  conversationId?: string;  // Conversation ID so model can update title in database
  sessionId?: string;  // Package (prompt_session) this chat belongs to — REQUIRED to start a new conversation
  tab?: 'chat' | 'trace' | 'tools';  // Which chat-column tab the conversation lives in
  editorial?: {
    enabled?: boolean;
    detectChatGPTPatterns?: boolean;
    stance?: 'collaborative' | 'directive' | 'suggestive';
    voicePreservationPriority?: 'high' | 'medium' | 'low';
    structuralCritique?: boolean;
    askObjectiveFirst?: boolean;
  };
}

export const neuralNetworkService = {
  // Query the neural network via backend proxy only (avoid browser CORS to LM Studio)
  query: async (question: string, context?: string, options?: QueryOptions): Promise<LMResponse> => {
    try {
      // Get API key from auth service
      const { getApiKey } = await import('./authService');
      const apiKey = getApiKey();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }
      
      // Calculate timeout based on input size (matches backend logic)
      // Large contexts need more time, but prevent indefinite hangs
      const inputLength = (question?.length || 0) + (context?.length || 0);
      let timeoutMs = 180000; // 3 minutes default (allows for complex queries)
      if (inputLength > 50000) {
        timeoutMs = 300000; // 5 minutes for very large inputs (PDFs, long documents)
      } else if (inputLength > 20000) {
        timeoutMs = 240000; // 4 minutes for long entries
      }
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            question,
            context,
            mode: options?.mode || 'chat',
            reasoning: true,
            reasoningStyle: options?.reasoningStyle || 'chain_of_thought',
            includeMemory: options?.includeMemory ?? true,  // Enable memory by default
            project_id: options?.projectId,  // Send project ID for memory retrieval
            conversation_id: options?.conversationId,  // Send conversation ID so model can update title
            session_id: options?.sessionId,  // Package scope — backend requires this to create a conversation
            tab: options?.tab || 'chat',  // Chat-column tab for new conversations
            temperature: options?.temperature || 0.45,
            selfReflection: options?.selfReflection ?? false,
            editorial: options?.editorial || {
              enabled: true,
              detectChatGPTPatterns: true,
              stance: 'collaborative',
              voicePreservationPriority: 'high',
              structuralCritique: false,
              askObjectiveFirst: true,
            }
          }),
          signal: controller.signal, // Add timeout signal
        });
        
        clearTimeout(timeoutId); // Clear timeout if request completes

      let raw = '';
      let parsed: any = null;
      try {
        raw = await response.clone().text();
        parsed = raw ? JSON.parse(raw) : null;
      } catch {}

      if (!response.ok) {
        const message = (parsed && (parsed.error || parsed.message)) || raw || `Backend error: ${response.status}`;
        return { content: '', error: message };
      }

      if (!parsed) {
        try { parsed = await response.json(); } catch {}
      }

        const rawContent = (parsed && parsed.content) || '';
        const content = stripSystemScaffolding(rawContent);  // Strip system scaffolding, preserve workspace commands
        const conversation_id = (parsed && parsed.conversation_id) || undefined;
        return { content, conversation_id };
      } catch (fetchError) {
        clearTimeout(timeoutId); // Ensure timeout is cleared
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return { 
            content: '', 
            error: `Request timeout after ${timeoutMs / 1000}s. The model may be processing a complex query. Please try again or reduce the context size.` 
          };
        }
        throw fetchError; // Re-throw other errors
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { content: '', error: `Connection Error: ${errorMessage}` };
    }
  },

  // Check if service is available
  // Health check ping removed — availability is assumed; query errors are handled in-call
  isAvailable: async (): Promise<boolean> => {
    return true;
  },
};
