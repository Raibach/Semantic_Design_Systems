import type { ChatMessageData } from './ChatMessage';
import solarDiagram from 'figma:asset/5feab89a462b56cdad4c2b6a0775c663c8e3bb11.png';

// APPROVAL QUEUE - Prompts waiting for review
export const approvalQueueMessages: ChatMessageData[] = [
  {
    id: 'aq1',
    type: 'system',
    timestamp: '2026-02-21T15:00:00Z',
    content: '**Approval Queue** - 10 prompts pending review',
  },
  {
    id: 'aq2',
    type: 'ai-response',
    timestamp: '2026-02-21T15:00:01Z',
    content: 'Click any prompt below to load it into the composer for review. Prompts are sorted by priority and submission time.',
    metadata: {
      model: 'System',
      tokens: 0,
      cost: 0,
      duration: '0s',
    },
  },
];

// TRACE TAB - Execution flows and traces
export const traceMessages = [
  {
    id: 'trace-msg-1',
    type: 'trace-execution' as const,
    title: 'AI Governance Assistant',
    version: 'v2.3',
    executedAt: '2026-02-10 14:32:15',
    steps: [
      {
        id: 'step-1',
        name: 'Task',
        duration: '9.13s',
        endTime: '15.53s',
        type: 'task' as const,
        children: [
          {
            id: 'step-2',
            name: 'ProcessUser Message',
            duration: '9.49s',
            endTime: '15.53s',
            type: 'task' as const,
            children: [
              {
                id: 'step-3',
                name: 'search_knowledge_base',
                duration: '0.78s',
                endTime: '0.09s',
                type: 'function' as const,
              },
              {
                id: 'step-4',
                name: 'Calculate',
                duration: '0.53s',
                endTime: '1.37s',
                type: 'function' as const,
              },
              {
                id: 'step-5',
                name: 'LLMFollowup',
                duration: '9.48s',
                endTime: '15.53s',
                type: 'task' as const,
                children: [
                  {
                    id: 'step-6',
                    name: 'Copilot (GPT-4o mini)',
                    duration: '2.02s',
                    endTime: '2.09s',
                    type: 'model' as const,
                  },
                ],
              },
              {
                id: 'step-7',
                name: 'Intent Classification',
                duration: '0.08s',
                type: 'analysis' as const,
              },
              {
                id: 'step-8',
                name: 'Closed QA',
                duration: '0.27s',
                type: 'analysis' as const,
              },
              {
                id: 'step-9',
                name: 'Intent Classification',
                duration: '0.08s',
                type: 'analysis' as const,
              },
              {
                id: 'step-10',
                name: 'Closed QA',
                duration: '0.27s',
                type: 'analysis' as const,
              },
              {
                id: 'step-11',
                name: 'Intent Classification',
                duration: '0.08s',
                type: 'analysis' as const,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'trace-msg-2',
    type: 'trace-execution' as const,
    title: 'Performance Report',
    executedAt: '2026-02-10 14:32:20',
    steps: [
      {
        id: 'perf-1',
        name: 'Aggregate Metrics',
        duration: '0.15s',
        type: 'analysis' as const,
      },
      {
        id: 'perf-2',
        name: 'Generate Visualization',
        duration: '0.32s',
        type: 'function' as const,
      },
    ],
  },
];

// GROUNDING & EVALUATION METRICS — displayed in Trace tab
import type { GroundingMetrics, MetricBar } from './types';

export const groundingMetricsSample: GroundingMetrics = {
  groundedness: 0.87,
  faithfulness: 0.92,
  hallucinationRate: 0.04,
  contextRecall: 0.78,
  contextPrecision: 0.85,
  evaluatedAt: new Date().toISOString(),
  model: 'GPT-4.1',
  driftWarning: false,
};

export const groundingMetricsDrifting: GroundingMetrics = {
  groundedness: 0.42,
  faithfulness: 0.35,
  hallucinationRate: 0.28,
  contextRecall: 0.31,
  contextPrecision: 0.29,
  evaluatedAt: new Date().toISOString(),
  model: 'GPT-4.1',
  driftWarning: true,
};

/** Build display bars from a GroundingMetrics object */
export function buildMetricBars(m: GroundingMetrics): MetricBar[] {
  const colorFor = (v: number, inverted?: boolean) => {
    const score = inverted ? (1 - v) : v; // hallucinationRate is inverted (lower is better)
    if (score >= 0.85) return 'bg-emerald-500';
    if (score >= 0.65) return 'bg-amber-500';
    return 'bg-red-500';
  };
  return [
    { key: 'groundedness', label: 'Groundedness', value: m.groundedness, description: 'Claims anchored to source material', color: colorFor(m.groundedness) },
    { key: 'faithfulness', label: 'Faithfulness', value: m.faithfulness, description: 'Claims inferrable from retrieved context', color: colorFor(m.faithfulness) },
    { key: 'hallucinationRate', label: 'Hallucination', value: m.hallucinationRate, description: 'Fraction of verifiably false claims', color: colorFor(m.hallucinationRate, true) },
    { key: 'contextRecall', label: 'Context Recall', value: m.contextRecall, description: 'Relevant source material captured', color: colorFor(m.contextRecall) },
    { key: 'contextPrecision', label: 'Context Precision', value: m.contextPrecision, description: 'Retrieved context that was relevant', color: colorFor(m.contextPrecision) },
  ];
}

// VARIABLES TAB - Variable management, A/B testing, history
export const variablesMessages: ChatMessageData[] = [
  {
    id: 'v1',
    type: 'user',
    timestamp: '2026-02-21T10:15:00Z',
    content: 'Show me the variable usage for ${customer_segment} in the sales prompt',
  },
  {
    id: 'v2',
    type: 'system',
    timestamp: '2026-02-21T10:15:01Z',
    content: 'Analyzing variable ${customer_segment} across 47 prompt executions...',
  },
  {
    id: 'v3',
    type: 'ai-response',
    timestamp: '2026-02-21T10:15:03Z',
    content: '**Variable Analysis: ${customer_segment}**\\n\\nThe variable ${customer_segment} is currently used in 12 active prompts. Here\'s the breakdown:\\n\\n• **Enterprise** - 62% of executions (highest conversion)\\n• **SMB** - 28% of executions\\n• **Startup** - 10% of executions\\n\\n**A/B Test Results:**\\nVariant A (Enterprise-first messaging): 34% conversion\\nVariant B (Value-first messaging): 41% conversion ✨\\n\\n**Recommendation:** Switch to Variant B for 15% improvement in outcomes.',
    metadata: {
      model: 'GPT-4.1',
      tokens: 189,
      cost: 0.0008,
      duration: '1.23s',
    },
  },
  {
    id: 'v4',
    type: 'performance-report',
    timestamp: '2026-02-21T10:15:04Z',
    data: {
      metrics: {
        'Variable References': '47',
        'Unique Values': '3',
        'A/B Tests Active': '2',
        'Winner Confidence': '94%',
        'Historical Versions': '8',
        'Last Modified': '2 days ago',
      },
    },
  },
  {
    id: 'v5',
    type: 'suggestion',
    timestamp: '2026-02-21T10:15:05Z',
    content: 'Create a new variable ${industry_vertical} to further segment your messaging. Based on patterns, this could improve targeting by 23%.',
    data: {
      action: 'create-variable',
      actionLabel: 'Create Variable',
      estimatedSavings: { time: 'N/A', cost: 'N/A' },
    },
  },
  {
    id: 'v6',
    type: 'user',
    timestamp: '2026-02-21T10:18:00Z',
    content: 'Compare the performance history of ${tone} variable over the last 30 days',
  },
  {
    id: 'v7',
    type: 'ai-response',
    timestamp: '2026-02-21T10:18:02Z',
    content: '**${tone} Variable Performance Trend**\\n\\n📊 **30-Day Analysis:**\\n\\n**Professional** tone:\\n• Week 1-2: 45% success rate\\n• Week 3-4: 52% success rate (+15% improvement)\\n\\n**Casual** tone:\\n• Week 1-2: 38% success rate\\n• Week 3-4: 36% success rate (-5% decline)\\n\\n**Friendly-Expert** tone (new):\\n• Week 3-4: 61% success rate 🎯\\n\\n**Version History:**\\nv1.0 - Original (Professional/Casual)\\nv1.1 - Added "Friendly" option\\nv2.0 - Split into "Friendly-Expert" + "Friendly-Casual"\\nv2.1 - Current (4 options) ← **Recommended**',
    metadata: {
      model: 'GPT-4.1',
      tokens: 312,
      cost: 0.0014,
      duration: '1.89s',
    },
  },
];

// TOOLS TAB - Available tools and functions
export const toolsMessages: ChatMessageData[] = [
  {
    id: 't1',
    type: 'user',
    timestamp: '2026-02-21T11:30:00Z',
    content: 'What tools are available for customer data enrichment?',
  },
  {
    id: 't2',
    type: 'system',
    timestamp: '2026-02-21T11:30:01Z',
    content: 'Searching tool registry for customer enrichment capabilities...',
  },
  {
    id: 't3',
    type: 'ai-response',
    timestamp: '2026-02-21T11:30:03Z',
    content: '**Customer Data Enrichment Tools**\\n\\nI found 6 tools that can help with customer data enrichment:\\n\\n🔧 **clearbit_enrich**\\n• Company data, employee count, tech stack\\n• Latency: ~850ms | Cost: $0.05/call\\n• Success rate: 94%\\n\\n🔧 **linkedin_lookup**\\n• Job titles, company info, connections\\n• Latency: ~1.2s | Cost: $0.08/call\\n• Success rate: 87%\\n\\n🔧 **crunchbase_funding**\\n• Funding rounds, investors, valuation\\n• Latency: ~650ms | Cost: $0.03/call\\n• Success rate: 91%\\n\\n🔧 **apollo_io_contact**\\n• Email verification, phone numbers\\n• Latency: ~420ms | Cost: $0.02/call\\n• Success rate: 96% ⭐\\n\\n🔧 **zoominfo_search**\\n• Contact details, org charts\\n• Latency: ~980ms | Cost: $0.12/call\\n• Success rate: 89%\\n\\n🔧 **builtwith_stack**\\n• Technology stack detection\\n• Latency: ~320ms | Cost: $0.01/call\\n• Success rate: 98%',
    metadata: {
      model: 'GPT-4.1',
      tokens: 425,
      cost: 0.0019,
      duration: '2.14s',
    },
  },
  {
    id: 't4',
    type: 'user',
    timestamp: '2026-02-21T11:32:00Z',
    content: 'Show me the usage stats for clearbit_enrich over the past week',
  },
  {
    id: 't5',
    type: 'performance-report',
    timestamp: '2026-02-21T11:32:02Z',
    data: {
      metrics: {
        'Total Calls': '1,847',
        'Success Rate': '94.2%',
        'Avg Latency': '843ms',
        'Total Cost': '$92.35',
        'Cache Hits': '312 (17%)',
        'Failed Calls': '107 (5.8%)',
        'Peak Usage': 'Tue 2PM-4PM',
      },
    },
  },
  {
    id: 't6',
    type: 'suggestion',
    timestamp: '2026-02-21T11:32:03Z',
    content: 'You could reduce clearbit_enrich costs by 28% by implementing smarter caching. Cache hits show potential for 520+ saved API calls per week.',
    data: {
      action: 'optimize-caching',
      actionLabel: 'Enable Smart Caching',
      estimatedSavings: { time: '438s/week', cost: '$25.86/week' },
    },
  },
  {
    id: 't7',
    type: 'technical-diagram',
    timestamp: '2026-02-21T11:33:00Z',
    content: 'Tool Integration Architecture',
    data: {
      imageUrl: solarDiagram,
      alt: 'Tool Integration Flow Diagram',
      description: 'Visual architecture showing how tools integrate with the prompt execution pipeline: API Gateway → Rate Limiter → Cache Layer → Tool Executor → Response Transformer. Click to expand for full system diagram.',
    },
  },
];

// DATA TAB - Raw data sources and cross-referencing
export const dataMessages: ChatMessageData[] = [
  {
    id: 'd1',
    type: 'user',
    timestamp: '2026-02-21T14:45:00Z',
    content: 'Show me all data sources connected to the sales pipeline prompt',
  },
  {
    id: 'd2',
    type: 'system',
    timestamp: '2026-02-21T14:45:01Z',
    content: 'Querying connected data sources and dependencies...',
  },
  {
    id: 'd3',
    type: 'ai-response',
    timestamp: '2026-02-21T14:45:03Z',
    content: '**Data Sources for Sales Pipeline Prompt**\\n\\n📊 **Primary Sources** (3)\\n\\n**Salesforce CRM**\\n• Type: REST API\\n• Records: 14,892 opportunities\\n• Last Sync: 4 minutes ago\\n• Fields Used: stage, amount, close_date, owner\\n• Status: ✅ Healthy\\n\\n**HubSpot Contacts**\\n• Type: GraphQL API\\n• Records: 8,431 contacts\\n• Last Sync: 12 minutes ago\\n• Fields Used: email, company, lifecycle_stage\\n• Status: ✅ Healthy\\n\\n**PostgreSQL Analytics DB**\\n• Type: Direct SQL\\n• Tables: opportunities, accounts, contacts\\n• Last Query: 2 minutes ago\\n• Query Performance: 145ms avg\\n• Status: ✅ Healthy\\n\\n📁 **Reference Data** (2)\\n\\n**Product Catalog JSON**\\n• Size: 2.4 MB\\n• Items: 347 products\\n• Last Updated: Yesterday 6:32 PM\\n\\n**Territory Mappings CSV**\\n• Size: 89 KB\\n• Regions: 52\\n• Last Updated: 3 days ago',
    metadata: {
      model: 'GPT-4.1',
      tokens: 378,
      cost: 0.0017,
      duration: '1.92s',
    },
  },
  {
    id: 'd4',
    type: 'user',
    timestamp: '2026-02-21T14:47:00Z',
    content: 'Cross-reference high-value opportunities with recent engagement data',
  },
  {
    id: 'd5',
    type: 'intermediate-result',
    timestamp: '2026-02-21T14:47:02Z',
    data: {
      query: 'High-value opportunities + engagement cross-reference',
      results: [
        { title: 'Acme Corp - $450K deal, 8 touchpoints this week', relevance: 0.98 },
        { title: 'TechStart Inc - $280K deal, 12 email opens', relevance: 0.95 },
        { title: 'Global Solutions - $720K deal, demo scheduled', relevance: 0.92 },
      ],
    },
    metadata: {
      duration: '1.84s',
    },
  },
  {
    id: 'd6',
    type: 'ai-response',
    timestamp: '2026-02-21T14:47:04Z',
    content: '**Cross-Reference Analysis Complete** 🎯\\n\\nFound **23 high-value opportunities** (>$200K) with recent engagement:\\n\\n**🔥 Hot Leads** (Action Required)\\n1. **Acme Corp** - $450K\\n   • 8 touchpoints this week\\n   • Last engagement: 2 hours ago\\n   • Next step: Follow-up call scheduled Mon 10AM\\n\\n2. **Global Solutions** - $720K\\n   • Demo scheduled for next week\\n   • Decision maker engaged 3x\\n   • Competitive threat: Low\\n\\n3. **TechStart Inc** - $280K\\n   • 12 email opens in 48 hours\\n   • Pricing doc downloaded\\n   • Urgency: Q1 budget deadline\\n\\n**📊 Engagement Patterns:**\\n• Email engagement up 34% week-over-week\\n• Demo-to-close rate: 68%\\n• Average deal cycle: 42 days',
    metadata: {
      model: 'GPT-4.1',
      tokens: 412,
      cost: 0.0018,
      duration: '2.08s',
    },
  },
  {
    id: 'd7',
    type: 'performance-report',
    timestamp: '2026-02-21T14:47:05Z',
    data: {
      metrics: {
        'Data Sources Queried': '5',
        'Records Analyzed': '23,323',
        'Cross-References Found': '67',
        'High-Priority Matches': '23',
        'Query Time': '1.84s',
        'Cache Efficiency': '82%',
        'Data Freshness': '< 15 min',
      },
    },
  },
  {
    id: 'd8',
    type: 'platform-comparison',
    timestamp: '2026-02-21T14:47:06Z',
    data: {
      title: 'Data Integration Capabilities Across Platforms',
      content: `**Enterprise Data Platform Comparison**\\n\\n**Snowflake** offers cloud-native data warehousing with near-instant elasticity, cross-cloud support, and zero-copy cloning for testing environments. Strong SQL interface with Java/Python UDFs. Best for large-scale analytics workloads.\\n\\n**Databricks** delivers unified analytics combining data warehousing and ML workflows through Delta Lake architecture. Excellent for real-time streaming and collaborative notebooks. Photon engine provides 3-8x query performance improvements.\\n\\n**BigQuery** provides serverless, highly scalable analytics with ML built-in via BigQuery ML. Seamless integration with GCP services. Automatic optimization and partition pruning. Cost-effective for intermittent workloads.\\n\\n**Firebolt** specializes in sub-second query performance on massive datasets through sparse indexing and vectorized execution. Ideal for customer-facing analytics and high-concurrency scenarios.\\n\\nKey selection criteria: query patterns, data volume, real-time requirements, ML integration needs, and cloud strategy.`,
    },
  },
];
