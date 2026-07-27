/**
 * Shared types for the components directory.
 * Used by InteractiveChatInterface, tabMessagesData, and related components.
 */

/** Evaluation/grounding metrics displayed in the Trace tab. */
export interface GroundingMetrics {
  faithfulness: number;
  contextRecall: number;
  contextPrecision: number;
  hallucinationRate: number;
  groundedness: number;
  model: string;
  evaluatedAt: string;
  driftWarning: boolean;
}

/** A single metric bar for display in the Trace evaluation panel. */
export interface MetricBar {
  key: string;
  label: string;
  value: number;
  color: string;
  description: string;
}
