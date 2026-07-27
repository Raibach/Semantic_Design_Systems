import * as React from 'react';
import svgPaths from '@/imports/svg-8sa7r42yg1';
import { NavigationButton } from './NavigationButton';

export interface SidebarNavigationProps {
  activeTab?: 'chat' | 'trace' | 'tools' | 'data' | 'variables';
  onTabChange?: (tab: string) => void;
  onGripperDoubleClick?: () => void;
  isCollapsed?: boolean;
  showBorder?: boolean;
  showShadow?: boolean;
  minHeight?: string | number;
  className?: string;
  showLogo?: boolean;
  showStats?: boolean;
  showSettings?: boolean;
  gradientBackground?: boolean;
  logoImage?: string;
}

/**
 * A reusable sidebar navigation component for the right column.
 * Contains navigation buttons, logo, stats, and settings.
 * Follows the same design pattern as the InteractiveChatInterface sidebar.
 */
export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  activeTab = 'chat',
  onTabChange,
  onGripperDoubleClick,
  isCollapsed = false,
  showBorder = true,
  showShadow = true,
  minHeight = '600px',
  className = '',
  showLogo = true,
  showStats = true,
  showSettings = true,
  gradientBackground = true,
  logoImage,
}) => {
  const [isGripperDragging, setIsGripperDragging] = React.useState(false);
  const isGripperDraggingRef = React.useRef(false);

  const handleTabClick = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const handleGripperMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    isGripperDraggingRef.current = true;
    setIsGripperDragging(true);

    window.dispatchEvent(new CustomEvent('right-column-drag-start'));
    window.dispatchEvent(
      new CustomEvent('right-column-drag', {
        detail: { clientX: e.clientX },
      })
    );
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isGripperDraggingRef.current) return;

      window.dispatchEvent(
        new CustomEvent('right-column-drag', {
          detail: { clientX: e.clientX },
        })
      );
    };

    const handleMouseUp = () => {
      if (!isGripperDraggingRef.current) return;

      isGripperDraggingRef.current = false;
      setIsGripperDragging(false);
      window.dispatchEvent(new CustomEvent('right-column-drag-end'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    if (isGripperDragging) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isGripperDragging]);

  const sidebarStyles: React.CSSProperties = {
    minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
  };

  const backgroundStyle = gradientBackground 
    ? {
        backgroundImage: "linear-gradient(90deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.2) 100%), linear-gradient(193.083deg, rgb(28, 47, 78) 27.022%, rgb(18, 66, 126) 38.117%, rgb(13, 48, 91) 98.965%)"
      }
    : {};

  return (
    <div 
      className={`h-full relative rounded-bl-[10px] rounded-tl-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] shrink-0 w-[75px] ${className}`}
      style={{ ...sidebarStyles, ...backgroundStyle }}
    >
      {/* Logo at top */}
      {showLogo && (
        <div className="content-stretch flex flex-col h-[66px] items-start overflow-clip relative shrink-0 w-full">
          <div className="h-[65.984px] relative shrink-0 w-full">
            {logoImage ? (
              <img 
                alt="Logo" 
                className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" 
                src={logoImage} 
              />
            ) : (
              <div className="absolute inset-0 bg-gray-300 flex items-center justify-center">
                <span className="text-white text-xs font-bold">LOGO</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat button */}
      <NavigationButton
        label="Chat"
        iconPath={svgPaths.pd073400}
        isActive={activeTab === 'chat'}
        onClick={() => handleTabClick('chat')}
        showBorder={showBorder}
        showShadow={showShadow}
        hoverTooltip="Chat with Grace"
      />

      {/* Trace button */}
      <NavigationButton
        label="Trace"
        iconPath={svgPaths.p2723500}
        isActive={activeTab === 'trace'}
        onClick={() => handleTabClick('trace')}
        showBorder={showBorder}
        showShadow={showShadow}
        hoverTooltip="Execution trace & version history"
      />

      {/* Tools button */}
      <NavigationButton
        label="Tools"
        iconPath={svgPaths.p2442da00}
        isActive={activeTab === 'tools'}
        onClick={() => handleTabClick('tools')}
        showBorder={showBorder}
        showShadow={showShadow}
        hoverTooltip="Functions that perform specific jobs"
      />

      {/* Gripper icon (placeholder) */}
      <button
        type="button"
        onMouseDown={handleGripperMouseDown}
        onDoubleClick={(e) => {
          onGripperDoubleClick?.();
          window.dispatchEvent(new CustomEvent('right-column-gripper-doubleclick'));
        }}
        aria-label={isCollapsed ? 'Expand right column' : 'Collapse right column'}
        title={isCollapsed ? 'Drag to resize · Double-click to expand to center' : 'Drag to resize · Double-click to snap to center'}
        className={`relative shrink-0 w-full cursor-col-resize hover:bg-white/5 transition-colors duration-150 ease-out rounded ${
          isGripperDragging ? 'bg-white/10' : ''
        }`}
      >
        <div className="flex flex-row items-center justify-center size-full">
          <div className="content-stretch flex items-center justify-center px-[8px] py-[3px] relative w-full">
            <div className="flex items-center justify-center relative shrink-0">
              <div className="flex-none rotate-180">
                <div className="h-[54px] relative w-[24px]">
                  <div className="absolute flex items-center justify-center left-px size-[24px] top-[25px]">
                    <div className="-rotate-90 flex-none">
                      <div className="content-stretch flex flex-col items-start relative size-[24px]">
                        <div className="h-[24px] overflow-clip relative shrink-0 w-full">
                          <div className="absolute contents inset-[45.83%_20.83%_45.83%_45.83%]">
                            <div className="absolute inset-[45.83%]">
                              <div className="absolute inset-[-50%]">
                                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
                                  <path d={svgPaths.p32cd9cf0} stroke="white" strokeLinecap="round" strokeWidth="2" />
                                </svg>
                              </div>
                            </div>
                            <div className="absolute inset-[45.83%_20.83%_45.83%_70.83%]">
                              <div className="absolute inset-[-50%]">
                                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
                                  <path d={svgPaths.p32cd9cf0} stroke="white" strokeLinecap="round" strokeWidth="2" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute flex items-center justify-center left-px size-[24px] top-[13px]">
                    <div className="-rotate-90 flex-none">
                      <div className="content-stretch flex flex-col items-start relative size-[24px]">
                        <div className="h-[24px] overflow-clip relative shrink-0 w-full">
                          <div className="absolute contents inset-[45.83%_20.83%_45.83%_45.83%]">
                            <div className="absolute inset-[45.83%]">
                              <div className="absolute inset-[-50%]">
                                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
                                  <path d={svgPaths.p32cd9cf0} stroke="white" strokeLinecap="round" strokeWidth="2" />
                                </svg>
                              </div>
                            </div>
                            <div className="absolute inset-[45.83%_20.83%_45.83%_70.83%]">
                              <div className="absolute inset-[-50%]">
                                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
                                  <path d={svgPaths.p32cd9cf0} stroke="white" strokeLinecap="round" strokeWidth="2" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Stats section */}
      {showStats && (
        <div className="absolute bottom-[70px] left-0 right-0 content-stretch flex flex-col gap-[10px] items-center p-[10px] w-full">
          {/* 27 Approve */}
          <button className="content-stretch flex flex-col h-[58.031px] items-start pb-px pr-[0.031px] rounded-[6px] w-full hover:bg-white/10 transition-colors cursor-pointer">
            <div className="content-stretch flex flex-col h-[55px] items-start justify-center relative shrink-0 w-full">
              <div className="h-[21px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Black',sans-serif] font-black leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[16px] text-center top-0 whitespace-nowrap">27</p>
              </div>
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[13px] text-center top-0 whitespace-nowrap">Approve</p>
              </div>
            </div>
          </button>

          {/* 1.2k Likes */}
          <button className="content-stretch flex flex-col h-[57.938px] items-start pb-px pr-[0.016px] rounded-[6px] w-full hover:bg-white/10 transition-colors cursor-pointer">
            <div className="content-stretch flex flex-col h-[55px] items-start justify-center relative shrink-0 w-full">
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">1.2k</p>
              </div>
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">Likes</p>
              </div>
            </div>
          </button>

          {/* 20 Mixes */}
          <button className="h-[58.031px] rounded-[6px] w-full hover:bg-white/10 transition-colors cursor-pointer">
            <div className="content-stretch flex flex-col h-[55px] items-start justify-center w-full">
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">20</p>
              </div>
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">Mixes</p>
              </div>
            </div>
          </button>

          {/* 232 Follows */}
          <button className="content-stretch flex flex-col h-[58.016px] items-start pb-px pr-[0.016px] rounded-[6px] w-full hover:bg-white/10 transition-colors cursor-pointer">
            <div className="content-stretch flex flex-col h-[55px] items-start justify-center relative shrink-0 w-full">
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">232</p>
              </div>
              <div className="h-[20px] relative shrink-0 w-full">
                <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[20px] left-0 right-0 not-italic text-[#acb9c0] text-[14px] text-center top-0 whitespace-nowrap">Follows</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Settings button at bottom */}
      {showSettings && (
        <button
          aria-label="Open settings"
          className="absolute content-stretch flex flex-col h-[29.547px] items-start left-[23px] bottom-[20px] w-[28.016px] hover:bg-white/5 rounded transition-colors"
        >
          <div className="h-[29.547px] overflow-clip relative shrink-0 w-full">
            <div className="absolute contents inset-0">
              <div className="absolute inset-0 mix-blend-multiply">
                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 28.0156 29.5469">
                  <g style={{ mixBlendMode: "multiply" }}>
                    <path d={svgPaths.p13379f2} fill="white" fillOpacity="0.01" />
                  </g>
                </svg>
              </div>
              <div className="absolute contents inset-[6.25%_0_6.25%_7.59%]">
                <div className="absolute bottom-[6.25%] left-[56.25%] right-0 top-1/2">
                  <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.2569 12.9268">
                    <path d={svgPaths.p2746f500} fill="#B5CCCE" />
                  </svg>
                </div>
                <div className="absolute inset-[31.25%]">
                  <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 10.5059 11.0801">
                    <path d={svgPaths.pb931d00} fill="#B5CCCE" />
                  </svg>
                </div>
                <div className="absolute inset-[6.25%_8.5%_6.25%_7.59%]">
                  <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 23.5089 25.8534">
                    <path d={svgPaths.pa59fe40} fill="#B5CCCE" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </button>
      )}
    </div>
  );
};
