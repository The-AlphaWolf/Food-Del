import type { ArtKey, TempClass } from "@food-del/domain";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Illustrated product art: a recognisable motif per delicacy, until photography lands.
 *
 * The backdrop and accent lines follow the theme (CSS variables; `currentColor` is the accent),
 * so the art sits quietly on Night's dark surfaces. The food itself keeps its real colours in
 * both themes, as a photograph would.
 */
const CREAM = "#FFF6E6";
const GUR = "#B5651D";
const PISTA = "#7FA650";
const SILVER = "#E9ECEF";
const ALMOND = "#E8C48F";
const CHILLI = "#C0392B";
const LEAF = "#4E7A2E";
const ACCENT = "currentColor";

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

/** An Archimedean spiral, for murukku. */
function spiral(turns: number, r: number): string {
  const steps = turns * 24;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(`${(Math.cos(a) * r * t).toFixed(2)} ${(Math.sin(a) * r * t).toFixed(2)}`);
  }
  return `M${pts.join(" L")}`;
}

/** Deterministic scatter so server and browser draw identical art. */
function scatter(n: number, x0: number, y0: number, w: number, h: number, seed = 1) {
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (((i + seed) * 37) % w),
    y: y0 + (((i + seed) * 23) % h),
    r: ((i + seed) * 47) % 180,
    i,
  }));
}

/** A shallow serving dish in the accent colour, for things served in syrup or sauce. */
function Dish({ fill = ACCENT, opacity = 0.18 }: { fill?: string; opacity?: number }) {
  return (
    <>
      <path d="M40 94 Q100 142 160 94 Z" fill={fill} fillOpacity={opacity} />
      <path
        d="M36 94 H164"
        stroke={fill}
        strokeOpacity=".5"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  );
}

/** A preserve jar: lid in the accent colour, contents in `fill`, floating `pieces`. */
function Jar({
  fill,
  pieces,
  pieceShape,
}: {
  fill: string;
  pieces: string;
  pieceShape: "round" | "leaf";
}) {
  return (
    <g>
      <rect x="70" y="44" width="60" height="14" rx="4" fill={ACCENT} />
      <path
        d="M66 62 h68 v54 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z"
        fill="#F7E7C9"
        stroke={ACCENT}
        strokeOpacity=".3"
        strokeWidth="2"
      />
      <path d="M66 80 h68 v36 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z" fill={fill} />
      {[82, 100, 116, 90, 110].map((x, i) =>
        pieceShape === "round" ? (
          <circle key={`${x}-${i}`} cx={x + 2} cy={i < 3 ? 96 : 112} r="6.5" fill={pieces} />
        ) : (
          <path
            key={`${x}-${i}`}
            d={`M${x} ${i < 3 ? 96 : 112} q6 -8 12 0 q-6 6 -12 0`}
            fill={pieces}
          />
        ),
      )}
    </g>
  );
}

