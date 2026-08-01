import { API_BASE } from "@/shared/apiHelper";
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as Sentry from "@sentry/react";
import { motion, AnimatePresence } from 'motion/react';
import { getImageUrl, getImageAlt } from '@/components/lit/a2ui-image-catalog';
import gripperChatBarHorizontal from 'figma:asset/84b716f5030a9e09ce034d9d633efe23a4440f3d.png';
// import { TraceTree } from './TraceTree'; // replaced with live version data
// import { traceMessages } from './tabMessagesData';
import { groundingMetricsSample, groundingMetricsDrifting, buildMetricBars } from './tabMessagesData';
import type { GroundingMetrics, MetricBar } from './types';
import { ApprovalQueueItem, type ApprovalItem } from './ApprovalQueueItem';
// SidebarNavigation replaced by Lit A2UI <chat-navigation-bar> web component
import '@/components/lit/chat-navigation-bar';
import type { ChatNavigationBar, TabChangeEventDetail, CollapseToggleEventDetail, TabId } from '@/components/lit/chat-navigation-bar';
import { TraceFeed } from './TraceFeed';
import { neuralNetworkService } from '@/services/neuralNetworkService';
import { conversationStorage, type Conversation } from '@/services/conversationStorage';
import { eventBus } from '@/shared/event-bus';
import { getAuthState } from '@/services/authService';

