"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { saveTrackingAction } from "@/app/actions/experiments";

type Point = { t: number; x: number; y: number; detected: boolean };
type XY = { x: number; y: number };
const MAX_POINTS = 600;
const DETECTION_INTERVAL_MS = 60;

export default function TrackingWorkbench({
  experimentId,
  experimentName,
}: {
  experimentId: string;
  experimentName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const settingsRef = useRef({ color: "#e53935", tolerance: 45, scaleCm: 100, referencePx: 200, sampleMs: 200 });
  const lastSampleRef = useRef(0);
  const segmentStartRef = useRef(0);
  const elapsedBeforePauseRef = useRef(0);
  const smoothedCenterRef = useRef<XY | null>(null);

  const [camera, setCamera] = useState(false);
  const [running, setRunning] = useState(false);
  const [color, setColor] = useState("#e53935");
  const [tolerance, setTolerance] = useState(45);
  const [scaleCm, setScaleCm] = useState(100);
  const [referencePx, setReferencePx] = useState(200);
  const [sampleMs, setSampleMs] = useState(200);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<XY[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [status, setStatus] = useState("Kamera belum dinyalakan");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    settingsRef.current = { color, tolerance, scaleCm, referencePx, sampleMs };
  }, [color, tolerance, scaleCm, referencePx, sampleMs]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Browser tidak mendukung akses kamera. Gunakan HTTPS atau localhost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera(true);
      setStatus("Kamera aktif. Pilih warna benda dan kalibrasikan skala sebelum merekam.");
    } catch {
      setError("Kamera tidak dapat diakses. Izinkan akses kamera dan pastikan halaman menggunakan HTTPS atau localhost.");
    }
  }

  function stopCamera() {
    if (running) elapsedBeforePauseRef.current += (performance.now() - segmentStartRef.current) / 1000;
    stopTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
    setRunning(false);
    setStatus("Kamera dihentikan.");
  }

  function handleCalibrationClick(event: MouseEvent<HTMLVideoElement>) {
    if (!calibrating || !videoRef.current) return;
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const shownWidth = video.videoWidth * scale;
    const shownHeight = video.videoHeight * scale;
    const offsetX = (rect.width - shownWidth) / 2;
    const offsetY = (rect.height - shownHeight) / 2;
    const x = (event.clientX - rect.left - offsetX) / scale;
    const y = (event.clientY - rect.top - offsetY) / scale;
    if (x < 0 || y < 0 || x > video.videoWidth || y > video.videoHeight) return;

    const nextPoint = { x, y };
    if (calibrationPoints.length === 0) {
      setCalibrationPoints([nextPoint]);
      setStatus("Titik pertama dipilih. Klik ujung kedua benda referensi.");
      return;
    }

    const distance = Math.hypot(nextPoint.x - calibrationPoints[0].x, nextPoint.y - calibrationPoints[0].y);
    setCalibrationPoints([calibrationPoints[0], nextPoint]);
    if (distance >= 2) {
      setReferencePx(Math.max(1, Math.round(distance)));
      setCalibrating(false);
      setStatus(`Jarak referensi terukur ${Math.round(distance)} piksel. Isi panjang sebenarnya dalam cm.`);
    }
  }

  const detect = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const settings = settingsRef.current;
    const hex = settings.color.replace("#", "");
    const target = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    const step = 4;
    const gridWidth = Math.ceil(width / step);
    const gridHeight = Math.ceil(height / step);
    const mask = new Uint8Array(gridWidth * gridHeight);
    const thresholdSquared = 3 * settings.tolerance * settings.tolerance;

    for (let gy = 0; gy < gridHeight; gy++) {
      const y = Math.min(height - 1, gy * step);
      for (let gx = 0; gx < gridWidth; gx++) {
        const x = Math.min(width - 1, gx * step);
        const index = (y * width + x) * 4;
        const dr = pixels[index] - target[0];
        const dg = pixels[index + 1] - target[1];
        const db = pixels[index + 2] - target[2];
        if (dr * dr + dg * dg + db * db <= thresholdSquared) mask[gy * gridWidth + gx] = 1;
      }
    }

    const visited = new Uint8Array(mask.length);
    let best: number[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const component: number[] = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor];
        component.push(index);
        const gx = index % gridWidth;
        const gy = Math.floor(index / gridWidth);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
            const neighbor = ny * gridWidth + nx;
            if (mask[neighbor] && !visited[neighbor]) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
      }
      if (component.length > best.length) best = component;
    }

    // Abaikan bercak warna kecil agar noise dari latar tidak masuk sebagai titik gerak.
    if (best.length < 10) {
      setStatus("Objek belum terdeteksi. Gunakan benda berwarna kontras dan latar polos.");
      return;
    }

    let sumX = 0;
    let sumY = 0;
    for (const index of best) {
      sumX += (index % gridWidth) * step;
      sumY += Math.floor(index / gridWidth) * step;
    }
    const rawCenter = { x: sumX / best.length, y: sumY / best.length };
    const previous = smoothedCenterRef.current;
    const alpha = 0.35;
    const center = previous
      ? { x: previous.x + alpha * (rawCenter.x - previous.x), y: previous.y + alpha * (rawCenter.y - previous.y) }
      : rawCenter;
    smoothedCenterRef.current = center;

    context.beginPath();
    context.arc(center.x, center.y, 13, 0, Math.PI * 2);
    context.strokeStyle = "#30AFFF";
    context.lineWidth = 4;
    context.stroke();

    const now = performance.now();
    if (now - lastSampleRef.current < settings.sampleMs || pointsRef.current.length >= MAX_POINTS) {
      if (pointsRef.current.length >= MAX_POINTS) setStatus(`Batas ${MAX_POINTS} titik tercapai. Simpan data atau mulai eksperimen baru.`);
      return;
    }
    const elapsed = elapsedBeforePauseRef.current + (now - segmentStartRef.current) / 1000;
    const cmPerPixel = settings.scaleCm / Math.max(1, settings.referencePx);
    const nextPoint: Point = {
      t: Number(elapsed.toFixed(3)),
      x: Number(((center.x * cmPerPixel) / 100).toFixed(5)),
      y: Number((((height - center.y) * cmPerPixel) / 100).toFixed(5)),
      detected: true,
    };
    pointsRef.current = [...pointsRef.current, nextPoint];
    lastSampleRef.current = now;
    setPoints(pointsRef.current);
    setStatus(`Tracking berjalan · ${pointsRef.current.length}/${MAX_POINTS} titik`);
  }, []);

  function startTracking() {
    if (!camera || running || pointsRef.current.length >= MAX_POINTS) return;
    segmentStartRef.current = performance.now();
    lastSampleRef.current = 0;
    smoothedCenterRef.current = null;
    setRunning(true);
    setStatus(pointsRef.current.length ? "Tracking dilanjutkan." : "Tracking berjalan.");
    timerRef.current = window.setInterval(detect, DETECTION_INTERVAL_MS);
  }

  function pauseTracking() {
    stopTimer();
    elapsedBeforePauseRef.current += (performance.now() - segmentStartRef.current) / 1000;
    setRunning(false);
    setStatus("Tracking dijeda. Tekan Lanjutkan untuk meneruskan pengukuran.");
  }

  function resetTracking() {
    stopTimer();
    pointsRef.current = [];
    setPoints([]);
    setRunning(false);
    elapsedBeforePauseRef.current = 0;
    lastSampleRef.current = 0;
    smoothedCenterRef.current = null;
    setStatus("Data pengukuran lokal direset. Data tersimpan di riwayat tidak ikut dihapus.");
  }

  async function save() {
    if (!pointsRef.current.length) return;
    const accepted = window.confirm("Menyimpan data baru akan mengganti data tracking sebelumnya pada eksperimen ini. Untuk menyimpan percobaan terpisah, buat eksperimen baru. Lanjutkan?");
    if (!accepted) return;
    setSaving(true);
    setError("");
    try {
      await saveTrackingAction(experimentId, pointsRef.current);
      setStatus(`${pointsRef.current.length} titik berhasil disimpan ke eksperimen ini.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan data.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopTimer]);

  const duration = points.length ? points[points.length - 1].t : 0;
  const scale = scaleCm / Math.max(1, referencePx);

  return (
    <div style={{ marginTop: 24 }}>
      <div className="panel" style={{ padding: 20, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><div className="muted" style={{ fontSize: 12 }}>EKSPERIMEN AKTIF</div><h2 style={{ margin: "5px 0 0", fontSize: 21 }}>{experimentName}</h2></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-secondary" href={`/analysis?experiment=${experimentId}`}>Analisis data</Link>
          <Link className="btn btn-secondary" href={`/learning?experiment=${experimentId}`}>Aktivitas belajar</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(270px,.7fr)", gap: 18 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ position: "relative", background: "#102331", borderRadius: 14, overflow: "hidden", aspectRatio: "4/3", display: "grid", placeItems: "center" }}>
            <video ref={videoRef} muted playsInline onClick={handleCalibrationClick} style={{ width: "100%", height: "100%", objectFit: "contain", display: camera ? "block" : "none", cursor: calibrating ? "crosshair" : "default" }} />
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", display: camera ? "block" : "none" }} />
            {camera && calibrationPoints.map((point, index) => <div key={index} style={{ position: "absolute", left: `${(point.x / Math.max(1, videoRef.current?.videoWidth || 1)) * 100}%`, top: `${(point.y / Math.max(1, videoRef.current?.videoHeight || 1)) * 100}%`, width: 14, height: 14, borderRadius: "50%", border: "3px solid #30AFFF", background: "white", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />)}
            {!camera && <div style={{ textAlign: "center", color: "#d8e8f0", padding: 20 }}><div style={{ fontSize: 38, marginBottom: 10 }}>◎</div><strong>Pratinjau kamera</strong><p style={{ fontSize: 13, color: "#a9c0cd" }}>Nyalakan kamera untuk mulai.</p></div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {!camera ? <button className="btn btn-primary" onClick={startCamera}>Nyalakan kamera</button> : <button className="btn btn-secondary" onClick={stopCamera}>Hentikan kamera</button>}
            {!running ? <button className="btn btn-primary" onClick={startTracking} disabled={!camera || points.length >= MAX_POINTS}>{points.length ? "Lanjutkan tracking" : "Mulai tracking"}</button> : <button className="btn btn-secondary" onClick={pauseTracking}>Jeda</button>}
            <button className="btn btn-secondary" onClick={resetTracking}>Reset data</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || points.length === 0}>{saving ? "Menyimpan…" : "Simpan data"}</button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{status}</p>
          {error && <p className="notice" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Kalibrasi & deteksi</h3>
          <div style={{ marginBottom: 16 }}><label className="label">Warna benda</label><div style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="color" value={color} onChange={(event) => setColor(event.target.value)} style={{ width: 52, height: 42, border: 0, background: "transparent" }} /><span className="muted" style={{ fontSize: 13 }}>{color.toUpperCase()}</span></div></div>
          <div style={{ marginBottom: 16 }}><label className="label">Toleransi warna: {tolerance}</label><input type="range" min="15" max="100" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} style={{ width: "100%" }} /><p className="muted" style={{ fontSize: 12 }}>Mulai dari 35–50. Toleransi terlalu tinggi dapat membuat latar ikut terdeteksi.</p></div>
          <div style={{ marginBottom: 14 }}><label className="label">Panjang referensi sebenarnya (cm)</label><input className="field" type="number" min="0.1" step="0.1" value={scaleCm} onChange={(event) => setScaleCm(Math.max(0.1, Number(event.target.value)))} /></div>
          <div style={{ marginBottom: 14 }}><label className="label">Panjang referensi pada gambar (piksel)</label><input className="field" type="number" min="1" step="1" value={referencePx} onChange={(event) => setReferencePx(Math.max(1, Number(event.target.value)))} /></div>
          <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => { setCalibrationPoints([]); setCalibrating(true); setStatus("Klik dua ujung benda referensi pada pratinjau kamera."); }} disabled={!camera || running}>Ukur otomatis dari kamera</button>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Klik dua ujung benda referensi pada video. Pastikan benda dan objek bergerak berada pada bidang yang sama.</p>
          <div className="notice">Skala aktif: {scale.toFixed(4)} cm/piksel. Pastikan panjang referensi benar sebelum merekam.</div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Catatan: tombol Simpan akan mengganti data tracking sebelumnya pada eksperimen yang sama. Buat eksperimen baru jika ingin menyimpan percobaan terpisah.</p>
          <div style={{ marginTop: 16 }}><label className="label">Interval pengambilan data</label><select className="field" value={sampleMs} onChange={(event) => setSampleMs(Number(event.target.value))} disabled={running}><option value={100}>100 ms · lebih rapat</option><option value={200}>200 ms · disarankan</option><option value={300}>300 ms · lebih sedikit titik</option><option value={500}>500 ms · ringkas</option></select><p className="muted" style={{ fontSize: 12 }}>Maksimal {MAX_POINTS} titik per sesi. Interval lebih besar menghasilkan data lebih sedikit.</p></div>
          <div className="grid-cards" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 15 }}>
            <div style={{ padding: 12, background: "#f5fbff", borderRadius: 12 }}><span className="muted" style={{ fontSize: 12 }}>Jumlah titik</span><strong style={{ display: "block", fontSize: 25, marginTop: 4 }}>{points.length}</strong></div>
            <div style={{ padding: 12, background: "#f0fff0", borderRadius: 12 }}><span className="muted" style={{ fontSize: 12 }}>Durasi (s)</span><strong style={{ display: "block", fontSize: 25, marginTop: 4 }}>{duration.toFixed(2)}</strong></div>
          </div>
        </div>
      </div>

      <div className="panel table-wrap" style={{ marginTop: 18 }}>
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)", fontWeight: 800 }}>Pratinjau 10 titik terbaru</div>
        <table><thead><tr><th>Waktu (s)</th><th>Posisi X (m)</th><th>Posisi Y (m)</th><th>Status</th></tr></thead><tbody>
          {points.slice(-10).reverse().map((point, index) => <tr key={`${point.t}-${index}`}><td>{point.t.toFixed(3)}</td><td>{point.x.toFixed(4)}</td><td>{point.y.toFixed(4)}</td><td>{point.detected ? "Terdeteksi" : "Tidak terdeteksi"}</td></tr>)}
          {!points.length && <tr><td colSpan={4} className="muted">Belum ada data. Nyalakan kamera lalu mulai tracking.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
