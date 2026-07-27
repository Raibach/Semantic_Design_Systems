import React from "react";
import { ArrowLeftRight } from "lucide-react";

/**
 * ColumnFlipToggle — "Flip it and forget it"
 *
 * A plain, stateless toggle that swaps the left and right column positions.
 * No visual state indicator — the layout itself is the only feedback.
 * Design intent: neutral button that looks identical whether flipped or not.
 * The icon and label never change color, rotate, or indicate state.
 * State is a user preference, not a mode.
 */
interface ColumnFlipToggleProps {
  flipped: boolean;
  onToggle: () => void;
}

export const ColumnFlipToggle: React.FC<ColumnFlipToggleProps> = ({
  onToggle,
}) => {
  return (
    <button
      onClick={onToggle}
      data-ui-id="column-flip-toggle"
      data-ui-type="button"
      data-ui-description="Swap left and right column positions — no visual state indicator"
      className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer select-none"
      title="Flip left and right columns"
    >
      <ArrowLeftRight className="w-3.5 h-3.5" />
      <span>Flip</span>
    </button>
  );
};

export default ColumnFlipToggle;