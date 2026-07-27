/**
 * Storybook Document Registry
 * 
 * Maps every markdown/mdx doc in the Storybook directory to a
 * card-displayable entry with title, category, and path.
 * The console can render these alongside prompt agent cards.
 */

export interface StorybookDoc {
  id: string;
  title: string;
  category: string;
  path: string;
  description: string;
  fileName: string;
}

export const STORYBOOK_DOCS: StorybookDoc[] = [
  // ── Architecture ──────────────────────────────────────────────────
  {
    id: "doc-architecture-vision",
    title: "Architecture Vision",
    category: "Architecture",
    path: "docs/Architecture_Vision.mdx",
    description: "High-level architecture overview of the Prompt Composer Console",
    fileName: "Architecture_Vision.mdx",
  },
  {
    id: "doc-storybook-architecture",
    title: "Storybook Architecture & Deployment",
    category: "Architecture",
    path: "docs/STORYBOOK_ARCHITECTURE_AND_DEPLOYMENT_SUMMARY.mdx",
    description: "How Storybook is structured and deployed",
    fileName: "STORYBOOK_ARCHITECTURE_AND_DEPLOYMENT_SUMMARY.mdx",
  },
  {
    id: "doc-column-modules",
    title: "Column Modules Documentation",
    category: "Architecture",
    path: "docs/STORYBOOK_COLUMN_MODULES_DOCUMENTATION.mdx",
    description: "Three-column layout module system documentation",
    fileName: "STORYBOOK_COLUMN_MODULES_DOCUMENTATION.mdx",
  },
  {
    id: "doc-project-overview",
    title: "Project Overview",
    category: "Architecture",
    path: "docs/STORYBOOK_PROJECT_OVERVIEW.mdx",
    description: "Complete project overview and structure",
    fileName: "STORYBOOK_PROJECT_OVERVIEW.mdx",
  },
  // ── A2UI ──────────────────────────────────────────────────────────
  {
    id: "doc-a2ui-tag-system",
    title: "Lit A2UI Tag System",
    category: "A2UI",
    path: "docs/Lit_A2UI_Tag_System.mdx",
    description: "Complete reference for the A2UI XML tag system and Gatekeeper",
    fileName: "Lit_A2UI_Tag_System.mdx",
  },
  {
    id: "doc-a2ui-agent-integration",
    title: "A2UI Agent Integration",
    category: "A2UI",
    path: "documentation/A2UI_AGENT_INTEGRATION.md",
    description: "How AI agents integrate with the A2UI surface",
    fileName: "A2UI_AGENT_INTEGRATION.md",
  },
  {
    id: "doc-a2ui-control-surface",
    title: "A2UI Control Surface",
    category: "A2UI",
    path: "documentation/A2UI_Control_Surface.mdx",
    description: "The AI-controllable output window architecture",
    fileName: "A2UI_Control_Surface.mdx",
  },
  {
    id: "doc-a2ui-implementation",
    title: "A2UI Implementation Summary",
    category: "A2UI",
    path: "documentation/A2UI_IMPLEMENTATION_SUMMARY.md",
    description: "Summary of A2UI implementation details and decisions",
    fileName: "A2UI_IMPLEMENTATION_SUMMARY.md",
  },
  {
    id: "doc-a2ui-pattern-assembly",
    title: "A2UI Pattern Assembly Framework",
    category: "A2UI",
    path: "documentation/A2UI_PATTERN_ASSEMBLY_FRAMEWORK.md",
    description: "Framework for assembling A2UI patterns from tags",
    fileName: "A2UI_PATTERN_ASSEMBLY_FRAMEWORK.md",
  },
  {
    id: "doc-a2ui-quick-start",
    title: "A2UI Quick Start",
    category: "A2UI",
    path: "documentation/A2UI_QUICK_START.md",
    description: "Quick start guide for A2UI development",
    fileName: "A2UI_QUICK_START.md",
  },
  {
    id: "doc-a2ui-surface-integration",
    title: "A2UI Surface Integration",
    category: "A2UI",
    path: "documentation/A2UI_SURFACE_INTEGRATION.md",
    description: "How to integrate components with the A2UI surface",
    fileName: "A2UI_SURFACE_INTEGRATION.md",
  },
  // ── Pipeline ──────────────────────────────────────────────────────
  {
    id: "doc-figma-pipeline",
    title: "Figma Pipeline",
    category: "Pipeline",
    path: "docs/Figma_Pipeline.mdx",
    description: "Figma-to-code pipeline architecture",
    fileName: "Figma_Pipeline.mdx",
  },
  {
    id: "doc-save-pipeline",
    title: "Save Pipeline",
    category: "Pipeline",
    path: "docs/Save_Pipeline.mdx",
    description: "Save and versioning pipeline for prompts",
    fileName: "Save_Pipeline.mdx",
  },
  // ── Features ──────────────────────────────────────────────────────
  {
    id: "doc-third-column",
    title: "The Magical Third Column",
    category: "Features",
    path: "docs/MAGICAL_THIRD_COLUMN.mdx",
    description: "Design and implementation of the third column",
    fileName: "MAGICAL_THIRD_COLUMN.mdx",
  },
  {
    id: "doc-product-package",
    title: "Product Package",
    category: "Features",
    path: "docs/ProductPackage.mdx",
    description: "Product packaging and feature set overview",
    fileName: "ProductPackage.mdx",
  },
  {
    id: "doc-use-cases",
    title: "Use Cases",
    category: "Features",
    path: "docs/Use_Cases.mdx",
    description: "Use cases and workflows for the platform",
    fileName: "Use_Cases.mdx",
  },
  {
    id: "doc-roadmap",
    title: "Roadmap",
    category: "Features",
    path: "docs/Roadmap.mdx",
    description: "Development roadmap and future plans",
    fileName: "Roadmap.mdx",
  },
  // ── Case Studies ──────────────────────────────────────────────────
  {
    id: "case-study-document-editor",
    title: "Case Study: Document Editor Workflow",
    category: "Case Studies",
    path: "docs/Case_Study_Document_Editor.mdx",
    description: "How the three-column panel system transforms chat prompts into a document editing workspace",
    fileName: "Case_Study_Document_Editor.mdx",
  },
];

export const STORYBOOK_DOC_CATEGORIES = [...new Set(STORYBOOK_DOCS.map((d) => d.category))];

export function getDocById(id: string): StorybookDoc | undefined {
  return STORYBOOK_DOCS.find((d) => d.id === id);
}

export function getDocsByCategory(category: string): StorybookDoc[] {
  return STORYBOOK_DOCS.filter((d) => d.category === category);
}
