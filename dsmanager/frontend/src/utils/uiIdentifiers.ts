/**
 * UI Identifiers for Figma-to-Code mapping
 *
 * This file provides consistent data attributes for all major UI elements
 * to help identify and map elements between Figma designs and the actual application.
 *
 * Usage:
 * <div {...UI_ID.LAYOUT.MAIN_CONTAINER}>...</div>
 *
 * In Figma, you can reference these same identifiers in your design specs.
 */

export const UI_ID = {
  // Main Layout Structure
  LAYOUT: {
    MAIN_CONTAINER: {
      "data-ui-id": "layout-main-container",
      "data-ui-type": "layout",
      "data-ui-description": "Main application container",
    },
    LEFT_COLUMN: {
      "data-ui-id": "layout-left-column",
      "data-ui-type": "layout",
      "data-ui-description": "Left column - Writing area",
    },
    RIGHT_COLUMN: {
      "data-ui-id": "layout-right-column",
      "data-ui-type": "layout",
      "data-ui-description": "Right column - Chat panel",
    },
    COLUMN: "data-ui-column",
  },

  // Top Navigation
  NAV: {
    CONTAINER: {
      "data-ui-id": "nav-container",
      "data-ui-type": "navigation",
      "data-ui-description": "Top navigation bar container",
    },
    LOGO: {
      "data-ui-id": "nav-logo",
      "data-ui-type": "navigation",
      "data-ui-description": "Grace AI logo",
    },
    TABS_CONTAINER: {
      "data-ui-id": "nav-tabs-container",
      "data-ui-type": "navigation",
      "data-ui-description": "Scrollable tabs container",
    },
    TABS_SCROLL_AREA: {
      "data-ui-id": "nav-tabs-scroll-area",
      "data-ui-type": "navigation",
      "data-ui-description": "Tabs scrollable area with overflow",
    },
    TAB_SCROLL_LEFT: {
      "data-ui-id": "nav-tab-scroll-left",
      "data-ui-type": "button",
      "data-ui-description": "Scroll tabs left button",
    },
    TAB_SCROLL_RIGHT: {
      "data-ui-id": "nav-tab-scroll-right",
      "data-ui-type": "button",
      "data-ui-description": "Scroll tabs right button",
    },
  },

  // Individual Tabs
  TABS: {
    MY_STORY: {
      "data-ui-id": "tab-my-story",
      "data-ui-type": "tab",
      "data-ui-description": "My Story tab button",
    },
    PDF_SUMMARIZER: {
      "data-ui-id": "tab-pdf-summarizer",
      "data-ui-type": "tab",
      "data-ui-description": "PDF Summarizer tab button",
    },
    QUARANTINE: {
      "data-ui-id": "tab-quarantine",
      "data-ui-type": "tab",
      "data-ui-description": "Quarantine tab button",
    },
    SETTINGS: {
      "data-ui-id": "tab-settings",
      "data-ui-type": "tab",
      "data-ui-description": "Settings tab button",
    },
    ARTIFACTS: {
      "data-ui-id": "tab-artifacts",
      "data-ui-type": "tab",
      "data-ui-description": "Artifacts tab button",
    },
    KEEPER_CHAT: {
      "data-ui-id": "tab-keeper-chat",
      "data-ui-type": "tab",
      "data-ui-description": "Keeper Chat tab button",
    },
    MEMORIES: {
      "data-ui-id": "tab-memories",
      "data-ui-type": "tab",
      "data-ui-description": "Memories tab button",
    },
    MILVUS_VECTORS: {
      "data-ui-id": "tab-milvus-vectors",
      "data-ui-type": "tab",
      "data-ui-description": "Milvus Vectors tab button",
    },
  },

  // Tab Content Areas
  TAB_CONTENT: {
    MY_STORY: {
      "data-ui-id": "content-my-story",
      "data-ui-type": "content-area",
      "data-ui-description": "My Story editor content area",
    },
    PDF_SUMMARIZER: {
      "data-ui-id": "content-pdf-summarizer",
      "data-ui-type": "content-area",
      "data-ui-description": "PDF Summarizer content area",
    },
    QUARANTINE: {
      "data-ui-id": "content-quarantine",
      "data-ui-type": "content-area",
      "data-ui-description": "Quarantine content area",
    },
    SETTINGS: {
      "data-ui-id": "content-settings",
      "data-ui-type": "content-area",
      "data-ui-description": "Settings content area",
    },
    ARTIFACTS: {
      "data-ui-id": "content-artifacts",
      "data-ui-type": "content-area",
      "data-ui-description": "Artifacts content area",
    },
    KEEPER_CHAT: {
      "data-ui-id": "content-keeper-chat",
      "data-ui-type": "content-area",
      "data-ui-description": "Keeper Chat content area",
    },
    MEMORIES: {
      "data-ui-id": "content-memories",
      "data-ui-type": "content-area",
      "data-ui-description": "Memories content area",
    },
    MILVUS_VECTORS: {
      "data-ui-id": "content-milvus-vectors",
      "data-ui-type": "content-area",
      "data-ui-description": "Milvus Vectors content area",
    },
  },

  // Editor Components
  EDITOR: {
    CONTAINER: {
      "data-ui-id": "editor-container",
      "data-ui-type": "editor",
      "data-ui-description": "Main text editor container",
    },
    CONTENT: {
      "data-ui-id": "editor-content",
      "data-ui-type": "editor",
      "data-ui-description": "Text editor content area (Lexical)",
    },
    TOOLBAR: {
      "data-ui-id": "editor-toolbar",
      "data-ui-type": "editor",
      "data-ui-description": "Editor toolbar",
    },
    PLACEHOLDER: {
      "data-ui-id": "editor-placeholder",
      "data-ui-type": "editor",
      "data-ui-description": "Editor placeholder text",
    },
  },

  // Chat Panel
  CHAT: {
    CONTAINER: {
      "data-ui-id": "chat-container",
      "data-ui-type": "chat",
      "data-ui-description": "Chat panel container",
    },
    HEADER: {
      "data-ui-id": "chat-header",
      "data-ui-type": "chat",
      "data-ui-description": "Chat panel header",
    },
    MESSAGES_AREA: {
      "data-ui-id": "chat-messages-area",
      "data-ui-type": "chat",
      "data-ui-description": "Chat messages scrollable area",
    },
    MESSAGE: (id: string) => ({
      "data-ui-id": `chat-message-${id}`,
      "data-ui-type": "chat-message",
      "data-ui-description": "Individual chat message",
    }),
    QUESTION: (id: string) => ({
      "data-ui-id": `chat-question-${id}`,
      "data-ui-type": "chat-message",
      "data-ui-description": "User question message",
    }),
    RESPONSE: (id: string) => ({
      "data-ui-id": `chat-response-${id}`,
      "data-ui-type": "chat-message",
      "data-ui-description": "AI response message",
    }),
    INPUT_CONTAINER: {
      "data-ui-id": "chat-input-container",
      "data-ui-type": "chat",
      "data-ui-description": "Chat input container",
    },
    INPUT_FIELD: {
      "data-ui-id": "chat-input-field",
      "data-ui-type": "input",
      "data-ui-description": "Chat text input field",
    },
    SEND_BUTTON: {
      "data-ui-id": "chat-send-button",
      "data-ui-type": "button",
      "data-ui-description": "Send message button",
    },
    MIC_BUTTON: {
      "data-ui-id": "chat-mic-button",
      "data-ui-type": "button",
      "data-ui-description": "Voice input/microphone button",
    },
    CONVERSATION_SELECTOR: {
      "data-ui-id": "chat-conversation-selector",
      "data-ui-type": "dropdown",
      "data-ui-description": "Conversation/Project selector",
    },
    MODE_INDICATOR: {
      "data-ui-id": "chat-mode-indicator",
      "data-ui-type": "indicator",
      "data-ui-description": "Current chat mode indicator (Grace/Keeper)",
    },
  },

  // Resize Grippers
  GRIPPER: {
    VERTICAL: {
      "data-ui-id": "gripper-vertical",
      "data-ui-type": "gripper",
      "data-ui-description": "Vertical resize gripper between columns",
    },
    HORIZONTAL: {
      "data-ui-id": "gripper-horizontal",
      "data-ui-type": "gripper",
      "data-ui-description": "Horizontal resize gripper",
    },
    CHAT_RESIZE: {
      "data-ui-id": "gripper-chat-resize",
      "data-ui-type": "gripper",
      "data-ui-description": "Chat panel resize handle",
    },
  },

  // Modals
  MODAL: {
    PROMPT: {
      "data-ui-id": "modal-prompt",
      "data-ui-type": "modal",
      "data-ui-description": "Prompt modal dialog",
    },
    PROJECT: {
      "data-ui-id": "modal-project",
      "data-ui-type": "modal",
      "data-ui-description": "Project modal dialog",
    },
    SAVE: {
      "data-ui-id": "modal-save",
      "data-ui-type": "modal",
      "data-ui-description": "Save modal dialog",
    },
    CORRECTIONS: {
      "data-ui-id": "modal-corrections",
      "data-ui-type": "modal",
      "data-ui-description": "Corrections/Suggestions modal dialog",
    },
    LOGIN: {
      "data-ui-id": "modal-login",
      "data-ui-type": "modal",
      "data-ui-description": "Login form modal",
    },
    OVERLAY: {
      "data-ui-id": "modal-overlay",
      "data-ui-type": "overlay",
      "data-ui-description": "Modal backdrop overlay",
    },
  },

  // Panels & Sections
  PANEL: {
    PDF_WORKSPACE: {
      "data-ui-id": "panel-pdf-workspace",
      "data-ui-type": "panel",
      "data-ui-description": "PDF workspace panel",
    },
    PDF_LIST: {
      "data-ui-id": "panel-pdf-list",
      "data-ui-type": "panel",
      "data-ui-description": "PDF list panel",
    },
    PDF_VIEWER: {
      "data-ui-id": "panel-pdf-viewer",
      "data-ui-type": "panel",
      "data-ui-description": "PDF viewer/preview panel",
    },
    MEMORIES: {
      "data-ui-id": "panel-memories",
      "data-ui-type": "panel",
      "data-ui-description": "Memories/Prompts panel",
    },
    QUARANTINE_REVIEW: {
      "data-ui-id": "panel-quarantine-review",
      "data-ui-type": "panel",
      "data-ui-description": "Quarantine review panel",
    },
    SETTINGS: {
      "data-ui-id": "panel-settings",
      "data-ui-type": "panel",
      "data-ui-description": "Settings panel",
    },
    ARTIFACTS_FILTER: {
      "data-ui-id": "panel-artifacts-filter",
      "data-ui-type": "panel",
      "data-ui-description": "Artifacts filter panel",
    },
  },

  // Buttons
  BUTTON: {
    UPLOAD_PDF: {
      "data-ui-id": "button-upload-pdf",
      "data-ui-type": "button",
      "data-ui-description": "Upload PDF button",
    },
    SAVE: {
      "data-ui-id": "button-save",
      "data-ui-type": "button",
      "data-ui-description": "Save button",
    },
    SAVE_AS_PDF: {
      "data-ui-id": "button-save-as-pdf",
      "data-ui-type": "button",
      "data-ui-description": "Save as PDF button",
    },
    SAVE_AS_RTF: {
      "data-ui-id": "button-save-as-rtf",
      "data-ui-type": "button",
      "data-ui-description": "Save as RTF button",
    },
    SAVE_TO_PROJECT: {
      "data-ui-id": "button-save-to-project",
      "data-ui-type": "button",
      "data-ui-description": "Save to project button",
    },
    CHECK_WRITING: {
      "data-ui-id": "button-check-writing",
      "data-ui-type": "button",
      "data-ui-description": "Check writing button",
    },
    ASK_GRACE: {
      "data-ui-id": "button-ask-grace",
      "data-ui-type": "button",
      "data-ui-description": "Ask Grace button",
    },
    LOGOUT: {
      "data-ui-id": "button-logout",
      "data-ui-type": "button",
      "data-ui-description": "Logout button",
    },
    NEW_PROJECT: {
      "data-ui-id": "button-new-project",
      "data-ui-type": "button",
      "data-ui-description": "Create new project button",
    },
    DELETE_PROJECT: {
      "data-ui-id": "button-delete-project",
      "data-ui-type": "button",
      "data-ui-description": "Delete project button",
    },
    PASTE_EVALUATE: {
      "data-ui-id": "button-paste-evaluate",
      "data-ui-type": "button",
      "data-ui-description": "Paste and evaluate source button",
    },
    CLEAR_CONTEXT: {
      "data-ui-id": "button-clear-context",
      "data-ui-type": "button",
      "data-ui-description": "Clear context button",
    },
    REANALYZE: {
      "data-ui-id": "button-reanalyze",
      "data-ui-type": "button",
      "data-ui-description": "Reanalyze button",
    },
  },

  // PDF Summarizer specific
  PDF: {
    CARD: (id: string) => ({
      "data-ui-id": `pdf-card-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "PDF card item",
    }),
    SUMMARY: (id: string) => ({
      "data-ui-id": `pdf-summary-${id}`,
      "data-ui-type": "content",
      "data-ui-description": "PDF summary text",
    }),
    HIGHLIGHT: (id: string) => ({
      "data-ui-id": `pdf-highlight-${id}`,
      "data-ui-type": "highlight",
      "data-ui-description": "PDF highlighted text",
    }),
    DELETE_BUTTON: (id: string) => ({
      "data-ui-id": `pdf-delete-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Delete PDF button",
    }),
    OPEN_BUTTON: (id: string) => ({
      "data-ui-id": `pdf-open-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Open PDF button",
    }),
    PROGRESS_BAR: (id: string) => ({
      "data-ui-id": `pdf-progress-${id}`,
      "data-ui-type": "progress",
      "data-ui-description": "PDF processing progress bar",
    }),
    PAGINATION: {
      "data-ui-id": "pdf-pagination",
      "data-ui-type": "pagination",
      "data-ui-description": "PDF list pagination controls",
    },
  },

  // Projects & Conversations
  PROJECT: {
    CARD: (id: string) => ({
      "data-ui-id": `project-card-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "Project card",
    }),
    LIST: {
      "data-ui-id": "project-list",
      "data-ui-type": "list",
      "data-ui-description": "Projects list container",
    },
    NAME_INPUT: {
      "data-ui-id": "project-name-input",
      "data-ui-type": "input",
      "data-ui-description": "Project name input field",
    },
    EDIT_BUTTON: (id: string) => ({
      "data-ui-id": `project-edit-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Edit project button",
    }),
    DELETE_BUTTON: (id: string) => ({
      "data-ui-id": `project-delete-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Delete project button",
    }),
  },

  CONVERSATION: {
    ITEM: (id: string) => ({
      "data-ui-id": `conversation-item-${id}`,
      "data-ui-type": "list-item",
      "data-ui-description": "Conversation list item",
    }),
    LIST: {
      "data-ui-id": "conversation-list",
      "data-ui-type": "list",
      "data-ui-description": "Conversations list container",
    },
    CHECKBOX: (id: string) => ({
      "data-ui-id": `conversation-checkbox-${id}`,
      "data-ui-type": "checkbox",
      "data-ui-description": "Conversation selection checkbox",
    }),
    DELETE_SELECTED: {
      "data-ui-id": "conversation-delete-selected",
      "data-ui-type": "button",
      "data-ui-description": "Delete selected conversations button",
    },
  },

  // Suggestions & Corrections
  SUGGESTION: {
    POPUP: {
      "data-ui-id": "suggestion-popup",
      "data-ui-type": "popup",
      "data-ui-description": "Suggestion popup/tooltip",
    },
    CARD: (id: string) => ({
      "data-ui-id": `suggestion-card-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "Suggestion card",
    }),
    APPLY_BUTTON: (id: string) => ({
      "data-ui-id": `suggestion-apply-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Apply suggestion button",
    }),
    DISMISS_BUTTON: (id: string) => ({
      "data-ui-id": `suggestion-dismiss-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Dismiss suggestion button",
    }),
    HIGHLIGHT: (id: string) => ({
      "data-ui-id": `suggestion-highlight-${id}`,
      "data-ui-type": "highlight",
      "data-ui-description": "Suggestion highlighted text in editor",
    }),
  },

  // Quarantine
  QUARANTINE: {
    ITEM: (id: string) => ({
      "data-ui-id": `quarantine-item-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "Quarantine item card",
    }),
    BADGE: {
      "data-ui-id": "quarantine-badge",
      "data-ui-type": "badge",
      "data-ui-description": "Quarantine count badge",
    },
    APPROVE_BUTTON: (id: string) => ({
      "data-ui-id": `quarantine-approve-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Approve quarantine item button",
    }),
    REJECT_BUTTON: (id: string) => ({
      "data-ui-id": `quarantine-reject-${id}`,
      "data-ui-type": "button",
      "data-ui-description": "Reject quarantine item button",
    }),
  },

  // Status Indicators
  STATUS: {
    LOADING: {
      "data-ui-id": "status-loading",
      "data-ui-type": "status",
      "data-ui-description": "Loading indicator",
    },
    PROCESSING: {
      "data-ui-id": "status-processing",
      "data-ui-type": "status",
      "data-ui-description": "Processing indicator",
    },
    SPINNER: {
      "data-ui-id": "status-spinner",
      "data-ui-type": "spinner",
      "data-ui-description": "Loading spinner animation",
    },
    BADGE: (type: string) => ({
      "data-ui-id": `status-badge-${type}`,
      "data-ui-type": "badge",
      "data-ui-description": `${type} status badge`,
    }),
    UNSAVED_INDICATOR: {
      "data-ui-id": "status-unsaved",
      "data-ui-type": "indicator",
      "data-ui-description": "Unsaved changes indicator",
    },
  },

  // Settings Components
  SETTINGS: {
    TEMPERATURE_SLIDER: {
      "data-ui-id": "settings-temperature-slider",
      "data-ui-type": "slider",
      "data-ui-description": "Temperature setting slider",
    },
    REASONING_TOGGLE: {
      "data-ui-id": "settings-reasoning-toggle",
      "data-ui-type": "toggle",
      "data-ui-description": "Enable reasoning toggle",
    },
    EDITORIAL_TOGGLE: {
      "data-ui-id": "settings-editorial-toggle",
      "data-ui-type": "toggle",
      "data-ui-description": "Enable editorial toggle",
    },
    THEME_TOGGLE: {
      "data-ui-id": "settings-theme-toggle",
      "data-ui-type": "toggle",
      "data-ui-description": "Light/Dark theme toggle",
    },
    SAVE_BUTTON: {
      "data-ui-id": "settings-save-button",
      "data-ui-type": "button",
      "data-ui-description": "Save settings button",
    },
    RESET_BUTTON: {
      "data-ui-id": "settings-reset-button",
      "data-ui-type": "button",
      "data-ui-description": "Reset settings to default button",
    },
  },

  // Keeper Chat specific
  KEEPER: {
    PANEL: {
      "data-ui-id": "keeper-panel",
      "data-ui-type": "panel",
      "data-ui-description": "Keeper chat panel",
    },
    MESSAGE: (id: string) => ({
      "data-ui-id": `keeper-message-${id}`,
      "data-ui-type": "message",
      "data-ui-description": "Keeper chat message",
    }),
  },

  // Artifacts
  ARTIFACTS: {
    FILTER_PANEL: {
      "data-ui-id": "artifacts-filter-panel",
      "data-ui-type": "panel",
      "data-ui-description": "Artifacts filter panel",
    },
    GRID: {
      "data-ui-id": "artifacts-grid",
      "data-ui-type": "grid",
      "data-ui-description": "Artifacts grid container",
    },
    CARD: (id: string) => ({
      "data-ui-id": `artifact-card-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "Artifact card",
    }),
  },

  // Memories/Prompts
  MEMORIES: {
    TAB: {
      "data-ui-id": "memories-tab",
      "data-ui-type": "tab",
      "data-ui-description": "Memories tab",
    },
    LIST: {
      "data-ui-id": "memories-list",
      "data-ui-type": "list",
      "data-ui-description": "Memories list container",
    },
    CARD: (id: string) => ({
      "data-ui-id": `memory-card-${id}`,
      "data-ui-type": "card",
      "data-ui-description": "Memory/Prompt card",
    }),
    SEARCH_INPUT: {
      "data-ui-id": "memories-search-input",
      "data-ui-type": "input",
      "data-ui-description": "Search memories input field",
    },
  },

  // Dropzone
  DROPZONE: {
    PDF: {
      "data-ui-id": "dropzone-pdf",
      "data-ui-type": "dropzone",
      "data-ui-description": "PDF file dropzone area",
    },
    ACTIVE: {
      "data-ui-id": "dropzone-active",
      "data-ui-type": "dropzone",
      "data-ui-description": "Dropzone in active/dragging state",
    },
  },

  // Analysis Mode
  ANALYSIS: {
    MODE_SELECTOR: {
      "data-ui-id": "analysis-mode-selector",
      "data-ui-type": "dropdown",
      "data-ui-description": "Analysis mode dropdown selector",
    },
    STUDENT_MODE: {
      "data-ui-id": "analysis-mode-student",
      "data-ui-type": "option",
      "data-ui-description": "Student analysis mode option",
    },
    TEACHER_MODE: {
      "data-ui-id": "analysis-mode-teacher",
      "data-ui-type": "option",
      "data-ui-description": "Teacher analysis mode option",
    },
    GRAMMAR_MODE: {
      "data-ui-id": "analysis-mode-grammar",
      "data-ui-type": "option",
      "data-ui-description": "Grammar check mode option",
    },
  },

  // Toast notifications
  TOAST: {
    CONTAINER: {
      "data-ui-id": "toast-container",
      "data-ui-type": "toast",
      "data-ui-description": "Toast notifications container",
    },
    MESSAGE: (id: string) => ({
      "data-ui-id": `toast-message-${id}`,
      "data-ui-type": "toast",
      "data-ui-description": "Toast notification message",
    }),
  },
} as const;

