"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function Lab3DSimulator() {
  const [speed, setSpeed] = useState(18);
  const [angle, setAngle] = useState(48);
  const [direction, setDirection] = useState(20);
  const [height, setHeight] = useState(1.5);
  const [gravity, setGravity] = useState(9.8);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const timeRef = useRef(0);

  const model = useMemo(() => {
    const rad = (angle * Math.PI) / 180;
    const yaw = (direction * Math.PI) / 180;
    const vx = speed * Math.cos(rad) * Math.cos(yaw);
    const vy = speed * Math.sin(rad);
    const vz = speed * Math.cos(rad) * Math.sin(yaw);
    const flight = gravity > 0 ? (vy + Math.sqrt(vy * vy + 2 * gravity * height)) / gravity : 0;
    const positionAt = (t: number) => ({ x: vx * t, y: Math.max(0, height + vy * t - 0.5 * gravity * t * t), z: vz * t });
    const velocityAt = (t: number) => ({ x: vx, y: vy - gravity * t, z: vz });
    const maxX = Math.max(1, vx * flight);
    const maxZ = Math.max(1, Math.abs(vz * flight));
    const scaleX = 560 / maxX;
    const scaleZ = Math.min(160 / maxZ, 5);
    const scaleY = Math.min(190 / Math.max(1, height + (vy * vy) / (2 * gravity)), 22);
    const project = (point: { x: number; y: number; z: number }) => ({
      x: 95 + point.x * scaleX - point.z * scaleZ,
      y: 330 - point.y * scaleY - point.z * scaleZ * 0.42 - point.x * scaleX * 0.10,
    });
    const trajectory = Array.from({ length: 61 }, (_, index) => {
      const t = (flight * index) / 60;
      return project(positionAt(t));
    });
    return { flight, positionAt, velocityAt, trajectory, project, maxX, maxZ };
  }, [speed, angle, direction, height, gravity]);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;
      const next = timeRef.current + delta;
      if (next >= model.flight) {
        timeRef.current = model.flight;
        setTime(model.flight);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTime(next);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameRef.current = 0;
    };
  }, [playing, model.flight]);

  useEffect(() => {
    setPlaying(false);
    timeRef.current = 0;
    setTime(0);
  }, [speed, angle, direction, height, gravity]);

  const current = model.positionAt(Math.min(time, model.flight));
  const velocity = model.velocityAt(Math.min(time, model.flight));
  const particle = model.project(current);
  const path = model.trajectory.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const groundStart = model.project({ x: 0, y: 0, z: -model.maxZ });
  const groundRight = model.project({ x: model.maxX, y: 0, z: -model.maxZ });
  const groundBack = model.project({ x: model.maxX, y: 0, z: model.maxZ });
  const groundLeft = model.project({ x: 0, y: 0, z: model.maxZ });

  return (
    <div className="panel" style={{ padding: 20, marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div><h2 style={{ margin: 0, fontSize: 21 }}>Simulasi gerak parabola 3D</h2><p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Ubah parameter awal dan amati lintasan pada ruang X, Y, Z.</p></div>
        <span className="eyebrow">Model ideal · tanpa hambatan udara</span>
      </div>

      <div style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", background: "linear-gradient(180deg,#f5fbff,#edf8ff)" }}>
        <svg viewBox="0 0 800 410" role="img" aria-label="Visualisasi lintasan gerak tiga dimensi" style={{ display: "block", width: "100%", height: "auto" }}>
          <defs><pattern id="lab3d-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#dcebf3" strokeWidth="1" /></pattern></defs>
          <rect width="800" height="410" fill="url(#lab3d-grid)" />
          <polygon points={`${groundStart.x},${groundStart.y} ${groundRight.x},${groundRight.y} ${groundBack.x},${groundBack.y} ${groundLeft.x},${groundLeft.y}`} fill="#e5f5e9" stroke="#9fc9b1" strokeWidth="1.5" />
          <path d={`M${groundStart.x},${groundStart.y} L${groundRight.x},${groundRight.y}`} stroke="#1789c5" strokeWidth="3" />
          <path d={`M${groundStart.x},${groundStart.y} L${groundLeft.x},${groundLeft.y}`} stroke="#259b65" strokeWidth="3" />
          <path d={`M${groundStart.x},${groundStart.y} L${groundStart.x},${groundStart.y - 230}`} stroke="#d28a28" strokeWidth="3" />
          <text x={groundRight.x - 8} y={groundRight.y + 22} fill="#087eaf" fontSize="14" fontWeight="700">X</text>
          <text x={groundLeft.x - 18} y={groundLeft.y + 10} fill="#218653" fontSize="14" fontWeight="700">Z</text>
          <text x={groundStart.x - 18} y={groundStart.y - 238} fill="#b2761c" fontSize="14" fontWeight="700">Y</text>
          <path d={path} fill="none" stroke="#159fe6" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 5" />
          <circle cx={particle.x} cy={particle.y} r="10" fill="#159fe6" stroke="white" strokeWidth="4" />
          <line x1={particle.x} y1={particle.y} x2={particle.x + velocity.x * 2.2} y2={particle.y - velocity.y * 2.2} stroke="#df8b26" strokeWidth="3" strokeLinecap="round" />
          <text x="22" y="30" fill="#466276" fontSize="13">Lintasan partikel dan proyeksi bidang gerak</text>
          <text x="22" y="52" fill="#71899a" fontSize="11">Visualisasi isometrik, bukan skala perspektif kamera</text>
        </svg>
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 15 }}>
        <button className="btn btn-primary" onClick={() => { if (time >= model.flight) { timeRef.current = 0; setTime(0); } else { timeRef.current = time; } setPlaying(true); }} disabled={playing || model.flight <= 0}>▶ Jalankan</button>
        <button className="btn btn-secondary" onClick={() => setPlaying(false)} disabled={!playing}>Jeda</button>
        <button className="btn btn-secondary" onClick={() => { setPlaying(false); timeRef.current = 0; setTime(0); }}>Reset</button>
        <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 10 }}><label className="label" style={{ margin: 0, whiteSpace: "nowrap" }}>Waktu</label><input aria-label="Waktu simulasi" type="range" min="0" max={Math.max(0.01, model.flight)} step="0.01" value={Math.min(time, model.flight)} onChange={(event) => { const next = Number(event.target.value); setPlaying(false); timeRef.current = next; setTime(next); }} style={{ width: "100%" }} /><strong style={{ whiteSpace: "nowrap", fontSize: 13 }}>{time.toFixed(2)} s</strong></div>
      </div>

      <div className="grid-cards" style={{ marginTop: 16 }}>
        <div className="panel stat"><span className="muted">Posisi X</span><strong>{current.x.toFixed(2)} m</strong></div>
        <div className="panel stat"><span className="muted">Ketinggian Y</span><strong>{current.y.toFixed(2)} m</strong></div>
        <div className="panel stat"><span className="muted">Posisi Z</span><strong>{current.z.toFixed(2)} m</strong></div>
        <div className="panel stat"><span className="muted">Waktu total di udara</span><strong>{model.flight.toFixed(2)} s</strong></div>
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", marginTop: 16 }}>
        <div><label className="label">Kecepatan awal: {speed} m/s</label><input type="range" min="5" max="30" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} style={{ width: "100%" }} /></div>
        <div><label className="label">Sudut elevasi: {angle}°</label><input type="range" min="10" max="80" value={angle} onChange={(event) => setAngle(Number(event.target.value))} style={{ width: "100%" }} /></div>
        <div><label className="label">Arah horizontal: {direction}°</label><input type="range" min="-60" max="60" value={direction} onChange={(event) => setDirection(Number(event.target.value))} style={{ width: "100%" }} /></div>
        <div><label className="label">Ketinggian awal: {height.toFixed(1)} m</label><input type="range" min="0" max="10" step="0.5" value={height} onChange={(event) => setHeight(Number(event.target.value))} style={{ width: "100%" }} /></div>
        <div><label className="label">Gravitasi: {gravity.toFixed(1)} m/s²</label><input type="range" min="1" max="20" step="0.1" value={gravity} onChange={(event) => setGravity(Number(event.target.value))} style={{ width: "100%" }} /></div>
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}>Persamaan yang digunakan: x = v₀ cos(θ) cos(φ)t, z = v₀ cos(θ) sin(φ)t, dan y = h₀ + v₀ sin(θ)t − ½gt². Model mengasumsikan gravitasi konstan dan mengabaikan hambatan udara.</p>
    </div>
  );
}
