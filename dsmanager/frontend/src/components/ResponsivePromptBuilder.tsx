import * as React from "react";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import svgPaths from "../imports/svg-lci6lnrtd4";
import { useDrag, useDrop } from 'react-dnd';
import { motion, AnimatePresence } from './MotionReplacement';
import { SimpleToolDropdown } from './SimpleToolDropdown';
/**
 * LEFT RAIL SYSTEM - Flexible Icon Placement
 * 
 * The left rail is a 45px reserved space for systematic icon placement across all role sections.
 * This space allows the app to inject icons for:
 *   - Collapse/expand controls
 *   - Error indicators
 *   - Warning alerts  
 *   - Info badges
 *   - Quick-jump links (scroll to specific prompt sections)
 *   - Custom status icons
 * 
 * USAGE:
 * 1. Use <LeftRailIcon> component with position="collapse" or position="status"
 * 2. Icons automatically position at standardized locations
 * 3. Easy to add hover text with the 'title' prop
 * 4. onClick handlers enable quick navigation to errors/sections
 * 
 * EXAMPLE:
 * <LeftRailIcon 
 *   position="status" 
 *   type="error" 
 *   title="Error: Missing required field on line 23" 
 *   onClick={() => scrollToLine(23)} 
 * />
 */
const LEFT_RAIL = {
  WIDTH: 45,                  // Total left rail reserved space
  COLLAPSE_CENTER: 23.5,      // Center point for collapse icons (4px left of status icons)
  STATUS_CENTER: 27.5,        // Center point for status icons (aligned with role icons)
  COLLAPSE_ICON_SIZE: 20,     // Collapse icon size
  STATUS_ICON_SIZE: 18,       // Status icon size
  CONTENT_START: 45           // Where main content begins
};

const ItemTypes = {
  ROLE_SECTION: 'roleSection'
};

interface DragItem {
  id: string;
  index: number;
}

// Reusable left rail icon component for collapse, status, alerts, etc.
interface LeftRailIconProps {
  position: 'collapse' | 'status';
  type?: 'collapse-expand' | 'error' | 'warning' | 'info' | 'custom';
  isExpanded?: boolean;
  onClick?: () => void;
  title?: string;
  icon?: ReactNode;
  top?: string;
}

