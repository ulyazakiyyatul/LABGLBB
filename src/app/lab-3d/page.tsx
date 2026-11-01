import { redirect } from "next/navigation";
import { Box, Move3D, SlidersHorizontal } from "lucide-react";
import { getSession } from "@/lib/session";
import Lab3DSimulator from "@/components/lab-3d-simulator";

export default async function Lab3D() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">Laboratorium simulasi</span>
        <h1 className="page-title" style={{ marginTop: 14 }}>Lab 3D</h1>
        <p className="muted" style={{ lineHeight: 1.7, maxWidth: 780 }}>
          Eksplorasi gerak benda dalam ruang tiga dimensi. Atur kecepatan awal, sudut, arah, ketinggian, dan gravitasi untuk mengamati perubahan lintasan.
        </p>
        <div className="grid-cards" style={{ marginTop: 20 }}>
          {[
            { icon: Box, title: "Ruang koordinat", text: "Amati komponen posisi pada sumbu X, Y, dan Z." },
            { icon: SlidersHorizontal, title: "Parameter gerak", text: "Ubah kondisi awal dan gravitasi secara langsung." },
            { icon: Move3D, title: "Lintasan interaktif", text: "Jalankan, jeda, dan ulangi simulasi." },
          ].map(({ icon: Icon, title, text }) => (
            <div className="panel" key={title} style={{ padding: 18 }}>
              <Icon size={23} color="#168dcc" />
              <h2 style={{ fontSize: 16, margin: "10px 0 5px" }}>{title}</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{text}</p>
            </div>
          ))}
        </div>
        <Lab3DSimulator />
      </div>
    </section>
  );
}
