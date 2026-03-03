import { useState, useEffect, useRef, useCallback } from "react";

// ─── Audio Beep System (Web Audio API) ──────────────────────
let audioCtx = null;
const getAudioCtx = () => {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

const beep = (freq = 800, duration = 0.12, vol = 0.3) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
};

const playStart = () => { beep(1000, 0.15, 0.35); setTimeout(() => beep(1400, 0.2, 0.4), 180); };
const playTick = () => beep(880, 0.08, 0.25);
const playDone = () => { beep(1200, 0.12, 0.3); setTimeout(() => beep(1600, 0.18, 0.35), 150); setTimeout(() => beep(2000, 0.25, 0.4), 320); };

// ─── Stick Figure Pose System ───────────────────────────────
// Joint order: head, neck, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hip, kneeL, kneeR, footL, footR
const J = {H:0,N:1,SL:2,SR:3,EL:4,ER:5,HL:6,HR:7,HI:8,KL:9,KR:10,FL:11,FR:12};

// Body segments: [from, to, group]
const SEGS = [
  [J.N,J.HI,"torso"],[J.SL,J.SR,"shoulder"],
  [J.SL,J.EL,"armUL"],[J.EL,J.HL,"armLL"],
  [J.SR,J.ER,"armUR"],[J.ER,J.HR,"armLR"],
  [J.HI,J.KL,"legUL"],[J.KL,J.FL,"legLL"],
  [J.HI,J.KR,"legUR"],[J.KR,J.FR,"legLR"],
];

const HL_GROUPS = {
  chest: new Set(["torso","shoulder","armUL","armLL","armUR","armLR"]),
  back: new Set(["torso"]),
  legs: new Set(["legUL","legLL","legUR","legLR"]),
  core: new Set(["torso"]),
  glutes: new Set(["legUL","legUR"]),
  shoulders: new Set(["armUL","armLL","armUR","armLR","shoulder"]),
};

const shift = (pose, dx, dy=0) => pose.map(([x,y]) => [x+dx, y+(dy||0)]);

// ─── POSE DATA (33 exercises × 2 poses) ─────────────────────
// Each entry: [startPose, endPose, options?]
// Poses defined for figure at position 1 (cx≈65)
// options: { ground?, surface?, hold?, flipArrow? }

const S = [[65,15],[65,28],[52,34],[78,34],[49,55],[81,55],[47,73],[83,73],[65,76],[57,107],[73,107],[54,142],[76,142]]; // standing

