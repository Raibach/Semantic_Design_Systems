// Authentication is disabled for development
// import { getAuthState } from "./authService";

import { systemDiagnostics } from "@/services/systemDiagnostics";
import { API_BASE } from "@/shared/apiHelper";

export interface PromptSection {
  id: string;
  type:
    | "system"
    | "user"
    | "assistant"
    | "tool"
    | "agent"
    | "variable"
    | "select";
  content: string;
  variant?: string;
  metadata?: Record<string, any>;
}

export interface PromptMetadata {
  title: string;
  version?: string;
  tags?: string[];
  promptId?: string;
  author?: string;
  score?: number;
  description?: string;
  category?: string;
  userId?: string;
  conversationId?: string;
  estimatedTokens?: number;
  variables?: Record<
    string,
    {
      defaultValue?: string;
      description?: string;
      type?: string;
    }
  >;
  performanceMetrics?: {
    avgResponseTime?: number;
    successRate?: number;
    avgTokenUsage?: number;
    totalExecutions?: number;
  };
}

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  sections: PromptSection[];
  metadata: PromptMetadata;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  userId: string;
  isActive: boolean;
  isArchived: boolean;
  leftColumnContent?: string;
  compiledOutput?: string;
}

export interface ColumnWidths {
  left: number | null;  // null = flex-based sharing, number = user-resized px
  chat: number;         // always a pixel value (75 when collapsed)
}

export interface PromptSession {
  id: string;
  userId: string;
  conversationId?: string;
  title: string;
  description?: string;
  leftColumnContent?: string;
  compiledOutput?: string;
  isActive: boolean;
  isArchived: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  metadata?: Record<string, any>;
  conversationTitle?: string;
  columnWidths?: ColumnWidths;  // persisted slider positions
  // ── Console card fields (agent-card-element, Figma 40000717:17091) ──
  category?: string;
  categoryColor?: string;
  categoryTitleColor?: string;
  categoryTextColor?: string;
  status?: string;
  likes?: number;
  modelName?: string;
  teamName?: string;
  avatarUrl?: string;
  username?: string;
  author?: string;
}

export interface PromptVersion {
  id: string;
  sessionId: string;
  versionNumber: number;
  leftColumnContent: string;
  compiledOutput?: string;
  changeDescription?: string;
  changeType?: string;
  createdAt: string;
  userId: string;
}

export interface SavePromptRequest {
  title: string;
  description?: string;
  leftColumnContent: string;
  compiledOutput?: string;
  metadata?: {
    version?: string;
    tags?: string[];
    promptId?: string;
    author?: string;
    score?: number;
    category?: string;
    estimatedTokens?: number;
    variables?: Record<string, any>;
    sections?: PromptSection[];
  };
}

export interface SavePromptResponse {
  session: PromptSession;
  version?: PromptVersion;
  error?: string;
}

export interface SearchPromptsRequest {
  query?: string;
  tags?: string[];
  category?: string;
  author?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

// Helper to map backend snake_case to frontend camelCase
function mapSessionFromBackend(raw: any): PromptSession {
  // The backend returns conversations as prompts. The shape is:
  // { id, title, user_id, created_at, updated_at, is_archived, message_count, metadata, project_id }
  return {
    id: raw.id || "",
    title: raw.title || "Untitled",
    description: raw.description || "",
    userId: raw.user_id || raw.userId || "",
    conversationId: raw.conversation_id || raw.conversationId || "",
    leftColumnContent: raw.left_column_content || raw.leftColumnContent || "",
    compiledOutput: raw.compiled_output || raw.compiledOutput || "",
    isActive: raw.is_active ?? raw.isActive ?? !raw.is_archived,
    isArchived: raw.is_archived ?? raw.isArchived ?? false,
    currentVersion: raw.current_version ?? raw.currentVersion ?? raw.message_count ?? 1,
    lastAccessedAt: raw.last_accessed_at || raw.lastAccessedAt || raw.updated_at || raw.updatedAt || "",
    updatedAt: raw.updated_at || raw.updatedAt || "",
    createdAt: raw.created_at || raw.createdAt || "",
    metadata: raw.metadata || {},
    // ── Console card fields from PostgreSQL ──
    category: raw.category || "",
    categoryColor: raw.category_color || raw.categoryColor || "",
    categoryTitleColor: raw.category_title_color || raw.categoryTitleColor || "",
    categoryTextColor: raw.category_text_color || raw.categoryTextColor || "",
    status: raw.status || "Active",
    likes: raw.likes ?? 0,
    modelName: raw.model_name || raw.modelName || "",
    teamName: raw.team_name || raw.teamName || "",
    avatarUrl: raw.avatar_url || raw.avatarUrl || "",
    username: raw.username || "",
    author: raw.author || raw.metadata?.author || "",
    columnWidths: raw.metadata?.column_widths || raw.column_widths || undefined,
  };
}

class PromptService {
  private readonly API_BASE = API_BASE;
  private readonly FRONTEND_API_BASE = API_BASE;

