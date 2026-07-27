/**
 * FeaturedCard — Adaptive hero card with 3 breakpoints.
 * Snaps to distinct layouts at each card-width threshold. No fluid scaling.
 *
 *   1-card (≤390px): 278×359 — title + image only, matches narrow card
 *   2-card (≤584px): ~556×359 — title + image + team badge
 *   3-card (default):  877×359 — full Figma layout with all profiles
 */
import { useState, useEffect, useRef } from "react";
import imgImage394 from "@/assets/ba2436ee5372d105c51f0b68f69557ac6ffaf857.png";
import imgImage393 from "@/assets/3d4a23c7755a1d58477ec16d818b1a952073d1ff.png";
import imgImage360 from "@/assets/be4698e5a4ad3e0033bd6c1207e196e97db60b98.png";
import imgImage76 from "@/assets/cf07d05e472d0020bc137b1d13d67cbffa013be9.png";
import imgImage372 from "@/assets/1d1c6e47491f6726f6303aa8c515da81db485c50.png";

interface FeaturedCardProps {
  /** Card ID for click handling */
  id?: string;
  /** Small eyebrow text above headline */
  subtitle?: string;
  /** Main headline */
  headline?: string;
  /** Team @handle */
  teamHandle?: string;
  /** Full team name */
  teamName?: string;
  /** Team avatar image */
  teamAvatar?: string;
  /** Hero image (1-card + 2-card states) */
  heroImage?: string;
  /** User profile rows shown in 3-card state */
  profiles?: Array<{ name: string; handle: string; avatar: string }>;
  /** Click handler */
  onOpenPrompt?: (id: string) => void;
}

type CardSize = "one" | "two" | "three";

// Adaptive widths: card(278) + gap(20)
// 1-col: 278px  2-col: 278+20+278=576px  3-col: 278+20+278+20+278=874px
const WIDTHS = { one: 278, two: 576, three: 874 } as const;

const DEFAULT_PROFILES = [
  { name: "Danny Williams", handle: "Williams_TeamMate253", avatar: "" },
  { name: "Lee Smith", handle: "Sally-Mustang23", avatar: "" },
  { name: "Danny Williams", handle: "Williams_TeamMate253", avatar: "" },
  { name: "Danny Williams", handle: "Williams_TeamMate253", avatar: "" },
];