const POSE_DB = {
  // ── CHEST ──
  "プッシュアップ": [
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,110],[22,114],[30,117],[30,117],[16,130],[16,130],[30,142],[30,142],[75,121],[100,124],[100,124],[125,142],[125,142]],
  ],
  "ワイドプッシュアップ": [
    [[15,88],[22,92],[30,95],[30,95],[22,118],[22,118],[15,142],[15,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,110],[22,114],[30,117],[30,117],[8,130],[8,130],[15,142],[15,142],[75,121],[100,124],[100,124],[125,142],[125,142]],
  ],
  "ナロープッシュアップ": [
    [[15,88],[22,92],[30,95],[30,95],[34,118],[34,118],[36,142],[36,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,110],[22,114],[30,117],[30,117],[24,132],[24,132],[36,142],[36,142],[75,121],[100,124],[100,124],[125,142],[125,142]],
  ],
  "インクラインプッシュアップ": [
    [[15,72],[22,78],[30,82],[30,82],[30,98],[30,98],[30,115],[30,115],[75,98],[100,118],[100,118],[125,142],[125,142]],
    [[15,92],[22,98],[30,100],[30,100],[18,108],[18,108],[30,115],[30,115],[75,112],[100,126],[100,126],[125,142],[125,142]],
    { surface: [22,115,20,27] },
  ],
  "ニープッシュアップ": [
    [[15,95],[22,98],[30,100],[30,100],[30,122],[30,122],[30,142],[30,142],[68,110],[92,142],[92,142],[108,132],[108,132]],
    [[15,116],[22,120],[30,122],[30,122],[16,134],[16,134],[30,142],[30,142],[68,128],[92,142],[92,142],[108,132],[108,132]],
  ],

  // ── BACK ──
  "スーパーマン": [
    [[15,128],[25,130],[32,128],[32,132],[18,126],[18,134],[5,128],[5,132],[75,132],[100,133],[100,133],[125,134],[125,134]],
    [[12,112],[22,118],[30,115],[30,120],[16,106],[16,112],[3,98],[3,104],[75,128],[100,120],[100,120],[125,108],[125,108]],
  ],
  "スーパーマン（交互）": [
    [[15,128],[25,130],[32,128],[32,132],[18,126],[18,134],[5,128],[5,132],[75,132],[100,133],[100,133],[125,134],[125,134]],
    [[12,116],[22,120],[30,118],[30,130],[16,108],[18,132],[3,98],[5,134],[75,130],[100,132],[100,118],[125,134],[125,106]],
  ],
  "リバーススノーエンジェル": [
    [[15,128],[25,130],[32,128],[32,132],[18,128],[18,132],[5,130],[5,134],[75,132],[100,133],[100,133],[125,134],[125,134]],
    [[15,122],[25,126],[32,122],[32,126],[16,108],[16,112],[3,94],[3,98],[75,130],[100,132],[100,132],[125,134],[125,134]],
  ],
  "プローンY字レイズ": [
    [[15,128],[25,130],[32,128],[32,132],[18,128],[18,132],[5,130],[5,134],[75,132],[100,133],[100,133],[125,134],[125,134]],
    [[15,120],[25,124],[32,120],[32,126],[14,106],[24,110],[2,92],[16,96],[75,130],[100,132],[100,132],[125,134],[125,134]],
  ],
  "スーパーマンパルス": [
    [[12,115],[22,120],[30,117],[30,122],[16,108],[16,114],[3,100],[3,106],[75,128],[100,122],[100,122],[125,112],[125,112]],
    [[12,110],[22,116],[30,113],[30,118],[16,104],[16,110],[3,96],[3,102],[75,126],[100,118],[100,118],[125,106],[125,106]],
    { pulse: true },
  ],

  // ── LEGS ──
  "スクワット": [
    S,
    [[65,38],[65,48],[50,52],[80,52],[38,58],[92,58],[32,50],[98,50],[65,85],[45,112],[85,112],[40,142],[90,142]],
  ],
  "ランジ（左右交互）": [
    S,
    [[65,22],[65,35],[52,40],[78,40],[49,60],[81,60],[47,78],[83,78],[65,82],[42,112],[86,118],[30,142],[100,142]],
  ],
  "ワイドスクワット": [
    [[65,15],[65,28],[48,34],[82,34],[44,55],[86,55],[42,73],[88,73],[65,76],[48,107],[82,107],[40,142],[90,142]],
    [[65,38],[65,48],[44,52],[86,52],[32,58],[98,58],[26,50],[104,50],[65,88],[36,114],[94,114],[30,142],[100,142]],
  ],
  "カーフレイズ": [
    S,
    [[65,8],[65,22],[52,28],[78,28],[49,48],[81,48],[47,66],[83,66],[65,70],[57,100],[73,100],[57,128],[73,128]],
  ],
  "リバースランジ": [
    S,
    [[65,22],[65,35],[52,40],[78,40],[49,60],[81,60],[47,78],[83,78],[65,82],[86,112],[42,118],[100,142],[28,142]],
  ],
  "スクワットパルス": [
    [[65,38],[65,48],[50,52],[80,52],[38,58],[92,58],[32,50],[98,50],[65,85],[45,112],[85,112],[40,142],[90,142]],
    [[65,32],[65,42],[50,46],[80,46],[38,52],[92,52],[32,44],[98,44],[65,80],[45,108],[85,108],[40,142],[90,142]],
    { pulse: true },
  ],

  // ── CORE ──
  "プランク": [
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    { hold: true },
  ],
  "クランチ": [
    [[15,126],[25,128],[32,126],[32,130],[20,120],[20,128],[8,114],[8,122],[72,130],[90,108],[90,108],[100,142],[100,142]],
    [[25,112],[32,118],[38,118],[38,124],[26,110],[26,116],[16,104],[16,110],[72,130],[90,108],[90,108],[100,142],[100,142]],
  ],
  "サイドプランク（左右）": [
    [[30,68],[30,78],[30,82],[30,82],[30,110],[30,110],[30,142],[30,142],[72,88],[100,92],[100,92],[120,142],[120,142]],
    [[30,68],[30,78],[30,82],[30,82],[30,110],[30,110],[30,142],[30,142],[72,88],[100,92],[100,92],[120,142],[120,142]],
    { hold: true },
  ],
  "バイシクルクランチ": [
    [[15,126],[25,128],[32,126],[32,130],[20,120],[20,128],[8,114],[8,122],[72,130],[90,108],[90,108],[100,142],[100,142]],
    [[28,108],[35,116],[40,114],[40,120],[28,106],[28,114],[18,98],[18,106],[72,128],[85,105],[95,125],[72,95],[105,142]],
  ],
  "デッドバグ": [
    [[15,128],[25,130],[32,128],[32,132],[20,110],[20,112],[8,92],[8,94],[72,130],[88,110],[88,110],[100,88],[100,88]],
    [[15,128],[25,130],[32,128],[32,132],[20,110],[32,132],[8,92],[45,134],[72,130],[88,110],[88,130],[100,88],[100,142]],
  ],
  "マウンテンクライマー（ゆっくり）": [
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[55,105],[100,104],[50,118],[125,142]],
  ],
  "レッグレイズ": [
    [[15,128],[25,130],[32,128],[32,132],[20,126],[20,134],[8,128],[8,132],[72,130],[95,132],[95,132],[118,134],[118,134]],
    [[15,128],[25,130],[32,128],[32,132],[20,126],[20,134],[8,128],[8,132],[72,130],[95,108],[95,108],[118,86],[118,86]],
  ],

  // ── GLUTES ──
  "ヒップリフト": [
    [[15,128],[25,130],[32,128],[32,132],[20,126],[20,134],[8,128],[8,132],[72,132],[90,110],[90,110],[102,142],[102,142]],
    [[15,128],[25,126],[32,122],[32,126],[20,120],[20,126],[8,122],[8,126],[72,108],[90,105],[90,105],[102,142],[102,142]],
  ],
  "シングルレッグヒップリフト": [
    [[15,128],[25,130],[32,128],[32,132],[20,126],[20,134],[8,128],[8,132],[72,132],[90,110],[90,110],[102,142],[102,142]],
    [[15,128],[25,126],[32,122],[32,126],[20,120],[20,126],[8,122],[8,126],[72,108],[90,105],[90,85],[102,142],[108,72]],
  ],
  "ドンキーキック": [
    [[15,100],[22,105],[28,102],[28,108],[28,130],[28,136],[28,142],[28,142],[60,108],[80,142],[80,142],[80,142],[80,142]],
    [[15,100],[22,105],[28,102],[28,108],[28,130],[28,136],[28,142],[28,142],[60,108],[80,142],[60,88],[80,142],[55,75]],
  ],
  "ファイヤーハイドラント": [
    [[15,100],[22,105],[28,102],[28,108],[28,130],[28,136],[28,142],[28,142],[60,108],[80,142],[80,142],[80,142],[80,142]],
    [[15,100],[22,105],[28,102],[28,108],[28,130],[28,136],[28,142],[28,142],[60,108],[80,142],[75,95],[80,142],[90,85]],
  ],
  "グルートブリッジマーチ": [
    [[15,128],[25,126],[32,122],[32,126],[20,120],[20,126],[8,122],[8,126],[72,108],[90,105],[90,105],[102,142],[102,142]],
    [[15,128],[25,126],[32,122],[32,126],[20,120],[20,126],[8,122],[8,126],[72,108],[90,105],[90,82],[102,142],[108,68]],
  ],

  // ── SHOULDERS ──
  "パイクプッシュアップ": [
    [[65,22],[65,34],[58,38],[72,38],[52,60],[78,60],[45,82],[85,82],[65,82],[57,112],[73,112],[50,142],[80,142]],
    [[65,52],[65,60],[56,64],[74,64],[42,78],[88,78],[45,100],[85,100],[65,100],[57,120],[73,120],[50,142],[80,142]],
  ],
  "ダイヤモンドプッシュアップ": [
    [[15,88],[22,92],[30,95],[30,95],[32,118],[32,118],[34,142],[34,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,110],[22,114],[30,117],[30,117],[26,132],[26,132],[34,142],[34,142],[75,121],[100,124],[100,124],[125,142],[125,142]],
  ],
  "リバースプランクホールド": [
    [[120,88],[112,92],[105,95],[105,95],[105,118],[105,118],[105,142],[105,142],[60,102],[35,106],[35,106],[10,142],[10,142]],
    [[120,88],[112,92],[105,95],[105,95],[105,118],[105,118],[105,142],[105,142],[60,102],[35,106],[35,106],[10,142],[10,142]],
    { hold: true },
  ],
  "プランクショルダータップ": [
    [[15,88],[22,92],[30,95],[30,95],[30,118],[30,118],[30,142],[30,142],[75,101],[100,104],[100,104],[125,142],[125,142]],
    [[15,86],[22,90],[30,93],[30,93],[30,118],[50,80],[30,142],[58,68],[75,99],[100,102],[100,102],[125,142],[125,142]],
  ],
  "トリセップディップス": [
    [[65,18],[65,30],[56,35],[74,35],[56,55],[74,55],[56,72],[74,72],[65,75],[57,105],[73,105],[50,142],[80,142]],
    [[65,42],[65,52],[56,56],[74,56],[46,66],[84,66],[56,72],[74,72],[65,92],[57,116],[73,116],[50,142],[80,142]],
    { surface: [48,72,34,6] },
  ],
};

