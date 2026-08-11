import { useEffect, useRef, useState } from 'react';
import type { PhotoCrop } from '../types';

const FRAME = 220;
/** Uploads are stored at this longest edge — big enough to re-crop later, small enough for localStorage. */
const UPLOAD_MAX = 800;

/**
 * A remote image already loaded without CORS sits in the HTTP cache as an opaque response, and the
 * browser will reuse it for a crossOrigin request — which then taints the canvas. A cache-busting
 * param forces a fresh, CORS-flavoured fetch. Only needed when we have to read pixels (uploads).
 */
function corsUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'cors=1';
}

/**
 * Reframe a photo, or crop a freshly picked file.
 *
 * Framing is returned as parameters rather than baked into a new bitmap, so the source image is
 * never destroyed: zoom back to 1 and you have the original framing again, and reopening resumes
 * from where you left off. Uploads additionally return a downscaled copy of the *whole* image to
 * store as the source — cropping it here would throw away the pixels needed to re-crop later.
 */
export default function CropModal({
  file,
  src: srcProp,
  initial,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  src?: string | null;
  initial?: PhotoCrop | null;
  onCancel: () => void;
  onConfirm: (result: { dataUrl?: string; crop: PhotoCrop }) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNatural(null);
    setFailed(false);
    // Resume the stored framing; size is a percentage where 100 = zoom 1.
    setZoom(initial ? Math.min(3, Math.max(1, initial.size / 100)) : 1);
    if (file) {
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setSrc(srcProp ? corsUrl(srcProp) : null);
  }, [file, srcProp, initial]);

  if ((!file && !srcProp) || !src) return null;

  // Render maths mirror cropStyle(): width is `size%` of the frame, height follows aspect.
  const dispW = FRAME * zoom;
  const dispH = natural ? dispW * (natural.h / natural.w) : FRAME;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(FRAME - dispW, o.x)),
    y: Math.min(0, Math.max(FRAME - dispH, o.y)),
  });

  /** background-position percentage <-> pixel offset, per the CSS definition. */
  const pctToPx = (pct: number, disp: number) => (disp <= FRAME ? (FRAME - disp) / 2 : ((FRAME - disp) * pct) / 100);
  const pxToPct = (px: number, disp: number) => (disp <= FRAME ? 50 : (px / (FRAME - disp)) * 100);

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.naturalWidth, h = el.naturalHeight;
    setNatural({ w, h });
    const dw = FRAME * zoom;
    const dh = dw * (h / w);
    setOffset({
      x: pctToPx(initial ? initial.x : 50, dw),
      y: pctToPx(initial ? initial.y : 50, dh),
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset(clamp({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onZoom = (v: number) => {
    setZoom(v);
    if (!natural) return;
    const dw = FRAME * v;
    const dh = dw * (natural.h / natural.w);
    setOffset((o) => ({ x: Math.min(0, Math.max(FRAME - dw, o.x)), y: Math.min(0, Math.max(FRAME - dh, o.y)) }));
  };

  const confirm = () => {
    if (!natural) return;
    const crop: PhotoCrop = {
      size: Math.round(zoom * 1000) / 10,
      x: Math.round(pxToPct(offset.x, dispW) * 10) / 10,
      y: Math.round(pxToPct(offset.y, dispH) * 10) / 10,
    };

    // Existing photo: framing only, source untouched.
    if (!file) return onConfirm({ crop });

    // Upload: store the whole image downscaled, never a crop of it, so it stays re-croppable.
    try {
      const { w, h } = natural;
      const s = Math.min(1, UPLOAD_MAX / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * s);
      canvas.height = Math.round(h * s);
      const ctx = canvas.getContext('2d');
      if (!ctx || !imgRef.current) return;
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
      onConfirm({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), crop });
    } catch {
      setFailed(true);
    }
  };

  return (
    // Callers render this inside a scrim whose onClick closes the parent sheet, and this modal is
    // a sibling of the sheet rather than a child — so without stopping propagation here, releasing
    // the zoom slider or finishing a drag bubbles a click up and closes everything mid-crop.
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: 'var(--sheet)', borderRadius: 20, padding: 20, width: 280, maxWidth: '88vw', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, textAlign: 'center' }}>{file ? 'Adjust photo' : 'Reframe photo'}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, textAlign: 'center' }}>Drag to move &middot; slider to zoom</div>
        <div
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ position: 'relative', width: FRAME, height: FRAME, margin: '0 auto 16px', borderRadius: 26, overflow: 'hidden', background: '#000', cursor: 'grab', touchAction: 'none' }}
        >
          <img
            ref={imgRef}
            src={src}
            crossOrigin="anonymous"
            onLoad={onImgLoad}
            onError={() => setFailed(true)}
            draggable={false}
            alt=""
            style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: failed ? 10 : 18 }}>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} style={{ flex: 1 }} />
          <button
            onClick={() => onZoom(1)}
            disabled={zoom === 1}
            style={{ flex: 'none', border: 'none', background: 'none', padding: 0, fontSize: 11, fontWeight: 600, color: zoom === 1 ? 'var(--text-faint)' : 'var(--accent-soft)', cursor: zoom === 1 ? 'default' : 'pointer' }}
          >
            Original
          </button>
        </div>

        {failed && (
          <div style={{ fontSize: 11.5, color: '#C24B4B', lineHeight: 1.45, marginBottom: 12, textAlign: 'center' }}>
            This image can&rsquo;t be reframed here. Upload your own copy instead.
          </div>
        )}
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onCancel} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>Cancel</button>
          <button onClick={confirm} disabled={failed || !natural} className="ct-btn-primary" style={{ flex: 1, height: 44 }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