export function FeaturedCard({
  id,
  subtitle = "Enterprise Prompt Portal",
  headline = "Unlock ChatGPT God‑Mode in 20 Minutes",
  teamHandle = "TeamMates253",
  teamName = "Team Mustang, Sales Accounts",
  teamAvatar,
  heroImage,
  profiles,
  onOpenPrompt,
}: FeaturedCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CardSize>("three");

  useEffect(() => {
    const check = () => {
      if (!containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const w = parent.offsetWidth;
      // Snap based on whether next column fits
      if (w >= WIDTHS.three) setSize("three");
      else if (w >= WIDTHS.two) setSize("two");
      else setSize("one");
    };
    check();
    const observer = new ResizeObserver(check);
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }
    return () => observer.disconnect();
  }, []);

  // ── 1-CARD — compact: title + image, 278×359 (matches FlipCard) ──
  if (size === "one") {
    return (
      <div
        ref={containerRef}
        data-lit-id="featured-card"
        data-lit-size="one-card"
        data-lit-type="hero-card"
        className="h-[359px] relative shrink-0 w-[278px] bg-white border border-[#8e98a8] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] overflow-hidden"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-[220%] left-[-40%] max-w-none top-[-50%] w-[220%] object-cover opacity-90" src={heroImage || imgImage394} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/80 via-white/40 to-transparent p-4 pt-8">
          <p className="text-[11px] font-semibold text-black/80 mb-0.5">{subtitle}</p>
          <p className="text-[14px] font-bold text-black leading-tight line-clamp-2">{headline}</p>
        </div>
      </div>
    );
  }

  // ── 2-CARD — simplified: title + image + team badge ──
  if (size === "two") {
    return (
      <div
        ref={containerRef}
        data-lit-id="featured-card"
        data-lit-size="two-card"
        data-lit-type="hero-card"
        className={`h-[359px] relative shrink-0 bg-white border border-[#8e98a8] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] overflow-hidden`}
        style={{ width: WIDTHS.two, maxWidth: '100%' }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-[55%] overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-[160%] left-[-20%] max-w-none top-[-15%] w-[160%] object-cover opacity-80" src={imgImage394} />
        </div>
        <div className="absolute right-4 top-4 bottom-4 left-[58%] flex flex-col justify-between">
          <div>
            <p className="text-[13px] font-medium text-gray-500 mb-1">{subtitle}</p>
            <p className="text-[16px] font-bold text-[#1a1a1a] leading-snug line-clamp-3">{headline}</p>
          </div>
          <div className="flex items-center gap-2">
            <img alt="" className="w-7 h-7 rounded-full" src={teamAvatar || imgImage360} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#171717] truncate">@{teamHandle}</p>
              <p className="text-[10px] text-gray-500 truncate">{teamName}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 3-CARD — full Figma layout: all images + profiles (877px) ──
  return (
    <div
      ref={containerRef}
      data-lit-id="featured-card"
      data-lit-size="three-card"
      data-lit-type="hero-card"
      data-node-id="40000225:15500"
      data-tag="featured-card"
      style={{ width: WIDTHS.three, maxWidth: '100%' }}
      className="h-[359px] relative shrink-0 bg-white"
    >
      {/* Card background */}
      <div className="absolute bg-white border border-[#8e98a8] border-solid h-[355px] left-[10px] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] top-[3px] w-[867px]" />

      {/* Left illustration */}
      <div className="absolute h-[252px] left-[35px] top-[96px] w-[542px]" data-name="image 394">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-[299.42%] left-[-60.73%] max-w-none top-[-87.13%] w-[185.94%]" src={imgImage394} />
        </div>
      </div>

      {/* Right illustration clip */}
      <div className="absolute h-[252px] left-[410px] top-[87px] w-[169px]" data-name="image 395">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-[299.42%] left-[-433.22%] max-w-none top-[-87.13%] w-[596.34%]" src={imgImage394} />
        </div>
      </div>

      {/* Title block */}
      <div className="absolute bg-white h-[246px] left-[30px] top-[17px] w-[20px]">
        <div className="[word-break:break-word] absolute font-['Inter:Regular',sans-serif] font-normal h-[170px] leading-[0] left-[11px] not-italic text-[0px] text-black top-[4px] w-[532px]">
          <p className="leading-[normal] mb-0 text-[18px]">{subtitle}</p>
          <p className="font-['Inter:Bold',sans-serif] font-bold leading-[normal] text-[24px]">{headline}</p>
        </div>
      </div>

      {/* Right side: team + profiles */}
      <div className="absolute contents left-[597px] top-[24px]">
        <div className="absolute aspect-[236/38] left-[68.78%] right-[4.03%] top-[24px]" data-name="image 393">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img alt="" className="absolute h-[2563.54%] left-[-0.12%] max-w-none top-[-22.22%] w-[515.93%]" src={imgImage393} />
          </div>
        </div>

        <p className="[word-break:break-word] absolute font-['Inter:Medium',sans-serif] font-medium h-[17px] leading-[16px] left-[656px] not-italic overflow-hidden text-[#171717] text-[12px] text-ellipsis top-[189px] w-[204px] whitespace-nowrap">{teamName}</p>
        <p className="[word-break:break-word] absolute font-['Inter:Semi_Bold',sans-serif] font-semibold h-[20px] leading-[20px] left-[655.74px] not-italic overflow-hidden text-[#171717] text-[13px] text-ellipsis top-[165px] w-[189px] whitespace-nowrap">@{teamHandle}</p>

        <div className="absolute h-[38px] left-[607px] top-[167px] w-[39px]" data-name="image 359">
          <img alt="" className="absolute block inset-0 max-w-none size-full" height="38" src={teamAvatar || imgImage360} width="39" />
        </div>

        {/* Injected profile rows — replaces hardcoded data */}
        {(profiles || DEFAULT_PROFILES).slice(0, 4).map((profile, idx) => {
          const tops = [64, 114, 219, 275];
          const nameTops = [84, 136, 239, 295];
          return (
            <div key={idx} className="absolute contents" style={{ left: 606, top: tops[idx] }}>
              <p className="[word-break:break-word] absolute font-['Inter:Medium',sans-serif] font-medium h-[23px] leading-[20px] not-italic text-[#171717] text-[13px] whitespace-nowrap" style={{ left: 654, top: nameTops[idx], width: 197 }}>{profile.name}</p>
              <p className="[word-break:break-word] absolute font-['Inter:Semi_Bold',sans-serif] font-semibold h-[20px] leading-[20px] not-italic overflow-hidden text-[#171717] text-[13px] text-ellipsis whitespace-nowrap" style={{ left: 654.21, top: tops[idx], width: 189 }}>@{profile.handle}</p>
              <div className="absolute border border-solid border-white h-[37px] overflow-clip rounded-[100px]" style={{ left: 606, top: tops[idx] + 3, width: 39 }}>
                <div className="absolute h-[48px] left-[-23px] top-[-8px] w-[229px]">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" height="48" src={profile.avatar || imgImage76} width="229" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FeaturedCard;