// ─── Figure SVG Component ───────────────────────────────────
function FigureSVG({ pose, category, color, opacity = 1 }) {
  const hlSet = HL_GROUPS[category] || new Set();
  const headR = 7;
  return (
    <g opacity={opacity}>
      {/* Head */}
      <circle cx={pose[J.H][0]} cy={pose[J.H][1]} r={headR}
        fill={hlSet.has("torso") ? color+"44" : "#333"}
        stroke={hlSet.has("torso") ? color : "#888"}
        strokeWidth={2}
      />
      {/* Body segments */}
      {SEGS.map(([a, b, grp], i) => {
        const hl = hlSet.has(grp);
        return (
          <line key={i}
            x1={pose[a][0]} y1={pose[a][1]}
            x2={pose[b][0]} y2={pose[b][1]}
            stroke={hl ? color : "#666"}
            strokeWidth={hl ? 4 : 2.5}
            strokeLinecap="round"
            opacity={hl ? 1 : 0.7}
          />
        );
      })}
    </g>
  );
}

function ExerciseIllustration({ name, category, color }) {
  const entry = POSE_DB[name];
  if (!entry) return null;
  const [p1, p2, opts = {}] = entry;
  const p2shifted = shift(p2, 150);
  const isHold = opts.hold;
  const isPulse = opts.pulse;

  return (
    <svg viewBox="0 0 280 155" style={{ width: "100%", maxWidth: 340, height: "auto" }}>
      {/* Ground line */}
      <line x1="0" y1="145" x2="280" y2="145" stroke="#333" strokeWidth="1" strokeDasharray="4,4" />

      {/* Surface (chair/bench) */}
      {opts.surface && !isHold && (
        <>
          <rect x={opts.surface[0]} y={opts.surface[1]} width={opts.surface[2]} height={opts.surface[3]}
            fill="#333" stroke="#555" strokeWidth="1" rx="2" />
          <rect x={opts.surface[0]+150} y={opts.surface[1]} width={opts.surface[2]} height={opts.surface[3]}
            fill="#333" stroke="#555" strokeWidth="1" rx="2" />
        </>
      )}
      {opts.surface && isHold && (
        <rect x={opts.surface[0]+75} y={opts.surface[1]} width={opts.surface[2]} height={opts.surface[3]}
          fill="#333" stroke="#555" strokeWidth="1" rx="2" />
      )}

      {isHold ? (
        <>
          {/* Single centered figure for hold exercises */}
          <FigureSVG pose={shift(p1, 75)} category={category} color={color} />
          {/* Pulsing glow ring around the figure */}
          {(() => {
            const cp = shift(p1, 75);
            const cx = (cp[J.H][0] + cp[J.HI][0]) / 2;
            const cy = (cp[J.H][1] + Math.max(cp[J.FL][1], cp[J.FR][1])) / 2;
            const r = Math.max(
              Math.abs(cp[J.H][1] - Math.max(cp[J.FL][1], cp[J.FR][1])) / 2 + 10,
              40
            );
            return (
              <g>
                <ellipse cx={cx} cy={cy} rx={r * 1.1} ry={r} fill="none" stroke={color} strokeWidth="1.5" opacity="0.15" strokeDasharray="6,4" />
                {/* Timer icon */}
                <g transform={`translate(${cx}, ${cy - r - 12})`}>
                  <circle cx="0" cy="0" r="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
                  <line x1="0" y1="0" x2="0" y2="-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                  <line x1="0" y1="0" x2="4" y2="2" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                </g>
              </g>
            );
          })()}
        </>
      ) : isPulse ? (
        <>
          <FigureSVG pose={p1} category={category} color={color} />
          {/* Pulse arrows (up/down) */}
          <g transform="translate(140, 72)">
            <polygon points="0,-18 -6,-8 6,-8" fill={color} opacity="0.6" />
            <polygon points="0,18 -6,8 6,8" fill={color} opacity="0.6" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke={color} strokeWidth="2" opacity="0.4" />
          </g>
          <FigureSVG pose={p2shifted} category={category} color={color} />
        </>
      ) : (
        <>
          {/* Figure 1 */}
          <FigureSVG pose={p1} category={category} color={color} />
          {/* Arrow */}
          <g transform="translate(140, 72)">
            <line x1="-15" y1="0" x2="10" y2="0" stroke={color} strokeWidth="2" opacity="0.5" />
            <polygon points="15,0 6,-5 6,5" fill={color} opacity="0.6" />
          </g>
          {/* Figure 2 */}
          <FigureSVG pose={p2shifted} category={category} color={color} />
        </>
      )}
    </svg>
  );
}

