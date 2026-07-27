/**
 * Chat message data types used by tabMessagesData for sample/demo content.
 */

export interface ChatMessageData {
  id: string;
  type: 'system' | 'user' | 'ai-response' | 'performance-report' | 'suggestion' | 'technical-diagram' | 'intermediate-result' | 'platform-comparison' | string;
  content?: string;
  timestamp?: string;
  tab?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