/**
 * Helper function to combine UI identifiers with additional props
 * Usage: <div {...mergeUIId(UI_ID.CHAT.CONTAINER, { className: 'my-class' })}>
 */
export function mergeUIId<T extends Record<string, unknown>>(
  uiId: Record<string, string>,
  props?: T,
): Record<string, unknown> {
  return { ...uiId, ...props };
}

/**
 * Get a custom UI identifier for dynamic elements
 */
export function customUIId(
  id: string,
  type: string,
  description?: string,
): Record<string, string> {
  return {
    "data-ui-id": id,
    "data-ui-type": type,
    ...(description && { "data-ui-description": description }),
  };
}

/**
 * Export UI identifiers map for documentation or Figma plugin integration
 */
export function exportUIMap() {
  const flatMap: Record<string, Record<string, string>> = {};

  function flatten(obj: Record<string, unknown>, prefix = ""): void {
    for (const key in obj) {
      const value = obj[key];
      const newPrefix = prefix ? `${prefix}.${key}` : key;

      if (
        typeof value === "object" &&
        value !== null &&
        "data-ui-id" in value
      ) {
        flatMap[newPrefix] = value as Record<string, string>;
      } else if (
        typeof value === "object" &&
        value !== null &&
        typeof value !== "function"
      ) {
        flatten(value as Record<string, unknown>, newPrefix);
      }
    }
  }

  flatten(UI_ID as unknown as Record<string, unknown>);
  return flatMap;
}

// Export to window for easy browser console access
if (typeof window !== "undefined") {
   
  (window as any).exportUIMap = exportUIMap;
   
  (window as any).UI_ID = UI_ID;
}