// ─── Modal Component ────────────────────────────────────────
function IllustrationModal({ exercise, category, color, onClose }) {
  if (!exercise) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      zIndex: 1000, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#151520", borderRadius: 16,
        border: `1px solid ${color}33`, padding: "20px 16px",
        maxWidth: 380, width: "100%",
        boxShadow: `0 0 60px ${color}15`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>{exercise.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#eee" }}>{exercise.name}</div>
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 4,
                background: color + "18", color: color, fontWeight: 700,
              }}>{POOL[category]?.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
            color: "#888", fontSize: 16, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", fontFamily: "inherit",
          }}>✕</button>
        </div>

        {/* SVG Illustration */}
        <div style={{
          background: "#0a0a12", borderRadius: 12, padding: "16px 8px",
          marginBottom: 12, border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <ExerciseIllustration name={exercise.name} category={category} color={color} />
        </div>

        {/* Description */}
        <div style={{
          fontSize: 12, color: "#aaa", lineHeight: 1.6,
          padding: "8px 4px",
        }}>
          {exercise.desc}
        </div>

        {/* Exercise specs */}
        <div style={{
          display: "flex", gap: 8, marginTop: 8,
          fontSize: 11, color: "#666",
        }}>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.04)" }}>
            {exercise.sets}セット
          </span>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.04)" }}>
            {exercise.type === "timed" ? `${exercise.duration}秒` : `${exercise.reps}回`}
          </span>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.04)" }}>
            休憩{exercise.rest}秒
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Exercise Pool ──────────────────────────────────────────
const POOL = {
  chest: {
    label: "胸", color: "#ff6b6b", exercises: [
      { name: "プッシュアップ", type: "reps", reps: 15, sets: 3, rest: 25, icon: "💪", desc: "両手を肩幅に開き、胸が床に近づくまで肘を曲げて戻す。体は一直線をキープ" },
      { name: "ワイドプッシュアップ", type: "reps", reps: 12, sets: 3, rest: 25, icon: "💪", desc: "手幅を肩幅の1.5倍に広げてプッシュアップ。胸の外側を意識して深く下ろす" },
      { name: "ナロープッシュアップ", type: "reps", reps: 12, sets: 3, rest: 25, icon: "💪", desc: "両手を胸の前で近づけて行うプッシュアップ。肘を体に沿わせ、三頭筋と胸の内側を刺激" },
      { name: "インクラインプッシュアップ", type: "reps", reps: 15, sets: 3, rest: 25, icon: "💪", desc: "椅子やベッドに手をつき上体を高くしてプッシュアップ。胸下部を意識してゆっくり行う" },
      { name: "ニープッシュアップ", type: "reps", reps: 18, sets: 3, rest: 25, icon: "💪", desc: "膝をついた状態でプッシュアップ。フォームを崩さず胸をしっかり下ろすことを優先" },
    ],
  },
  back: {
    label: "背中", color: "#4ecdc4", exercises: [
      { name: "スーパーマン", type: "timed", duration: 30, sets: 3, rest: 25, icon: "🦸", desc: "うつ伏せで両手両足を同時に床から浮かせてキープ。背中全体を意識して反らす" },
      { name: "スーパーマン（交互）", type: "reps", reps: 20, sets: 3, rest: 25, icon: "🤸", desc: "うつ伏せで右手と左足→左手と右足を交互に持ち上げる。対角線を意識してゆっくり" },
      { name: "リバーススノーエンジェル", type: "reps", reps: 12, sets: 3, rest: 25, icon: "🦅", desc: "うつ伏せで腕を体の横から頭上へ弧を描いて動かす。肩甲骨を寄せながらゆっくり" },
      { name: "プローンY字レイズ", type: "reps", reps: 15, sets: 3, rest: 25, icon: "🙆", desc: "うつ伏せで両腕をY字に伸ばし、親指を天井に向けて持ち上げる。僧帽筋下部を意識" },
      { name: "スーパーマンパルス", type: "timed", duration: 30, sets: 3, rest: 25, icon: "🦸", desc: "スーパーマンの姿勢で手足を小刻みに上下させる。背中全体を常に緊張させ続ける" },
    ],
  },
  legs: {
    label: "脚", color: "#ffd93d", exercises: [
      { name: "スクワット", type: "reps", reps: 20, sets: 3, rest: 30, icon: "🦵", desc: "足を肩幅に開き、お尻を後ろに引きながら太ももが床と平行になるまで腰を落とす" },
      { name: "ランジ（左右交互）", type: "reps", reps: 20, sets: 3, rest: 30, icon: "🚶", desc: "片足を大きく前に踏み出し、後ろ膝が床に近づくまで沈む。左右交互に繰り返す" },
      { name: "ワイドスクワット", type: "reps", reps: 18, sets: 3, rest: 30, icon: "🦵", desc: "足を肩幅の1.5倍に開き、つま先を外に向けて腰を落とす。内ももを意識" },
      { name: "カーフレイズ", type: "reps", reps: 25, sets: 3, rest: 20, icon: "🦶", desc: "壁に手をつき、つま先立ちでかかとを限界まで上げて2秒キープし、ゆっくり下ろす" },
      { name: "リバースランジ", type: "reps", reps: 16, sets: 3, rest: 30, icon: "🚶", desc: "片足を後ろに引き、後ろ膝が床に近づくまで沈む。前足のかかとで踏み込んで戻る" },
      { name: "スクワットパルス", type: "timed", duration: 30, sets: 3, rest: 30, icon: "🦵", desc: "スクワットの下の位置で小刻みに上下を繰り返す。太ももが常に緊張した状態をキープ" },
    ],
  },
  core: {
    label: "体幹", color: "#a78bfa", exercises: [
      { name: "プランク", type: "timed", duration: 40, sets: 3, rest: 25, icon: "🧱", desc: "肘とつま先で体を支え、頭からかかとまで一直線に保つ。お尻が上下しないよう注意" },
      { name: "クランチ", type: "reps", reps: 20, sets: 3, rest: 25, icon: "🔥", desc: "仰向けで膝を立て、おへそを覗き込むように肩甲骨を浮かせる。首ではなく腹筋で起こす" },
      { name: "サイドプランク（左右）", type: "timed", duration: 25, sets: 3, rest: 20, icon: "◀▶", desc: "肘と足の側面で体を支え一直線に保つ。左右それぞれ行う（片側ずつタイマー分）" },
      { name: "バイシクルクランチ", type: "reps", reps: 20, sets: 3, rest: 25, icon: "🚲", desc: "仰向けで対角の肘と膝を交互にタッチ。上体をしっかりひねり、脚は自転車を漕ぐように" },
      { name: "デッドバグ", type: "reps", reps: 16, sets: 3, rest: 25, icon: "🪲", desc: "仰向けで両手両足を天井に上げ、対角の手足を交互に床に近づける。腰を床に押しつけて" },
      { name: "マウンテンクライマー（ゆっくり）", type: "reps", reps: 20, sets: 3, rest: 25, icon: "⛰️", desc: "プランク姿勢から膝を交互に胸に引きつける。音を立てず静かに、体幹を安定させて" },
      { name: "レッグレイズ", type: "reps", reps: 15, sets: 3, rest: 25, icon: "🦿", desc: "仰向けで両脚を揃えてゆっくり上げ下げする。腰が浮かないよう手をお尻の下に置いてもOK" },
    ],
  },
  glutes: {
    label: "臀部", color: "#f472b6", exercises: [
      { name: "ヒップリフト", type: "reps", reps: 15, sets: 3, rest: 25, icon: "🍑", desc: "仰向けで膝を立て、お尻を天井に持ち上げる。肩から膝が一直線になるまで上げてキープ" },
      { name: "シングルレッグヒップリフト", type: "reps", reps: 12, sets: 3, rest: 25, icon: "🍑", desc: "片足を天井に伸ばした状態でヒップリフト。左右各12回。支持脚の臀部を強く締める" },
      { name: "ドンキーキック", type: "reps", reps: 16, sets: 3, rest: 20, icon: "🐴", desc: "四つん這いから片足を天井に蹴り上げる。膝は90度のまま、お尻の筋肉で持ち上げる" },
      { name: "ファイヤーハイドラント", type: "reps", reps: 16, sets: 3, rest: 20, icon: "🔥", desc: "四つん這いから膝を横に開いて持ち上げる。中臀筋を意識し、体が傾かないよう注意" },
      { name: "グルートブリッジマーチ", type: "reps", reps: 20, sets: 3, rest: 25, icon: "🍑", desc: "ヒップリフト位置をキープしたまま、足踏みのように片足ずつ持ち上げる。腰を落とさない" },
    ],
  },
  shoulders: {
    label: "肩・腕", color: "#38bdf8", exercises: [
      { name: "パイクプッシュアップ", type: "reps", reps: 12, sets: 3, rest: 25, icon: "🏔️", desc: "お尻を高く突き上げた逆V字の姿勢でプッシュアップ。頭を床に近づけ、三角筋を刺激" },
      { name: "ダイヤモンドプッシュアップ", type: "reps", reps: 10, sets: 3, rest: 25, icon: "💎", desc: "両手の親指と人差し指でひし形を作り、胸の下に置いてプッシュアップ。上腕三頭筋に効く" },
      { name: "リバースプランクホールド", type: "timed", duration: 30, sets: 3, rest: 25, icon: "🤸", desc: "仰向けで手とかかとで体を支え、お腹を天井に向ける。肩・腕・体幹を同時に鍛える" },
      { name: "プランクショルダータップ", type: "reps", reps: 20, sets: 3, rest: 25, icon: "👋", desc: "プランク姿勢で片手ずつ反対の肩にタッチ。体がぶれないようコアを固定して行う" },
      { name: "トリセップディップス", type: "reps", reps: 12, sets: 3, rest: 25, icon: "🪑", desc: "椅子に背を向けて手をつき、肘を曲げて体を下ろす。肘が90度まで曲がったら押し上げる" },
    ],
  },
};

