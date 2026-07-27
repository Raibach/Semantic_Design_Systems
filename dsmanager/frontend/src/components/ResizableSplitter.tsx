import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';

interface ResizableSplitterProps {
  leftInitialWidth: number;
  minLeftWidth: number;
  minRightWidth: number;
  children: [React.ReactNode, React.ReactNode, React.ReactNode?];
  isLightMode?: boolean;
  isThirdColumnOpen?: boolean;
  onThirdColumnStateChange?: (isOpen: boolean) => void;
  leftColumnTitle?: string;
  rightColumnTitle?: string;
  thirdColumnTitle?: string;
}

export const ResizableSplitter: React.FC<ResizableSplitterProps> = ({
  leftInitialWidth,
  minLeftWidth = 400,
  minRightWidth = 400,
  children,
  isLightMode = false,
  isThirdColumnOpen: controlledIsThirdColumnOpen,
  onThirdColumnStateChange,
  leftColumnTitle,
  rightColumnTitle,
  thirdColumnTitle,
}) => {
  const [leftWidth, setLeftWidth] = useState(leftInitialWidth);
  const [thirdWidth, setThirdWidth] = useState(300);
  // Use controlled state if provided, otherwise use internal state
  const [internalIsThirdColumnOpen, setInternalIsThirdColumnOpen] = useState(false);
  const isThirdColumnOpen = controlledIsThirdColumnOpen !== undefined 
    ? controlledIsThirdColumnOpen 
    : internalIsThirdColumnOpen;
  const setIsThirdColumnOpen = controlledIsThirdColumnOpen !== undefined 
    ? onThirdColumnStateChange || (() => {})
    : setInternalIsThirdColumnOpen;
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingThird, setIsResizingThird] = useState(false);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [isRightColumnCollapsed, setIsRightColumnCollapsed] = useState(false);
  const [isLeftColumnCollapsed, setIsLeftColumnCollapsed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const gripperRef = useRef<HTMLDivElement>(null);
  const secondGripperRef = useRef<HTMLDivElement>(null);
  const preCollapseWidthsRef = useRef<{ left: number; third: number }>({
    left: leftInitialWidth,
    third: 300,
  });
  const preLeftCollapseWidthRef = useRef<number>(leftInitialWidth);

  const STORAGE_KEY = 'grace_editor_column_width';
  const THRESHOLD_KEY = 'grace_editor_third_column_open';
  const RIGHT_COLUMN_COLLAPSED_WIDTH = 75;
  const LEFT_COLUMN_COLLAPSED_WIDTH = 66; // Match LeftVerticalMenu width
  const SLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const SLIDE_DURATION_MS = prefersReducedMotion ? 0 : 420;

  const getWidthTransition = () => {
    if (isResizing || isResizingThird || isSidebarDragging) return 'none';
    return `width ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}, min-width ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`;
  };

  const applyPrimaryResize = useCallback((clientX: number) => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeftWidth = clientX - containerRect.left;
    const collapseTargetLeftWidth = isThirdColumnOpen
      ? containerRect.width - thirdWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
      : containerRect.width - RIGHT_COLUMN_COLLAPSED_WIDTH - 8;

    // Allow dragging all the way to close (minimum of LEFT_COLUMN_COLLAPSED_WIDTH or 0)
    // User can drag left to collapse to 56px (LEFT_COLUMN_COLLAPSED_WIDTH) or right to expand
    const minDragWidth = LEFT_COLUMN_COLLAPSED_WIDTH; // Allow dragging to collapsed width
    const constrainedWidth = Math.max(
      minDragWidth,
      Math.min(newLeftWidth, collapseTargetLeftWidth)
    );

    // Keep drag continuous/smooth; do not auto-collapse while dragging.
    // Collapse/expand is handled by explicit sidebar toggle interactions.
    if (isRightColumnCollapsed) {
      setIsRightColumnCollapsed(false);
      emitRightColumnCollapseChange(false);
    }
    if (isLeftColumnCollapsed) {
      setIsLeftColumnCollapsed(false);
    }

    setLeftWidth(constrainedWidth);
  }, [isThirdColumnOpen, thirdWidth, isRightColumnCollapsed, isLeftColumnCollapsed]);

  const handleLeftColumnToggle = () => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    
    if (isLeftColumnCollapsed) {
      // Expand left column
      const restoredLeftWidth = preLeftCollapseWidthRef.current;
      const maxLeftWidth = isThirdColumnOpen
        ? containerRect.width - minRightWidth - thirdWidth - 16
        : containerRect.width - minRightWidth - 8;

      setLeftWidth(Math.max(minLeftWidth, Math.min(restoredLeftWidth, maxLeftWidth)));
    } else {
      // Collapse left column
      preLeftCollapseWidthRef.current = leftWidth;
      const targetLeftWidth = LEFT_COLUMN_COLLAPSED_WIDTH;
      setLeftWidth(Math.max(minLeftWidth, targetLeftWidth));
    }
    
    setIsLeftColumnCollapsed(!isLeftColumnCollapsed);
  };

  const emitRightColumnCollapseChange = (isCollapsed: boolean) => {
    window.dispatchEvent(
      new CustomEvent('right-column-collapse-change', {
        detail: { isCollapsed, source: 'splitter' },
      })
    );
  };

  // On mount, calculate equal width for left/right columns
  useEffect(() => {
    const savedWidth = sessionStorage.getItem(STORAGE_KEY);
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth);
      if (!isNaN(parsedWidth) && parsedWidth >= minLeftWidth) {
        setLeftWidth(parsedWidth);
        return; // Use saved width from current session
      }
    }

    // No saved width — calculate equal columns
    const setEqualWidth = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const equalWidth = Math.max(minLeftWidth, Math.floor((containerWidth - 8) / 2));
      setLeftWidth(equalWidth);
    };
    
    setEqualWidth();
    window.addEventListener("resize", setEqualWidth);
    
    // Load third column state - only open if explicitly set to open
    const isOpen = sessionStorage.getItem(THRESHOLD_KEY);
    if (isOpen === 'true') {
      setIsThirdColumnOpen(true);
      const savedThirdWidth = sessionStorage.getItem('grace_editor_third_column_width');
      if (savedThirdWidth) {
        const parsedThirdWidth = parseInt(savedThirdWidth);
        if (!isNaN(parsedThirdWidth) && parsedThirdWidth > 0) {
          setThirdWidth(parsedThirdWidth);
        }
      }
    }
    
    return () => window.removeEventListener("resize", setEqualWidth);
  }, [minLeftWidth]);
  
  // Load saved width when third column is opened
  useEffect(() => {
    if (isThirdColumnOpen) {
      const savedThirdWidth = sessionStorage.getItem('grace_editor_third_column_width');
      if (savedThirdWidth) {
        const parsedThirdWidth = parseInt(savedThirdWidth);
        if (!isNaN(parsedThirdWidth) && parsedThirdWidth > 0) {
          setThirdWidth(parsedThirdWidth);
        }
      }
    }
  }, [isThirdColumnOpen]);
  
  // Sync with controlled state if it changes from parent
  useEffect(() => {
    if (controlledIsThirdColumnOpen !== undefined && controlledIsThirdColumnOpen !== isThirdColumnOpen) {
      setIsThirdColumnOpen(controlledIsThirdColumnOpen);
    }
  }, [controlledIsThirdColumnOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => {
      mediaQuery.removeEventListener('change', updatePreference);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRightColumnCollapsed) {
      setIsRightColumnCollapsed(false);
      emitRightColumnCollapseChange(false);
    }
    setIsResizing(true);
  };

  const handleGripperDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleLeftColumnToggle();
  };

  const handleSecondGripperMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingThird(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    applyPrimaryResize(e.clientX);
  };

  const handleMouseUp = () => {
    setIsResizing(false);

    if (!containerRef.current) {
      sessionStorage.setItem(STORAGE_KEY, leftWidth.toString());
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const collapseTargetLeftWidth = isThirdColumnOpen
      ? containerRect.width - thirdWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
      : containerRect.width - RIGHT_COLUMN_COLLAPSED_WIDTH - 8;
    const expandedMaxLeftWidth = isThirdColumnOpen
      ? containerRect.width - minRightWidth - thirdWidth - 16
      : containerRect.width - minRightWidth - 8;

    // Use LEFT_COLUMN_COLLAPSED_WIDTH as minimum, not minLeftWidth
    const finalizedWidth = isRightColumnCollapsed
      ? Math.max(LEFT_COLUMN_COLLAPSED_WIDTH, collapseTargetLeftWidth)
      : Math.max(LEFT_COLUMN_COLLAPSED_WIDTH, Math.min(leftWidth, expandedMaxLeftWidth));

    // If width is at or near collapsed width, set collapsed state
    const isNowCollapsed = finalizedWidth <= LEFT_COLUMN_COLLAPSED_WIDTH + 10; // 10px tolerance
    if (isNowCollapsed !== isLeftColumnCollapsed) {
      setIsLeftColumnCollapsed(isNowCollapsed);
      if (isNowCollapsed) {
        preLeftCollapseWidthRef.current = leftWidth; // Save previous width
      }
    }

    setLeftWidth(finalizedWidth);
    sessionStorage.setItem(STORAGE_KEY, finalizedWidth.toString());
    
    // When resizing the left column, don't automatically close the third column
    // Third column should only close when explicitly dragged to 0 width
    // No action needed here for third column state
  };

  useEffect(() => {
    const handleMouseMoveWrapper = (e: MouseEvent) => {
      if (isResizing) {
        handleMouseMove(e);
      } else if (isResizingThird) {
        handleSecondGripperMouseMove(e);
      }
    };
    const handleMouseUpWrapper = () => {
      if (isResizing) {
        handleMouseUp();
      } else if (isResizingThird) {
        handleSecondGripperMouseUp();
      }
    };
    
    window.addEventListener('mousemove', handleMouseMoveWrapper);
    window.addEventListener('mouseup', handleMouseUpWrapper);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveWrapper);
      window.removeEventListener('mouseup', handleMouseUpWrapper);
    };
  }, [isResizing, isResizingThird, leftWidth, thirdWidth, minLeftWidth, minRightWidth, applyPrimaryResize]);

  useEffect(() => {
    const handleSidebarDragStart = () => {
      if (isRightColumnCollapsed) {
        setIsRightColumnCollapsed(false);
        emitRightColumnCollapseChange(false);
      }
      setIsSidebarDragging(true);
    };

    const handleSidebarDrag = (event: Event) => {
      const customEvent = event as CustomEvent<{ clientX?: number }>;
      if (typeof customEvent.detail?.clientX !== 'number') return;

      applyPrimaryResize(customEvent.detail.clientX);
    };

    const handleSidebarDragEnd = () => {
      if (!containerRef.current) {
        setIsSidebarDragging(false);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const collapseTargetLeftWidth = isThirdColumnOpen
        ? containerRect.width - thirdWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
        : containerRect.width - RIGHT_COLUMN_COLLAPSED_WIDTH - 8;
      const expandedMaxLeftWidth = isThirdColumnOpen
        ? containerRect.width - minRightWidth - thirdWidth - 16
        : containerRect.width - minRightWidth - 8;

      const finalizedWidth = isRightColumnCollapsed
        ? Math.max(LEFT_COLUMN_COLLAPSED_WIDTH, collapseTargetLeftWidth)
        : Math.max(LEFT_COLUMN_COLLAPSED_WIDTH, Math.min(leftWidth, expandedMaxLeftWidth));

      setLeftWidth(finalizedWidth);
      sessionStorage.setItem(STORAGE_KEY, finalizedWidth.toString());
      setIsSidebarDragging(false);
    };

    window.addEventListener('right-column-drag-start', handleSidebarDragStart);
    window.addEventListener('right-column-drag', handleSidebarDrag as EventListener);
    window.addEventListener('right-column-drag-end', handleSidebarDragEnd);

    return () => {
      window.removeEventListener('right-column-drag-start', handleSidebarDragStart);
      window.removeEventListener('right-column-drag', handleSidebarDrag as EventListener);
      window.removeEventListener('right-column-drag-end', handleSidebarDragEnd);
    };
  }, [
    isThirdColumnOpen,
    thirdWidth,
    minRightWidth,
    minLeftWidth,
    isRightColumnCollapsed,
    leftWidth,
    applyPrimaryResize,
  ]);

  useEffect(() => {
    const handleRightColumnCollapseChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ isCollapsed?: boolean; source?: string }>;
      const nextCollapsed = Boolean(customEvent.detail?.isCollapsed);
      const isFromSplitter = customEvent.detail?.source === 'splitter';

      if (isFromSplitter) {
        setIsRightColumnCollapsed(nextCollapsed);
        return;
      }

      if (!containerRef.current) {
        setIsRightColumnCollapsed(nextCollapsed);
        return;
      }

      if (nextCollapsed === isRightColumnCollapsed) return;

      const containerRect = containerRef.current.getBoundingClientRect();

      if (nextCollapsed) {
        preCollapseWidthsRef.current = { left: leftWidth, third: thirdWidth };

        const targetLeftWidth = isThirdColumnOpen
          ? containerRect.width - thirdWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
          : containerRect.width - RIGHT_COLUMN_COLLAPSED_WIDTH - 8;

        setLeftWidth(Math.max(minLeftWidth, targetLeftWidth));
      } else {
        const restoredLeftWidth = preCollapseWidthsRef.current.left;
        const maxLeftWidth = isThirdColumnOpen
          ? containerRect.width - minRightWidth - thirdWidth - 16
          : containerRect.width - minRightWidth - 8;

        setLeftWidth(Math.max(minLeftWidth, Math.min(restoredLeftWidth, maxLeftWidth)));
      }

      setIsRightColumnCollapsed(nextCollapsed);
    };

    window.addEventListener('right-column-collapse-change', handleRightColumnCollapseChange as EventListener);
    return () => {
      window.removeEventListener('right-column-collapse-change', handleRightColumnCollapseChange as EventListener);
    };
  }, [
    isRightColumnCollapsed,
    isThirdColumnOpen,
    leftWidth,
    thirdWidth,
    minLeftWidth,
    minRightWidth,
  ]);

  const handleSecondGripperMouseMove = (e: MouseEvent) => {
    if (!isResizingThird || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newThirdWidth = e.clientX - containerRect.left - leftWidth - 8;
    const collapseTargetThirdWidth = Math.max(
      0,
      containerRect.width - leftWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
    );
    const constrainedWidth = Math.max(0, Math.min(newThirdWidth, collapseTargetThirdWidth));
    if (isRightColumnCollapsed) {
      setIsRightColumnCollapsed(false);
      emitRightColumnCollapseChange(false);
    }

    setThirdWidth(constrainedWidth);
  };

  const handleSecondGripperMouseUp = () => {
    setIsResizingThird(false);

    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const collapseTargetThirdWidth = Math.max(
      0,
      containerRect.width - leftWidth - RIGHT_COLUMN_COLLAPSED_WIDTH - 16
    );
    const expandedMaxThirdWidth = Math.max(
      0,
      containerRect.width - leftWidth - minRightWidth - 16
    );
    
    // Only close if width is <= 0 (user explicitly dragged all the way to close)
    // Otherwise, keep the third column open at whatever width the user set
    if (isRightColumnCollapsed || thirdWidth <= 0) {
      setThirdWidth(collapseTargetThirdWidth);
      setIsThirdColumnOpen(false);
      sessionStorage.removeItem(THRESHOLD_KEY);
      sessionStorage.removeItem('grace_editor_third_column_width');
    } else {
      const finalizedThirdWidth = Math.max(0, Math.min(thirdWidth, expandedMaxThirdWidth));
      setThirdWidth(finalizedThirdWidth);
      // Keep third column open and save its width
      sessionStorage.setItem(THRESHOLD_KEY, 'true');
      sessionStorage.setItem('grace_editor_third_column_width', finalizedThirdWidth.toString());
    }
  };

  // Listen for reset-columns-to-equal-widths event
  useEffect(() => {
    const handleResetColumns = () => {
      console.log('📥 [ResizableSplitter] Received reset-columns-to-equal-widths event');
      
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const totalWidth = containerRect.width;
      
      // Calculate equal width for all three columns
      // Account for gripper widths (8px each, total 16px for 3 columns)
      const availableWidth = totalWidth - 16; // Subtract gripper widths
      const equalWidth = Math.floor(availableWidth / 3);
      
      // Ensure minimum widths are respected
      const finalLeftWidth = Math.max(minLeftWidth, equalWidth);
      const finalThirdWidth = Math.max(300, equalWidth); // Use 300 as minimum for third column
      
      // Calculate right column width based on the other two columns
      // Right column width = totalWidth - leftWidth - thirdWidth - 16 (grippers)
      const rightColumnWidth = totalWidth - finalLeftWidth - finalThirdWidth - 16;
      
      // If right column would be less than minimum, adjust left and third columns
      let adjustedLeftWidth = finalLeftWidth;
      let adjustedThirdWidth = finalThirdWidth;
      
      if (rightColumnWidth < minRightWidth) {
        // Need to reduce left and third columns to make room for right column
        const neededWidthForRight = minRightWidth;
        const availableForLeftAndThird = totalWidth - neededWidthForRight - 16;
        
        // Split remaining space equally between left and third columns
        const newEqualWidth = Math.floor(availableForLeftAndThird / 2);
        adjustedLeftWidth = Math.max(minLeftWidth, newEqualWidth);
        adjustedThirdWidth = Math.max(300, newEqualWidth);
        
        console.log(`⚠️ Adjusted widths to respect minRightWidth: left=${adjustedLeftWidth}px, third=${adjustedThirdWidth}px, right=${minRightWidth}px`);
      } else {
        console.log(`📏 Setting columns to equal widths: left=${finalLeftWidth}px, third=${finalThirdWidth}px`);
      }
      
      // Set the widths
      setLeftWidth(adjustedLeftWidth);
      setThirdWidth(adjustedThirdWidth);
      
      // Save to sessionStorage to override any manual settings
      sessionStorage.setItem(STORAGE_KEY, adjustedLeftWidth.toString());
      sessionStorage.setItem('grace_editor_third_column_width', adjustedThirdWidth.toString());
      sessionStorage.setItem(THRESHOLD_KEY, 'true'); // Mark third column as open
      
      // Ensure third column is open
      setIsThirdColumnOpen(true);
    };

    window.addEventListener('reset-columns-to-equal-widths', handleResetColumns);
    return () => {
      window.removeEventListener('reset-columns-to-equal-widths', handleResetColumns);
    };
  }, [minLeftWidth, minRightWidth]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowLeft') {
          setLeftWidth(prev => Math.max(minLeftWidth, prev - 20));
        } else if (e.key === 'ArrowRight') {
          setLeftWidth(prev => Math.min(
            containerRef.current?.offsetWidth || prev,
            prev + 20
          ));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [minLeftWidth]);

  const gripperColor = 'transparent';
  const headerBg = isLightMode ? 'bg-gray-50 dark:bg-gray-900' : 'bg-gray-800';
  const headerText = isLightMode ? 'text-gray-700 dark:text-gray-200' : 'text-gray-200';

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden relative"
      style={{ height: '100%' }}
    >
      {/* Left Column */}
      <div
        className="overflow-hidden flex flex-col h-full"
        style={{
          width: isLeftColumnCollapsed
            ? `${LEFT_COLUMN_COLLAPSED_WIDTH}px`
            : `${leftWidth}px`,
          minWidth: `${LEFT_COLUMN_COLLAPSED_WIDTH}px`, // Always allow collapsing to 56px
          transition: getWidthTransition(),
          willChange: 'width'
        }}
      >
        {leftColumnTitle && (
          <div className={`flex-shrink-0 px-3 py-2 border-b border-border ${headerBg}`}>
            <h2 className={`text-sm font-semibold ${headerText}`}>{leftColumnTitle}</h2>
          </div>
        )}
        <div className="flex-1 min-h-0 w-full">
          {children[0]}
        </div>
      </div>

      {/* Gripper */}
      <div
        ref={gripperRef}
        className="cursor-col-resize hover:bg-blue-500 transition-colors relative z-50"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleGripperDoubleClick}
        title="Drag to resize (Ctrl/Cmd + Arrow Left/Right). Double-click to collapse/expand."
          style={{ 
            width: '8px',
            backgroundColor: gripperColor,
            cursor: 'col-resize'
          }}
        >
      </div>

      {/* Third Column - Only show when explicitly opened by user */}
      {isThirdColumnOpen && (
        <>
          <div
            className="overflow-hidden flex flex-col"
            style={{ 
              width: `${thirdWidth}px`,
              minWidth: '0px',
              transition: getWidthTransition(),
              willChange: 'width',
              height: '100%'
            }}
          >
            {thirdColumnTitle && (
              <div className={`flex-shrink-0 px-3 py-2 border-b border-border ${headerBg}`}>
                <h2 className={`text-sm font-semibold ${headerText}`}>{thirdColumnTitle}</h2>
              </div>
            )}
            <div className="flex-1 min-h-0 w-full">
              {children[2] || (
                <div className="bg-gray-100 dark:bg-gray-800 p-4 w-full">
                  <div className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Prompt Writing Area
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Additional vertical space for prompt writing
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Second Gripper */}
          <div
            ref={secondGripperRef}
            className="cursor-col-resize hover:bg-blue-500 transition-colors relative z-50"
            onMouseDown={handleSecondGripperMouseDown}
            title="Drag to resize third column (Ctrl/Cmd + Arrow Left/Right)"
            style={{ 
              width: '8px',
              backgroundColor: gripperColor,
              cursor: 'col-resize'
            }}
          >
          </div>
        </>
      )}

      {/* Right Column */}
      <div
        className="overflow-hidden flex flex-col"
        style={{ 
          width: isRightColumnCollapsed
            ? `${RIGHT_COLUMN_COLLAPSED_WIDTH}px`
            : isThirdColumnOpen
            ? isLeftColumnCollapsed
              ? `calc(100% - ${LEFT_COLUMN_COLLAPSED_WIDTH}px - ${thirdWidth}px - 16px)`
              : `calc(100% - ${leftWidth}px - ${thirdWidth}px - 16px)`
            : isLeftColumnCollapsed
              ? `calc(100% - ${LEFT_COLUMN_COLLAPSED_WIDTH}px - 8px)`
              : `calc(100% - ${leftWidth}px - 8px)`,
          minWidth: isRightColumnCollapsed
            ? `${RIGHT_COLUMN_COLLAPSED_WIDTH}px`
            : `${minRightWidth}px`,
          transition: getWidthTransition(),
          willChange: 'width',
          height: '100%'
        }}
      >
        {rightColumnTitle && (
          <div className={`flex-shrink-0 px-3 py-2 border-b border-border ${headerBg}`}>
            <h2 className={`text-sm font-semibold ${headerText}`}>{rightColumnTitle}</h2>
          </div>
        )}
        <div className="flex-1 min-h-0 w-full">
          {children[1]}
        </div>
      </div>
    </div>
  );
};