function Motif({ art }: { art: string }): ReactNode {
  switch (art as ArtKey) {
    // ─── Bengal ────────────────────────────────────────────────────────────────────────────
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
          <Dish />
          {[
            [76, 82],
            [100, 76],
            [124, 82],
            [88, 98],
            [112, 98],
          ].map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="13"
              fill={CREAM}
              stroke={ACCENT}
              strokeOpacity=".2"
              strokeWidth="1.5"
            />
          ))}
          <path
            d="M70 72 q4 -6 10 -6"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case "baked-rosogolla":
      return (
        <g>
          {/* A terracotta bhaar, as they're served in north Kolkata. */}
          <path d="M48 88 Q100 138 152 88 Z" fill="#B5552B" />
          <ellipse cx="100" cy="88" rx="52" ry="9" fill="#D07A45" />
          {[
            [80, 80],
            [100, 74],
            [120, 80],
            [100, 88],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="13" fill="#C9813E" />
              <ellipse cx={x} cy={y! - 4} rx="9" ry="5" fill="#9E5A22" fillOpacity=".7" />
              <circle cx={x! - 4} cy={y! - 6} r="2" fill="#fff" fillOpacity=".5" />
            </g>
          ))}
        </g>
      );
    case "kacha-golla":
      return (
        <g>
          {[
            [70, 94],
            [100, 86],
            [130, 94],
          ].map(([x, y]) => (
            <g key={`${x}`}>
              <path
                d={`M${x! - 22} ${y! + 10} Q${x! - 20} ${y! - 18} ${x} ${y! - 20} Q${x! + 20} ${y! - 18} ${x! + 22} ${y! + 10} Z`}
                fill="#FFF4DF"
                stroke="#E6D3B0"
                strokeWidth="1.5"
              />
              <rect
                x={x! - 5}
                y={y! - 20}
                width="10"
                height="3"
                rx="1.5"
                fill={PISTA}
                transform={`rotate(-20 ${x} ${y! - 20})`}
              />
            </g>
          ))}
        </g>
      );
    case "tin":
      return (
        <g>
          <ellipse cx="100" cy="114" rx="34" ry="8" fill="#AEB4BB" />
          <rect x="66" y="52" width="68" height="62" fill="#D9DDE2" />
          <ellipse
            cx="100"
            cy="52"
            rx="34"
            ry="8"
            fill="#EEF1F4"
            stroke="#AEB4BB"
            strokeWidth="2"
          />
          <rect x="66" y="66" width="68" height="34" fill="#B33A2E" />
          <circle cx="100" cy="83" r="11" fill={CREAM} />
          <path d="M70 66 H130 M70 100 H130" stroke="#F2C14E" strokeWidth="2" />
        </g>
      );
    case "moa":
      return (
        <g>
          {[
            [72, 96],
            [128, 96],
            [100, 96],
            [86, 72],
            [114, 72],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="17" fill="#F1DDA7" />
              {scatter(10, x! - 12, y! - 12, 24, 24, k + 2).map((p) => (
                <ellipse
                  key={p.i}
                  cx={p.x}
                  cy={p.y}
                  rx="2.4"
                  ry="1.4"
                  fill="#FFFDF5"
                  transform={`rotate(${p.r} ${p.x} ${p.y})`}
                />
              ))}
              <circle cx={x! + 5} cy={y! + 6} r="1.6" fill={GUR} />
            </g>
          ))}
        </g>
      );
    case "naru":
      return (
        <g>
          {[
            [70, 96],
            [130, 96],
            [100, 96],
            [85, 72],
            [115, 72],
            [100, 50],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="16" fill="#F8F1E1" stroke="#E2D2B2" strokeWidth="1" />
              {scatter(6, x! - 10, y! - 10, 20, 20, k + 5).map((p) => (
                <rect
                  key={p.i}
                  x={p.x}
                  y={p.y}
                  width="5"
                  height="1.4"
                  rx=".7"
                  fill="#8B5A2B"
                  fillOpacity=".7"
                  transform={`rotate(${p.r} ${p.x} ${p.y})`}
                />
              ))}
            </g>
          ))}
        </g>
      );
    case "nimki":
      return (
        <g>
          {scatter(14, 48, 52, 104, 60, 3).map((p) => (
            <g key={p.i} transform={`translate(${p.x} ${p.y}) rotate(${p.r % 60})`}>
              <path d="M0 -9 L13 0 L0 9 L-13 0 Z" fill="#E4B460" stroke="#C48A35" strokeWidth="1" />
              <circle cx="-3" cy="1" r="1.1" fill="#2E2219" />
              <circle cx="4" cy="-2" r="1.1" fill="#2E2219" />
            </g>
          ))}
        </g>
      );

    // ─── Hyderabad ─────────────────────────────────────────────────────────────────────────
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
    case "fruit-biscuit":
      return (
        <g>
          {[
            [56, 70],
            [104, 64],
            [80, 94],
            [126, 92],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`} transform={`rotate(${k * 7 - 10} ${x! + 18} ${y! + 13})`}>
              <rect
                x={x}
                y={y}
                width="38"
                height="27"
                rx="5"
                fill="#E9C27A"
                stroke="#C9934A"
                strokeWidth="1.5"
              />
              {scatter(5, x! + 5, y! + 5, 28, 18, k + 1).map((p) => (
                <rect
                  key={p.i}
                  x={p.x}
                  y={p.y}
                  width="4"
                  height="4"
                  rx="1"
                  fill={p.i % 2 ? CHILLI : "#4E9A3A"}
                />
              ))}
            </g>
          ))}
        </g>
      );
    case "jaali":
      return (
        <g>
          {[
            [72, 88],
            [128, 88],
            [100, 68],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="24" fill="#F1E0BC" stroke="#D9B77E" strokeWidth="2" />
              <g stroke="#C99A55" strokeWidth="1.4" strokeOpacity=".8">
                {[-12, -4, 4, 12].map((d) => (
                  <g key={d}>
                    <path d={`M${x! - 16} ${y! + d - 8} L${x! + 16} ${y! + d + 8}`} />
                    <path d={`M${x! - 16} ${y! + d + 8} L${x! + 16} ${y! + d - 8}`} />
                  </g>
                ))}
              </g>
              <circle cx={x} cy={y} r="24" fill="none" stroke="#D9B77E" strokeWidth="3" />
            </g>
          ))}
        </g>
      );
    case "meetha-dish":
      return (
        <g>
          <ellipse cx="100" cy="98" rx="60" ry="22" fill={ACCENT} fillOpacity=".2" />
          <ellipse cx="100" cy="94" rx="54" ry="18" fill="#F3DFB8" />
          {[
            [70, 90],
            [100, 84],
            [128, 90],
            [86, 100],
            [114, 100],
          ].map(([x, y], k) => (
            <path
              key={`${x}-${y}`}
              d={`M${x! - 13} ${y! + 7} L${x} ${y! - 9} L${x! + 13} ${y! + 7} Z`}
              fill="#B86A2A"
              stroke="#8E4C18"
              strokeWidth="1"
              transform={`rotate(${k * 13 - 20} ${x} ${y})`}
            />
          ))}
          {scatter(8, 64, 80, 72, 22, 4).map((p) => (
            <ellipse
              key={p.i}
              cx={p.x}
              cy={p.y}
              rx="3"
              ry="1.5"
              fill={p.i % 2 ? ALMOND : PISTA}
              transform={`rotate(${p.r} ${p.x} ${p.y})`}
            />
          ))}
        </g>
      );
    case "jar":
      return <Jar fill="#E59A3A" pieces="#D9792B" pieceShape="round" />;
    case "pickle":
      return <Jar fill="#C9541E" pieces="#E2A33C" pieceShape="leaf" />;
    case "gongura":
      return <Jar fill="#3E5A2A" pieces={CHILLI} pieceShape="leaf" />;

    // ─── Delhi ─────────────────────────────────────────────────────────────────────────────
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
                stroke={ACCENT}
                strokeOpacity=".25"
              />
              <rect x="-11" y="-11" width="22" height="22" rx="2" fill={SILVER} opacity=".85" />
            </g>
          ))}
        </g>
      );
    case "dodha":
      return (
        <g>
          {[
            [52, 62],
            [102, 62],
            [77, 92],
            [127, 92],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="40" height="28" rx="3" fill="#8A5427" />
              {scatter(12, x! + 3, y! + 3, 34, 22, k + 3).map((p) => (
                <circle key={p.i} cx={p.x} cy={p.y} r="1.3" fill="#5E3514" />
              ))}
              <rect x={x! + 14} y={y! + 4} width="10" height="3" rx="1.5" fill={PISTA} />
            </g>
          ))}
        </g>
      );
    case "halwa":
      return (
        <g>
          <rect x="46" y="58" width="108" height="56" rx="8" fill="#6E3B1E" />
          <rect x="46" y="58" width="108" height="14" rx="7" fill="#8D5129" />
          {[60, 78, 96, 114, 132, 70, 104, 140].map((x, i) => (
            <rect
              key={`${x}-${i}`}
              x={x}
              y={i < 5 ? 82 : 98}
              width="10"
              height="3.5"
              rx="1.7"
              fill={i % 2 ? ALMOND : PISTA}
              transform={`rotate(${((i * 23) % 40) - 20} ${x} ${i < 5 ? 82 : 98})`}
            />
          ))}
        </g>
      );
    case "sohan":
      return (
        <g>
          {[
            [72, 96],
            [128, 96],
            [100, 74],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <ellipse cx={x} cy={y! + 5} rx="26" ry="11" fill="#A9652A" />
              <ellipse cx={x} cy={y} rx="26" ry="11" fill="#E2A84F" />
              {scatter(5, x! - 16, y! - 6, 32, 10, k + 2).map((p) => (
                <rect
                  key={p.i}
                  x={p.x}
                  y={p.y}
                  width="6"
                  height="2.2"
                  rx="1.1"
                  fill={p.i % 2 ? PISTA : ALMOND}
                  transform={`rotate(${p.r} ${p.x} ${p.y})`}
                />
              ))}
            </g>
          ))}
        </g>
      );
    case "mathri":
      return (
        <g>
          {[
            [72, 92],
            [128, 92],
            [100, 70],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <ellipse
                cx={x}
                cy={y}
                rx="25"
                ry="20"
                fill="#E4BE79"
                stroke="#C99A55"
                strokeWidth="1.5"
              />
              {[-8, 0, 8].flatMap((dx) =>
                [-6, 6].map((dy) => (
                  <circle key={`${dx}${dy}`} cx={x! + dx} cy={y! + dy} r="1.5" fill="#B88A44" />
                )),
              )}
              {scatter(7, x! - 15, y! - 12, 30, 24, k + 6).map((p) => (
                <ellipse key={p.i} cx={p.x} cy={p.y} rx="1.6" ry=".8" fill="#4A3520" />
              ))}
            </g>
          ))}
        </g>
      );
    case "dal-moth":
      return (
        <g>
          <path d="M44 86 Q100 140 156 86 Z" fill={ACCENT} fillOpacity=".25" />
          <path d="M50 86 Q100 56 150 86 Z" fill="#E6B53A" />
          {scatter(26, 56, 66, 88, 20, 2).map((p) => (
            <ellipse
              key={p.i}
              cx={p.x}
              cy={p.y}
              rx={p.i % 4 === 0 ? 4 : 2.6}
              ry="1.8"
              fill={p.i % 5 === 0 ? "#7A9A3A" : p.i % 7 === 0 ? CHILLI : "#C98B2B"}
              transform={`rotate(${p.r} ${p.x} ${p.y})`}
            />
          ))}
          <path
            d="M40 86 H160"
            stroke={ACCENT}
            strokeOpacity=".5"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      );

    // ─── Karnataka ─────────────────────────────────────────────────────────────────────────
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
              <ellipse cx={x} cy={y} rx="22" ry="12" fill="#8E5A2E" />
              <ellipse cx={x} cy={y! - 2} rx="20" ry="10" fill="#A9703C" />
              {[-8, 0, 8].map((dx) => (
                <circle key={dx} cx={x! + dx} cy={y! - 3} r="1.6" fill="#F4E9D8" />
              ))}
            </g>
          ))}
        </g>
      );
    case "chiroti":
      return (
        <g>
          {[
            [70, 92],
            [130, 92],
            [100, 70],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <path d={scallop(25, 14, 2.5)} fill="#F6E7C6" stroke="#D9B77E" strokeWidth="1.2" />
              <path d={scallop(18, 12, 2)} fill="none" stroke="#D9B77E" strokeWidth="1.2" />
              <path d={scallop(11, 10, 1.5)} fill="none" stroke="#D9B77E" strokeWidth="1.2" />
              {scatter(8, -16, -14, 32, 28, 3).map((p) => (
                <circle key={p.i} cx={p.x} cy={p.y} r="1.2" fill="#fff" />
              ))}
            </g>
          ))}
        </g>
      );
    case "obbattu":
      return (
        <g>
          {[
            [82, 84],
            [118, 92],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <ellipse
                cx={x}
                cy={y}
                rx="38"
                ry="24"
                fill="#E7B04E"
                stroke="#C88A35"
                strokeWidth="1.5"
              />
              {scatter(9, x! - 26, y! - 14, 52, 28, k + 7).map((p) => (
                <ellipse
                  key={p.i}
                  cx={p.x}
                  cy={p.y}
                  rx="3.5"
                  ry="2"
                  fill="#B8792A"
                  fillOpacity=".7"
                  transform={`rotate(${p.r} ${p.x} ${p.y})`}
                />
              ))}
            </g>
          ))}
          <ellipse cx="124" cy="86" rx="9" ry="4" fill="#FCE6A8" fillOpacity=".85" />
        </g>
      );
    case "murukku":
      return (
        <g>
          {[
            [70, 92],
            [130, 92],
            [100, 68],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <path
                d={spiral(3, 22)}
                fill="none"
                stroke="#C98A3E"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              <path
                d={spiral(3, 22)}
                fill="none"
                stroke="#E2AE5E"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      );
    case "peanuts":
      return (
        <g>
          {scatter(18, 52, 58, 96, 54, 1).map((p) => (
            <g key={p.i} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`}>
              <ellipse cx="-4" cy="0" rx="6" ry="5" fill="#C88A4A" />
              <ellipse cx="4" cy="0" rx="6" ry="5" fill="#C88A4A" />
              <circle cx="0" cy="-1" r="1.3" fill={CHILLI} />
            </g>
          ))}
          {[64, 128].map((x) => (
            <path key={x} d={`M${x} 106 q6 -10 12 0 q-6 7 -12 0`} fill={LEAF} />
          ))}
        </g>
      );
    case "nippattu":
      return (
        <g>
          {[
            [72, 90],
            [128, 90],
            [100, 68],
          ].map(([x, y], k) => (
            <g key={`${x}-${y}`}>
              <path
                d={`M${x} ${y} m-24 0 a24 21 0 1 0 48 0 a24 21 0 1 0 -48 0`}
                fill="#D8A456"
                stroke="#B57E35"
                strokeWidth="1.5"
              />
              {scatter(6, x! - 14, y! - 12, 28, 24, k + 2).map((p) => (
                <ellipse key={p.i} cx={p.x} cy={p.y} rx="3" ry="2.2" fill="#B5763A" />
              ))}
              {scatter(5, x! - 16, y! - 10, 32, 20, k + 9).map((p) => (
                <path key={`l${p.i}`} d={`M${p.x} ${p.y} q2 -3 4 0 q-2 2 -4 0`} fill={LEAF} />
              ))}
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
            <path key={x} d={`M${x} 104 q5 -9 10 0 q-5 6 -10 0`} fill={LEAF} />
          ))}
        </g>
      );
    default:
      return <circle cx="100" cy="85" r="30" fill={ACCENT} fillOpacity=".3" />;
  }
}