function LeftRailIcon({ position, type = 'collapse-expand', isExpanded = true, onClick, title, icon, top = '10px' }: LeftRailIconProps) {
  // Calculate centered position based on icon type and size
  const iconSize = type === 'collapse-expand' ? LEFT_RAIL.COLLAPSE_ICON_SIZE : LEFT_RAIL.STATUS_ICON_SIZE;
  const centerPoint = type === 'collapse-expand' ? LEFT_RAIL.COLLAPSE_CENTER : LEFT_RAIL.STATUS_CENTER;
  const leftPosition = centerPoint - (iconSize / 2);
  
  if (type === 'collapse-expand') {
    return (
      <button
        onClick={onClick}
        className="absolute z-10 flex items-center justify-center rounded transition-all hover:outline hover:outline-2 hover:outline-[#4066e3] hover:text-[#4066e3]"
        style={{ 
          left: `${leftPosition}px`, 
          top,
          width: `${LEFT_RAIL.COLLAPSE_ICON_SIZE}px`,
          height: `${LEFT_RAIL.COLLAPSE_ICON_SIZE}px`
        }}
        title={title || (isExpanded ? "Collapse" : "Expand")}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {isExpanded ? (
            <line x1="4" y1="8" x2="12" y2="8" />
          ) : (
            <>
              <line x1="8" y1="4" x2="8" y2="12" />
              <line x1="4" y1="8" x2="12" y2="8" />
            </>
          )}
        </svg>
      </button>
    );
  }
  
  if (type === 'error') {
    return (
      <button
        onClick={onClick}
        className="absolute z-10 flex items-center justify-center hover:opacity-80 transition-opacity"
        style={{ 
          left: `${leftPosition}px`, 
          top,
          width: `${LEFT_RAIL.STATUS_ICON_SIZE}px`,
          height: `${LEFT_RAIL.STATUS_ICON_SIZE}px`
        }}
        title={title}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="8" fill="#ef4444" />
          <path d="M9 5v5M9 12v1" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    );
  }
  
  if (type === 'warning') {
    return (
      <button
        onClick={onClick}
        className="absolute z-10 flex items-center justify-center hover:opacity-80 transition-opacity"
        style={{ 
          left: `${leftPosition}px`, 
          top,
          width: `${LEFT_RAIL.STATUS_ICON_SIZE}px`,
          height: `${LEFT_RAIL.STATUS_ICON_SIZE}px`
        }}
        title={title}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2l7.794 13.5H1.206L9 2z" fill="#f59e0b" />
          <path d="M9 7v4M9 13v1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    );
  }
  
  if (type === 'info') {
    return (
      <button
        onClick={onClick}
        className="absolute z-10 flex items-center justify-center hover:opacity-80 transition-opacity"
        style={{ 
          left: `${leftPosition}px`, 
          top,
          width: `${LEFT_RAIL.STATUS_ICON_SIZE}px`,
          height: `${LEFT_RAIL.STATUS_ICON_SIZE}px`
        }}
        title={title}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="8" fill="#3b82f6" />
          <path d="M9 8v5M9 6v1" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    );
  }
  
  if (icon) {
    return (
      <button
        onClick={onClick}
        className="absolute z-10 flex items-center justify-center hover:opacity-80 transition-opacity"
        style={{ 
          left: `${leftPosition}px`, 
          top,
          width: `${LEFT_RAIL.COLLAPSE_ICON_SIZE}px`,
          height: `${LEFT_RAIL.COLLAPSE_ICON_SIZE}px`
        }}
        title={title}
      >
        {icon}
      </button>
    );
  }
  
  return null;
}

interface DraggableRoleProps {
  id: string;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  children: (dragRef: any) => ReactNode;
}

function DraggableRole({ id, index, moveSection, children }: DraggableRoleProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.ROLE_SECTION,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      
      if (!clientOffset) {
        return;
      }
      
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveSection(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.ROLE_SECTION,
    item: () => {
      return { id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Connect drag ONLY to the drag handle (which will be the dropdown button)
  // Connect drop to the entire container for better drop zone detection
  drop(ref);

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className="w-full"
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children(drag)}
    </div>
  );
}

// History management hook with actual state tracking
function useHistory<T>(initialState: T, maxSteps = 10) {
  const [historyStack, setHistoryStack] = useState<T[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [canUndo, setCanUndo] = useState(false);

  const addToHistory = useCallback((newState: T) => {
    setHistoryStack(prev => {
      // Remove any future states if we're not at the end
      const newStack = prev.slice(0, currentIndex + 1);
      // Add new state
      newStack.push(newState);
      // Limit stack size
      const limitedStack = newStack.slice(-maxSteps);
      return limitedStack;
    });
    setCurrentIndex(prev => {
      const newIndex = Math.min(prev + 1, maxSteps - 1);
      setCanUndo(newIndex > 0);
      return newIndex;
    });
  }, [currentIndex, maxSteps]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      setCanUndo(newIndex > 0);
      return historyStack[newIndex];
    }
    return historyStack[currentIndex];
  }, [currentIndex, historyStack]);

  const getCurrentState = useCallback(() => {
    return historyStack[currentIndex];
  }, [currentIndex, historyStack]);

  return { 
    canUndo, 
    addToHistory, 
    undo, 
    historyCount: currentIndex,
    getCurrentState 
  };
}

// Text selection toolbar component
function TextSelectionToolbar() {
  const [position, setPosition] = useState({ x: 0, y: 0, show: false });
  const [selectedText, setSelectedText] = useState("");
  const [activeElement, setActiveElement] = useState<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTextareaSelection = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const text = target.value.substring(start, end);
        
        if (text && text.length > 0) {
          // Get the textarea's position
          const rect = target.getBoundingClientRect();
          
          setPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY,
            show: true
          });
          setSelectedText(text);
          setActiveElement(target);
        } else {
          setPosition({ x: 0, y: 0, show: false });
          setSelectedText("");
          setActiveElement(null);
        }
      }
    };

    const handleRegularSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect) {
          setPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY,
            show: true
          });
          setSelectedText(text);
          setActiveElement(null);
        }
      } else if (!activeElement) {
        setPosition({ x: 0, y: 0, show: false });
        setSelectedText("");
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        setTimeout(() => handleTextareaSelection(e), 10);
      } else {
        setTimeout(handleRegularSelection, 10);
      }
    };

    const handleSelect = (e: Event) => {
      handleTextareaSelection(e);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
          const selection = window.getSelection();
          const text = selection?.toString().trim();
          if (!text) {
            setPosition({ x: 0, y: 0, show: false });
            setActiveElement(null);
          }
        }
      }
    };

    // Listen to all textareas for select events
    const textareas = document.querySelectorAll('textarea, input');
    textareas.forEach(textarea => {
      textarea.addEventListener('select', handleSelect);
      textarea.addEventListener('mouseup', handleSelect);
    });

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('selectionchange', handleRegularSelection);

    return () => {
      textareas.forEach(textarea => {
        textarea.removeEventListener('select', handleSelect);
        textarea.removeEventListener('mouseup', handleSelect);
      });
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('selectionchange', handleRegularSelection);
    };
  }, [activeElement]);

  const applyFormatting = (format: 'bold' | 'italic' | 'color') => {
    if (activeElement) {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const text = activeElement.value;
      const selectedText = text.substring(start, end);
      
      let wrappedText = selectedText;
      if (format === 'bold') {
        wrappedText = `**${selectedText}**`;
      } else if (format === 'italic') {
        wrappedText = `*${selectedText}*`;
      }
      
      const newValue = text.substring(0, start) + wrappedText + text.substring(end);
      activeElement.value = newValue;
      
      // Trigger change event
      const event = new Event('input', { bubbles: true });
      activeElement.dispatchEvent(event);
    }
  };

  if (!position.show || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed bg-white shadow-lg rounded-md border border-gray-300 flex items-center gap-1 p-1.5 z-[9999]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, calc(-100% - 8px))'
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Bold"
        onClick={() => applyFormatting('bold')}
        onMouseDown={(e) => e.preventDefault()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 2h5a3 3 0 010 6H4V2zm0 6h6a3 3 0 010 6H4V8z" />
        </svg>
      </button>
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors italic"
        title="Italic"
        onClick={() => applyFormatting('italic')}
        onMouseDown={(e) => e.preventDefault()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="10" y1="2" x2="6" y2="14" />
          <line x1="7" y1="2" x2="11" y2="2" />
          <line x1="5" y1="14" x2="9" y2="14" />
        </svg>
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Color"
        onMouseDown={(e) => e.preventDefault()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Variables"
        onMouseDown={(e) => e.preventDefault()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <text x="2" y="12" fontSize="12" fontWeight="bold">{'{ }'}</text>
        </svg>
      </button>
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Attachment"
        onClick={() => {
          // Trigger the hidden file input in the Tool Call section
          const fileInput = document.getElementById('tool-call-file-input');
          if (fileInput) {
            fileInput.click();
          } else {
            // If no Tool Call section exists, add one first
            window.dispatchEvent(new CustomEvent('add-prompt-role', {
              detail: { roleName: 'Tool Call', placeholder: '' }
            }));
            setTimeout(() => {
              document.getElementById('tool-call-file-input')?.click();
            }, 200);
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M14 8.5V13a2 2 0 01-2 2H4a2 2 0 01-2-2V8.5M11 4L8 1 5 4M8 1v9" />
        </svg>
      </button>
      <button
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Tool Call"
        onClick={() => {
          // Scroll to the Tool Call section or add it
          const toolSection = document.querySelector('[data-section-name="Tool Call"]');
          if (toolSection) {
            toolSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Focus the textarea inside
            const ta = toolSection.querySelector('textarea');
            if (ta) ta.focus();
          } else {
            window.dispatchEvent(new CustomEvent('add-prompt-role', {
              detail: { roleName: 'Tool Call', placeholder: '' }
            }));
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 6l-6 6-4-4" />
          <path d="M2 8l2 2" />
        </svg>
      </button>
    </div>
  );
}

function SystemRoleSection() {
  return (
    <div className="relative h-[43px] w-full" data-section-container data-section-name="System Role" data-section-state="active" data-section-actions="edit_content; toggle_functions_tools" data-tag="prompt-section">
      <div className="absolute bg-white h-[43px] left-[51.92px] right-[224px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] px-3 py-3">
        <div className="flex items-center h-full">
          <p className="font-['Inter:Bold',sans-serif] font-bold text-[18px] text-[#171717] leading-[normal]">System Role</p>
        </div>
      </div>
      
      <button className="absolute bg-white h-[43px] right-[20px] w-[194px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all">
        <div className="flex items-center justify-center h-full font-['Inter:Bold',sans-serif] font-bold text-[16px] text-[#5a5a5a]">
          <p className="leading-[normal]">Functions / Tools</p>
        </div>
      </button>

      <div className="absolute left-[1.92px] size-[37px] top-[3px] pointer-events-none" data-name="lightning_alt_fill_light">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 37 37">
          <g id="lightning_alt_fill_light">
            <path d={svgPaths.p32331f80} fill="var(--fill-0, #33363F)" id="Subtract" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function AutoResizeTextarea({
  initialValue = "",
  className,
  ariaLabel = 'Prompt content',
  sectionName = '',
  placeholder,
  sectionId,
}: {
  initialValue?: string;
  className?: string;
  ariaLabel?: string;
  sectionName?: string;
  placeholder?: string;
  sectionId?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);

  // A2UI Architecture: Persistent UUID for this section
  // This ID stays constant across sessions and allows trace tracking
  const [persistentSectionId] = useState(() => {
    return sectionId || crypto.randomUUID?.() || `section-${Date.now()}-${Math.random()}`;
  });

  // Sync when a non-empty initialValue arrives after first render (e.g. session load).
  // Only overwrite if the textarea is still empty — don't clobber user edits.
  useEffect(() => {
    if (initialValue && !value) {
      setValue(initialValue);
    }
  }, [initialValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.max(50, textareaRef.current.scrollHeight);
      textareaRef.current.style.height = newHeight + "px";
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Initialize height on mount
  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  // Add resize observer to handle browser resize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) return; // already scheduled — skip
      rafId = requestAnimationFrame(() => {
        rafId = null;
        adjustHeight();
      });
    });

    resizeObserver.observe(textarea);

    const handleResize = () => { adjustHeight(); };
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [adjustHeight]);

  // Listen for AI column action events and apply to React state.
  // Guard: skip if value hasn't changed to prevent cascade re-renders.
  useEffect(() => {
    const handleClear = () => {
      setValue(prev => prev === '' ? prev : '');
    };

    const handleSet = (e: Event) => {
      const { content, target } = (e as CustomEvent<{ content: string; target: string }>).detail;
      if (target) {
        // Targeted update: only update this textarea if section name matches
        const matches = sectionName.toLowerCase().includes(target.toLowerCase()) ||
          target.toLowerCase().includes(sectionName.toLowerCase());
        if (!matches) return;
      } else {
        // Untargeted SET_LEFT: only the first textarea (System Role) absorbs it
        if (sectionName !== 'System Role') return;
      }
      // AI-initiated updates (from XML tags in chat) ALWAYS overwrite.
      // The guard that blocked non-empty textareas (prev === '' ? content : prev)
      // has been removed. The AI is the primary interface and must have full
      // control over all sections — the same capabilities as a human user.
      setValue(content);
    };

    // New handler for database loading - exact name match required
    const handleForceSet = (e: Event) => {
      const { sectionName: targetName, content, override } =
        (e as CustomEvent<{ sectionName: string; content: string; override: boolean }>).detail;

      // Exact match only for database loads
      if (targetName === sectionName) {
        console.log(`[ResponsivePromptBuilder] Loading "${sectionName}" from database with ${content.length} chars`);
        setValue(content);
        // Trigger height adjustment after content loads
        setTimeout(() => adjustHeight(), 50);
      }
    };

    // DEAD CODE REMOVED: collect-prompt-sections / prompt-section-response
    // The save pipeline now reads sections from the Lit <prompt-section-editor> ref.
    // These React textareas are NOT the source of truth — the Lit editor is.

    window.addEventListener('clear-left-column', handleClear);
    window.addEventListener('set-left-column-text', handleSet);
    window.addEventListener('force-set-section', handleForceSet);

    return () => {
      window.removeEventListener('clear-left-column', handleClear);
      window.removeEventListener('set-left-column-text', handleSet);
      window.removeEventListener('force-set-section', handleForceSet);
    };
  }, [sectionName, adjustHeight, value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label={sectionName || ariaLabel}
      data-section-name={sectionName || ariaLabel}
      data-section-state="active"
      data-section-id={persistentSectionId}
      data-trace-enabled="true"
      className={className}
      placeholder={placeholder}
      style={{ overflow: "hidden", resize: "none", minHeight: "50px" }}
    />
  );
}

function SystemRoleContent() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showStatusIcon] = useState(false); // Toggle this to demo status icons

  // A2UI Architecture: Persistent section ID for System Role
  const [sectionId] = useState(() => crypto.randomUUID?.() || `system-role-${Date.now()}`);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0" data-section-id={sectionId}>
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick} 
      />
      
      {/* Left Rail: Status Icon Slot - Easy to inject dynamically */}
      {showStatusIcon && (
        <LeftRailIcon 
          position="status" 
          type="error" 
          title="Error: Missing required field at line 3" 
          onClick={() => console.log('Jump to error at line 3')} 
        />
      )}
      
      <motion.div 
        className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {isExpanded && (
          <AutoResizeTextarea
            sectionName="System Role"
            sectionId={sectionId}
            initialValue=""
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
            placeholder="Type your system prompt here..."
          />
        )}
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            You are a professional solar energy system designer...
          </div>
        )}
      </motion.div>
    </div>
  );
}

function VariableComponent() {
  const [showVarDropdown, setShowVarDropdown] = useState(false);
  const [showMultimediaDropdown, setShowMultimediaDropdown] = useState(false);
  const [showUrlDropdown, setShowUrlDropdown] = useState(false);

  return (
    <div className="absolute font-['Inter:Bold',sans-serif] font-bold h-[17px] leading-[0] left-[284.74px] not-italic text-[14px] top-[12px] w-[228px] whitespace-nowrap" data-name="Component 3">
      <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[92px] text-[#767676] top-[8.5px]">
        <p className="font-['Inter:Medium',sans-serif] font-medium flex gap-2">
          <span 
            onClick={(e) => {
              e.stopPropagation();
              setShowMultimediaDropdown(!showMultimediaDropdown);
            }}
            className="leading-[normal] hover:text-[#4066e3] relative cursor-pointer"
          >
            {` {{multimedia}}`}
            {showMultimediaDropdown && (
              <div className="absolute left-0 top-[20px] bg-white rounded-[4px] shadow-lg w-[120px] z-[9999] text-left">
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">Image</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">Video</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">Audio</div>
              </div>
            )}
          </span>
          <span 
            onClick={(e) => {
              e.stopPropagation();
              setShowUrlDropdown(!showUrlDropdown);
            }}
            className="leading-[normal] hover:text-[#4066e3] relative cursor-pointer"
          >
            {`{{url}}`}
            {showUrlDropdown && (
              <div className="absolute left-0 top-[20px] bg-white rounded-[4px] shadow-lg w-[100px] z-[9999] text-left">
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">URL</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">Link</div>
              </div>
            )}
          </span>
        </p>
      </div>
      <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[-5px] text-[#4066e3] top-[8.5px]">
        <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold">
          <span 
            onClick={(e) => {
              e.stopPropagation();
              setShowVarDropdown(!showVarDropdown);
            }}
            className="leading-[normal] hover:text-[#6358D6] relative cursor-pointer"
          >
            {`{{variables}} `}
            {showVarDropdown && (
              <div className="absolute left-0 top-[20px] bg-white rounded-[4px] shadow-lg w-[150px] z-[9999] text-left">
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">grid_type</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">application</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">power_requirement</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">battery_voltage</div>
                <div className="w-full px-3 py-1.5 text-[12px] hover:bg-[#f0f0f0] text-[#171717] cursor-pointer">panel_type</div>
              </div>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}

function UserRoleSection({ dragRef, onRemove, onRoleChange }: { dragRef?: any; onRemove?: () => void; onRoleChange?: (role: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dragRef && buttonRef.current) {
      dragRef(buttonRef);
    }
  }, [dragRef]);

  const handleRoleChange = (role: string) => {
    if (onRoleChange) {
      onRoleChange(role);
    }
    setShowDropdown(false);
  };

  const handleRemoveClick = () => {
    setShowDropdown(false);
    setShowConfirmRemove(true);
  };

  const handleConfirmRemove = () => {
    if (onRemove) {
      onRemove();
    }
  };

  const handleCancelRemove = () => {
    setShowConfirmRemove(false);
  };

  return (
    <div className="relative h-[43px] w-full shrink-0" data-section-container data-section-name="User Role" data-section-state="active" data-section-actions="edit_content; change_role:Tool Call,Agent Role; remove; collapse" data-tag="prompt-section">
      <AnimatePresence mode="wait">
        {showConfirmRemove ? (
          <motion.div 
            key="confirm-remove"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute bg-white h-[43px] left-[51px] right-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-[-4px] px-3 py-3"
          >
            <div className="flex items-center justify-between h-full w-full">
              <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold text-[14px] text-[#171717]">Remove this section?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelRemove}
                  className="px-4 py-1 bg-gray-200 hover:bg-gray-300 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-[#171717] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRemove}
                  className="px-4 py-1 bg-red-500 hover:bg-red-600 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-white transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="role-button"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            ref={buttonRef}
            onClick={() => setShowDropdown(!showDropdown)}
            className="absolute bg-white h-[43px] left-[51px] right-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-[-4px] hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all px-3 py-3 cursor-move"
          >
            <div className="flex items-center h-full">
              <p className="font-['Inter:Bold',sans-serif] font-bold text-[18px] text-[#171717] leading-[normal]">User Role</p>
            </div>
            <VariableComponent />
            <div className="absolute h-[28px] left-[166.74px] top-[9px] w-[27px] pointer-events-none">
              <div className="absolute bottom-1/4 left-[11.88%] right-[11.88%] top-[7.54%]">
                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20.5834 18.8884">
                  <path d={svgPaths.p3d183980} fill="var(--fill-0, #E4D48E)" id="Polygon 1" stroke="var(--stroke-0, #D29207)" />
                </svg>
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showDropdown && !showConfirmRemove && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute left-[51px] top-[44px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] right-[20px] z-50"
          >
            <div className="py-2">
              <button 
                onClick={handleRemoveClick}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#ffebeb] text-[#d32f2f] transition-colors"
              >
                Remove Role
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button 
                onClick={() => handleRoleChange('User Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                User Role
              </button>
              <button 
                onClick={() => handleRoleChange('Tool Call')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Tool Call
              </button>
              <button 
                onClick={() => handleRoleChange('Agent Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Agent Role
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-[-56px] size-[37px] top-[104px] pointer-events-none">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 37 37">
          <g id="Frame 886906">
            <path d={svgPaths.p33651600} id="Vector 602" stroke="url(#paint0_linear_4_1734)" strokeLinecap="round" strokeWidth="2" />
          </g>
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_4_1734" x1="19.5" x2="19.5" y1="7" y2="30">
              <stop stopColor="#7E72E3" />
              <stop offset="1" stopColor="#4234B8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function UserRoleContent() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sectionId] = useState(() => crypto.randomUUID?.() || `user-role-${Date.now()}`);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0" data-section-id={sectionId}>
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick}
        top="8px"
      />
      
      {/* Left Rail: Status Icon Slot */}
      {/* <LeftRailIcon position="status" type="info" title="Tip: Use variables for dynamic content" top="8px" onClick={() => console.log('Jump to variables')} /> */}
      
      <motion.div 
        className="bg-white rounded-[6px] p-[10px] mr-[20px] top-[8px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {isExpanded && (
          <AutoResizeTextarea
            sectionName="User Role"
            sectionId={sectionId}
            initialValue=""
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
            placeholder="Type your user prompt here..."
          />
        )}
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            Design a complete {'{grid_type}'} solar power system...
          </div>
        )}
      </motion.div>
        
      <div className="absolute left-[-56px] size-[37px] top-[104px] pointer-events-none">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 37 37">
          <g id="Frame 886906">
            <path d={svgPaths.p33651600} id="Vector 602" stroke="url(#paint0_linear_4_1734)" strokeLinecap="round" strokeWidth="2" />
          </g>
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_4_1734" x1="19.5" x2="19.5" y1="7" y2="30">
              <stop stopColor="#7E72E3" />
              <stop offset="1" stopColor="#4234B8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function ToolCallSection({ dragRef, onRemove, onRoleChange }: { dragRef?: any; onRemove?: () => void; onRoleChange?: (role: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dragRef && buttonRef.current) {
      dragRef(buttonRef);
    }
  }, [dragRef]);

  const handleRoleChange = (role: string) => {
    if (onRoleChange) {
      onRoleChange(role);
    }
    setShowDropdown(false);
  };

  const handleRemoveClick = () => {
    setShowDropdown(false);
    setShowConfirmRemove(true);
  };

  const handleConfirmRemove = () => {
    if (onRemove) {
      onRemove();
    }
  };

  const handleCancelRemove = () => {
    setShowConfirmRemove(false);
  };

  return (
    <div className="relative h-[43px] w-full shrink-0" data-section-container data-section-name="Tool Call" data-section-state="active" data-section-actions="edit_content; change_role:User Role,Agent Role; remove; collapse" data-tag="prompt-section">
      <AnimatePresence mode="wait">
        {showConfirmRemove ? (
          <motion.div 
            key="confirm-remove"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute bg-white h-[43px] left-[51.92px] right-[224px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-0 px-3 py-3"
          >
            <div className="flex items-center justify-between h-full w-full">
              <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold text-[14px] text-[#171717]">Remove this section?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelRemove}
                  className="px-4 py-1 bg-gray-200 hover:bg-gray-300 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-[#171717] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRemove}
                  className="px-4 py-1 bg-red-500 hover:bg-red-600 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-white transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button 
            key="role-button"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            ref={buttonRef}
            onClick={() => setShowDropdown(!showDropdown)}
            className="absolute bg-white h-[43px] left-[51.92px] right-[224px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-0 hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all px-3 py-3 cursor-move" 
            data-name="system-role"
          >
            <div className="flex items-center h-full">
              <p className="font-['Inter:Bold',sans-serif] font-bold text-[18px] text-[#171717] leading-[normal]">Tool Call</p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
      
      {/* Tool selector dropdown - defines the entire context */}
      <div className="absolute bg-white h-[43px] right-[70px] w-[140px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] hover:outline hover:outline-2 hover:outline-[#4066e3] focus-within:outline focus-within:outline-2 focus-within:outline-[#4066e3] transition-all">
        <SimpleToolDropdown />
      </div>

      {/* File attachment — paperclip icon triggers hidden file input (for plugins/tools) */}
      <button
        className="absolute bg-white h-[43px] right-[20px] w-[43px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all flex items-center justify-center"
        onClick={() => document.getElementById('tool-call-file-input')?.click()}
        title="Attach plugin/tool file"
      >
        <svg className="size-5 text-[#5a5a5a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>
      <input
        id="tool-call-file-input"
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const content = reader.result as string;
            window.dispatchEvent(new CustomEvent('set-left-column-text', {
              detail: { content, target: 'Tool Call' }
            }));
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
      
      <AnimatePresence>
        {showDropdown && !showConfirmRemove && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute left-[51.92px] top-[48px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] right-[224px] z-50"
          >
            <div className="py-2">
              <button 
                onClick={handleRemoveClick}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#ffebeb] text-[#d32f2f] transition-colors"
              >
                Remove Role
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button 
                onClick={() => handleRoleChange('User Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                User Role
              </button>
              <button 
                onClick={() => handleRoleChange('Tool Call')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Tool Call
              </button>
              <button 
                onClick={() => handleRoleChange('Agent Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Agent Role
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-[1.92px] size-[37px] top-[3px] pointer-events-none" data-name="lightning_alt_fill_light">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 37 37">
          <g id="lightning_alt_fill_light">
            <path d={svgPaths.p32331f80} fill="var(--fill-0, #33363F)" id="Subtract" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function ToolCallContent() {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0">
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick} 
      />
      
      {/* Left Rail: Status Icon Slot - Easy to inject icons for alerts/errors */}
      {/* <LeftRailIcon position="status" type="warning" title="Warning: Check parameter types" onClick={() => console.log('Jump to warning')} /> */}
      
      <motion.div 
        className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        <div style={{ display: isExpanded ? 'block' : 'none' }}>
          <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[normal] text-[16px] text-black mb-2">Tool override</p>
          <AutoResizeTextarea
            sectionName="Tool Call"
            initialValue=""
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
            placeholder="Paste file content, tool definition, or function call here..."
          />
        </div>
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            Tool Call content — click to expand
          </div>
        )}
      </motion.div>
    </div>
  );
}

function FewShotContent() {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className="relative w-full shrink-0">
      <LeftRailIcon position="collapse" type="collapse-expand" isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
      <motion.div className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false} animate={{ height: isExpanded ? "auto" : "55px" }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
        <div style={{ display: isExpanded ? 'block' : 'none' }}>
          <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[normal] text-[16px] text-black mb-2">Few-Shot Examples</p>
          <AutoResizeTextarea sectionName="Few Shot" initialValue="" className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none" placeholder="Paste input/output exemplar pairs here to anchor model style..." />
        </div>
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black/40 cursor-pointer" onClick={() => setIsExpanded(true)}>Few-Shot — click to expand</div>
        )}
      </motion.div>
    </div>
  );
}

function ContextContent() {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className="relative w-full shrink-0">
      <LeftRailIcon position="collapse" type="collapse-expand" isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
      <motion.div className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false} animate={{ height: isExpanded ? "auto" : "55px" }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
        <div style={{ display: isExpanded ? 'block' : 'none' }}>
          <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[normal] text-[16px] text-black mb-2">Context / Grounding</p>
          <AutoResizeTextarea sectionName="Context" initialValue="" className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none" placeholder="Milvus RAG snippets, Figma layers, document text, or schema payloads..." />
        </div>
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black/40 cursor-pointer" onClick={() => setIsExpanded(true)}>Context — click to expand</div>
        )}
      </motion.div>
    </div>
  );
}

function ConstraintsContent() {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className="relative w-full shrink-0">
      <LeftRailIcon position="collapse" type="collapse-expand" isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
      <motion.div className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false} animate={{ height: isExpanded ? "auto" : "55px" }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
        <div style={{ display: isExpanded ? 'block' : 'none' }}>
          <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[normal] text-[16px] text-black mb-2">Constraints / Boundaries</p>
          <AutoResizeTextarea sectionName="Constraints" initialValue="" className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none" placeholder="Immutable boundary rules — never exceed token limit, always cite sources, etc..." />
        </div>
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black/40 cursor-pointer" onClick={() => setIsExpanded(true)}>Constraints — click to expand</div>
        )}
      </motion.div>
    </div>
  );
}

function AgentRoleSection({ dragRef, onRemove, onRoleChange }: { dragRef?: any; onRemove?: () => void; onRoleChange?: (role: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dragRef && buttonRef.current) {
      dragRef(buttonRef);
    }
  }, [dragRef]);

  const handleRoleChange = (role: string) => {
    if (onRoleChange) {
      onRoleChange(role);
    }
    setShowDropdown(false);
  };

  const handleRemoveClick = () => {
    setShowDropdown(false);
    setShowConfirmRemove(true);
  };

  const handleConfirmRemove = () => {
    if (onRemove) {
      onRemove();
    }
  };

  const handleCancelRemove = () => {
    setShowConfirmRemove(false);
  };

  return (
    <div className="relative h-[43px] w-full shrink-0" data-section-container data-section-name="Agent Role" data-section-state="active" data-section-actions="edit_content; change_role:User Role,Tool Call; remove; collapse" data-tag="prompt-section">
      <AnimatePresence mode="wait">
        {showConfirmRemove ? (
          <motion.div 
            key="confirm-remove"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute bg-white h-[43px] left-[45px] right-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-[-1px] px-3 py-3"
          >
            <div className="flex items-center justify-between h-full w-full">
              <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold text-[14px] text-[#171717]">Remove this section?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelRemove}
                  className="px-4 py-1 bg-gray-200 hover:bg-gray-300 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-[#171717] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRemove}
                  className="px-4 py-1 bg-red-500 hover:bg-red-600 rounded text-[12px] font-['Inter:Semi_Bold',sans-serif] font-semibold text-white transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button 
            key="role-button"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            ref={buttonRef}
            onClick={() => setShowDropdown(!showDropdown)}
            className="absolute bg-white h-[43px] left-[45px] right-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-[-1px] hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all px-3 py-3 cursor-move"
          >
            <div className="flex items-center h-full">
              <p className="font-['Inter:Bold',sans-serif] font-bold text-[18px] text-[#171717] leading-[normal]">Agent Role</p>
            </div>
            <VariableComponent />
            <div className="absolute h-[28px] left-[166.74px] top-[9px] w-[27px] pointer-events-none">
              <div className="absolute bottom-1/4 left-[11.88%] right-[11.88%] top-[7.54%]">
                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20.5834 18.8884">
                  <path d={svgPaths.p3d183980} fill="var(--fill-0, #E4D48E)" id="Polygon 1" stroke="var(--stroke-0, #D29207)" />
                </svg>
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showDropdown && !showConfirmRemove && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute left-[45px] top-[44px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] right-[20px] z-50"
          >
            <div className="py-2">
              <button 
                onClick={handleRemoveClick}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#ffebeb] text-[#d32f2f] transition-colors"
              >
                Remove Role
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button 
                onClick={() => handleRoleChange('User Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                User Role
              </button>
              <button 
                onClick={() => handleRoleChange('Tool Call')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Tool Call
              </button>
              <button 
                onClick={() => handleRoleChange('Agent Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Agent Role
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-[13px] size-[24px] top-[3px] pointer-events-none" data-name="Database_fill">
        <div className="absolute inset-[0_0_-20.83%_-12.5%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 27 29">
            <g id="Database_fill">
              <path d={svgPaths.p27cdbd80} fill="var(--fill-0, #222222)" id="Subtract" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

function AgentRoleContentWithRAG() {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0">
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick} 
      />
      
      {/* Left Rail: Status Icon Slot */}
      {/* <LeftRailIcon position="status" type="info" title="RAG context injection" onClick={() => console.log('Jump to RAG section')} /> */}
      
      <motion.div 
        className="bg-[rgba(255,255,255,0.5)] mr-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] mt-[10px] p-[10px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {isExpanded && (
          <AutoResizeTextarea
            initialValue={`Retrieved context variable "Based on this context: {{retrieved_context}}, answer the question: {{query}}"

A retrieved context variable can be inserted into the user role section of a prompt. It is used to provide the AI with dynamic, external information—such as search results, document snippets, or database entries—that supports the user's query. This practice is common in Retrieval-Augmented Generation (RAG) systems, where context is fetched at runtime and injected into the user message to ensure responses are informed and accurate.`}
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
          />
        )}
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            Retrieved context variable "Based on this context..."
          </div>
        )}
      </motion.div>
    </div>
  );
}

function AgentRoleContentDetailed() {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0">
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick} 
      />
      
      {/* Left Rail: Status Icon Slot */}
      {/* <LeftRailIcon position="status" type="warning" title="Assistant role usage note" onClick={() => console.log('Jump to note')} /> */}
      
      <motion.div 
        className="bg-[rgba(255,255,255,0.5)] mr-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] mt-[10px] p-[10px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {isExpanded && (
          <AutoResizeTextarea
            initialValue="The assistant role is included as a selectable section in prompt construction to allow users to:

Define example responses (few-shot prompting).
Continue multi-turn conversations by including prior AI replies.
Guide the model's output style through sample answers.
While the model typically generates the assistant role during execution, letting users manually add it helps shape response format, tone, and logic—especially in complex or iterative workflows.

You can insert a tool call after an assistant message to invoke a function at a specific point. Tool calls are separate from assistant text and appear as distinct tool_call entries in the message flow. You don't need to embed them in the assistant role—adding a tool call after an assistant message is standard and valid."
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
          />
        )}
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            The assistant role is included as a selectable section...
          </div>
        )}
      </motion.div>
    </div>
  );
}

function SelectRolePrompt() {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCollapseClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="relative w-full shrink-0">
      {/* Left Rail: Collapse Icon */}
      <LeftRailIcon 
        position="collapse" 
        type="collapse-expand" 
        isExpanded={isExpanded}
        onClick={handleCollapseClick} 
      />
      
      {/* Left Rail: Status Icon Slot */}
      {/* <LeftRailIcon position="status" type="info" title="Select a role to begin" onClick={() => console.log('Jump to selection')} /> */}
      
      <motion.div 
        className="bg-[rgba(255,255,255,0.5)] mr-[20px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] mt-[10px] p-[10px] overflow-hidden" 
        style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false}
        animate={{ 
          height: isExpanded ? "auto" : "55px"
        }}
        transition={{ 
          duration: 0.5, 
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {isExpanded && (
          <AutoResizeTextarea
            initialValue="Select a role and enter your prompt."
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
          />
        )}
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[25px] text-[16px] text-black/40 cursor-pointer" onClick={handleCollapseClick}>
            Select a role and enter your prompt.
          </div>
        )}
      </motion.div>
    </div>
  );
}

function MeatballsMenu() {
  return (
    <div className="relative size-[24px]" data-name="Meatballs_menu">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="Meatballs_menu">
          <circle cx="12" cy="12" id="Ellipse 206" r="1" stroke="var(--stroke-0, #767676)" strokeLinecap="round" strokeWidth="2" />
          <circle cx="6" cy="12" id="Ellipse 207" r="1" stroke="var(--stroke-0, #767676)" strokeLinecap="round" strokeWidth="2" />
          <circle cx="18" cy="12" id="Ellipse 208" r="1" stroke="var(--stroke-0, #767676)" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function GenericRoleSection({ roleName, dragRef, onRemove, onRoleChange }: { roleName: string; dragRef?: any; onRemove?: () => void; onRoleChange?: (role: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative h-[43px] w-full shrink-0" data-section-container data-section-name={roleName} data-section-state="active" data-tag="prompt-section">
      <AnimatePresence mode="wait">
        {showConfirmRemove ? (
          <motion.div key="confirm-remove" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            className="absolute bg-white h-[43px] left-[51.92px] right-[224px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-0 px-3 py-3"
          >
            <div className="flex items-center justify-between h-full w-full">
              <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold text-[14px] text-[#171717]">Remove this section?</p>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmRemove(false)} className="px-4 py-1 bg-gray-200 hover:bg-gray-300 rounded text-[12px] font-semibold text-[#171717]">Cancel</button>
                <button onClick={() => { onRemove?.(); setShowConfirmRemove(false); }} className="px-4 py-1 bg-red-500 hover:bg-red-600 rounded text-[12px] font-semibold text-white">Remove</button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button key="role-button" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
            ref={dragRef || buttonRef} onClick={() => setShowDropdown(!showDropdown)}
            className="absolute bg-white h-[43px] left-[51.92px] right-[224px] rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-0 hover:outline hover:outline-2 hover:outline-[#4066e3] transition-all px-3 py-3 cursor-move"
          >
            <div className="flex items-center h-full">
              <p className="font-['Inter:Bold',sans-serif] font-bold text-[18px] text-[#171717] leading-[normal]">{roleName}</p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
      
      {showDropdown && !showConfirmRemove && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
          className="absolute left-[51.92px] top-[48px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] right-[224px] z-50"
        >
          <div className="py-2">
            <button 
              onClick={() => { setShowConfirmRemove(true); setShowDropdown(false); }}
              className="w-full px-4 py-2 text-left text-[14px] font-semibold hover:bg-[#ffebeb] text-[#d32f2f]">Remove Role</button>
            <div className="border-t border-gray-200 my-1"></div>
            {['User Role', 'Tool Call', 'Few Shot', 'Context', 'Constraints', 'Agent Role'].filter(r => r !== roleName).map(r => (
              <button key={r} onClick={() => { onRoleChange?.(r); setShowDropdown(false); }}
                className="w-full px-4 py-2 text-left text-[14px] font-semibold hover:bg-[#f0f0f0] text-[#171717]">{r}</button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function GenericRoleContent({ roleName }: { roleName: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className="relative w-full shrink-0">
      <LeftRailIcon position="collapse" type="collapse-expand" isExpanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)} />
      <motion.div className="bg-white rounded-[6px] p-[10px] mr-[20px] mt-[10px] overflow-hidden" style={{ marginLeft: `${LEFT_RAIL.CONTENT_START}px` }}
        initial={false} animate={{ height: isExpanded ? "auto" : "55px" }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
        <div style={{ display: isExpanded ? 'block' : 'none' }}>
          <AutoResizeTextarea sectionName={roleName} initialValue="" 
            className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black bg-transparent border-none outline-none placeholder:text-black/60 resize-none"
            placeholder={`Enter ${roleName.toLowerCase()} content...`} />
        </div>
        {!isExpanded && (
          <div className="w-full font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[20px] text-[16px] text-black/40 cursor-pointer" onClick={() => setIsExpanded(true)}>{roleName} — click to expand</div>
        )}
      </motion.div>
    </div>
  );
}

function SelectRoleSection({ onRoleSelect }: { onRoleSelect?: (role: string) => void }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setShowDropdown(false);
    // Notify parent component about role selection
    if (onRoleSelect) {
      onRoleSelect(role);
    }
  };

  const handleRemoveRole = () => {
    setSelectedRole(null);
  };

  return (
    <div className="relative h-[43px] w-full shrink-0">
      <button 
        onClick={() => {
          if (selectedRole) {
            handleRemoveRole();
          } else {
            setShowDropdown(!showDropdown);
          }
        }}
        className="absolute bg-white font-['Inter:Bold',sans-serif] font-bold h-[43px] leading-[0] left-[39px] right-[54px] not-italic rounded-[6px] shadow-[-4px_-4px_10px_0px_rgba(0,0,0,0.15),4px_4px_10px_0px_rgba(0,0,0,0.15)] top-[0px] hover:outline hover:outline-2 hover:outline-[#4066e3] focus:outline focus:outline-2 focus:outline-[#4066e3] transition-all"
      >
        <div className="-translate-y-1/2 absolute flex h-[43px] items-center justify-center left-[15px] text-[18px] top-[21.5px] w-[162px]">
          <p className={`leading-[normal] whitespace-pre-wrap ${selectedRole ? 'text-[#171717]' : 'text-[#767676]'}`}>
            {selectedRole ? 'Remove Role' : 'Add Section'}
          </p>
        </div>
        <div className="absolute h-[17px] left-[294px] text-[14px] top-[12px] w-[228px] whitespace-nowrap" data-name="Component 3">
          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[92px] text-[#767676] top-[8.5px] pointer-events-none">
            <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold">
              <span className="leading-[normal]">{` {{multimedia}}`}</span>
              <span className="leading-[normal] text-[#767676]">{`    `}</span>
              <span className="leading-[normal]">{`{{url}}`}</span>
            </p>
          </div>
          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[-5px] text-[#4066e3] top-[8.5px] pointer-events-none">
            <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold">
              <span className="leading-[normal]">{`{{variables}} `}</span>
              <span className="leading-[normal] text-[#4066e3]">{` `}</span>
            </p>
          </div>
        </div>
      </button>
      
      <AnimatePresence>
        {showDropdown && !selectedRole && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute left-[39px] top-[48px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] right-[267px] z-50"
          >
            <div className="py-2">
              <button 
                onClick={() => handleRoleSelect('User Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                User Role
              </button>
              <button 
                onClick={() => handleRoleSelect('Tool Call')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Tool Call
              </button>
              <button 
                onClick={() => handleRoleSelect('Agent Role')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Agent Role
              </button>
              <button 
                onClick={() => handleRoleSelect('Few Shot')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Few Shot
              </button>
              <button 
                onClick={() => handleRoleSelect('Context')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Context
              </button>
              <button 
                onClick={() => handleRoleSelect('Constraints')}
                className="w-full px-4 py-2 text-left text-[14px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717] transition-colors"
              >
                Constraints
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute h-[37px] left-[2px] top-[1px] w-[35px]">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setShowMenuDropdown(!showMenuDropdown);
          }}
          aria-label="Open role action menu"
          className="absolute flex items-center justify-center left-[6px] size-[24px] top-[6px] hover:bg-[#f0f0f0] rounded-full transition-all"
        >
          <div className="-rotate-90 flex-none">
            <MeatballsMenu />
          </div>
        </button>
        <div className="absolute flex items-center justify-center left-[13px] size-[24px] top-[6px]">
          <div className="-rotate-90 flex-none pointer-events-none">
            <MeatballsMenu />
          </div>
        </div>
        
        {showMenuDropdown && (
          <div className="absolute left-[30px] top-[6px] bg-white rounded-[6px] shadow-[-4px_4px_10px_0px_rgba(0,0,0,0.15)] w-[120px] z-50">
            <div className="py-2">
              <button className="w-full px-4 py-2 text-left text-[12px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717]">Edit</button>
              <button className="w-full px-4 py-2 text-left text-[12px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717]">Duplicate</button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveRole();
                  setShowMenuDropdown(false);
                }}
                className="w-full px-4 py-2 text-left text-[12px] font-['Inter:Semi_Bold',sans-serif] hover:bg-[#f0f0f0] text-[#171717]"
              >
                {selectedRole ? 'Remove Role' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptInputSidebar({ onDoubleClick, isCollapsed, onSave, onRun }: { onDoubleClick?: () => void; isCollapsed?: boolean; onSave?: () => void; onRun?: () => void }) {
  const handleClick = () => {
    // Single click to expand when collapsed
    if (isCollapsed && onDoubleClick) {
      onDoubleClick();
    }
  };

  const handleDoubleClick = () => {
    // Double-click to collapse when expanded
    if (!isCollapsed && onDoubleClick) {
      onDoubleClick();
    }
  };

  return (
    <div 
      className={`bg-white border-[#8e98a8] border-b border-r border-solid border-t relative rounded-tr-[10px] h-full w-[39px] shrink-0 select-none transition-all ${
        isCollapsed ? 'cursor-pointer hover:bg-blue-50' : 'cursor-pointer'
      }`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={isCollapsed ? "Click to expand" : "Double-click to collapse"}
    >
      {/* Top meatballs menu */}
      <div className="absolute left-[6px] top-[7px]">
        <div className="absolute flex h-[37px] items-center justify-center left-0 top-0 w-[29px]">
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="h-[37px] relative w-[29px]">
              <div className="absolute flex items-center justify-center left-0 size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
              <div className="absolute flex items-center justify-center left-[7px] size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Input text - rotated vertically */}
      <div className="-translate-y-1/2 absolute flex h-[806px] items-center justify-center left-0 top-[461px] w-[38px]">
        <div className="flex-none rotate-90">
          <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[38px] justify-center leading-[0] not-italic relative text-[#171717] text-[16px] w-[806px]">
            <p className="leading-[normal] whitespace-pre-wrap">Prompt Input</p>
          </div>
        </div>
      </div>

      {/* Tokens and Cost text - rotated vertically */}
      <div className="-translate-x-full absolute flex h-[329px] items-center justify-center left-[25px] top-[483px] w-[17px]">
        <div className="flex-none rotate-90">
          <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold h-[17px] leading-[20px] not-italic relative text-[#767676] text-[12px] text-right w-[329px] whitespace-pre-wrap">{`Tokens: 2022 Cost: $0.00802 `}</p>
        </div>
      </div>

      {/* Bottom meatballs menu (gripper) */}
      <div className="absolute left-[6px] bottom-[10px]">
        <div className="absolute flex h-[37px] items-center justify-center left-0 top-0 w-[29px]">
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="h-[37px] relative w-[29px]">
              <div className="absolute flex items-center justify-center left-0 size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
              <div className="absolute flex items-center justify-center left-[7px] size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptOutputSidebar() {
  return (
    <div className="bg-white border-[#8e98a8] border-b border-l border-solid border-t relative rounded-tl-[10px] h-full w-[39px] shrink-0">
      {/* Top meatballs menu */}
      <div className="absolute left-[6px] top-[7px]">
        <div className="absolute flex h-[37px] items-center justify-center left-0 top-0 w-[29px]">
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="h-[37px] relative w-[29px]">
              <div className="absolute flex items-center justify-center left-0 size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
              <div className="absolute flex items-center justify-center left-[7px] size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Output text - rotated vertically */}
      <div className="-translate-y-1/2 absolute flex h-[806px] items-center justify-center left-0 top-[461px] w-[38px]">
        <div className="flex-none -rotate-90">
          <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium h-[38px] justify-center leading-[0] not-italic relative text-[#171717] text-[16px] w-[806px]">
            <p className="leading-[normal] whitespace-pre-wrap">Prompt Output</p>
          </div>
        </div>
      </div>

      {/* Bottom meatballs menu (gripper) */}
      <div className="absolute left-[6px] bottom-[10px]">
        <div className="absolute flex h-[37px] items-center justify-center left-0 top-0 w-[29px]">
          <div className="-scale-y-100 flex-none rotate-180">
            <div className="h-[37px] relative w-[29px]">
              <div className="absolute flex items-center justify-center left-0 size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
              <div className="absolute flex items-center justify-center left-[7px] size-[24px] top-[6px]">
                <div className="-rotate-90 flex-none">
                  <MeatballsMenu />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ControlBar removed — superseded by Lit <control-bar> in WritingAreaIndex

export function ResponsivePromptBuilder() {
  const [sections, setSections] = useState([
    { id: 'user-role', type: 'User Role' },
    { id: 'tool-call', type: 'Tool Call' },
    { id: 'select-role-1', type: 'Select Role' },
  ]);

  const [nextSelectorId, setNextSelectorId] = useState(2);
  const [nextRoleCounter, setNextRoleCounter] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ══════════════════════════════════════════════════════════════════════
  // A2UI: Track save-in-progress for button spinner feedback
  // Listens to events from WritingAreaIndex to show immediate UI feedback
  // ══════════════════════════════════════════════════════════════════════
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleSaveStart = () => setIsSaving(true);
    const handleSaveEnd = () => setIsSaving(false);

    window.addEventListener('save-template-start', handleSaveStart);
    window.addEventListener('save-template-end', handleSaveEnd);

    return () => {
      window.removeEventListener('save-template-start', handleSaveStart);
      window.removeEventListener('save-template-end', handleSaveEnd);
    };
  }, []);

  const handleRoleSelection = useCallback((sectionId: string, roleType: string) => {
    setSections((prevSections) => {
      const sectionIndex = prevSections.findIndex(s => s.id === sectionId);
      
      if (sectionIndex === -1) return prevSections;

      // Don't add System Role (it's fixed at top)
      if (roleType === 'System Role') return prevSections;

      // Generate a unique ID for the new role
      const newRoleId = `${roleType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

      // Replace the selector with the actual role
      const newRole: any = { id: newRoleId, type: roleType };
      if (roleType === 'Agent Role') {
        newRole.variant = 'rag'; // Default to RAG variant
      }

      const newSections = [...prevSections];
      newSections[sectionIndex] = newRole;

      // Add a new selector at the end
      newSections.push({
        id: `select-role-${Date.now()}`,
        type: 'Select Role'
      });

      setNextSelectorId(prev => prev + 1);
      setNextRoleCounter(prev => prev + 1);

      return newSections;
    });
  }, [nextSelectorId]);

  const handleRemoveSection = useCallback((sectionId: string) => {
    setSections((prevSections) => {
      return prevSections.filter(section => section.id !== sectionId);
    });
  }, []);

  const handleChangeRole = useCallback((sectionId: string, newRoleType: string) => {
    setSections((prevSections) => {
      const sectionIndex = prevSections.findIndex(s => s.id === sectionId);
      if (sectionIndex === -1) return prevSections;

      const newSections = [...prevSections];
      const newRole: any = { id: sectionId, type: newRoleType };
      
      if (newRoleType === 'Agent Role') {
        newRole.variant = 'rag'; // Default to RAG variant
      }
      
      newSections[sectionIndex] = newRole;
      return newSections;
    });
  }, []);

  // Dynamic panel management via AI XML tags
  useEffect(() => {
    const handleAdd = (e: Event) => {
      const { roleName, placeholder } = (e as CustomEvent).detail;
      const id = `${roleName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      setSections(prev => {
        // Remove the last Select Role
        const filtered = prev.filter(s => s.type !== 'Select Role');
        // Add the new role
        const newRole: any = { id, type: roleName };
        // Add Select Role back at the end
        return [...filtered, newRole, { id: `select-role-${Date.now()}`, type: 'Select Role' }];
      });
      // If placeholder provided, inject it after a short delay for DOM mount
      if (placeholder) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('set-left-column-text', {
            detail: { content: placeholder, target: roleName }
          }));
        }, 150);
      }
    };

    const handleRemove = (e: Event) => {
      const { roleName } = (e as CustomEvent).detail;
      setSections(prev => prev.filter(s => s.type !== roleName));
    };

    window.addEventListener('add-prompt-role', handleAdd);
    window.addEventListener('remove-prompt-role', handleRemove);
    return () => {
      window.removeEventListener('add-prompt-role', handleAdd);
      window.removeEventListener('remove-prompt-role', handleRemove);
    };
  }, []);

  const renderSection = (section: any, dragRef?: any) => {
    switch (section.type) {
      case 'User Role':
        return (
          <div className="w-full">
            <UserRoleSection 
              dragRef={dragRef}
              onRemove={() => handleRemoveSection(section.id)} 
              onRoleChange={(role) => handleChangeRole(section.id, role)}
            />
            <UserRoleContent />
          </div>
        );
      case 'Tool Call':
        return (
          <div className="w-full">
            <ToolCallSection 
              dragRef={dragRef}
              onRemove={() => handleRemoveSection(section.id)} 
              onRoleChange={(role) => handleChangeRole(section.id, role)}
            />
            <ToolCallContent />
          </div>
        );
      case 'Few Shot':
        return (
          <div className="w-full">
            <GenericRoleSection dragRef={dragRef} roleName="Few Shot" onRemove={() => handleRemoveSection(section.id)} onRoleChange={(role) => handleChangeRole(section.id, role)} />
            <FewShotContent />
          </div>
        );
      case 'Context':
        return (
          <div className="w-full">
            <GenericRoleSection dragRef={dragRef} roleName="Context" onRemove={() => handleRemoveSection(section.id)} onRoleChange={(role) => handleChangeRole(section.id, role)} />
            <ContextContent />
          </div>
        );
      case 'Constraints':
        return (
          <div className="w-full">
            <GenericRoleSection dragRef={dragRef} roleName="Constraints" onRemove={() => handleRemoveSection(section.id)} onRoleChange={(role) => handleChangeRole(section.id, role)} />
            <ConstraintsContent />
          </div>
        );
      case 'Agent Role':
        if (section.variant === 'detailed') {
          return (
            <div className="w-full">
              <AgentRoleSection 
                dragRef={dragRef}
                onRemove={() => handleRemoveSection(section.id)} 
                onRoleChange={(role) => handleChangeRole(section.id, role)}
              />
              <AgentRoleContentDetailed />
            </div>
          );
        }
        return (
          <div className="w-full">
            <AgentRoleSection 
              dragRef={dragRef}
              onRemove={() => handleRemoveSection(section.id)} 
              onRoleChange={(role) => handleChangeRole(section.id, role)}
            />
            <AgentRoleContentWithRAG />
          </div>
        );
      case 'Select Role':
        return (
          <div className="w-full">
            <SelectRoleSection onRoleSelect={(role) => handleRoleSelection(section.id, role)} />
          </div>
        );
      default:
        // Dynamic/custom roles — same pattern as User/Tool/Agent
        return (
          <div className="w-full">
            <GenericRoleSection 
              dragRef={dragRef}
              roleName={section.type}
              onRemove={() => handleRemoveSection(section.id)}
              onRoleChange={(role) => handleChangeRole(section.id, role)}
            />
            <GenericRoleContent roleName={section.type} />
          </div>
        );
    }
  };

  const moveSection = useCallback((dragIndex: number, hoverIndex: number) => {
    setSections((prevSections) => {
      const newSections = [...prevSections];
      const draggedSection = newSections[dragIndex];
      newSections.splice(dragIndex, 1);
      newSections.splice(hoverIndex, 0, draggedSection);
      return newSections;
    });
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Text Selection Toolbar */}
      <TextSelectionToolbar />
      
      {/* Main content area with sidebars */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Scrollable prompt area - with white background for scrollbar */}
        <div 
          className="bg-white relative border-[#c0bdcf] border-b border-solid"
          style={{
            flex: isCollapsed ? '0 0 0px' : '1 1 auto',
            opacity: isCollapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'flex 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            pointerEvents: isCollapsed ? 'none' : 'auto'
          }}
        >
          <div 
            className="absolute inset-0 overflow-y-scroll bg-white p-[18px]" 
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#dadee4 #ffffff',
              display: isCollapsed ? 'none' : 'block'
            }}
          >
            <style>{`
              .scrollbar-minimal::-webkit-scrollbar {
                width: 10px;
              }
              .scrollbar-minimal::-webkit-scrollbar-track {
                background: #ffffff;
              }
              .scrollbar-minimal::-webkit-scrollbar-thumb {
                background: #dadee4;
                border-radius: 10px;
              }
              .scrollbar-minimal::-webkit-scrollbar-thumb:hover {
                background: #c5cbd4;
              }
            `}</style>
            <div className="bg-white flex flex-col gap-[19px] items-center w-full scrollbar-minimal pb-[100px]">
              {/* System Role - Fixed at top, not draggable */}
              <div className="w-full">
                <SystemRoleSection />
                <SystemRoleContent />
              </div>
              
              {/* All other sections - Draggable */}
              {sections.map((section, index) => (
                <DraggableRole
                  key={section.id}
                  id={section.id}
                  index={index}
                  moveSection={moveSection}
                >
                  {(dragRef) => renderSection(section, dragRef)}
                </DraggableRole>
              ))}
            </div>
          </div>
        </div>

        {/* Right Input Sidebar */}
        <PromptInputSidebar onDoubleClick={handleToggleCollapse} isCollapsed={isCollapsed} />
      </div>

      {/* Control bar — moved to Lit <control-bar> in WritingAreaIndex */}
      
    </div>
  );
}
