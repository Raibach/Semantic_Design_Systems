import { useState } from "react";

interface FlipCardProps {
  cardId: string;
  onOpenPrompt?: (id: string) => void;
  front: React.ReactNode;
  back: React.ReactNode;
}

export function FlipCard({ cardId, onOpenPrompt, front, back }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  // Only consider it a valid ID if it looks like a UUID (has dashes in standard places)
  // This prevents fallback strings like "card-sales" from being sent to the API
  const isValidId = (id: string) => {
    // UUID format: 8-4-4-4-12 hex chars
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  };

  const handleOpen = () => {
    if (isValidId(cardId)) {
      onOpenPrompt?.(cardId);
    }
  };

  return (
    <div style={{ perspective: "1000px" }}>
      <div
        className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Front */}
        <div className="[backface-visibility:hidden] relative">
          {/* Top section — click opens prompt */}
          <div
            className={`${isValidId(cardId) ? "cursor-pointer" : "cursor-default opacity-40"} relative`}
            onClick={handleOpen}
            title={cardId ? undefined : "No session data available – create a new prompt first"}
          >
            {front}
          </div>
          {/* Bottom flip-zone stripe — click flips card */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[68px] cursor-pointer z-10 rounded-b-[10px]"
            onClick={(e) => { e.stopPropagation(); setFlipped(prev => !prev); }}
            title="Click to see details"
          />
        </div>
        {/* Back — click opens prompt */}
        <div
          className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            isValidId(cardId) ? "cursor-pointer" : "cursor-default"
          }`}
          onClick={handleOpen}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
