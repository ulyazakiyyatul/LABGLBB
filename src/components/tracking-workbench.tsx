"use client";import {useEffect,useRef,useState,type MouseEvent} from "react";import Link from "next/link";import {saveTrackingAction} from "@/app/actions/experiments";type P={t:number;x:number;y:number;detected:boolean};export default function TrackingWorkbench({experimentId,experimentName}:{experimentId:string;experimentName:string}){const videoRef=useRef<HTMLVideoElement>(null);const canvasRef=useRef<HTMLCanvasElement>(null);const streamRef=useRef<MediaStream|null>(null);const timerRef=useRef<number|undefined>(undefined);const pointsRef=useRef<P[]>([]);const [camera,setCamera]=useState(false);const [running,setRunning]=useState(false);const [color,setColor]=useState("#e53935");const [tolerance,setTolerance]=useState(55);const [scaleCm,setScaleCm]=useState(100);const [referencePx,setReferencePx]=useState(200);const [calibrating,setCalibrating]=useState(false);const [calibrationPoints,setCalibrationPoints]=useState<{x:number;y:number}[]>([]);const [points,setPoints]=useState<P[]>([]);const [status,setStatus]=useState("Kamera belum dinyalakan");const [saving,setSaving]=useState(false);const [error,setError]=useState("");const startRef=useRef(0);const lastRef=useRef(0);const target=()=>{const c=color.replace("#","");return {r:parseInt(c.slice(0,2),16),g:parseInt(c.slice(2,4),16),b:parseInt(c.slice(4,6),16)}};async function startCamera(){setError("");try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640},height:{ideal:480}},audio:false});streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play()}setCamera(true);setStatus("Kamera aktif. Atur warna dan skala, lalu mulai tracking.")}catch{setError("Kamera tidak dapat diakses. Izinkan akses kamera dan pastikan halaman menggunakan HTTPS atau localhost.")}}function stopCamera(){if(timerRef.current)window.clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCamera(false);setRunning(false);setStatus("Kamera dihentikan")}function handleCalibrationClick(e:MouseEvent<HTMLVideoElement>){
if(!calibrating||!videoRef.current)return;
const video=videoRef.current;
const rect=video.getBoundingClientRect();
const scale=Math.min(rect.width/video.videoWidth,rect.height/video.videoHeight);
if(!Number.isFinite(scale)||scale<=0)return;
const shownW=video.videoWidth*scale,shownH=video.videoHeight*scale;
const offsetX=(rect.width-shownW)/2,offsetY=(rect.height-shownH)/2;
const x=(e.clientX-rect.left-offsetX)/scale;
const y=(e.clientY-rect.top-offsetY)/scale;
if(x<0||y<0||x>video.videoWidth||y>video.videoHeight)return;
const point={x,y};
if(calibrationPoints.length===0){
  setCalibrationPoints([point]);
  setStatus("Titik pertama dipilih. Sekarang klik ujung kedua referensi.");
}else{
  const first=calibrationPoints[0];
  const distance=Math.hypot(point.x-first.x,point.y-first.y);
  setCalibrationPoints([first,point]);
  if(distance>=1){
    setReferencePx(Math.max(1,Math.round(distance)));
    setStatus(`Panjang referensi terukur sekitar ${Math.round(distance)} piksel. Masukkan panjang sebenarnya dalam cm.`);
    setCalibrating(false);
  }
}
}
function detect(){
const video=videoRef.current,canvas=canvasRef.current;
if(!video||!canvas||video.readyState<2)return;
const w=video.videoWidth,h=video.videoHeight;
if(!w||!h)return;
canvas.width=w;canvas.height=h;
const ctx=canvas.getContext("2d",{willReadFrequently:true});
if(!ctx)return;
ctx.drawImage(video,0,0,w,h);
const data=ctx.getImageData(0,0,w,h).data;
const c=target();
const step=4;
const gw=Math.ceil(w/step),gh=Math.ceil(h/step);
const mask=new Uint8Array(gw*gh);
for(let gy=0;gy<gh;gy++){
  const y=Math.min(h-1,gy*step);
  for(let gx=0;gx<gw;gx++){
    const x=Math.min(w-1,gx*step);
    const i=(y*w+x)*4;
    if(Math.abs(data[i]-c.r)<tolerance&&Math.abs(data[i+1]-c.g)<tolerance&&Math.abs(data[i+2]-c.b)<tolerance){
      mask[gy*gw+gx]=1;
    }
  }
}
const visited=new Uint8Array(mask.length);
let best:number[]=[];
for(let start=0;start<mask.length;start++){
  if(!mask[start]||visited[start])continue;
  const queue:number[]=[start];
  const component:number[]=[];
  visited[start]=1;
  for(let q=0;q<queue.length;q++){
    const idx=queue[q];
    component.push(idx);
    const gx=idx%gw,gy=Math.floor(idx/gw);
    for(let dy=-1;dy<=1;dy++){
      for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0)continue;
        const nx=gx+dx,ny=gy+dy;
        if(nx<0||ny<0||nx>=gw||ny>=gh)continue;
        const ni=ny*gw+nx;
        if(mask[ni]&&!visited[ni]){
          visited[ni]=1;
          queue.push(ni);
        }
      }
    }
  }
  if(component.length>best.length)best=component;
}
if(best.length>3){
  let sx=0,sy=0;
  for(const idx of best){
    sx+=(idx%gw)*step;
    sy+=Math.floor(idx/gw)*step;
  }
  const px=sx/best.length,py=sy/best.length;
  ctx.beginPath();
  ctx.arc(px,py,12,0,Math.PI*2);
  ctx.strokeStyle="#30AFFF";
  ctx.lineWidth=4;
  ctx.stroke();
  const now=performance.now();
  if(now-lastRef.current>80){
    const t=(now-startRef.current)/1000;
    const factor=scaleCm/Math.max(1,referencePx);
    const p={t:Number(t.toFixed(3)),x:Number((px*factor/100).toFixed(5)),y:Number(((h-py)*factor/100).toFixed(5)),detected:true};
    pointsRef.current.push(p);
    lastRef.current=now;
    setPoints([...pointsRef.current]);
    setStatus(`Objek terdeteksi · ${best.length} piksel sampel pada area terbesar`);
  }
}else{
  setStatus("Objek tidak terdeteksi. Atur warna/toleransi, gunakan latar polos, dan pastikan benda terlihat jelas.");
}
}function startTracking(){if(!camera)return;pointsRef.current=[];setPoints([]);startRef.current=performance.now();lastRef.current=0;setRunning(true);setStatus("Tracking berjalan");timerRef.current=window.setInterval(detect,80)}function pause(){if(timerRef.current)window.clearInterval(timerRef.current);setRunning(false);setStatus("Tracking dijeda. Tekan Mulai untuk merekam ulang dari awal.")}async function save(){setSaving(true);setError("");try{await saveTrackingAction(experimentId,pointsRef.current);setStatus(`${pointsRef.current.length} titik tersimpan.`)}catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan data.")}finally{setSaving(false)}}useEffect(()=>()=>{if(timerRef.current)window.clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop())},[]);return <div style={{marginTop:24}}><div className="panel" style={{padding:20,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><div className="muted" style={{fontSize:12}}>EKSPERIMEN AKTIF</div><h2 style={{margin:"5px 0 0",fontSize:21}}>{experimentName}</h2></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link className="btn btn-secondary" href={`/analysis?experiment=${experimentId}`}>Analisis data</Link><Link className="btn btn-secondary" href={`/learning?experiment=${experimentId}`}>Aktivitas belajar</Link></div></div><div style={{display:"grid",gridTemplateColumns:"minmax(0,1.3fr) minmax(270px,.7fr)",gap:18}}><div className="panel" style={{padding:16}}><div style={{position:"relative",background:"#102331",borderRadius:14,overflow:"hidden",aspectRatio:"4/3",display:"grid",placeItems:"center"}}><video ref={videoRef} muted playsInline onClick={handleCalibrationClick} style={{width:"100%",height:"100%",objectFit:"contain",display:camera?"block":"none",cursor:calibrating?"crosshair":"default"}}/>
{camera&&calibrationPoints.map((p,i)=><div key={`cal-${i}`} style={{position:"absolute",left:`${(p.x/Math.max(1,videoRef.current?.videoWidth||1))*100}%`,top:`${(p.y/Math.max(1,videoRef.current?.videoHeight||1))*100}%`,width:14,height:14,borderRadius:"50%",border:"3px solid #30AFFF",background:"#fff",transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:3}}/>)}<canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",pointerEvents:"none",display:camera?"block":"none"}}/>{!camera&&<div style={{textAlign:"center",color:"#d8e8f0",padding:20}}><div style={{fontSize:38,marginBottom:10}}>◎</div><strong>Pratinjau kamera</strong><p style={{fontSize:13,color:"#a9c0cd"}}>Nyalakan kamera untuk mulai.</p></div>}</div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>{!camera?<button className="btn btn-primary" onClick={startCamera}>Nyalakan kamera</button>:<button className="btn btn-secondary" onClick={stopCamera}>Hentikan kamera</button>}{!running?<button className="btn btn-primary" onClick={startTracking} disabled={!camera}>Mulai tracking</button>:<button className="btn btn-secondary" onClick={pause}>Jeda</button>}<button className="btn btn-secondary" onClick={()=>{pointsRef.current=[];setPoints([]);setStatus("Data lokal dikosongkan")}}>Reset data</button><button className="btn btn-primary" onClick={save} disabled={saving||points.length===0}>{saving?"Menyimpan…":"Simpan data"}</button></div><p className="muted" style={{fontSize:13,marginBottom:0}}>{status}</p>{error&&<p className="notice" style={{marginTop:12}}>{error}</p>}</div><div className="panel" style={{padding:20}}><h3 style={{marginTop:0}}>Kalibrasi & deteksi</h3><div style={{marginBottom:18}}><label className="label">Warna benda</label><div style={{display:"flex",alignItems:"center",gap:10}}><input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:52,height:42,border:0,background:"transparent"}}/><span className="muted" style={{fontSize:13}}>{color.toUpperCase()}</span></div></div><div style={{marginBottom:18}}><label className="label">Toleransi warna: {tolerance}</label><input type="range" min="20" max="120" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))} style={{width:"100%"}}/><p className="muted" style={{fontSize:12}}>Naikkan toleransi bila warna sulit terdeteksi, tetapi latar juga dapat ikut terdeteksi.</p></div><div style={{marginBottom:16}}><label className="label">Panjang referensi (cm)</label><input className="field" type="number" min="0.1" step="0.1" value={scaleCm} onChange={e=>setScaleCm(Number(e.target.value))}/></div><div style={{marginBottom:16}}><label className="label">Panjang referensi pada gambar (piksel)</label><input className="field" type="number" min="1" step="1" value={referencePx} onChange={e=>setReferencePx(Math.max(1,Number(e.target.value)||1))}/><button type="button" className="btn btn-secondary" style={{marginTop:8,width:"100%"}} disabled={!camera} onClick={()=>{setCalibrationPoints([]);setCalibrating(true);setStatus("Kalibrasi aktif: klik dua ujung panjang referensi pada pratinjau kamera.");}}>Ukur otomatis dari kamera</button><p className="muted" style={{fontSize:12,marginTop:8}}>{calibrating?"Klik ujung pertama lalu ujung kedua pada pratinjau kamera.":"Gunakan tombol ukur otomatis untuk menghitung jarak piksel dari dua titik."}</p>{calibrating&&<button type="button" className="btn btn-secondary" onClick={()=>{setCalibrating(false);setCalibrationPoints([]);setStatus("Pengukuran kalibrasi dibatalkan.");}}>Batal ukur</button>}</div><div className="notice">Skala aktif: {(scaleCm/Math.max(1,referencePx)).toFixed(4)} cm/piksel. Ukur dua ujung referensi pada gambar, lalu masukkan panjang sebenarnya dalam cm.</div><div className="grid-cards" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:15}}><div style={{padding:12,background:"#f5fbff",borderRadius:12}}><span className="muted" style={{fontSize:12}}>Jumlah titik</span><strong style={{display:"block",fontSize:25,marginTop:4}}>{points.length}</strong></div><div style={{padding:12,background:"#f0fff0",borderRadius:12}}><span className="muted" style={{fontSize:12}}>Durasi (s)</span><strong style={{display:"block",fontSize:25,marginTop:4}}>{points.length?points[points.length-1].t.toFixed(2):"0.00"}</strong></div></div></div></div><div className="panel table-wrap" style={{marginTop:18}}><div style={{padding:18,borderBottom:"1px solid var(--border)",fontWeight:800}}>Pratinjau titik terbaru</div><table><thead><tr><th>Waktu (s)</th><th>Posisi X (m)</th><th>Posisi Y (m)</th><th>Status</th></tr></thead><tbody>{points.slice(-8).reverse().map((p,i)=><tr key={`${p.t}-${i}`}><td>{p.t.toFixed(3)}</td><td>{p.x.toFixed(4)}</td><td>{p.y.toFixed(4)}</td><td>{p.detected?"Terdeteksi":"Tidak terdeteksi"}</td></tr>)}</tbody></table></div></div>}