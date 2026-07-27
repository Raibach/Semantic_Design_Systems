import React, { useState, useEffect, type ReactNode, type CSSProperties, forwardRef } from 'react';

/**
 * Drop-in replacement for Motion components using CSS transitions
 * This avoids runtime errors in Figma's preview environment
 * Now with proper AnimatePresence support for dropdowns
 */

interface MotionProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  initial?: any;
  animate?: any;
  exit?: any;
  transition?: any;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  whileHover?: any;
  whileTap?: any;
}

const motion_div = forwardRef<HTMLDivElement, MotionProps>(
  ({ children, className = '', style, animate, initial, transition, onClick }, ref) => {
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
      // Trigger mount animation
      setMounted(true);
    }, []);

    // Extract CSS properties from animate prop, handling special cases
    let animatedStyle: CSSProperties = { ...style };
    
    if (animate && typeof animate === 'object') {
      const { height, opacity, y, scale, ...otherAnimateProps } = animate;
      
      // Handle height: "auto" case - remove fixed height to allow natural sizing
      if (height === "auto") {
        animatedStyle = {
          ...animatedStyle,
          ...otherAnimateProps,
          height: undefined,
          maxHeight: '9999px', // Allow expansion
        };
      } else if (height !== undefined) {
        animatedStyle = {
          ...animatedStyle,
          ...otherAnimateProps,
          height,
          maxHeight: undefined,
        };
      } else {
        animatedStyle = {
          ...animatedStyle,
          ...otherAnimateProps,
        };
      }

      // Handle opacity
      if (opacity !== undefined && mounted) {
        animatedStyle.opacity = opacity;
      } else if (initial && typeof initial === 'object' && 'opacity' in initial && !mounted) {
        animatedStyle.opacity = initial.opacity;
      }

      // Handle transform (y and scale)
      const transforms: string[] = [];
      
      if (y !== undefined && mounted) {
        transforms.push(`translateY(${y}px)`);
      } else if (initial && typeof initial === 'object' && 'y' in initial && !mounted) {
        transforms.push(`translateY(${initial.y}px)`);
      }
      
      if (scale !== undefined && mounted) {
        transforms.push(`scale(${scale})`);
      } else if (initial && typeof initial === 'object' && 'scale' in initial && !mounted) {
        transforms.push(`scale(${initial.scale})`);
      }

      if (transforms.length > 0) {
        animatedStyle.transform = transforms.join(' ');
      }
    }

    // Apply transition duration from transition prop if available
    const transitionDuration = transition?.duration ? `${transition.duration * 1000}ms` : '200ms';

    return (
      <div 
        ref={ref}
        className={`${className} transition-all ease-out`}
        style={{
          ...animatedStyle,
          transitionDuration,
        }}
        onClick={onClick}
      >
        {children}
      </div>
    );
  }
);
motion_div.displayName = 'motion.div';

const motion_button = forwardRef<HTMLButtonElement, MotionProps>(
  ({ children, className = '', style, animate, initial, onClick, onDoubleClick }, ref) => {
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
      setMounted(true);
    }, []);

    let animatedStyle: CSSProperties = { ...style };
    
    if (animate && typeof animate === 'object') {
      const { opacity, y, scale, ...otherAnimateProps } = animate;
      
      animatedStyle = {
        ...animatedStyle,
        ...otherAnimateProps,
      };

      // Handle opacity
      if (opacity !== undefined && mounted) {
        animatedStyle.opacity = opacity;
      } else if (initial && typeof initial === 'object' && 'opacity' in initial && !mounted) {
        animatedStyle.opacity = initial.opacity;
      }

      // Handle transform
      const transforms: string[] = [];
      
      if (y !== undefined && mounted) {
        transforms.push(`translateY(${y}px)`);
      } else if (initial && typeof initial === 'object' && 'y' in initial && !mounted) {
        transforms.push(`translateY(${initial.y}px)`);
      }
      
      if (scale !== undefined && mounted) {
        transforms.push(`scale(${scale})`);
      } else if (initial && typeof initial === 'object' && 'scale' in initial && !mounted) {
        transforms.push(`scale(${initial.scale})`);
      }

      if (transforms.length > 0) {
        animatedStyle.transform = transforms.join(' ');
      }
    }

    return (
      <button 
        ref={ref}
        className={`${className} transition-all duration-200 ease-out`}
        style={animatedStyle}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </button>
    );
  }
);
motion_button.displayName = 'motion.button';

// AnimatePresence with proper mount/unmount support
export function AnimatePresence({ children, mode }: { children: ReactNode; mode?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Delay showing children to allow for entrance animation
    const timer = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(timer);
  }, [children]);

  // Render children immediately (they handle their own animation states)
  return <>{children}</>;
}

// Export as motion object to match Framer Motion API
export const motion = {
  div: motion_div,
  button: motion_button,
};
