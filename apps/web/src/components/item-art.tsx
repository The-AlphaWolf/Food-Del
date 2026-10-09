import { artPalettes } from "@food-del/design-tokens";
import type { TempClass } from "@food-del/domain";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Illustrated product art: a simple, recognisable motif per delicacy, tinted by how it travels.
 * Placeholder for photography, but deliberate rather than a grey box.
 */
const CREAM = "#FFF6E6";
const GUR = "#B5651D";
const PISTA = "#7FA650";
const SILVER = "#E9ECEF";

/** A scalloped (mould-pressed) outline: `lobes` bumps of depth `depth` around radius `r`. */
function scallop(r: number, lobes: number, depth: number): string {
  const steps = lobes * 8;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r - depth + depth * Math.abs(Math.cos((a * lobes) / 2));
    pts.push(`${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function Motif({ art, accent }: { art: string; accent: string }): ReactNode {
  switch (art) {
    case "sandesh":
      return (
        <g>
          {[
            [62, 86],
            [100, 70],
            [138, 86],
          ].map(([x, y]) => (
            <g key={`${x}`} transform={`translate(${x} ${y})`}>
              <path
                d={scallop(22, 10, 3.2)}
                fill={CREAM}
                stroke={GUR}
                strokeOpacity=".35"
                strokeWidth="1.5"
              />
              <path
                d={scallop(13, 8, 2)}
                fill="none"
                stroke={GUR}
                strokeOpacity=".4"
                strokeWidth="1.4"
              />
              <circle r="5" fill={GUR} fillOpacity=".75" />
            </g>
          ))}
        </g>
      );
    case "rosogolla":
      return (
        <g>
          <path d="M40 92 Q100 140 160 92 Z" fill={accent} fillOpacity=".18" />
          <path
            d="M36 92 H164"
            stroke={accent}
            strokeOpacity=".5"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {[
            [76, 80],
            [100, 74],
            [124, 80],
            [88, 96],
            [112, 96],
          ].map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="13"
              fill={CREAM}
              stroke={accent}
              strokeOpacity=".2"
              strokeWidth="1.5"
            />
          ))}
          <path
            d="M70 70 q4 -6 10 -6"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case "laddoo":
      return (
        <g>
          {[
            [70, 98],
            [130, 98],
            [100, 98],
            [85, 74],
            [115, 74],
            [100, 52],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="17" fill="#F2A33A" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <circle
                  key={i}
                  cx={x! - 8 + ((i * 7) % 16)}
                  cy={y! - 7 + ((i * 11) % 14)}
                  r="1.6"
                  fill="#C46A12"
                />
              ))}
            </g>
          ))}
        </g>
      );
    case "barfi":
      return (
        <g>
          {[
            [70, 70],
            [110, 70],
            [90, 100],
            [130, 100],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(45)`}>
              <rect
                x="-17"
                y="-17"
                width="34"
                height="34"
                rx="3"
                fill="#F3E2C2"
                stroke={accent}
                strokeOpacity=".25"
              />
              <rect x="-11" y="-11" width="22" height="22" rx="2" fill={SILVER} opacity=".85" />
            </g>
          ))}
        </g>
      );
    case "halwa":
      return (
        <g>
          <rect x="46" y="58" width="108" height="56" rx="8" fill="#B8742F" />
          <rect x="46" y="58" width="108" height="14" rx="7" fill="#D69A4E" />
          {[60, 78, 96, 114, 132, 70, 104, 140].map((x, i) => (
            <rect
              key={`${x}-${i}`}
              x={x}
              y={i < 5 ? 82 : 98}
              width="10"
              height="3.5"
              rx="1.7"
              fill={PISTA}
              transform={`rotate(${((i * 23) % 40) - 20} ${x} ${i < 5 ? 82 : 98})`}
            />
          ))}
        </g>
      );
    case "biscuit":
      return (
        <g>
          {[
            [78, 90],
            [120, 82],
            [98, 66],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="26" fill="#E7B76A" stroke="#C88A3A" strokeWidth="2" />
              {[-10, 0, 10].flatMap((dx) =>
                [-8, 6].map((dy) => (
                  <circle key={`${dx}${dy}`} cx={x! + dx} cy={y! + dy} r="1.8" fill="#A8661F" />
                )),
              )}
            </g>
          ))}
        </g>
      );
    case "namkeen":
      return (
        <g>
          {Array.from({ length: 22 }, (_, i) => {
            const x = 50 + ((i * 37) % 100);
            const y = 56 + ((i * 23) % 58);
            return i % 3 === 0 ? (
              <ellipse key={i} cx={x} cy={y} rx="6" ry="4.5" fill="#C98B4B" />
            ) : (
              <rect
                key={i}
                x={x}
                y={y}
                width="16"
                height="3.4"
                rx="1.7"
                fill="#E3A845"
                transform={`rotate(${(i * 47) % 180} ${x} ${y})`}
              />
            );
          })}
          {[70, 118, 96].map((x) => (
            <path key={x} d={`M${x} 104 q5 -9 10 0 q-5 6 -10 0`} fill="#4E7A2E" />
          ))}
        </g>
      );
    case "pickle":
      return (
        <g>
          <rect x="70" y="44" width="60" height="14" rx="4" fill={accent} />
          <path
            d="M66 62 h68 v54 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z"
            fill="#F7E7C9"
            stroke={accent}
            strokeOpacity=".3"
            strokeWidth="2"
          />
          <path d="M66 82 h68 v34 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z" fill="#C9541E" />
          {[82, 100, 116, 90, 110].map((x, i) => (
            <path
              key={`${x}-${i}`}
              d={`M${x} ${i < 3 ? 96 : 112} q6 -8 12 0 q-6 6 -12 0`}
              fill="#E2A33C"
            />
          ))}
        </g>
      );
    case "peda":
      return (
        <g>
          {[
            [70, 92],
            [130, 92],
            [100, 70],
            [100, 106],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <ellipse cx={x} cy={y} rx="22" ry="12" fill="#C68A4F" />
              <ellipse cx={x} cy={y! - 2} rx="20" ry="10" fill="#D9A46A" />
              <ellipse cx={x} cy={y! - 3} rx="6" ry="3" fill="#B87437" />
            </g>
          ))}
        </g>
      );
    case "pak":
      return (
        <g>
          {[
            [56, 64],
            [104, 64],
            [80, 92],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="44" height="30" rx="4" fill="#E8B24A" />
              {Array.from({ length: 9 }, (_, i) => (
                <circle
                  key={i}
                  cx={x! + 7 + (i % 3) * 14}
                  cy={y! + 7 + Math.floor(i / 3) * 8}
                  r="2.2"
                  fill="#B97A1E"
                />
              ))}
            </g>
          ))}
        </g>
      );
    case "jar":
      return (
        <g>
          <rect x="72" y="42" width="56" height="12" rx="4" fill={accent} />
          <path
            d="M68 58 h64 v58 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 z"
            fill="#FCEFD9"
            stroke={accent}
            strokeOpacity=".3"
            strokeWidth="2"
          />
          <path
            d="M68 76 h64 v40 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 z"
            fill="#E59A3A"
            fillOpacity=".55"
          />
          {[84, 100, 116, 92, 108].map((x, i) => (
            <circle key={`${x}-${i}`} cx={x} cy={i < 3 ? 94 : 110} r="7" fill="#D9792B" />
          ))}
        </g>
      );
    default:
      return <circle cx="100" cy="85" r="30" fill={accent} fillOpacity=".3" />;
  }
}

export function ItemArt({
  art,
  tempClass,
  label,
  className,
}: {
  art: string | null;
  tempClass: TempClass;
  label?: string;
  className?: string;
}) {
  const [bg, mid, accent] = artPalettes[tempClass];
  const id = `g-${art ?? "x"}-${tempClass}`;
  return (
    <svg
      viewBox="0 0 200 150"
      className={cn("block h-full w-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor={bg} />
          <stop offset="1" stopColor={mid} />
        </radialGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#${id})`} />
      <g opacity=".22" fill="none" stroke={accent} strokeWidth="1">
        <circle cx="178" cy="18" r="26" />
        <circle cx="178" cy="18" r="18" />
        <circle cx="22" cy="134" r="22" />
      </g>
      <ellipse cx="100" cy="122" rx="62" ry="8" fill={accent} opacity=".12" />
      <Motif art={art ?? ""} accent={accent} />
    </svg>
  );
}