// ─── App Logic ──────────────────────────────────────────────
const CATEGORIES = Object.keys(POOL);
const BETWEEN_EXERCISE_REST = 40;

const buildMenu = () => {
  const picks = [];
  for (const cat of CATEGORIES) {
    const pool = [...POOL[cat].exercises];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < 2; i++) picks.push({ ...pool[i], category: cat });
  }
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
};

const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const estimateTime = (exercises) => {
  let t = 0;
  exercises.forEach((ex, i) => {
    for (let s = 0; s < ex.sets; s++) {
      t += ex.type === "timed" ? ex.duration : ex.reps * 2.5;
      if (s < ex.sets - 1) t += ex.rest;
    }
    if (i < exercises.length - 1) t += BETWEEN_EXERCISE_REST;
  });
  return Math.round(t / 60);
};

// ─── Main App ───────────────────────────────────────────────
export default function WorkoutApp() {
  const [menu, setMenu] = useState(() => buildMenu());
  const [phase, setPhase] = useState("idle");
  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const [totalRunning, setTotalRunning] = useState(false);
  const [restTime, setRestTime] = useState(0);
  const [completedSets, setCompletedSets] = useState({});
  const [modalExercise, setModalExercise] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const intervalRef = useRef(null);
  const totalRef = useRef(null);
  const restRef = useRef(null);
  const wakeLockRef = useRef(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false));
      }
    } catch (e) { /* user denied or not supported */ }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // Re-acquire on tab visibility change (OS releases wake lock when tab hidden)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && totalRunning) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [totalRunning, acquireWakeLock]);

  // Release wake lock on unmount
  useEffect(() => {
    return () => { if (wakeLockRef.current) wakeLockRef.current.release(); };
  }, []);

  const ex = menu[exIdx];

  useEffect(() => {
    if (timerRunning && timer > 0) {
      intervalRef.current = setInterval(() => {
        setTimer((t) => {
          if (t <= 1) {
            setTimerRunning(false);
            playDone();
            try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
            return 0;
          }
          if (t <= 6) playTick(); // beep at 5,4,3,2,1
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning, timer]);

  useEffect(() => {
    if (totalRunning) {
      totalRef.current = setInterval(() => setTotalTime((t) => t + 1), 1000);
    }
    return () => clearInterval(totalRef.current);
  }, [totalRunning]);

  useEffect(() => {
    if (restTime > 0 && (phase === "resting" || phase === "betweenExercise")) {
      restRef.current = setInterval(() => {
        setRestTime((t) => {
          if (t <= 1) {
            try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restRef.current);
  }, [restTime, phase]);

  const startWorkout = () => {
    setPhase("active");
    setExIdx(0); setSetIdx(0); setRepCount(0);
    setTimer(menu[0].type === "timed" ? menu[0].duration : 0);
    setTotalTime(0); setTotalRunning(true);
    setCompletedSets({});
    if (menu[0].type === "timed") { playStart(); setTimerRunning(true); }
    acquireWakeLock();
  };

  const markKey = (ei, si) => `${ei}-${si}`;

  const completeSet = useCallback(() => {
    setCompletedSets((prev) => ({ ...prev, [markKey(exIdx, setIdx)]: true }));
    if (setIdx < ex.sets - 1) { setPhase("resting"); setRestTime(ex.rest); }
    else if (exIdx < menu.length - 1) { setPhase("betweenExercise"); setRestTime(BETWEEN_EXERCISE_REST); }
    else { setPhase("done"); setTotalRunning(false); releaseWakeLock(); }
  }, [exIdx, setIdx, ex, menu.length]);

  const nextAfterRest = () => {
    clearInterval(restRef.current);
    if (phase === "resting") {
      setSetIdx(s => s + 1); setRepCount(0);
      setTimer(ex.type === "timed" ? ex.duration : 0);
      setPhase("active");
      if (ex.type === "timed") { playStart(); setTimerRunning(true); }
    } else if (phase === "betweenExercise") {
      const ni = exIdx + 1; setExIdx(ni); setSetIdx(0); setRepCount(0);
      const nex = menu[ni];
      setTimer(nex.type === "timed" ? nex.duration : 0);
      setPhase("active");
      if (nex.type === "timed") { playStart(); setTimerRunning(true); }
    }
  };

  const addRep = () => {
    if (phase !== "active" || ex.type !== "reps") return;
    const next = repCount + 1; setRepCount(next);
    if (next >= ex.reps) completeSet();
  };

  const completeTimed = () => {
    if (phase !== "active" || ex.type !== "timed") return;
    setTimerRunning(false); completeSet();
  };

  const resetWorkout = () => {
    setPhase("idle"); setTimerRunning(false); setTotalRunning(false);
    clearInterval(intervalRef.current); clearInterval(totalRef.current); clearInterval(restRef.current);
    setTotalTime(0); setMenu(buildMenu());
    releaseWakeLock();
  };

  const totalSetsAll = menu.reduce((a, e) => a + e.sets, 0);
  const doneSets = Object.keys(completedSets).length;
  const progress = totalSetsAll > 0 ? (doneSets / totalSetsAll) * 100 : 0;
  const restMax = phase === "resting" ? ex.rest : BETWEEN_EXERCISE_REST;
  const restProgress = (phase === "resting" || phase === "betweenExercise") ? restTime / restMax : 0;
  const catColor = ex ? POOL[ex.category]?.color || "#c8ff00" : "#c8ff00";

  const openModal = (exercise, category) => setModalExercise({ exercise, category });
  const closeModal = () => setModalExercise(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(170deg, #0a0a0f 0%, #111118 40%, #0d1117 100%)",
      color: "#e8e6e3",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: 0, position: "relative", overflow: "hidden",
      userSelect: "none", WebkitUserSelect: "none",
    }}>
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0,
      }} />

      {/* Modal */}
      {modalExercise && (
        <IllustrationModal
          exercise={modalExercise.exercise}
          category={modalExercise.category}
          color={POOL[modalExercise.category]?.color || "#888"}
          onClose={closeModal}
        />
      )}

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 440,
        padding: "16px 16px env(safe-area-inset-bottom, 16px) 16px",
        display: "flex", flexDirection: "column", minHeight: "100vh",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12, paddingBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div>
            <h1 style={{
              fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #f0f0f0 0%, #888 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>HOME WORKOUT</h1>
            <span style={{ fontSize: 11, color: "#555", letterSpacing: "2px", textTransform: "uppercase" }}>
              QUIET · ~{estimateTime(menu)}MIN · RANDOM
            </span>
          </div>
          {phase !== "idle" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                {wakeLockActive && (
                  <span style={{ fontSize: 10, color: "#4ecdc4", opacity: 0.7 }} title="画面ロック防止中">☀</span>
                )}
                <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#c8ff00" }}>
                  {formatTime(totalTime)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "1px" }}>ELAPSED</div>
            </div>
          )}
        </div>

        {phase !== "idle" && (
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #c8ff00, #88cc00)", borderRadius: 2, transition: "width 0.5s ease" }} />
          </div>
        )}

        {/* ─── IDLE ─── */}
        {phase === "idle" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, color: "#666", letterSpacing: "2px", margin: 0, fontWeight: 500 }}>
                TODAY'S MENU — {menu.length} EXERCISES
              </h2>
              <button onClick={() => setMenu(buildMenu())} style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)", color: "#888", fontSize: 11,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>🔀 SHUFFLE</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
              {menu.map((e, i) => {
                const cc = POOL[e.category]?.color || "#888";
                return (
                  <div key={i} onClick={() => openModal(e, e.category)} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 12px", marginBottom: 4, borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                    onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(ev) => ev.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  >
                    <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0, paddingTop: 2 }}>{e.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{e.name}</div>
                        <span style={{
                          fontSize: 9, padding: "1px 6px", borderRadius: 4,
                          background: cc + "18", color: cc, fontWeight: 700, flexShrink: 0,
                        }}>{POOL[e.category]?.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        {e.sets}セット × {e.type === "timed" ? `${e.duration}秒` : `${e.reps}回`}
                        <span style={{ margin: "0 4px", opacity: 0.3 }}>|</span>休憩{e.rest}秒
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 3, lineHeight: 1.4 }}>{e.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "#444", flexShrink: 0, paddingTop: 4 }}>👁</span>
                  </div>
                );
              })}
            </div>
            <div style={{ paddingBottom: 20 }}>
              <button onClick={startWorkout} style={{
                width: "100%", padding: "18px", border: "none", borderRadius: 12,
                background: "linear-gradient(135deg, #c8ff00 0%, #a0dd00 100%)",
                color: "#0a0a0f", fontSize: 16, fontWeight: 800,
                letterSpacing: "2px", cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 0 40px rgba(200,255,0,0.15)", transition: "transform 0.1s",
              }}
                onMouseDown={(ev) => ev.currentTarget.style.transform = "scale(0.97)"}
                onMouseUp={(ev) => ev.currentTarget.style.transform = "scale(1)"}
              >▶ START WORKOUT</button>
            </div>
          </div>
        )}

        {/* ─── ACTIVE ─── */}
        {phase === "active" && ex && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#666", letterSpacing: "2px" }}>{exIdx + 1} / {menu.length}</span>
                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: catColor + "18", color: catColor, fontWeight: 700 }}>
                  {POOL[ex.category]?.label}
                </span>
              </div>
              <div style={{ fontSize: 30, marginBottom: 2 }}>{ex.icon}</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 2px 0", letterSpacing: "-0.5px" }}>{ex.name}</h2>

              {/* Inline illustration (compact) */}
              <div onClick={() => openModal(ex, ex.category)} style={{
                margin: "4px auto", maxWidth: 240, cursor: "pointer",
                background: "rgba(255,255,255,0.02)", borderRadius: 10,
                padding: "6px 4px", border: "1px solid rgba(255,255,255,0.04)",
              }}>
                <ExerciseIllustration name={ex.name} category={ex.category} color={catColor} />
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
                {Array.from({ length: ex.sets }).map((_, i) => (
                  <div key={i} style={{
                    width: 30, height: 30, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    background: completedSets[markKey(exIdx, i)] ? catColor + "22"
                      : i === setIdx ? catColor + "15" : "rgba(255,255,255,0.03)",
                    border: i === setIdx ? `2px solid ${catColor}`
                      : completedSets[markKey(exIdx, i)] ? `2px solid ${catColor}55`
                      : "2px solid rgba(255,255,255,0.06)",
                    color: completedSets[markKey(exIdx, i)] ? catColor : i === setIdx ? "#fff" : "#555",
                  }}>{completedSets[markKey(exIdx, i)] ? "✓" : i + 1}</div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>SET {setIdx + 1} / {ex.sets}</div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              {ex.type === "reps" ? (
                <>
                  <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "#fff", marginBottom: 4 }}>{repCount}</div>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>/ {ex.reps} reps</div>
                  <button onClick={addRep} style={{
                    width: 160, height: 160, borderRadius: "50%",
                    border: `3px solid ${catColor}55`,
                    background: `radial-gradient(circle at 40% 40%, ${catColor}14 0%, ${catColor}05 100%)`,
                    color: catColor, fontSize: 16, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", gap: 4,
                    boxShadow: `0 0 60px ${catColor}10`, transition: "transform 0.08s",
                  }}
                    onMouseDown={(ev) => ev.currentTarget.style.transform = "scale(0.93)"}
                    onMouseUp={(ev) => ev.currentTarget.style.transform = "scale(1)"}
                    onTouchStart={(ev) => ev.currentTarget.style.transform = "scale(0.93)"}
                    onTouchEnd={(ev) => ev.currentTarget.style.transform = "scale(1)"}
                  >
                    <span style={{ fontSize: 24 }}>TAP</span>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>カウント</span>
                  </button>
                </>
              ) : (
                <>
                  <div style={{ position: "relative", width: 170, height: 170, marginBottom: 12 }}>
                    <svg width="170" height="170" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="85" cy="85" r="76" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
                      <circle cx="85" cy="85" r="76" fill="none"
                        stroke={timer > 5 ? catColor : "#ff4444"} strokeWidth="5"
                        strokeDasharray={2 * Math.PI * 76}
                        strokeDashoffset={2 * Math.PI * 76 * (1 - timer / ex.duration)}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                      />
                    </svg>
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ fontSize: 48, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: timer > 5 ? "#fff" : "#ff4444", transition: "color 0.3s" }}>{timer}</div>
                      <div style={{ fontSize: 11, color: "#666" }}>秒</div>
                    </div>
                  </div>
                  {!timerRunning && timer > 0 && (
                    <button onClick={() => { playStart(); setTimerRunning(true); }} style={{
                      padding: "10px 28px", borderRadius: 10, border: `2px solid ${catColor}`,
                      background: "transparent", color: catColor, fontSize: 14, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>▶ START</button>
                  )}
                  {timerRunning && (
                    <button onClick={() => setTimerRunning(false)} style={{
                      padding: "10px 28px", borderRadius: 10, border: "2px solid #666",
                      background: "transparent", color: "#888", fontSize: 14, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>⏸ PAUSE</button>
                  )}
                  {timer === 0 && (
                    <button onClick={completeTimed} style={{
                      padding: "12px 32px", borderRadius: 10, border: "none",
                      background: `linear-gradient(135deg, ${catColor} 0%, ${catColor}cc 100%)`,
                      color: "#0a0a0f", fontSize: 14, fontWeight: 800,
                      cursor: "pointer", fontFamily: "inherit", boxShadow: `0 0 30px ${catColor}25`,
                    }}>✓ COMPLETE</button>
                  )}
                </>
              )}
            </div>

            {ex.type === "reps" && (
              <div style={{ textAlign: "center", paddingBottom: 16 }}>
                <button onClick={completeSet} style={{
                  padding: "10px 24px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)",
                  color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>セット完了 →</button>
              </div>
            )}
          </div>
        )}

        {/* ─── REST ─── */}
        {(phase === "resting" || phase === "betweenExercise") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflowY: "auto" }}>
            <div style={{ fontSize: 13, letterSpacing: "3px", color: "#c8ff00", marginBottom: 8, fontWeight: 600 }}>
              {phase === "resting" ? "REST" : "NEXT EXERCISE"}
            </div>
            {phase === "betweenExercise" && menu[exIdx + 1] && (() => {
              const nex = menu[exIdx + 1];
              const nc = POOL[nex.category]?.color || "#888";
              return (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#ddd", marginBottom: 4, textAlign: "center" }}>
                    {nex.icon} {nex.name}
                  </div>
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 4, marginBottom: 8,
                    background: nc + "18", color: nc, fontWeight: 700,
                  }}>{POOL[nex.category]?.label}</span>
                  {/* Preview illustration */}
                  <div onClick={() => openModal(nex, nex.category)} style={{
                    maxWidth: 200, width: "100%", cursor: "pointer",
                    background: "rgba(255,255,255,0.02)", borderRadius: 10,
                    padding: "4px 2px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <ExerciseIllustration name={nex.name} category={nex.category} color={nc} />
                  </div>
                </>
              );
            })()}
            <div style={{ position: "relative", width: 160, height: 160, marginBottom: 20 }}>
              <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
                <circle cx="80" cy="80" r="70" fill="none" stroke="#4488ff" strokeWidth="5"
                  strokeDasharray={2 * Math.PI * 70}
                  strokeDashoffset={2 * Math.PI * 70 * (1 - restProgress)}
                  strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 46, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{restTime}</div>
                <div style={{ fontSize: 11, color: "#666" }}>秒</div>
              </div>
            </div>
            <button onClick={nextAfterRest} style={{
              padding: "14px 40px", borderRadius: 10, border: "none",
              background: restTime === 0 ? "linear-gradient(135deg, #c8ff00 0%, #a0dd00 100%)" : "rgba(255,255,255,0.06)",
              color: restTime === 0 ? "#0a0a0f" : "#aaa",
              fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              boxShadow: restTime === 0 ? "0 0 30px rgba(200,255,0,0.15)" : "none", transition: "all 0.3s",
            }}>{restTime === 0 ? "▶ NEXT" : "SKIP →"}</button>
          </div>
        )}

        {/* ─── DONE ─── */}
        {phase === "done" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🏆</div>
            <h2 style={{
              fontSize: 28, fontWeight: 900, margin: "0 0 8px 0",
              background: "linear-gradient(135deg, #c8ff00 0%, #88cc00 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>COMPLETE!</h2>
            <div style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>おつかれさまでした！</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 280, marginBottom: 24 }}>
              <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#c8ff00" }}>{formatTime(totalTime)}</div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: "1px" }}>TIME</div>
              </div>
              <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#c8ff00" }}>{doneSets}</div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: "1px" }}>SETS</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 28 }}>
              {CATEGORIES.map((cat) => {
                const count = menu.filter((e) => e.category === cat).length;
                if (!count) return null;
                return (
                  <span key={cat} style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 4,
                    background: POOL[cat].color + "18", color: POOL[cat].color, fontWeight: 700,
                  }}>{POOL[cat].label} ×{count}</span>
                );
              })}
            </div>
            <button onClick={resetWorkout} style={{
              padding: "16px 40px", borderRadius: 12, border: "2px solid rgba(200,255,0,0.3)",
              background: "transparent", color: "#c8ff00", fontSize: 15, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px",
            }}>↻ NEW MENU</button>
          </div>
        )}

        {phase !== "idle" && phase !== "done" && (
          <div style={{ textAlign: "center", paddingBottom: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button onClick={resetWorkout} style={{
              padding: "8px 20px", borderRadius: 8, border: "none", background: "transparent",
              color: "#444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>■ RESET</button>
          </div>
        )}
      </div>
    </div>
  );
}