// Sample approval queue items
const approvalQueueItems: ApprovalItem[] = [
  { id: 'appr-001', promptName: 'Customer Onboarding Automation', version: '3.2', submittedBy: 'Sarah Chen', submittedAt: '2 hours ago', priority: 'high', riskLevel: 'medium', category: 'Sales', estimatedCost: '$0.15/exec', status: 'pending', description: 'Automated onboarding sequence with personalized welcome messages and product recommendations based on customer segment.' },
  { id: 'appr-002', promptName: 'Contract Risk Analysis', version: '2.1', submittedBy: 'Marcus Rodriguez', submittedAt: '4 hours ago', priority: 'high', riskLevel: 'high', category: 'Legal', estimatedCost: '$0.42/exec', status: 'flagged', description: 'AI-powered contract review that identifies potential risks, missing clauses, and suggests modifications for compliance.' },
  { id: 'appr-003', promptName: 'Product FAQ Generator', version: '1.8', submittedBy: 'Emily Watson', submittedAt: '5 hours ago', priority: 'medium', riskLevel: 'low', category: 'Support', estimatedCost: '$0.08/exec', status: 'pending', description: 'Generates comprehensive FAQ entries from product documentation and customer support tickets.' },
  { id: 'appr-004', promptName: 'Code Review Assistant', version: '4.0', submittedBy: 'Dev Team', submittedAt: '7 hours ago', priority: 'medium', riskLevel: 'low', category: 'Engineering', estimatedCost: '$0.22/exec', status: 'in-review', description: 'Reviews pull requests for security vulnerabilities, code quality issues, and suggests improvements with examples.' },
  { id: 'appr-005', promptName: 'Competitive Intelligence Report', version: '2.5', submittedBy: 'John Park', submittedAt: '1 day ago', priority: 'low', riskLevel: 'medium', category: 'Strategy', estimatedCost: '$0.65/exec', status: 'pending', description: 'Analyzes competitor websites, product announcements, and market positioning to generate strategic insights.' },
  { id: 'appr-006', promptName: 'Email Campaign Optimizer', version: '1.3', submittedBy: 'Marketing Ops', submittedAt: '1 day ago', priority: 'medium', riskLevel: 'low', category: 'Marketing', estimatedCost: '$0.12/exec', status: 'pending', description: 'Optimizes email subject lines, body copy, and CTAs based on historical performance data and A/B test results.' },
  { id: 'appr-007', promptName: 'Financial Forecasting Model', version: '3.1', submittedBy: 'Finance Team', submittedAt: '2 days ago', priority: 'high', riskLevel: 'high', category: 'Finance', estimatedCost: '$0.88/exec', status: 'flagged', description: 'Generates quarterly revenue forecasts using historical data, market trends, and economic indicators.' },
  { id: 'appr-008', promptName: 'Customer Sentiment Analysis', version: '2.0', submittedBy: 'CX Team', submittedAt: '2 days ago', priority: 'low', riskLevel: 'low', category: 'Support', estimatedCost: '$0.06/exec', status: 'pending', description: 'Analyzes customer feedback from surveys, reviews, and support tickets to identify trends and actionable insights.' },
  { id: 'appr-009', promptName: 'Product Naming Assistant', version: '1.0', submittedBy: 'Product Team', submittedAt: '3 days ago', priority: 'low', riskLevel: 'low', category: 'Product', estimatedCost: '$0.18/exec', status: 'in-review', description: 'Generates creative product names with trademark availability checks and brand alignment scoring.' },
  { id: 'appr-010', promptName: 'Incident Response Guide', version: '2.3', submittedBy: 'Security Team', submittedAt: '3 days ago', priority: 'high', riskLevel: 'medium', category: 'Security', estimatedCost: '$0.34/exec', status: 'pending', description: 'Provides step-by-step incident response guidance based on threat type, severity, and organizational protocols.' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionVersion {
  id: string;
  version_number: number;
  change_description: string;
  change_type: string;
  created_at: string;
  overall_score?: number | null;
  left_column_content?: string;
  source?: 'postgres' | 'milvus';
}

interface PostgresVersionResponse {
  versions?: SessionVersion[];
}

interface MilvusVersionRecord {
  id: string | number;
  version_number: number;
  saved_at?: string;
  content_full?: string;
  content?: string;
}

interface MilvusVersionsResponse {
  status?: string;
  versions?: MilvusVersionRecord[];
}

interface InteractiveChatInterfaceProps {
  onConversationChange?: (conversationId: string | null) => void;
  /** Active prompt session (package) ID — conversations are package-owned and scoped to this */
  sessionId?: string | null;
  /** Latest output from the Run pipeline — assistant auto-analyzes on change */
  compiledOutput?: string;
  /** Whether a Run is currently streaming */
  isRunning?: boolean;
}

export function InteractiveChatInterface({ onConversationChange, sessionId, compiledOutput, isRunning }: InteractiveChatInterfaceProps = {}) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [inputHeight, setInputHeight] = useState(180);
  const [isDragging, setIsDragging] = useState(false);
  const [isRightColumnCollapsed, setIsRightColumnCollapsed] = useState(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);
  const [chatInput, setChatInput] = useState('');
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showConvDropdown, setShowConvDropdown] = useState(false);
  const handleSendRef = useRef<(overrideText?: string) => void>(() => {});
  // ── Request deduplication: prevent conversation fetch storms ──
  const isConversationsLoadingRef = useRef(false);
  const conversationsLoadedRef = useRef(false); // Track if we've loaded at least once
  // ── Prevent infinite loop: track last reported conversation ID + throttle ──
  const lastReportedConvIdRef = useRef<string | null>(null);
  const convChangeThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const threshold = 30;
    const isAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) <= threshold;
    isAtBottomRef.current = isAtBottom;
  };

  // ── Auto-analyze output when Run completes ────────────────────────
  const prevRunningRef = useRef(isRunning);
  useEffect(() => {
    // Detect transition: was running → now stopped, and output exists
    if (prevRunningRef.current && !isRunning && compiledOutput?.trim()) {
      // Auto-send an analysis prompt to the assistant
      const analysisPrompt = `The user just ran a prompt and got this output. Analyze it and give feedback — what's good, what could be improved, any issues:

${compiledOutput.slice(0, 3000)}`;
      handleSendRef.current(analysisPrompt);
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, compiledOutput]);

  // ── Notify parent of conversation changes (with loop prevention + throttle) ──
  useEffect(() => {
    // Only notify if the conversation ID actually changed
    if (currentConversationId !== lastReportedConvIdRef.current) {
      // Clear any pending throttled call
      if (convChangeThrottleRef.current) {
        clearTimeout(convChangeThrottleRef.current);
      }
      // Throttle: wait 100ms before notifying parent (debounce rapid changes)
      convChangeThrottleRef.current = setTimeout(() => {
        lastReportedConvIdRef.current = currentConversationId;
        onConversationChange?.(currentConversationId);
      }, 100);
    }
    // Cleanup on unmount
    return () => {
      if (convChangeThrottleRef.current) {
        clearTimeout(convChangeThrottleRef.current);
      }
    };
    // Note: intentionally omitting onConversationChange from deps to prevent
    // infinite loops when parent creates a new callback reference on each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]);

  // ══════════════════════════════════════════════════════════════════════════
  // NO STARTUP GREETING (owner directive: no welcome messages).
  // The AI speaks only when the user initiates. No automatic LLM calls on mount.
  // ══════════════════════════════════════════════════════════════════════════

  const scrollToLatest = () => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'auto' });
    isAtBottomRef.current = true;
  };

  // ResizeObserver: auto-scroll during streaming, freezes on manual scroll-up
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── NO AUTO-LOAD (owner directive): conversations load COLLAPSED.
  // The user picks one from the dropdown — nothing opens automatically.
  const [selectedNav, setSelectedNav] = useState('chat');
  const [showApprovalQueue, setShowApprovalQueue] = useState(false);
  const [currentGroundingMetrics, setCurrentGroundingMetrics] = useState<GroundingMetrics>(groundingMetricsSample);
  const metricBars = useMemo<MetricBar[]>(() => buildMetricBars(currentGroundingMetrics), [currentGroundingMetrics]);
  const [traceHistoryCollapsed, setTraceHistoryCollapsed] = useState(true);

  // ── ROLE-BASED ACCESS: fetch user's departmental role + capability set ──
  // Drives which tabs are visible in <chat-navigation-bar> and which
  // governance views are accessible. Falls back to 'basic' on error.
  // See frontend/src/shared/role-caps.ts for the persona matrix.
  const [allowedTabs, setAllowedTabs] = useState<string>('chat,trace,tools');
  const [userRole, setUserRole] = useState<string>('basic');
  const [roleCaps, setRoleCaps] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { userId } = getAuthState();
        const res = await fetch(`${API_BASE}/ai/role-capabilities`, {
          headers: { 'X-User-ID': userId || '' },
        });
        if (res.ok) {
          const data = await res.json();
          const caps = data.capabilities || {};
          setUserRole(data.role || 'basic');
          setRoleCaps(caps);
          const tabs = caps.tabs || ['chat'];
          setAllowedTabs(tabs.join(','));
          // If the current tab isn't in the allowed list, snap to 'chat'
          if (!tabs.includes(selectedNav)) {
            setSelectedNav('chat');
          }
        }
      } catch (e) {
        // Fall back to dev defaults — don't block rendering
        console.warn('[RoleCaps] Could not fetch role, using dev defaults', e);
      }
    };
    fetchRole();
  }, []);

  // ── Ref to the Lit <chat-navigation-bar> element ──────────────────────
  const navBarRef = useRef<ChatNavigationBar | null>(null);

  // ── Listen for collapse-chat event — save closes into list item ──
  useEffect(() => {
    const handler = async () => {
      // ✅ DEDUP: Skip if already loading conversations
      if (isConversationsLoadingRef.current) {
        console.log('[Chat] Skipping conversation reload - already in flight');
        setChatMessages([]);
        setCurrentConversationId(null);
        return;
      }

      // Reload the package's conversations so the saved one appears in the list
      isConversationsLoadingRef.current = true;
      try {
        const all = sessionId
          ? await conversationStorage.getSessionConversations(sessionId)
          : [];
        setConversations((all || []).filter(Boolean).sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ));
        conversationsLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to reload conversations after collapse-chat:', error);
      } finally {
        isConversationsLoadingRef.current = false;
      }
      // Collapse: clear messages and reset conversation
      setChatMessages([]);
      setCurrentConversationId(null);
    };
    window.addEventListener('collapse-chat', handler);
    return () => window.removeEventListener('collapse-chat', handler);
  }, []);
  useEffect(() => {
    const handler = (e: Event) => {
      const { emptySections, sectionList } = (e as CustomEvent).detail;
      const sectionNames: string[] = emptySections || [];
      // Build message with remove buttons
      const buttonLines = sectionNames.map((s: string) => `[Remove "${s}"](action:remove_role:${encodeURIComponent(s)})`).join('  ');
      const msg = `**Run blocked.** ${sectionNames.length > 1 ? 'These sections are' : 'This section is'} empty: ${sectionList}.\n\nFill ${sectionNames.length > 1 ? 'them' : 'it'} in, or click below to remove:\n\n${buttonLines}\n\nReply with "remove [section name]" or click a button.`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: msg }]);
    };
    window.addEventListener('run-blocked', handler);
    return () => window.removeEventListener('run-blocked', handler);
  }, []);

  // ── System messages (save errors, etc.) routed to chat instead of toasts ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { role, content } = (e as CustomEvent).detail;
      setChatMessages(prev => [...prev, { role: role || 'assistant', content }]);
    };
    window.addEventListener('a2ui:system-message', handler);
    return () => window.removeEventListener('a2ui:system-message', handler);
  }, []);

  // ── Edit activity log (circular buffer of last 10 actions) ──────────
  const editLogRef = useRef<Array<{ts: number; action: string; section: string; preview: string}>>([]);
  const trackEdit = (action: string, section: string, preview: string) => {
    editLogRef.current.push({ts: Date.now(), action, section, preview: preview.slice(0, 80)});
    if (editLogRef.current.length > 10) editLogRef.current.shift();
  };

  // Listen for textarea edits on the left column
  useEffect(() => {
    const handleInput = (e: Event) => {
      const ta = e.target as HTMLTextAreaElement;
      const section = ta.getAttribute('placeholder') || ta.getAttribute('aria-label') || ta.closest('[data-section-name]')?.getAttribute('data-section-name') || 'prompt';
      trackEdit('edited', section, ta.value.slice(-50));
    };
    const textareas = document.querySelectorAll('[data-section-container] textarea, [data-section-name] textarea');
    textareas.forEach(ta => ta.addEventListener('input', handleInput));
    return () => { textareas.forEach(ta => ta.removeEventListener('input', handleInput)); };
  }, []);

  const [selectedVersionEntry, setSelectedVersionEntry] = useState<{ id: string; version_number: number; change_description: string; created_at: string; overall_score?: number | null; left_column_content?: string } | null>(null);

  // Real data scoped to the current prompt session
  const [sessionVersions, setSessionVersions] = useState<SessionVersion[]>([]);
  const [promptVariables, setPromptVariables] = useState<Array<{ name: string; section: string; value: string }>>([]);
  const [promptTools, setPromptTools] = useState<Array<{ name: string; content: string }>>([]);

  // Scan left column for {variable} tokens and tool section content
  const scanPromptContent = () => {
    const sections = document.querySelectorAll('[data-section-name]');
    const vars: Array<{ name: string; section: string; value: string }> = [];
    const tools: Array<{ name: string; content: string }> = [];
    const seen = new Set<string>();

    sections.forEach(el => {
      const sectionName = el.getAttribute('data-section-name') || '';
      const content = (el as HTMLElement).textContent || (el as HTMLTextAreaElement).value || '';
      // Extract {token} and {{token}} variable patterns
      const matches = content.matchAll(/\{+([a-zA-Z_][a-zA-Z0-9_ ]*)\}+/g);
      for (const m of matches) {
        const name = m[1].trim();
        if (!seen.has(name)) {
          seen.add(name);
          vars.push({ name, section: sectionName, value: '' });
        }
      }
      // Tool Call section → extract tool definitions
      if (sectionName.toLowerCase().includes('tool')) {
        const toolNameMatch = content.match(/Tool Name:\s*(.+)/i);
        if (toolNameMatch) {
          tools.push({ name: toolNameMatch[1].trim(), content });
        }
      }
    });

    setPromptVariables(vars);
    setPromptTools(tools);
  };

  // Load version history from PostgreSQL + Milvus
  const loadSessionVersions = () => {
    
    // PostgreSQL versions
    if (sessionId) {
      fetch(`${API_BASE}/prompt-sessions/${sessionId}/versions`)
        .then(r => r.json())
        .then((d: PostgresVersionResponse) => {
          const pgVersions: SessionVersion[] = (d.versions || []).map((v) => ({
            ...v,
            source: 'postgres',
          }));
          setSessionVersions(prev => {
            const milvusOnly = prev.filter((v) => v.source === 'milvus');
            return [...pgVersions, ...milvusOnly];
          });
        })
        .catch((error) => {
          console.error('Failed to load PostgreSQL session versions:', error);
        });
    }
    
    // Milvus versions
    fetch('/api/milvus/versions')
      .then(r => r.json())
      .then((d: MilvusVersionsResponse) => {
        if (d.status === 'ok' && d.versions) {
          const mvVersions: SessionVersion[] = d.versions.map((v) => ({
            id: `mv-${v.id}`,
            version_number: v.version_number,
            change_description: `Milvus snapshot — ${v.saved_at ? new Date(v.saved_at).toLocaleString() : 'unknown'}`,
            change_type: 'milvus-snapshot',
            created_at: v.saved_at,
            overall_score: null,
            left_column_content: v.content_full || v.content,
            source: 'milvus',
          }));
          setSessionVersions(prev => {
            const pgOnly = prev.filter((v) => v.source !== 'milvus');
            return [...pgOnly, ...mvVersions];
          });
        }
      })
      .catch((error) => {
        console.error('Failed to load Milvus versions:', error);
      });
  };

  // Listen for version-selected events from VersionManager or ScoreDropdown
  useEffect(() => {
    const handler = (e: Event) => {
      const version = (e as CustomEvent).detail;
      if (!version) return;
      setSelectedVersionEntry(version);
      setSelectedNav('trace');
    };
    window.addEventListener('version-selected', handler);
    return () => window.removeEventListener('version-selected', handler);
  }, []);

  // Scan prompt content and load versions when a tab is opened
  useEffect(() => {
    if (selectedNav === 'variables' || selectedNav === 'tools') {
      scanPromptContent();
    }
    if (selectedNav === 'trace') {
      loadSessionVersions();
    }
  }, [selectedNav]);

  // Listen for figma-component-selected — pre-fill chat input with component prompt
  useEffect(() => {
    const handler = (e: Event) => {
      const { prompt } = (e as CustomEvent).detail || {};
      if (prompt) setChatInput(prompt);
    };
    window.addEventListener('figma-component-selected', handler);
    return () => window.removeEventListener('figma-component-selected', handler);
  }, []);

  // Load the package's conversations — PACKAGE-SCOPED (conversations belong to
  // the open prompt_session). No session = no conversations (console view).
  // Loads COLLAPSED: list only, nothing auto-opens.
  useEffect(() => {
    // ✅ DEDUP: Skip if already loading
    if (isConversationsLoadingRef.current) {
      console.log('[Chat] Skipping duplicate conversation fetch');
      return;
    }

    if (!sessionId) {
      setConversations([]);
      conversationsLoadedRef.current = true;
      return;
    }

    isConversationsLoadingRef.current = true;

    conversationStorage.getSessionConversations(sessionId).then(all => {
      const filtered = (all || []).filter(Boolean);
      setConversations(filtered.sort((a: Conversation, b: Conversation) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
      conversationsLoadedRef.current = true;
    }).catch((error) => {
      console.error('Failed to load package conversations:', error);
    }).finally(() => {
      isConversationsLoadingRef.current = false;
    });
  }, [sessionId]);

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await fetch('/api/conversations/' + convId, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c?.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
        setChatMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleLoadConversation = async (conv: Conversation) => {
    if (!conv?.id) return;
    setCurrentConversationId(conv.id);
    setShowConvDropdown(false);
    try {
      const found = await conversationStorage.getConversation(conv.id);
      if (found?.messages) {
        setChatMessages(found.messages.map((m) => ({
          role: m.type === 'question' ? 'user' : 'assistant',
          content: m.content
        })));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // ── Multi-column context awareness ──────────────────────────────────
  // Scrapes all textareas across the three-column layout so the model
  // knows the full workspace state and can update any column.
  const buildWorkspaceContext = (): string => {
    const parts: string[] = [];

    // Left column: all textareas (both data-section-container and data-section-name patterns)
    const leftTextareas = document.querySelectorAll('[data-section-container] textarea, textarea[data-section-name]');
    const leftParts: string[] = [];
    const seenLabels = new Set<string>();
    let activeSection = '';
    leftTextareas.forEach((el) => {
      const ta = el as HTMLTextAreaElement;
      // Skip hidden textareas (removed roles)
      let parent = ta.parentElement;
      let hidden = false;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') { hidden = true; break; }
        parent = parent.parentElement;
      }
      if (hidden) return;
      const label = ta.getAttribute('data-section-name') || ta.getAttribute('placeholder') || ta.getAttribute('aria-label') || '';
      if (ta === document.activeElement) {
        activeSection = label || 'unknown';
      }
      if (ta.value?.trim() && !seenLabels.has(label)) {
        seenLabels.add(label);
        leftParts.push(label ? `${label}: ${ta.value.trim()}` : ta.value.trim());
      }
    });
    if (leftParts.length > 0 || activeSection) {
      parts.push('=== PROMPT INPUT AREA (what the user is building) ===');
      if (activeSection) {
        parts.push(`User is currently focused on: "${activeSection}".`);
      }
      if (leftParts.length > 0) {
        parts.push(...leftParts);
      }
    }

    // Third column: compiled output (read from editable textarea)
    const compiledEl = document.querySelector('[data-compiled-output]');
    if (compiledEl) {
      const outputTa = compiledEl.querySelector('textarea');
      const outputText = outputTa?.value?.trim();
      if (outputText) {
        parts.push('');
        parts.push('=== OUTPUT PANEL ===');
        parts.push(outputText);
      }
    }

    // Grounding & evaluation metrics — always available for AI discussion
    if (selectedNav === 'trace') {
      parts.push('');
      parts.push('=== EVALUATION METRICS (current session) ===');
      parts.push(`Groundedness: ${(currentGroundingMetrics.groundedness * 100).toFixed(0)}% — how well claims are anchored to sources`);
      parts.push(`Faithfulness: ${(currentGroundingMetrics.faithfulness * 100).toFixed(0)}% — whether claims can be inferred from retrieved context`);
      parts.push(`Hallucination Rate: ${(currentGroundingMetrics.hallucinationRate * 100).toFixed(0)}% — fraction of claims that are verifiably false`);
      parts.push(`Context Recall: ${(currentGroundingMetrics.contextRecall * 100).toFixed(0)}% — how much relevant source material was captured`);
      parts.push(`Context Precision: ${(currentGroundingMetrics.contextPrecision * 100).toFixed(0)}% — how much retrieved context was actually relevant`);
      if (currentGroundingMetrics.driftWarning) {
        parts.push('⚠️ DRIFT WARNING: Hallucination rate is elevated or groundedness is low. The model may be losing context accuracy.');
      }
    }

    return parts.join('\n');
  };

  // Send content to the left column via custom events
  const applyTextToLeftColumn = (content: string, targetPlaceholder?: string) => {
    window.dispatchEvent(new CustomEvent('set-left-column-text', {
      detail: { content, target: targetPlaceholder || '' }
    }));
  };

  // Clear all left column textareas via custom events that React listens for
  const clearLeftColumn = () => {
    window.dispatchEvent(new CustomEvent('clear-left-column'));
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || isSending) return;
    if (!overrideText) setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
    // Persist user message to backend
    if (currentConversationId) {
      conversationStorage.addMessage(currentConversationId, 'question', text).catch(err => {
        console.error('[Chat] Failed to persist user message:', err);
      });
    }
    setIsSending(true);
    scrollToLatest();

    // Build full workspace context so the model knows all columns
    const workspaceContext = buildWorkspaceContext();

    // Hardcoded baseline identity — MUST be at the very top of the payload
    const systemInstructions = `You are Grace, the Agentic Flow Architect. You help users build multi-step agentic prompt pipelines. Each prompt entry field in the workspace represents a STEP in an agentic flow — they are not arbitrary text boxes. Your job is to map the user's ideas onto the correct steps in the flow.

# AGENTIC FLOW STEPS (choose from this list — do NOT invent new ones)

| Step | Section Tag | Purpose |
|------|-------------|---------|
| 1. System Role | <update_agent> | Defines the AI's identity, expertise, and behavioral rules |
| 2. User Role | <update_user> | The user's request, task, or query template |
| 3. Tool Call | <update_tool> | Functions, APIs, or tools the agent can invoke |
| 4. Few Shot | <update_few_shot> | Examples that demonstrate desired input→output patterns |
| 5. Context | <update_context> | Background information, constraints, or domain knowledge |
| 6. Constraints | <update_constraints> | Hard rules the agent must never violate |

# WORKSPACE USER FLOW — STRICT RULES

1. ANALYZE the user's intent. MAP it to ONE of the 6 steps above.
2. STATE your choice in ONE sentence. Example: "This belongs in Constraints — it's a hard rule the agent must follow."
3. EMIT the tag IMMEDIATELY — same message, right after your sentence. Write the content INSIDE the tag.
   Correct: "I'll put this in Constraints. <update_constraints>Never suggest removing error boundaries.</update_constraints>"
   Wrong: "I'll put this in Constraints. The content would say: never suggest removing error boundaries."
4. SUGGEST which step to fill next. Stay within the 6 steps above.
5. USER has veto — if they say move it to a different step, do it.

# INTERACTION RULES — CONFIRMATION BUTTONS

When you need user confirmation on an action, render clickable buttons in the chat using this exact format:

[Confirm](action:confirm) [Refuse](action:refuse) [Cancel](action:cancel)

Supported actions: confirm, refuse, cancel, proceed, yes, no, log, flag.

Always include a fallback line immediately after the buttons:
"Reply with one of: confirm, refuse, cancel."

Never proceed with a destructive or irreversible action (save, clear, delete) without explicit user confirmation. If the user has not confirmed, ask again.

# CONTROL SURFACE (XML COMMAND TAGS)

WRITE TO STEPS:
<update_agent>text</update_agent>
<update_user>text</update_user>
<update_tool>text</update_tool>
<update_few_shot>text</update_few_shot>
<update_context>text</update_context>
<update_constraints>text</update_constraints>

MEMORY COMMANDS:
<save/>
<get_versions/>
<load_version>N</load_version>

DESTRUCTIVE:
<clear_all/> — ONLY if user says "clear", "reset", "wipe", or "nuke". MUST ask for confirmation with buttons first.

## CURRENT WORKSPACE
${workspaceContext}
</system_instructions>

<execution_context>
You are in the chat panel. Follow the WORKSPACE USER FLOW above. Use XML tags silently — they are stripped from the visible chat. Never ask the user to copy-paste or manually click UI. Stay within the 6 agentic flow steps — do not invent new section types unless the user explicitly asks for a custom step.
</execution_context>`;

    try {
      // ── Sentry AI monitoring: tag span with conversation ID ──
      if (currentConversationId) {
        Sentry.setTag("gen_ai.conversation.id", currentConversationId);
      }
      const response = await neuralNetworkService.query(text, systemInstructions, {
        conversationId: currentConversationId,
        sessionId: sessionId || undefined,
        tab: selectedNav === 'trace' || selectedNav === 'tools' ? selectedNav : 'chat',
      });
      if (response.conversation_id && !currentConversationId) {
        setCurrentConversationId(response.conversation_id);
        // New conversation was created under this package — refresh the dropdown list
        if (sessionId) {
          conversationStorage.getSessionConversations(sessionId).then(all => {
            setConversations((all || []).filter(Boolean).sort((a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            ));
          }).catch(err => console.error('Failed to refresh conversation list:', err));
        }
      }
      if (response.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${response.error}` }]);
      } else {
        let responseContent = response.content;

        // ── XML tag interceptors — strip from chat, execute on DOM ──
        const xmlTags: Array<{ regex: RegExp; target: string }> = [
          { regex: /<update_agent>([\s\S]*?)<\/update_agent>/g, target: 'System Role' },
          { regex: /<update_user>([\s\S]*?)<\/update_user>/g, target: 'User Role' },
          { regex: /<update_tool_call>([\s\S]*?)<\/update_tool_call>/g, target: 'Tool Call' },
          { regex: /<update_tool>([\s\S]*?)<\/update_tool>/g, target: 'Tool Call' },
          { regex: /<update_few_shot>([\s\S]*?)<\/update_few_shot>/g, target: 'Few Shot' },
          { regex: /<update_context>([\s\S]*?)<\/update_context>/g, target: 'Context' },
          { regex: /<update_constraints>([\s\S]*?)<\/update_constraints>/g, target: 'Constraints' },
        ];

        for (const { regex, target } of xmlTags) {
          let match;
          while ((match = regex.exec(responseContent)) !== null) {
            applyTextToLeftColumn(match[1].trim(), target);
          }
          responseContent = responseContent.replace(regex, '');
        }

        // ── Dynamic panel management ──
        // <add_role name="Role Name">placeholder</add_role>
        const addRoleRegex = /<add_role\s+name="([^"]+)">([\s\S]*?)<\/add_role>/g;
        let addMatch;
        while ((addMatch = addRoleRegex.exec(responseContent)) !== null) {
          window.dispatchEvent(new CustomEvent('add-prompt-role', {
            detail: { roleName: addMatch[1].trim(), placeholder: addMatch[2].trim() }
          }));
        }
        responseContent = responseContent.replace(addRoleRegex, '');

        // <remove_role name="Role Name"/>
        const removeRoleRegex = /<remove_role\s+name="([^"]+)"\s*\/>/g;
        let remMatch;
        while ((remMatch = removeRoleRegex.exec(responseContent)) !== null) {
          window.dispatchEvent(new CustomEvent('remove-prompt-role', {
            detail: { roleName: remMatch[1].trim() }
          }));
        }
        responseContent = responseContent.replace(removeRoleRegex, '');

        // Self-closing tags
        if (/<clear_all\s*\/>/.test(responseContent)) {
          clearLeftColumn();
          responseContent = responseContent.replace(/<clear_all\s*\/>/g, '');
        }

        // ── AI Control Surface tags ──

        // <switch_tab>trace|variables|chat</switch_tab>
        const switchTabRegex = /<switch_tab>(trace|variables|chat|tools|data)<\/switch_tab>/g;
        let tabMatch;
        while ((tabMatch = switchTabRegex.exec(responseContent)) !== null) {
          setSelectedNav(tabMatch[1]);
        }
        responseContent = responseContent.replace(switchTabRegex, '');

        // <run_prompt/>
        if (/<run_prompt\s*\/>/.test(responseContent)) {
          window.dispatchEvent(new CustomEvent('ai-run-prompt'));
          responseContent = responseContent.replace(/<run_prompt\s*\/>/g, '');
        }

        // <save/>
        if (/<save\s*\/>/.test(responseContent)) {
          eventBus.emit({ command: 'save-button' } as any);
          responseContent = responseContent.replace(/<save\s*\/>/g, '');
        }

        // <show_version>N</show_version>
        const showVersionRegex = /<show_version>(\d+)<\/show_version>/g;
        let verMatch;
        while ((verMatch = showVersionRegex.exec(responseContent)) !== null) {
          window.dispatchEvent(new CustomEvent('ai-show-version', {
            detail: { version: parseInt(verMatch[1]) }
          }));
        }
        responseContent = responseContent.replace(showVersionRegex, '');

        // <eval_grounding/>
        if (/<eval_grounding\s*\/>/.test(responseContent)) {
          window.dispatchEvent(new CustomEvent('ai-eval-grounding'));
          responseContent = responseContent.replace(/<eval_grounding\s*\/>/g, '');
        }

        // ── A2UI Console surface tags ──

        // <reassemble-console sort="category|title" />  or  <reassemble-console filter="Design System" />
        const reassembleRegex = /<reassemble-console\s+([^>]*?)\s*\/?>/g;
        let reassembleMatch;
        while ((reassembleMatch = reassembleRegex.exec(responseContent)) !== null) {
          const attrs = reassembleMatch[1];
          const sortMatch = attrs.match(/sort="([^"]*)"/);
          const filterMatch = attrs.match(/filter="([^"]*)"/);
          window.dispatchEvent(new CustomEvent('a2ui:console-command', {
            detail: {
              sort: sortMatch ? sortMatch[1] : undefined,
              filter: filterMatch ? filterMatch[1] : undefined,
            }
          }));
        }
        responseContent = responseContent.replace(reassembleRegex, '');

        // ── A2UI Surface tags → eventBus (Lit components in third column) ──

        // <project-card-element id="..." name="..." description="..."/>
        const projectCardRegex = /<project-card-element\s+([^>]*?)\s*\/?>/g;
        let cardMatch;
        while ((cardMatch = projectCardRegex.exec(responseContent)) !== null) {
          const attrs = cardMatch[1];
          const props: Record<string, string> = {};
          const attrRegex = /(\w+)="([^"]*)"/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            props[attrMatch[1]] = attrMatch[2];
          }
          eventBus.emit({
            tag: 'project-card-element',
            sessionId: 'default',
            command: 'project-card-element',
            timestamp: new Date().toISOString(),
            props,
          });
        }
        responseContent = responseContent.replace(projectCardRegex, '');

        // <add-button label="..." onclick="..."/>
        const addButtonRegex = /<add-button\s+([^>]*?)\s*\/?>/g;
        let btnMatch;
        while ((btnMatch = addButtonRegex.exec(responseContent)) !== null) {
          const attrs = btnMatch[1];
          const props: Record<string, string> = {};
          const attrRegex = /(\w+)="([^"]*)"/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            props[attrMatch[1]] = attrMatch[2];
          }
          eventBus.emit({
            tag: 'add-button',
            sessionId: 'default',
            command: 'add-button',
            timestamp: new Date().toISOString(),
            props,
          });
        }
        responseContent = responseContent.replace(addButtonRegex, '');

        // <set-html content="..."/>
        const setHtmlRegex = /<set-html\s+content="([^"]*)"\s*\/?>/g;
        let htmlMatch;
        while ((htmlMatch = setHtmlRegex.exec(responseContent)) !== null) {
          eventBus.emit({
            tag: 'set-html',
            sessionId: 'default',
            command: 'set-html',
            timestamp: new Date().toISOString(),
            props: { content: htmlMatch[1] },
          });
        }
        responseContent = responseContent.replace(setHtmlRegex, '');

        // <clear-surface/>
        if (/<clear-surface\s*\/>/.test(responseContent)) {
          eventBus.emit({
            tag: 'clear-surface',
            sessionId: 'default',
            command: 'clear-surface',
            timestamp: new Date().toISOString(),
            props: {},
          });
          responseContent = responseContent.replace(/<clear-surface\s*\/>/g, '');
        }

        responseContent = responseContent.trim();
        setChatMessages(prev => [...prev, { role: 'assistant', content: responseContent }]);
        if (currentConversationId && responseContent) {
          conversationStorage.addMessage(currentConversationId, 'response', responseContent).catch(err => {
            console.error('[Chat] Failed to persist assistant response:', err);
          });
        }
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }]);
    } finally {
      setIsSending(false);
    }
  };

  handleSendRef.current = (overrideText?: string) => {
    void handleSend(overrideText);
  };

  // ── Render message content with action buttons ────────────────────
  const renderMessageContent = (content: string) => {
    // Split on action: patterns like [Confirm](action:confirm)
    const parts = content.split(/(\[.*?\]\(action:[^)]+\))/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(.*?)\]\(action:([^)]+)\)$/);
      if (match) {
        const label = match[1];
        const action = match[2];
        return (
          <button
            key={i}
            onClick={() => {
              // Handle remove_role actions directly — dispatch DOM event
              if (action.startsWith('remove_role:')) {
                const roleName = decodeURIComponent(action.replace('remove_role:', ''));
                window.dispatchEvent(new CustomEvent('remove-prompt-role', {
                  detail: { roleName }
                }));
                setChatMessages(prev => [...prev, { role: 'assistant', content: `Removed "${roleName}". You can run now.` }]);
                return;
              }
              // Advice buttons
              if (action === 'accept_advice') {
                setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Applying optimization now...' }]);
                handleSend(`[ACCEPT_ADVICE] You just gave optimization advice. APPLY IT NOW using XML tags. Do NOT describe the changes — EMIT the tags. Use <update_agent>, <update_user>, <update_tool>, <update_few_shot>, <update_context>, <update_constraints> for existing sections. Use <add_role name="NAME">CONTENT</add_role> for new sections. WRITE the improved content into the workspace immediately. Do not explain what you changed until after the tags are emitted.`);
                return;
              }
              if (action === 'reject_advice') {
                setChatMessages(prev => [...prev, { role: 'assistant', content: '❌ Advice rejected. Continuing with current prompt.' }]);
                return;
              }
              if (action === 'explain_more') {
                setChatMessages(prev => [...prev, { role: 'assistant', content: '💡 Requesting more detail...' }]);
                handleSend(`[EXPLAIN_MORE] Explain your optimization advice in more detail. Why is this approach better? What specific improvements will it make?`);
                return;
              }
              // Other actions: send as chat message
              handleSend(`[${action}]`);
            }}
            className="inline-block px-3 py-1 mx-0.5 my-0.5 rounded-md bg-[#4066e3] text-white text-xs font-semibold hover:bg-[#3051c0] transition-colors cursor-pointer"
          >
            {label}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const motionPresets = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        content: { duration: 0, ease: 'linear' as const, opacity: { duration: 0 }, y: { duration: 0, ease: 'linear' as const }, filter: { duration: 0 } },
        header: { duration: 0, delay: 0, ease: 'linear' as const },
      };
    }
    return {
      content: { duration: 0.42, ease: 'easeOut' as const, opacity: { duration: 0.28 }, y: { duration: 0.42, ease: 'easeOut' as const }, filter: { duration: 0.24 } },
      header: { duration: 0.48, delay: 0, ease: 'easeOut' as const },
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showConvDropdown && !(e.target as HTMLElement).closest('.relative')) {
        setShowConvDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConvDropdown]);

  useEffect(() => {    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => { mediaQuery.removeEventListener('change', updatePreference); };
  }, []);

  const tabMetadata = useMemo(() => {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    switch (selectedNav) {
      case 'variables': return { title: 'Execution Trace', subtitle: 'Complete flow from prompt submission to final response — Milvus snapshots', timestamp, tokens: '1,247', cost: '$0.0062', executions: '15' };
      case 'tools': return { title: 'Tool Registry & Usage', subtitle: 'Available functions, API integrations, and execution statistics', timestamp, tokens: '1,247', cost: '$0.0057', executions: '1,847' };
      case 'data': return { title: 'Data Sources & Cross-References', subtitle: 'Connected databases, APIs, and query analytics', timestamp, tokens: '1,103', cost: '$0.0052', executions: '23,323' };
      case 'evaluation': return { title: 'A/B Testing', subtitle: 'Model comparison, variant testing, and statistical significance', timestamp, tokens: '2,481', cost: '$0.0124', executions: '8' };
      case 'metadata': return { title: 'Governance & Cost', subtitle: 'Cost per invocation, change history, hallucination rates, audit trail', timestamp, tokens: '—', cost: '$47.82/mo', executions: '3,847' };
      case 'trace':
      default: return { title: 'Chat History', subtitle: 'Conversations, past chats, and new chat', timestamp, tokens: '892', cost: '$0.0041', executions: '47' };
    }
  }, [selectedNav]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startHeightRef.current = inputHeight;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      // Clamp to the panel's real height so the input can never push the
      // gripper (58px) + bottom bar (52px) + a minimum chat area below the viewport
      const panel = chatContainerRef.current?.parentElement;
      const dynamicMax = panel ? Math.max(100, panel.clientHeight - 58 - 52 - 80) : 600;
      setInputHeight(Math.max(100, Math.min(Math.min(600, dynamicMax), startHeightRef.current + deltaY)));
    };
    const handleMouseUp = () => { setIsDragging(false); };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Don't change cursor during drag - let the user see what's under their cursor
      // This prevents jerky motion
      // document.body.style.cursor = 'ns-resize';
      // document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, inputHeight]);

  const handleNavClick = useCallback((tab: string) => {
    // The Lit component handles expand/collapse internally.
    // React just syncs selectedNav for trace/tools content rendering.
    setSelectedNav(tab);
    setShowApprovalQueue(false);
  }, []);

  // ── Wire Lit <chat-navigation-bar> events → React state ───────────────
  useEffect(() => {
    const el = navBarRef.current;
    if (!el) return;

    const onTabChange = (e: Event) => {
      const detail = (e as CustomEvent<TabChangeEventDetail>).detail;
      if (detail?.tab !== undefined) {
        setSelectedNav(detail.tab);
      }
    };

    const onCollapseToggle = (e: Event) => {
      const detail = (e as CustomEvent<CollapseToggleEventDetail>).detail;
      if (typeof detail?.collapsed === 'boolean') {
        setIsRightColumnCollapsed(detail.collapsed);
        if (detail.collapsed) {
          setSelectedNav('');
        }
      }
    };

    el.addEventListener('tab-change', onTabChange);
    el.addEventListener('collapse-toggle', onCollapseToggle);

    return () => {
      el.removeEventListener('tab-change', onTabChange);
      el.removeEventListener('collapse-toggle', onCollapseToggle);
    };
  }, []);

  // ── Push initial React state → Lit component on mount ─────────────────
  // The Lit component defaults to collapsed=false, activeTab=''.
  // React defaults to selectedNav='chat', isRightColumnCollapsed=false.
  // Sync once on mount, then Lit is the source of truth afterward.
  useEffect(() => {
    const el = navBarRef.current;
    if (!el) return;
    // Only set if not already synced (Lit has no previousTab on first render)
    if (!el.activeTab && !el.collapsed) {
      el.activeTab = 'chat';
    }
  }, []);

  const handleLoadToComposer = (item: ApprovalItem) => {
    console.log('Loading prompt to composer:', item);
    alert(`Loading "${item.promptName}" v${item.version} to composer...`);
  };

  // Scroll whenever chatMessages change (new message added).
  // AI replies scroll so the reply begins at the TOP of the viewport (read
  // from the start); the user's own messages keep classic scroll-to-bottom.
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const id = requestAnimationFrame(() => {
      const container = chatContainerRef.current;
      if (!container || !isAtBottomRef.current) return;
      const lastIdx = chatMessages.length - 1;
      const last = chatMessages[lastIdx];
      if (last.role !== 'user') {
        const el = container.querySelector<HTMLElement>(`[data-msg-idx="${lastIdx}"]`);
        if (el) {
          const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12;
          container.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          return;
        }
      }
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [chatMessages.length]);

  // Scroll to top when switching to any tab — show header first
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = 0;
        isAtBottomRef.current = false;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedNav]);

  return (
    <div className="bg-[rgba(255,255,255,0)] content-stretch flex items-start justify-center relative shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] h-full w-full min-h-0 min-w-0 overflow-hidden">
      {/* Lit A2UI chat navigation bar — replaces React SidebarNavigation */}
      <chat-navigation-bar
        ref={navBarRef}
        active-tab={isRightColumnCollapsed ? '' : (selectedNav === 'trace' || selectedNav === 'tools' || selectedNav === 'evaluation' || selectedNav === 'variables' || selectedNav === 'metadata' ? selectedNav : 'chat')}
        collapsed={isRightColumnCollapsed ? 'true' : 'false'}
        allowed-tabs={allowedTabs}
      >
        <img slot="logo" alt={getImageAlt('card-img-default')} loading="lazy" data-a2ui-id="card-img-default" src={getImageUrl('card-img-default')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </chat-navigation-bar>

      <div
        data-tag="chat-panel"
        className="flex flex-col h-full min-h-0 min-w-0"
        style={{
          flex: '1 1 0%',
          opacity: isRightColumnCollapsed ? 0 : 1,
          transform: isRightColumnCollapsed ? 'translateX(14px)' : 'translateX(0)',
          pointerEvents: isRightColumnCollapsed ? 'none' : 'auto',
          overflow: 'hidden',
          transition: prefersReducedMotion ? 'none' : 'opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        aria-hidden={isRightColumnCollapsed}
      >
        {/* Chat messages area */}
        <div 
          className={`flex-1 min-h-0 rounded-tr-[10px] shadow-[inset_5px_5px_10px_0px_rgba(0,0,0,0.25)] border border-[#8e98a8] overflow-y-auto overflow-x-hidden p-6 transition-colors duration-200 ease-out [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-white hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 ${showApprovalQueue ? 'bg-[#B5C3C6]' : 'bg-white'}`}
          ref={chatContainerRef}
          onScroll={handleScroll}
        >
          <div
            className="flex flex-col min-h-full"
          >
          <AnimatePresence mode="wait">
            {showApprovalQueue ? (
              <motion.div key="approval-queue" initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }} transition={motionPresets.content} className="space-y-4">
                <motion.div initial={{ opacity: 0, y: -15, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={motionPresets.header} className="bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef] border-l-4 border-[#1c2f4e] rounded-lg p-5 shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="font-['Inter'] font-bold text-[20px] text-[#1c2f4e] mb-1">Approval Queue</h2>
                      <p className="font-['Inter'] text-[13px] text-[#6c757d] leading-relaxed">Review and approve prompts submitted by your team.</p>
                    </div>
                    <div className="bg-[#1c2f4e] text-white px-4 py-1.5 rounded-full text-[11px] font-['Inter'] font-semibold min-w-[80px] text-center flex-shrink-0 ml-4">10 PENDING</div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#dee2e6]">
                    <div className="space-y-3">
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Last Submitted</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">2 hours ago</div></div>
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Oldest Pending</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">3 days ago</div></div>
                    </div>
                    <div className="space-y-3">
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Total Est. Tokens</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">24,847</div></div>
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Total Est. Cost</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">$3.14</div></div>
                    </div>
                    <div className="space-y-3">
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Priority Breakdown</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]"><span className="text-red-600">4 High</span> · <span className="text-yellow-600">4 Med</span> · <span className="text-green-600">2 Low</span></div></div>
                      <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Risk Status</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]"><span className="text-red-600">3 High</span> · <span className="text-yellow-600">2 Med</span> · <span className="text-green-600">5 Low</span></div></div>
                    </div>
                  </div>
                </motion.div>
                {approvalQueueItems.map((item, index) => (
                  <ApprovalQueueItem key={item.id} item={item} index={index} onLoadToComposer={handleLoadToComposer} />
                ))}
              </motion.div>
            ) : (
              <motion.div key={selectedNav} initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }} transition={motionPresets.content} className="space-y-6">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-['Inter'] font-medium bg-[#f0f0f0] text-[#666] border border-[#ccc]">
                    <span className="w-2 h-2 rounded-full bg-[#999]" />
                    Standard — new content loads at bottom
                  </div>
                  {/* Conversation Selector */}
                  <div className="relative">
                    <button
                      onClick={() => setShowConvDropdown(!showConvDropdown)}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[11px] font-['Inter'] font-medium bg-white border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <span className="truncate">
                        {currentConversationId 
                          ? ((conversations || []).find(c => c?.id === currentConversationId)?.title || 'Untitled')
                          : 'Select a conversation...'}
                      </span>
                      <svg className="w-3 h-3 ml-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showConvDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-[200px] overflow-y-auto">
                        <button
                          onClick={() => { setCurrentConversationId(null); setChatMessages([]); setShowConvDropdown(false); }}
                          className="w-full text-left px-3 py-2 text-[11px] font-['Inter'] hover:bg-gray-50 border-b border-gray-100"
                        >
                          + New conversation
                        </button>
                        {conversations.slice(0, 20).map(conv => (
                          <div key={conv.id} className="group">
                          <button
                            onClick={() => handleLoadConversation(conv)}
                            className={`w-full text-left px-3 py-2 text-[11px] font-['Inter'] hover:bg-gray-50 ${
                              currentConversationId === conv?.id ? 'bg-[#e8f0f1]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="truncate font-medium">{conv.title || 'Untitled'}</div>
                              <div className="flex items-center gap-1 shrink-0">
                                {conv.tab && conv.tab !== 'chat' && (
                                  <span className="text-[9px] uppercase tracking-wide bg-[#507274] text-white rounded px-1 py-[1px]">{conv.tab}</span>
                                )}
                                <button 
                                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                                  className="opacity-0 group-hover:opacity-100 shrink-0 text-red-400 hover:text-red-300 text-sm leading-none px-1 transition-opacity"
                                  title="Delete conversation"
                                >×</button>
                              </div>
                            </div>
                            <div className="text-gray-400 text-[10px]">{new Date(conv.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                          </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

                {chatMessages.length > 0 && (
                  <div className="space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} data-msg-idx={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg p-3 text-[13px] font-['Inter'] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[#4066e3] text-white' : 'bg-gray-100 text-gray-800 border border-gray-200'}`}>
                          {renderMessageContent(msg.content)}
                        </div>
                      </div>
                    ))}
                    {isSending && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-[13px] font-['Inter'] text-gray-400 italic">
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <motion.div initial={{ opacity: 0, y: -15, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={motionPresets.header} className="bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef] border-l-4 border-[#507274] rounded-lg p-5 shadow-md">
                  <div className="flex items-start justify-between mb-3">
                    <div style={{ minWidth: 300 }}>
                      <h2 className="font-['Inter'] font-bold text-[20px] text-[#1c2f4e] mb-1">{tabMetadata.title}</h2>
                      <p className="font-['Inter'] text-[13px] text-[#6c757d] leading-relaxed">{tabMetadata.subtitle}</p>
                    </div>
                    <div className="bg-[#507274] text-white px-3 py-1 rounded-full text-[11px] font-['Inter'] font-semibold">{selectedNav.toUpperCase()}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#dee2e6]" style={{ minWidth: 300 }}>
                    <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Last Updated</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">{tabMetadata.timestamp}</div></div>
                    <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Tokens Used</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">{tabMetadata.tokens}</div></div>
                    <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Est. Cost</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">{tabMetadata.cost}</div></div>
                    <div><div className="text-[11px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-1">Executions</div><div className="text-[13px] font-['Inter'] font-semibold text-[#1c2f4e]">{tabMetadata.executions}</div></div>
                  </div>
                </motion.div>

                {(() => {
                  switch (selectedNav) {
                    case 'trace': return (
                      <div className="space-y-2">
                        {/* ── Grounding & Evaluation Metrics ── */}
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className={`rounded-xl border-2 p-4 ${
                            currentGroundingMetrics.driftWarning
                              ? 'border-red-300 bg-red-50'
                              : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h3 className="font-['Inter'] font-bold text-[14px] text-[#1c2f4e]">Evaluation Scores</h3>
                              <p className="text-[11px] text-gray-500">
                                Model: {currentGroundingMetrics.model} · Evaluated {new Date(currentGroundingMetrics.evaluatedAt).toLocaleTimeString()}
                              </p>
                            </div>
                            {currentGroundingMetrics.driftWarning && (
                              <span className="bg-red-500 text-white px-2.5 py-1 rounded-full text-[10px] font-bold animate-pulse">
                                ⚠ DRIFT DETECTED
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {metricBars.map(bar => (
                              <div
                                key={bar.key}
                                className="group cursor-pointer"
                                onClick={() => {
                                  const q = bar.key === 'hallucinationRate'
                                    ? `My hallucination rate is ${(bar.value * 100).toFixed(0)}%. ${bar.value > 0.1 ? 'This seems high — why might the model be hallucinating and how can I reduce it?' : 'Is this considered acceptable? What threshold should I aim for?'}`
                                    : `My ${bar.label.toLowerCase()} score is ${(bar.value * 100).toFixed(0)}%. ${bar.value < 0.7 ? 'How can I improve this metric?' : 'What does this metric tell me about response quality?'}`;
                                  setChatInput(q);
                                }}
                                title={`Click to ask about ${bar.label}`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[11px] font-['Inter'] font-semibold text-[#1c2f4e]">{bar.label}</span>
                                  <span className="text-[11px] font-['Inter'] font-bold text-[#1c2f4e]">{(bar.value * 100).toFixed(0)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${bar.color} group-hover:opacity-80`}
                                    style={{ width: `${bar.key === 'hallucinationRate' ? (1 - bar.value) * 100 : bar.value * 100}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {bar.description} — click to discuss
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Drift simulator — toggle between healthy and drifting for testing */}
                          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">Simulate:</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setCurrentGroundingMetrics(groundingMetricsSample); }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
                                !currentGroundingMetrics.driftWarning ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-emerald-100'
                              }`}
                            >Healthy</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setCurrentGroundingMetrics(groundingMetricsDrifting); }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
                                currentGroundingMetrics.driftWarning ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-red-100'
                              }`}
                            >Drifting</button>
                          </div>
                        </motion.div>

                        {/* ── Live AI Trace Feed ── */}
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="rounded-xl border border-gray-200 bg-white overflow-hidden h-[280px]"
                        >
                          <TraceFeed />
                        </motion.div>

                        {/* ── Collapsible Chat History ── */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setTraceHistoryCollapsed(!traceHistoryCollapsed)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <span className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e]">
                              All Conversations ({conversations.filter(c => c?.id).length})
                            </span>
                            <span className={`text-[14px] text-gray-400 transition-transform ${traceHistoryCollapsed ? '' : 'rotate-90'}`}>
                              ▶
                            </span>
                          </button>
                          {!traceHistoryCollapsed && (
                            <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto">
                              {(() => {
                                const labelMap: Record<string, string> = { trace: '[Trace]', variables: '[Variables]', tools: '[Variables]', general: '[General]' };
                                const filtered = conversations.filter(c => c?.id);
                                return filtered.length > 0 ? (
                                  filtered.map(conv => (
                                    <div
                                      key={conv.id}
                                      onClick={() => handleLoadConversation(conv)}
                                      className={`bg-white border rounded-lg p-3 text-[12px] font-['Inter'] cursor-pointer hover:border-[#4066e3] transition-colors ${currentConversationId === conv.id ? 'border-[#4066e3] bg-[#f0f4ff]' : 'border-gray-200'}`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold truncate">
                                          <span className="text-[10px] text-[#507274] mr-1">{labelMap[conv.tag || 'general'] || '[General]'}</span>
                                          {conv.title || 'Untitled'}
                                        </span>
                                        <button
                                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                                          className="text-gray-400 hover:text-red-500 text-[10px] ml-2 shrink-0"
                                        >Delete</button>
                                      </div>
                                      <div className="text-[10px] text-gray-400 mt-1">
                                        {new Date(conv.updatedAt).toLocaleString()}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[12px] text-gray-400 italic p-4 text-center border border-dashed border-gray-300 rounded-lg">
                                    No conversations yet — start chatting below
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    case 'variables': return (
                      <div className="space-y-4">
                        {selectedVersionEntry && (
                          <div className="rounded-xl border border-[#4066e3] bg-[#f0f4ff] overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-[#4066e3]">
                              <span className="text-white font-semibold text-[13px]">
                                {selectedVersionEntry.change_description || `Version ${selectedVersionEntry.version_number}`}
                                <span className="ml-2 opacity-70 font-normal">v{selectedVersionEntry.version_number}</span>
                              </span>
                              <div className="flex items-center gap-3">
                                {selectedVersionEntry.overall_score != null && (
                                  <span className="text-white font-bold text-[14px]">
                                    Score: {(selectedVersionEntry.overall_score as number).toFixed(1)}
                                  </span>
                                )}
                                <button onClick={() => setSelectedVersionEntry(null)} className="text-white/70 hover:text-white text-[18px] leading-none" title="Dismiss">×</button>
                              </div>
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-[11px] text-gray-400 mb-2 uppercase tracking-wide font-semibold">
                                Saved {new Date(selectedVersionEntry.created_at).toLocaleString()}
                              </p>
                              {selectedVersionEntry.left_column_content ? (
                                <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-mono bg-white rounded-lg p-3 border border-gray-200 max-h-[300px] overflow-y-auto">{selectedVersionEntry.left_column_content}</pre>
                              ) : (
                                <p className="text-[12px] text-gray-400 italic">No content stored for this version.</p>
                              )}
                            </div>
                          </div>
                        )}
                        {sessionVersions.length > 0 ? (
                          sessionVersions.filter(v => v?.id).map(v => (
                            <div key={v.id} className="bg-white border border-gray-200 rounded-lg p-3 text-[12px] font-['Inter']">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold">v{v.version_number}</span>
                                <span className="text-[10px] text-gray-400">{new Date(v.created_at).toLocaleString()}</span>
                              </div>
                              <div className="text-gray-600">{v.change_description || 'No description'}</div>
                              {v.overall_score != null && <div className="mt-1 text-[#4066e3] font-semibold">Score: {v.overall_score}</div>}
                            </div>
                          ))
                        ) : (
                          <div className="text-[12px] text-gray-400 italic p-4 text-center border border-dashed border-gray-300 rounded-lg">
                            {sessionId ? 'No versions yet — run a prompt to create a trace' : 'No active prompt session'}
                          </div>
                        )}
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    case 'tools': return (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e] mb-2">Detected Tools</h3>
                          {promptTools.length > 0 ? (
                            <div className="space-y-2">
                              {promptTools.map((tool, i) => (
                                <div key={`${tool.name}-${i}`} className="bg-white border border-gray-200 rounded-lg p-3 text-[12px] font-['Inter']">
                                  <div className="font-semibold text-[#1c2f4e]">{tool.name}</div>
                                  <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap font-mono">{tool.content}</pre>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[12px] text-gray-400 italic p-4 text-center border border-dashed border-gray-300 rounded-lg">
                              0 tools
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e] mb-2">Detected Variables</h3>
                        {promptVariables.length > 0 ? (
                          promptVariables.map((v, i) => (
                            <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 text-[12px] font-['Inter']">
                              <span className="font-mono text-[#507274] font-semibold">{'{{'}{v.name}{'}}'}</span>
                              <span className="ml-2 text-gray-400">from {v.section}</span>
                              {v.value && <div className="mt-1 text-gray-600">Value: {v.value}</div>}
                            </div>
                          ))
                        ) : (
                          <div className="text-[12px] text-gray-400 italic p-4 text-center border border-dashed border-gray-300 rounded-lg">
                            0 variables
                          </div>
                        )}
                        </div>
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    case 'data': return (
                      <div className="text-[12px] text-gray-400 italic p-4 text-center border border-dashed border-gray-300 rounded-lg">
                        Data view coming soon. Use the Variables tab for variable extraction and the Tools tab for tool definitions.
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    case 'evaluation': return (
                      <div className="space-y-3">
                        <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
                          <h3 className="font-['Inter'] font-bold text-[14px] text-[#1c2f4e] mb-1">A/B Testing & Model Comparison</h3>
                          <p className="text-[11px] text-gray-500 mb-3">Compare prompt versions across different models and configurations.</p>
                          <div className="text-[12px] text-gray-400 italic p-3 text-center border border-dashed border-gray-300 rounded-lg">
                            A/B test runner — design pending.
                            <br/>Will show: variant comparison, confidence intervals, statistical significance, model performance deltas.
                          </div>
                        </div>
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    case 'metadata': return (
                      <div className="space-y-3">
                        <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
                          <h3 className="font-['Inter'] font-bold text-[14px] text-[#1c2f4e] mb-1">Governance & Cost</h3>
                          <p className="text-[11px] text-gray-500 mb-3">Cost per invocation, change history, hallucination rates, audit trail.</p>
                          <div className="text-[12px] text-gray-400 italic p-3 text-center border border-dashed border-gray-300 rounded-lg">
                            Governance dashboard — design pending.
                            <br/>Will pull from: grace_decisions, grace_health_metrics, usage_metrics, data_dignity_ledger, audit_logs.
                          </div>
                        </div>
                        <div className="h-[230px]" aria-hidden="true"></div>
                      </div>
                    );
                    default: return null;
                  }
                })()}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

        {/* Action bar - draggable gripper */}
        <div 
          onMouseDown={handleMouseDown}
          className={`bg-[#e5e1dd] h-[58px] shrink-0 flex items-center px-2 gap-[15px] cursor-ns-resize hover:bg-[#d5d1cd] transition-colors duration-200 ease-out ${isDragging ? 'bg-[#c5c1bd]' : ''}`}
          title="Drag to resize input area"
        >
          <div className={`h-[40px] w-[25px] rounded transition-colors duration-200 ease-out flex items-center justify-center pointer-events-none ${isDragging ? 'bg-black/10' : ''}`} aria-hidden="true">
            <img src={gripperChatBarHorizontal} alt="" className="w-full h-auto object-contain" />
          </div>

          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => handleSend()}
            disabled={isSending}
            onMouseEnter={() => setHoveredButton('send')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Send"
            className={`bg-[#507274] flex items-center justify-center px-[5px] py-[7px] rounded-[6px] h-[40px] w-[44px] border border-[#758e87] hover:bg-[#5e8486] transition-colors duration-200 ease-out relative ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="rotate-[-88.53deg] skew-x-[0.82deg]">
              <svg className="w-[23px] h-[29px]" fill="none" viewBox="0 0 17.494 21.5167">
                <path d="M0 0L17.494 10.758L0 21.517L0 13.514L12.495 10.758L0 8.003L0 0Z" fill={isSending ? '#ccc' : '#FFDE30'} />
              </svg>
            </div>
            {hoveredButton === 'send' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#BCCBCE] text-black p-[3px] rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">
                Send
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#BCCBCE]"></div>
              </div>
            )}
          </button>

          <button 
            onClick={() => setShowApprovalQueue(true)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHoveredButton('approve')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Open approval queue"
            className="bg-[#1c2f4e] flex items-center justify-center px-[10px] py-[7px] rounded-[6px] h-[40px] border border-[#758e87] hover:bg-[#243a5d] transition-colors duration-200 ease-out relative"
          >
            <p className="font-['Inter'] font-bold text-[16px] text-white leading-[20px]"><span className="font-medium">(10) </span><span>Approve</span></p>
            {hoveredButton === 'approve' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#BCCBCE] text-black px-3 py-2 rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">
                Approval queue for submitted prompts
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#BCCBCE]"></div>
              </div>
            )}
          </button>

          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHoveredButton('create')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Create new prompt"
            className="bg-[#507274] flex items-center justify-center px-[5px] py-[7px] rounded-[6px] h-[40px] w-[44px] border border-[#758e87] hover:bg-[#5e8486] transition-colors duration-200 ease-out relative"
          >
            <p className="font-['Inter'] font-medium text-[36px] text-white leading-[20px]">+</p>
            {hoveredButton === 'create' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#BCCBCE] text-black p-[3px] rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">
                Create new prompt
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#BCCBCE]"></div>
              </div>
            )}
          </button>

          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHoveredButton('console')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Open prompt console"
            className="bg-[#1c2f4e] flex items-center justify-center px-[10px] py-[7px] rounded-[6px] h-[40px] border border-[#758e87] hover:bg-[#243a5d] transition-colors duration-200 ease-out relative"
          >
            <p className="font-['Inter'] font-bold text-[16px] text-white leading-[20px]">Console</p>
            {hoveredButton === 'console' && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#BCCBCE] text-black px-3 py-2 rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">
                Main prompt repository
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#BCCBCE]"></div>
              </div>
            )}
          </button>
        </div>

        <div 
          className={`shrink-0 shadow-[inset_5px_5px_10px_0px_rgba(0,0,0,0.25)] transition-[height,background-color] duration-200 ease-out ${showApprovalQueue ? 'bg-[#B5C3C6]' : 'bg-[#b5ccce]'}`}
          style={{ height: `${inputHeight}px`, transitionDuration: isDragging || prefersReducedMotion ? '0ms' : '180ms', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <div className="p-4 h-full flex flex-col gap-2">
            <textarea
              className="w-full flex-1 bg-white border border-[#8e98a8] rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#507274] font-['Inter'] text-[14px]"
              placeholder="Type your message here..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        <div className={`h-[52px] rounded-br-[10px] shrink-0 flex items-center justify-between px-5 transition-colors duration-200 ease-out ${showApprovalQueue ? 'bg-[#B5C3C6]' : 'bg-[#b5ccce]'}`}>
          <button onMouseEnter={() => setHoveredButton('gpt')} onMouseLeave={() => setHoveredButton(null)} className="bg-[#e5f1ec] border border-[#bcbcbc] h-[34px] px-5 rounded-[4px] shadow-[2px_3px_10px_0px_rgba(0,0,0,0.15)] font-['Inter'] font-bold text-[18px] text-[#10455f] hover:bg-[#d5e1dc] transition-colors duration-200 ease-out relative">
            GPT-4.1
            {hoveredButton === 'gpt' && (<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#BCCBCE] text-black p-[3px] rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">Select AI model<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#BCCBCE]"></div></div>)}
          </button>
          <div className="text-[#10455f] text-sm opacity-60">{isDragging ? `${inputHeight}px` : ''}</div>
        </div>
      </div>
    </div>
  );
}