  /**
   * Get API headers (authentication disabled for development)
   */
  private async getHeaders(): Promise<HeadersInit> {
    // Use the development user ID — all backend routes require X-User-ID for RLS
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-User-ID": "00000000-0000-0000-0000-000000000001",
    };

    return headers;
  }

  /**
   * Save a prompt template to the backend.
   *
   * Backend reality (grace_api.py):
   *   POST /api/conversations  → creates conversation record → returns { id, success }
   *   POST /api/prompts/{id}/versions → stores full content as a version → returns { success, version_number, session_id, conversation_id }
   *   GET  /api/prompts         → lists all conversations as agent packages
   *
   * Agent packages live in the conversations table. The prompt_versions table
   * stores the full snapshot (sections, compiled output, metadata) per save.
   */
  async savePromptTemplate(
    name: string,
    sections: PromptSection[],
    metadata: PromptMetadata,
  ): Promise<SavePromptResponse> {
    try {
      const headers = await this.getHeaders();

      // ── Step 1: Create the prompt session (which also creates a conversation) ──
      const sessionResponse = await fetch(`${this.API_BASE}/prompt-sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: name,
          description: metadata.description || null,
        }),
      });

      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        throw new Error(`Failed to create prompt session: ${sessionResponse.status} ${errorText}`);
      }

      const sessionData = await sessionResponse.json();
      const promptSession = sessionData.session;
      const sessionId = promptSession.id;
      const conversationId = promptSession.conversation_id;

      // ── Step 2: Save sections as version 1 ──
      const versionSections = sections.length > 0
        ? sections
        : [{ id: "default", type: "system" as const, content: "" }];

      // Normalize sections to backend format: { section, role, content }
      // consistent with what updatePromptSession produces
      const normalizedSections = versionSections.map(s => ({
        section: s.type,
        role: s.type,
        content: s.content,
      }));
      const leftColumnContent = JSON.stringify({ sections: normalizedSections });

      const versionResponse = await fetch(
        `${this.API_BASE}/prompt-sessions/${sessionId}/versions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            left_column_content: leftColumnContent,
            compiled_output: "",
            change_description: "Initial save",
            change_type: "create",
          }),
        },
      );

      if (!versionResponse.ok) {
        const errorText = await versionResponse.text();
        throw new Error(`Failed to save agent content: ${versionResponse.status} ${errorText}`);
      }

      const versionResult = await versionResponse.json();

      // Build session object
      const session: PromptSession = {
        id: sessionId,
        userId: metadata.userId || "00000000-0000-0000-0000-000000000001",
        title: name,
        description: metadata.description || "",
        leftColumnContent: JSON.stringify({ sections: versionSections }),
        compiledOutput: "",
        conversationId: conversationId,
        metadata: { ...metadata },
        currentVersion: versionResult.version?.version_number || 1,
        isActive: true,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      return { session, version: versionResult };
    } catch (error) {
      console.error("❌ Failed to save agent package:", error);
      throw error;
    }
  }

  /**
   * Get all prompt sessions for the current user
   */
  async getPromptSessions(options?: {
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PromptSession[]> {
    try {
      const headers = await this.getHeaders();

      const params = new URLSearchParams();
      if (options?.includeArchived) params.append("include_archived", "true");
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());

      const url = `${this.API_BASE}/prompts${params.toString() ? `?${params.toString()}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get prompt sessions: ${response.status} ${errorText}`,
        );
      }

      const data = await response.json();
      return (data.prompts || data.sessions || []).map(mapSessionFromBackend);
    } catch (error) {
      console.error("❌ Failed to get prompt sessions:", error);
      throw error;
    }
  }

  /**
   * Get a specific prompt session by ID.
   * Fetches the conversation record, then enriches with latest version content.
   */
  async getPromptSession(sessionId: string): Promise<PromptSession> {
    try {
      const headers = await this.getHeaders();

      // Step 1: Get the prompt session record
      const response = await fetch(
        `${this.API_BASE}/prompt-sessions/${sessionId}`,
        { method: "GET", headers },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get prompt session: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const session = mapSessionFromBackend(data.session || data);

      // Step 2: Try to get the latest version content
      try {
        const versionResp = await fetch(
          `${this.API_BASE}/prompt-sessions/${sessionId}/versions?limit=20`,
          { method: "GET", headers },
        );
        if (versionResp.ok) {
          const versionData = await versionResp.json();
          const versions = versionData.versions || [];
          if (versions.length > 0) {
            // Backend returns versions in DESC order (newest first), so index 0 is the latest
            const latest = versions[0];
            const lc = latest.left_column_content || "";
            session.leftColumnContent = lc || session.leftColumnContent;
            session.currentVersion = latest.version_number || session.currentVersion;
            // compiledOutput = exactly what the latest save captured.
            // An empty value is valid state (prompt never run / output cleared)
            // — do NOT resurrect stale output from older versions.
            session.compiledOutput = latest.compiled_output || "";
          }
        }
      } catch {
        // Version fetch is optional — use conversation data as-is
      }

      return session;
    } catch (error) {
      console.error("❌ Failed to get prompt session:", error);
      throw error;
    }
  }

  /**
   * Get versions for a prompt session
   */
  async getPromptVersions(
    sessionId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<PromptVersion[]> {
    try {
      const headers = await this.getHeaders();

      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());

      const url = `${this.API_BASE}/prompt-sessions/${sessionId}/versions${params.toString() ? `?${params.toString()}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get prompt versions: ${response.status} ${errorText}`,
        );
      }

      const data = await response.json();
      return data.versions || [];
    } catch (error) {
      console.error("❌ Failed to get prompt versions:", error);
      throw error;
    }
  }

  /**
   * Update a prompt session by saving a new version.
   * (No PUT endpoint exists — backend updates the session on each version save.)
   */
  async updatePromptSession(
    sessionId: string,
    updates: {
      title?: string;
      description?: string;
      leftColumnContent?: string;
      compiledOutput?: string;
      conversationId?: string;
      sections?: Array<{ type: string; role?: string; content: string }>;
      metadata?: Record<string, any>;
      isActive?: boolean;
      isArchived?: boolean;
    },
  ): Promise<PromptSession> {
    try {
      const headers = await this.getHeaders();

      // Step 1: Update the session metadata via PUT (including leftColumnContent)
      const sessionUpdates: Record<string, any> = {};
      if (updates.title !== undefined) sessionUpdates.title = updates.title;
      if (updates.description !== undefined) sessionUpdates.description = updates.description;
      if (updates.metadata !== undefined) sessionUpdates.metadata = updates.metadata;
      if (updates.leftColumnContent !== undefined) sessionUpdates.left_column_content = updates.leftColumnContent;
      if (updates.compiledOutput !== undefined) sessionUpdates.compiled_output = updates.compiledOutput;
      if (updates.conversationId !== undefined) sessionUpdates.conversation_id = updates.conversationId;
      if (updates.isActive !== undefined) sessionUpdates.is_active = updates.isActive;
      if (updates.isArchived !== undefined) sessionUpdates.is_archived = updates.isArchived;

      if (Object.keys(sessionUpdates).length > 0) {
        const updateResponse = await fetch(
          `${this.API_BASE}/prompt-sessions/${sessionId}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify(sessionUpdates),
          },
        );
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error(`Failed to update session metadata: ${updateResponse.status} ${errorText}`);
        }
      }

      // Step 2: Parse sections for version save
      let versionSections: Array<{ section: string; role: string; content: string }> = [];
      if (updates.sections && updates.sections.length > 0) {
        versionSections = updates.sections.map((s) => ({ section: s.type, role: s.type, content: s.content }));
      } else if (updates.leftColumnContent) {
        const parsed = this.parsePromptSections(updates.leftColumnContent);
        versionSections = parsed.map((s) => ({ section: s.type, role: s.type, content: s.content }));
      }

      // Step 3: Save as a new version
      const response = await fetch(
        `${this.API_BASE}/prompt-sessions/${sessionId}/versions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            left_column_content: JSON.stringify({ sections: versionSections.length > 0 ? versionSections : [{ section: "system", role: "system", content: "" }] }),
            compiled_output: updates.compiledOutput || "",
            change_description: "Manual save",
            change_type: "manual",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update agent package: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      // Build the leftColumnContent JSON for storage in the returned session
      const storedContent = updates.leftColumnContent || JSON.stringify({ sections: versionSections });

      return {
        id: sessionId,
        userId: "00000000-0000-0000-0000-000000000001",
        title: updates.title || "Untitled",
        description: updates.description || "",
        leftColumnContent: storedContent,
        compiledOutput: updates.compiledOutput || "",
        conversationId: updates.conversationId || undefined,
        metadata: updates.metadata || {},
        currentVersion: result.version?.version_number || 1,
        isActive: updates.isActive ?? true,
        isArchived: updates.isArchived ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to update agent package:", error);
      throw error;
    }
  }

  /**
   * Save a new version of a prompt
   */
  async savePromptVersion(
    sessionId: string,
    leftColumnContent: string,
    compiledOutput?: string,
    changeDescription?: string,
    changeType?: string,
  ): Promise<PromptVersion> {
    try {
      const headers = await this.getHeaders();

      const response = await fetch(
        `${this.API_BASE}/prompt-sessions/${sessionId}/versions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            left_column_content: leftColumnContent,
            compiled_output: compiledOutput,
            change_description: changeDescription || "Updated version",
            change_type: changeType || "update",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to save prompt version: ${response.status} ${errorText}`,
        );
      }

      const data = await response.json();
      return data.version;
    } catch (error) {
      console.error("❌ Failed to save prompt version:", error);
      throw error;
    }
  }

  /**
   * Search prompt sessions
   */
  async searchPrompts(request: SearchPromptsRequest): Promise<PromptSession[]> {
    try {
      const headers = await this.getHeaders();

      // For now, get all sessions and filter client-side
      // TODO: Implement server-side search when backend supports it
      const sessions = await this.getPromptSessions({
        includeArchived: request.includeArchived,
        limit: request.limit || 100,
        offset: request.offset || 0,
      });

      // Client-side filtering
      return sessions.filter((session) => {
        const metadata = session.metadata || {};

        // Text search
        if (request.query) {
          const query = request.query.toLowerCase();
          const matchesTitle = session.title.toLowerCase().includes(query);
          const matchesDescription =
            session.description?.toLowerCase().includes(query) || false;
          const matchesMetadata = JSON.stringify(metadata)
            .toLowerCase()
            .includes(query);

          if (!matchesTitle && !matchesDescription && !matchesMetadata) {
            return false;
          }
        }

        // Tag filtering
        if (request.tags && request.tags.length > 0) {
          const sessionTags = metadata.tags || [];
          const hasAllTags = request.tags.every((tag) =>
            sessionTags.includes(tag),
          );
          if (!hasAllTags) return false;
        }

        // Category filtering
        if (request.category && metadata.category !== request.category) {
          return false;
        }

        // Author filtering
        if (request.author && metadata.author !== request.author) {
          return false;
        }

        return true;
      });
    } catch (error) {
      console.error("❌ Failed to search prompts:", error);
      throw error;
    }
  }

  /**
   * Delete a prompt session (soft delete by archiving)
   */
  async deletePromptSession(
    sessionId: string,
    permanent: boolean = false,
  ): Promise<boolean> {
    try {
      const headers = await this.getHeaders();

      const response = await fetch(
        `${this.API_BASE}/prompt-sessions/${sessionId}?permanent=${permanent}`,
        {
          method: "DELETE",
          headers,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to delete prompt session: ${response.status} ${errorText}`,
        );
      }

      return true;
    } catch (error) {
      console.error("❌ Failed to delete prompt session:", error);
      throw error;
    }
  }

  /**
   * Restore a prompt session from archive
   */
  async restorePromptSession(sessionId: string): Promise<PromptSession> {
    try {
      return await this.updatePromptSession(sessionId, {
        isArchived: false,
      });
    } catch (error) {
      console.error("❌ Failed to restore prompt session:", error);
      throw error;
    }
  }

  /**
   * Get prompt session statistics
   */
  async getPromptStats(): Promise<{
    total: number;
    active: number;
    archived: number;
    byCategory: Record<string, number>;
    recentActivity: Array<{ date: string; count: number }>;
  }> {
    try {
      const sessions = await this.getPromptSessions({ includeArchived: true });

      const stats = {
        total: sessions.length,
        active: sessions.filter((s) => s.isActive && !s.isArchived).length,
        archived: sessions.filter((s) => s.isArchived).length,
        byCategory: {} as Record<string, number>,
        recentActivity: [] as Array<{ date: string; count: number }>,
      };

      // Count by category
      sessions.forEach((session) => {
        const category = session.metadata?.category || "Uncategorized";
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      });

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentSessions = sessions.filter(
        (s) => new Date(s.updatedAt) >= sevenDaysAgo,
      );

      // Group by day
      const activityByDay: Record<string, number> = {};
      recentSessions.forEach((session) => {
        const date = new Date(session.updatedAt).toISOString().split("T")[0];
        activityByDay[date] = (activityByDay[date] || 0) + 1;
      });

      stats.recentActivity = Object.entries(activityByDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => b.date.localeCompare(a.date));

      return stats;
    } catch (error) {
      console.error("❌ Failed to get prompt stats:", error);
      throw error;
    }
  }

  /**
   * Serialize prompt sections to string format for storage
   */
  serializePromptSections(sections: PromptSection[]): string {
    return sections
      .map((section) => {
        const header = `[${section.type.toUpperCase()}]${section.variant ? ` (${section.variant})` : ""}`;
        return `${header}\n${section.content}\n`;
      })
      .join("\n");
  }

  /**
   * Parse prompt sections from stored content.
   * Handles both plain JSON ({sections: [{name, content}]}) and legacy
   * bracketed format ([SECTION]\ncontent\n...).
   */
  parsePromptSections(content: string): PromptSection[] {
    // ── Try JSON format first ──
    try {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.sections)) {
        return parsed.sections.map((s: any, i: number) => {
          // Handle both frontend format {name, content} and backend format {section, role, content}
          const sectionName = s.name || s.section || s.role || 'unknown';
          return {
            id: `${sectionName}-${i}`,
            type: sectionName.toLowerCase().replace(/\s+/g, '_').replace(/_role$/, '') as PromptSection["type"],
            content: s.content || '',
          };
        });
      }
    } catch {
      // Not JSON — fall through to legacy bracketed parser
    }

    // ── Legacy bracketed format: [SECTION]\ncontent\n[SECTION]\ncontent ──
    const sections: PromptSection[] = [];
    const lines = content.split("\n");

    let currentSection: Partial<PromptSection> = {};
    let currentContent: string[] = [];

    for (const line of lines) {
      // Check if line starts a new section
      const sectionMatch = line.match(/^\[([A-Z_]+)\](?:\s*\(([^)]+)\))?$/);

      if (sectionMatch) {
        // Save previous section if exists
        if (currentSection.type && currentContent.length > 0) {
          sections.push({
            id: `${currentSection.type}-${sections.length}`,
            type: currentSection.type as PromptSection["type"],
            content: currentContent.join("\n").trim(),
            variant: currentSection.variant,
          });
        }

        // Start new section
        const [, type, variant] = sectionMatch;
        currentSection = {
          type: type.toLowerCase() as PromptSection["type"],
          variant: variant || undefined,
        };
        currentContent = [];
      } else if (currentSection.type) {
        // Add to current section content
        currentContent.push(line);
      }
    }

    // Add the last section
    if (currentSection.type && currentContent.length > 0) {
      sections.push({
        id: `${currentSection.type}-${sections.length}`,
        type: currentSection.type as PromptSection["type"],
        content: currentContent.join("\n").trim(),
        variant: currentSection.variant,
      });
    }

    return sections;
  }

  /**
   * Estimate token count for prompt sections
   */
  private estimateTokens(sections: PromptSection[]): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    const totalChars = sections.reduce(
      (sum, section) => sum + section.content.length,
      0,
    );
    return Math.ceil(totalChars / 4);
  }

  /**
   * Extract metadata from DOM elements
   */
  extractPromptMetadata(): PromptMetadata {
    // Try to get metadata from the header
    const titleElement = document.querySelector(
      '[id*="PROMPT_TITLE"], [class*="prompt-title"]',
    );
    const versionElement = document.querySelector(
      '[id*="VERSION"], [id*="version"]',
    );
    const tagsElement = document.querySelector('[id*="TAGS"], [id*="tags"]');
    const idElement = document.querySelector('[id*="ID"], [id*="prompt-id"]');
    const authorElement = document.querySelector(
      '[id*="AUTHOR"], [id*="author"]',
    );
    const scoreElement = document.querySelector('[id*="SCORE"], [id*="score"]');

    // Extract text content
    const title =
      titleElement?.textContent?.replace("prompt_title:", "").trim() ||
      "Untitled Prompt";
    const version = versionElement?.textContent?.trim() || "Editing Version 1";
    const tagsText = tagsElement?.textContent?.trim() || "No tags";
    const idText =
      idElement?.textContent?.replace("ID:", "").trim() || "PR-0000";
    const authorText =
      authorElement?.textContent?.replace("Author:", "").trim() || "Unknown";
    const scoreText =
      scoreElement?.textContent?.replace("Score:", "").trim() || "N/A";

    // Parse tags
    const tags =
      tagsText === "No tags" || tagsText === "No tags +"
        ? []
        : tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag);

    // Parse score
    const score = scoreText === "N/A" ? undefined : parseFloat(scoreText);

    // Extract version number
    const versionMatch = version.match(/Version\s+(\d+)/);
    const versionNumber = versionMatch ? parseInt(versionMatch[1]) : 1;

    return {
      title,
      version,
      tags,
      promptId: idText,
      author: authorText,
      score,
      description: `Prompt ${idText}: ${title}`,
      category: "Engineering", // Default category, can be enhanced
      estimatedTokens: 1500, // Default estimate
      variables: {}, // Will be extracted from prompt content
    };
  }

  /**
   * Extract variables from prompt content
   */
  extractVariables(
    content: string,
  ): Record<
    string,
    { defaultValue?: string; description?: string; type?: string }
  > {
    const variables: Record<
      string,
      { defaultValue?: string; description?: string; type?: string }
    > = {};

    // Find all {variable} patterns
    const variablePattern = /\{([^}]+)\}/g;
    let match;

    while ((match = variablePattern.exec(content)) !== null) {
      const variableName = match[1];
      if (!variables[variableName]) {
        variables[variableName] = {
          defaultValue: "",
          description: `Variable: ${variableName}`,
          type: "string",
        };
      }
    }

    return variables;
  }

  /**
   * Collect all prompt data from the UI
   */
  async collectPromptData(): Promise<{
    sections: PromptSection[];
    metadata: PromptMetadata;
    leftColumnContent: string;
  }> {
    // Extract metadata from header
    const metadata = this.extractPromptMetadata();

    // Collect sections from the prompt composer
    const sections = this.collectPromptSectionsFromUI();

    // Serialize sections
    const leftColumnContent = this.serializePromptSections(sections);

    // Extract variables from content
    const variables = this.extractVariables(leftColumnContent);
    metadata.variables = variables;

    // Update estimated tokens
    metadata.estimatedTokens = this.estimateTokens(sections);

    return {
      sections,
      metadata,
      leftColumnContent,
    };
  }

  /**
   * Collect prompt sections from the UI
   */
  collectPromptSectionsFromUI(): PromptSection[] {
    const sections: PromptSection[] = [];

    // Get the left column container
    const leftColumn = document.querySelector(
      '[data-ui-id="layout.leftColumn"]',
    );

    if (!leftColumn) {
      console.warn("Left column not found");
      return sections;
    }

    // Find all role sections
    const roleSections = leftColumn.querySelectorAll(
      '[data-role-type], [class*="role"], [class*="section"], [class*="content"]',
    );

    roleSections.forEach((section, index) => {
      // Determine section type
      let type = "unknown";
      const variant = "";

      // Check data attributes and classes for type
      const roleType = section.getAttribute("data-role-type");
      const className = section.className || "";

      if (roleType) {
        // Normalize: "System Role" → "system", "User Role" → "user", etc.
        type = roleType.toLowerCase().replace(' role', '');
      } else if (
        className.includes("system-role") ||
        className.includes("SystemRole")
      ) {
        type = "system";
      } else if (
        className.includes("user-role") ||
        className.includes("UserRole")
      ) {
        type = "user";
      } else if (
        className.includes("agent-role") ||
        className.includes("AgentRole")
      ) {
        type = "agent";
      } else if (
        className.includes("tool-call") ||
        className.includes("ToolCall")
      ) {
        type = "tool";
      } else if (
        className.includes("variable") ||
        className.includes("Variable")
      ) {
        type = "variable";
      } else if (
        className.includes("select-role") ||
        className.includes("SelectRole")
      ) {
        type = "select";
      }

      // Find textarea content within the section
      const textarea = section.querySelector("textarea");
      const content = textarea ? textarea.value.trim() : "";

      if (content) {
        sections.push({
          id: `${type}-${index}`,
          type: type as PromptSection["type"],
          content,
          variant: variant || undefined,
        });
      }
    });

    return sections;
  }

  /**
   * Save current prompt with all metadata
   */
  async saveCurrentPrompt(
    name?: string,
    description?: string,
  ): Promise<SavePromptResponse> {
    try {
      // Collect all data from UI
      const { sections, metadata, leftColumnContent } =
        await this.collectPromptData();

      // Use provided name or extracted title
      const promptName = name || metadata.title;

      // Save to backend
      return await this.savePromptTemplate(promptName, sections, {
        ...metadata,
        description: description || metadata.description,
      });
    } catch (error) {
      console.error("❌ Failed to save current prompt:", error);
      throw error;
    }
  }

  /**
   * Load a prompt template into the UI
   */
  async loadPromptTemplate(sessionId: string): Promise<void> {
    try {
      // Get the prompt session
      const session = await this.getPromptSession(sessionId);

      if (!session.leftColumnContent) {
        throw new Error("Prompt session has no content");
      }

      // Parse sections from stored content
      const sections = this.parsePromptSections(session.leftColumnContent);

      // TODO: Implement UI loading logic
      // This would involve:
      // 1. Clearing current prompt composer
      // 2. Creating sections for each parsed section
      // 3. Populating textareas with content
      // 4. Updating header metadata

      console.log("Loaded prompt template:", {
        id: session.id,
        title: session.title,
        sections: sections.length,
      });

      // Dispatch event to notify other components
      window.dispatchEvent(
        new CustomEvent("prompt-template-loaded", {
          detail: {
            sessionId: session.id,
            title: session.title,
            sections,
            metadata: session.metadata,
          },
        }),
      );
    } catch (error) {
      console.error("❌ Failed to load prompt template:", error);
      throw error;
    }
  }
}

// Create singleton instance
export const promptService = new PromptService();
