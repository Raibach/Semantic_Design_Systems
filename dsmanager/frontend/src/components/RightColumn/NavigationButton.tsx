import * as React from 'react';

export interface NavigationButtonProps {
  label: string;
  iconPath?: string;
  iconComponent?: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  showBorder?: boolean;
  showShadow?: boolean;
  minHeight?: string | number;
  className?: string;
  hoverTooltip?: string;
  showHoverEffect?: boolean;
}

/**
 * A reusable navigation button component for the right column sidebar.
 * Supports customizable icons, labels, hover effects, and tooltips.
 */
export const NavigationButton: React.FC<NavigationButtonProps> = ({
  label,
  iconPath,
  iconComponent,
  isActive = false,
  onClick,
  showBorder = true,
  showShadow = true,
  minHeight = '67px',
  className = '',
  hoverTooltip,
  showHoverEffect = true,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (hoverTooltip) {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowTooltip(false);
  };

  const borderClass = showBorder ? 'rounded-[inherit]' : '';
  const shadowClass = showShadow ? 'shadow-[inset_0px_4px_4px_0px_rgba(0,0,0,0.25)]' : '';
  
  const buttonStyles: React.CSSProperties = {
    minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
  };

  const iconColor = '#4ECFD5';
  const labelColor = iconColor; // Keep label color locked to icon color for every tab/state
  const labelFontClass = isActive || isHovered
    ? "font-['Inter:Bold',sans-serif] font-bold"
    : "font-['Inter:Medium',sans-serif] font-medium";

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative shrink-0 w-full transition-all duration-200 ease-in-out group ${
        isActive ? 'bg-[#fccd3d] h-[77px]' : ''
      } ${
        showHoverEffect && !isActive ? 'hover:bg-[#fccd3d] hover:h-[77px]' : ''
      } ${className}`}
      style={buttonStyles}
    >
      {/* Background effects */}
      <div className={`absolute inset-0 pointer-events-none ${borderClass} ${
        isHovered ? shadowClass : 'shadow-[inset_0px_0px_0px_0px_rgba(0,0,0,0)]'
      } transition-all duration-200 ease-in-out`} />

      {/* Icon and label container */}
      <div className={`absolute h-[47px] left-[7.42px] top-[10px] w-[67.58px] ${
        showHoverEffect ? 'group-hover:top-[15px]' : ''
      } transition-all duration-200 ease-in-out`}>
        
        {/* Icon area */}
        <div className="absolute content-stretch flex flex-col items-start left-[17px] top-px w-[26px]">
          <div className="h-[25px] overflow-clip relative shrink-0 w-full">
            {iconComponent ? (
              <div className="absolute inset-0 flex items-center justify-center">
                {React.isValidElement(iconComponent) 
                  ? React.cloneElement(iconComponent as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
                      className: 'transition-all duration-200 ease-in-out',
                      fill: iconColor
                    })
                  : iconComponent}
              </div>
            ) : iconPath ? (
              <div className="absolute contents inset-0">
                <div className="absolute inset-0 mix-blend-multiply">
                  <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 26 25">
                    <g style={{ mixBlendMode: "multiply" }}>
                      <path d="M26 0H0V25H26V0Z" fill="white" fillOpacity="0.01" />
                    </g>
                  </svg>
                </div>
                <div className="absolute inset-[6.25%]">
                  <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 22.75 21.8752">
                    <path 
                      d={iconPath} 
                      fill={iconColor} 
                      className="transition-all duration-200 ease-in-out" 
                    />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-gray-300 rounded"></div>
            )}
          </div>
        </div>

        {/* Label area */}
        <div className={`absolute content-stretch flex flex-col h-[16px] items-start justify-center left-0 top-[31px] w-full ${
          showHoverEffect ? 'group-hover:top-[33px]' : ''
        } transition-all duration-200 ease-in-out`}>
          <div className="h-[20px] relative shrink-0 w-full">
            <p
              className={`absolute ${labelFontClass} not-italic leading-[20px] text-[13px] text-center top-0 left-0 right-0 transition-all duration-200 ease-in-out whitespace-nowrap`}
              style={{ color: labelColor }}
            >
              {label}
            </p>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoverTooltip && showTooltip && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-[#BCCBCE] text-black px-3 py-2 rounded shadow-[0px_2px_8px_rgba(0,0,0,0.25)] whitespace-nowrap text-[10pt] font-['Inter'] font-normal z-50">
          {hoverTooltip}
          <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-[#BCCBCE]"></div>
        </div>
      )}
    </button>
  );
};