const BACKDROP: Record<TempClass, { a: string; b: string; accent: string }> = {
  AMBIENT: {
    a: "var(--color-art-ambient-a)",
    b: "var(--color-art-ambient-b)",
    accent: "text-jaggery",
  },
  CHILLED: {
    a: "var(--color-art-chilled-a)",
    b: "var(--color-art-chilled-b)",
    accent: "text-chilled",
  },
  FROZEN: { a: "var(--color-art-frozen-a)", b: "var(--color-art-frozen-b)", accent: "text-info" },
};

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
  const look = BACKDROP[tempClass];
  const id = `g-${tempClass}`;
  return (
    <svg
      viewBox="0 0 200 150"
      className={cn("block h-full w-full", look.accent, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" style={{ stopColor: look.a }} />
          <stop offset="1" style={{ stopColor: look.b }} />
        </radialGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#${id})`} />
      <g opacity=".22" fill="none" stroke={ACCENT} strokeWidth="1">
        <circle cx="178" cy="18" r="26" />
        <circle cx="178" cy="18" r="18" />
        <circle cx="22" cy="134" r="22" />
      </g>
      <ellipse cx="100" cy="122" rx="62" ry="8" fill={ACCENT} opacity=".12" />
      <Motif art={art ?? ""} />
    </svg>
  );
}
