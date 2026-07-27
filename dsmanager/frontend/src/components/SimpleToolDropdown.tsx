/**
 * SIMPLE TOOL DROPDOWN
 *
 * Compact dropdown for Tool Call section that:
 * - Sits next to the attachment button
 * - Updates Tool Call textarea with selected tool
 * - Tags properly for AI recognition
 * - Works with existing XML commands
 */

import React, { useState, useEffect, useRef } from 'react';

// Available tools that can be selected
export const TOOL_OPTIONS = [
  {
    value: 'lexical-editor:load',
    label: '📝 Lexical',
    fullName: 'Lexical Editor',
    description: 'Rich text writing'
  },
  {
    value: 'markdown-editor:compile',
    label: '📄 Markdown',
    fullName: 'Markdown Editor',
    description: 'WYSIWYG markdown'
  },
  {
    value: 'text:display',
    label: '📋 Text',
    fullName: 'Text Output',
    description: 'Default output'
  },
  {
    value: 'code:display',
    label: '💻 Code',
    fullName: 'Code Viewer',
    description: 'Syntax highlighting'
  }
];

export function SimpleToolDropdown() {
  const [selectedTool, setSelectedTool] = useState('text:display');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (toolValue: string) => {
    setSelectedTool(toolValue);
    setIsOpen(false);

    // Update the Tool Call textarea
    const textarea = document.querySelector('textarea[data-section-name="Tool Call"]') as HTMLTextAreaElement;
    if (textarea) {
      // Set tool value that AI can recognize
      textarea.value = toolValue;

      // Add metadata comment for clarity
      if (toolValue.includes('lexical')) {
        textarea.value += '\n# Rich text editor for writing';
      } else if (toolValue.includes('markdown')) {
        textarea.value += '\n# WYSIWYG markdown editor';
      }

      // Trigger input event
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
    }

    // Dispatch event for system recognition
    window.dispatchEvent(new CustomEvent('tool-selected', {
      detail: {
        tool: toolValue,
        timestamp: new Date().toISOString()
      }
    }));

    // Log for AI awareness
    console.log('[Tool Selected]', toolValue);
  };

  // Listen for AI tool assignment
  useEffect(() => {
    const handleAIToolAssign = (e: CustomEvent) => {
      const { tool } = e.detail;
      if (TOOL_OPTIONS.find(t => t.value === tool)) {
        handleSelect(tool);
      }
    };

    // AI can use these events to assign tools
    window.addEventListener('ai-assign-tool', handleAIToolAssign as EventListener);
    window.addEventListener('set-tool', handleAIToolAssign as EventListener);

    return () => {
      window.removeEventListener('ai-assign-tool', handleAIToolAssign as EventListener);
      window.removeEventListener('set-tool', handleAIToolAssign as EventListener);
    };
  }, []);

  const currentTool = TOOL_OPTIONS.find(t => t.value === selectedTool) || TOOL_OPTIONS[2];

  return (
    <div
      ref={dropdownRef}
      className="relative h-full flex items-center px-3"
      data-tool-dropdown
      data-selected={selectedTool}
      data-ai-controllable="true"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-sm hover:bg-gray-100 px-2 py-1 rounded transition-colors"
        title={`Tool: ${currentTool.fullName}`}
        aria-label="Select tool for output"
        data-ai-tag="tool-selector"
      >
        <span>{currentTool.label}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[180px]">
          {TOOL_OPTIONS.map(tool => (
            <button
              key={tool.value}
              type="button"
              onClick={() => handleSelect(tool.value)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between ${
                selectedTool === tool.value ? 'bg-blue-50' : ''
              }`}
              data-tool-option={tool.value}
            >
              <div className="flex items-center gap-2">
                <span>{tool.label}</span>
                <span className="text-gray-600">{tool.fullName}</span>
              </div>
              {selectedTool === tool.value && (
                <span className="text-blue-600 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Hidden input for form submission and AI reading */}
      <input
        type="hidden"
        name="selected_output_tool"
        value={selectedTool}
        data-ai-readable="true"
      />
    </div>
  );
}