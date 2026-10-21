import { useId } from "react";

interface SarWatermarkOverlayProps {
  watermarkText: string | null | undefined;
  opacity: number;
  position: number;
  dynamicText: string;
}

export function SarWatermarkOverlay({
  watermarkText,
  opacity,
  position,
  dynamicText,
}: SarWatermarkOverlayProps) {
  const patternId = useId().replace(/:/g, "");
  const staticText = watermarkText?.trim() || "";
  const lines = [staticText, dynamicText].filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const svgOpacity = Math.max(0, Math.min(1, opacity / 100));

  if (position === 1) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="select-none text-center font-bold text-blue-800"
          style={{ opacity: svgOpacity, userSelect: "none" }}
        >
          {lines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              style={{ fontSize: index === 0 ? 18 : 14 }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const patternTransform = position === 0 ? "rotate(-35)" : "rotate(0)";
  const patternHeight = position === 0 ? 140 : 120;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
      >
        <defs>
          <pattern
            id={patternId}
            x="0"
            y="0"
            width="280"
            height={patternHeight}
            patternUnits="userSpaceOnUse"
            patternTransform={patternTransform}
          >
            {lines.map((line, index) => (
              <text
                key={`${line}-${index}`}
                x="10"
                y={32 + index * 20}
                fontSize={index === 0 ? 13 : 11}
                fontWeight={index === 0 ? "700" : "400"}
                fill="#1e40af"
                fontFamily="sans-serif"
                letterSpacing="0.5"
                opacity={svgOpacity}
              >
                {line}
              </text>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
