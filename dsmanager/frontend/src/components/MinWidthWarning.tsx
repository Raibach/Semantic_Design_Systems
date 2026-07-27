import React, { useState, useEffect } from "react";

const MIN_WIDTH_THRESHOLD = 400;

export const MinWidthWarning: React.FC = () => {
  const [tooSmall, setTooSmall] = useState(
    typeof window !== "undefined" && window.innerWidth < MIN_WIDTH_THRESHOLD
  );

  useEffect(() => {
    const check = () => setTooSmall(window.innerWidth < MIN_WIDTH_THRESHOLD);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!tooSmall) return null;

  return (
    <div
      data-ui-id="min-width-warning"
      data-ui-type="modal"
      data-ui-description="Minimum viewport width warning — expand browser to view content"
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ backgroundColor: "rgba(26, 22, 37, 0.92)" }}
    >
      <div className="text-center px-8 max-w-xs">
        <p className="text-white/70 text-sm font-semibold font-manrope mb-1">
          Viewport too narrow
        </p>
        <p className="text-white/40 text-xs font-manrope leading-relaxed">
          Expand your browser window wider to display the content.
          <br />
          Minimum width: 400px.
        </p>
      </div>
    </div>
  );
};

export default MinWidthWarning;