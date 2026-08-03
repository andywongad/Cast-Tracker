import { useEffect, useRef, useState } from 'react';

const FRAME = 220;
const OUTPUT = 480;

export default function CropModal({ file, onCancel, onConfirm }: { file: File | null; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!file) { setSrc(null); return; }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !src) return null;

  const scale = natural ? Math.max(FRAME / natural.w, FRAME / natural.h) * zoom : 1;
  const dispW = natural ? natural.w * scale : FRAME;
  const dispH = natural ? natural.h * scale : FRAME;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(FRAME - dispW, o.x)),
    y: Math.min(0, Math.max(FRAME - dispH, o.y)),
  });

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.naturalWidth, h = el.naturalHeight;
    setNatural({ w, h });
    const s = Math.max(FRAME / w, FRAME / h);
    setOffset({ x: (FRAME - w * s) / 2, y: (FRAME - h * s) / 2 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onZoom = (v: number) => {
    setZoom(v);
    if (natural) {
      const s = Math.max(FRAME / natural.w, FRAME / natural.h) * v;
      const w = natural.w * s, h = natural.h * s;
      setOffset((o) => ({ x: Math.min(0, Math.max(FRAME - w, o.x)), y: Math.min(0, Math.max(FRAME - h, o.y)) }));
    }
  };

  const confirm = () => {
    if (!natural) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) return;
    const sx = -offset.x / scale, sy = -offset.y / scale;
    const sSize = FRAME / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    try {
      onConfirm(canvas.toDataURL('image/jpeg', 0.88));
    } catch {
      onCancel();
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--sheet)', borderRadius: 20, padding: 20, width: 280, maxWidth: '88vw', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>Adjust photo</div>
        <div
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ position: 'relative', width: FRAME, height: FRAME, margin: '0 auto 16px', borderRadius: 26, overflow: 'hidden', background: '#000', cursor: 'grab', touchAction: 'none' }}
        >
          <img ref={imgRef} src={src} onLoad={onImgLoad} draggable={false} alt="" style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }} />
        </div>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} style={{ width: '100%', marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onCancel} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>Cancel</button>
          <button onClick={confirm} className="ct-btn-primary" style={{ flex: 1, height: 44 }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
