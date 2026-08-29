import { useEffect, useRef, useState } from 'react';
import type { PhotoCrop } from '../types';
import { useDismissible } from './Sheet';

const FRAME = 220;
/**
 * The frame is square unless a caller says otherwise.
 *
 * A crop is stored as `size%` of the container width plus a background-position, so the same
 * numbers frame differently in containers of different shapes. That was invisible while the only
 * caller was the character photo — cropper, card and thumbnail are all square — and stopped being
 * invisible the moment show posters wanted framing, because a show tile is 4:5. Cropping a poster
 * in a square window and rendering it in a tall one is a promise the preview cannot keep.
 *
 * Width is fixed and height follows, so `aspect: 1` reproduces the old 220x220 frame exactly and
 * nothing about the character path changes.
 */
const DEFAULT_ASPECT = 1;
/** Uploads are stored at this longest edge — big enough to re-crop later, small enough for localStorage. */
const UPLOAD_MAX = 800;
/**
 * Largest file we'll hand to the decoder.
 *
 * The output is capped at UPLOAD_MAX and re-encoded, but that happens *after* the browser has
 * decoded the original into a bitmap: a 50-megapixel phone photo is roughly 200MB in memory at
 * 4 bytes a pixel, which is enough to take the tab down on a mid-range Android before any crop
 * runs. 20MB comfortably clears a 48MP JPEG while ruling out RAW-sized files and the pathological
 * cases. The message tells the user what to do about it, since resizing before upload works.
 */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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
interface CropModalProps {
  file: File | null;
  src?: string | null;
  initial?: PhotoCrop | null;
  /** Width / height of the frame, matching wherever the result will be shown. Defaults to square. */
  aspect?: number;
  onCancel: () => void;
  onConfirm: (result: { dataUrl?: string; crop: PhotoCrop }) => void;
}

/**
 * Callers render this unconditionally and it decides for itself whether there's anything to crop.
 * The gate is split out so the body only mounts when there is: useDismissible reads being mounted
 * as being open, and a permanently-mounted instance would sit at the top of the dismissal stack
 * and swallow every Escape in the app.
 */
export default function CropModal(props: CropModalProps) {
  if (!props.file && !props.src) return null;
  return <CropModalBody {...props} />;
}

function CropModalBody({ file, src: srcProp, initial, aspect = DEFAULT_ASPECT, onCancel, onConfirm }: CropModalProps) {
  const FRAME_W = FRAME;
  const FRAME_H = Math.round(FRAME / aspect);
  // Escape cancels. No backdrop dismissal on purpose -- a stray tap outside would throw away a
  // crop in progress, and unlike a sheet there is no cheap way back to where you were.
  useDismissible(onCancel);
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** Live pointers by id — two down means a pinch, one means a pan. */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  // Pointer handlers fire faster than React re-renders; reading offset from a ref keeps a pinch
  // from snapping back to a stale position mid-gesture.
  const offsetRef = useRef(offset);

  useEffect(() => {
    setNatural(null);
    setFailed(false);
    // Resume the stored framing; size is a percentage where 100 = zoom 1.
    setZoom(initial ? Math.min(3, Math.max(1, initial.size / 100)) : 1);
    if (file) {
      // Checked before createObjectURL, so an oversized file is never decoded at all.
      if (file.size > MAX_UPLOAD_BYTES) {
        setTooLarge(true);
        setFailed(true);
        setSrc(null);
        return;
      }
      setTooLarge(false);
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setTooLarge(false);
    setSrc(srcProp ? corsUrl(srcProp) : null);
  }, [file, srcProp, initial]);

  useEffect(() => { offsetRef.current = offset; }, [offset]);

  if (!src && !tooLarge) return null;

  // Render maths mirror cropStyle(): width is `size%` of the frame, height follows aspect.
  const dispW = FRAME_W * zoom;
  const dispH = natural ? dispW * (natural.h / natural.w) : FRAME_H;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(FRAME_W - dispW, o.x)),
    y: Math.min(0, Math.max(FRAME_H - dispH, o.y)),
  });

  /**
   * background-position percentage <-> pixel offset, per the CSS definition.
   *
   * `frame` is the container's extent along the axis being converted. It used to be the single
   * FRAME constant, which was correct only while the frame was square.
   */
  const pctToPx = (pct: number, disp: number, frame: number) => (disp <= frame ? (frame - disp) / 2 : ((frame - disp) * pct) / 100);
  const pxToPct = (px: number, disp: number, frame: number) => (disp <= frame ? 50 : (px / (frame - disp)) * 100);

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.naturalWidth, h = el.naturalHeight;
    setNatural({ w, h });
    const dw = FRAME_W * zoom;
    const dh = dw * (h / w);
    setOffset({
      x: pctToPx(initial ? initial.x : 50, dw, FRAME_W),
      y: pctToPx(initial ? initial.y : 50, dh, FRAME_H),
    });
  };

  /**
   * Zoom about a fixed point so the image grows from where the fingers are rather than the
   * corner. The slider anchors at the frame centre; a pinch anchors at the midpoint between the
   * two touches, which is what makes it feel attached to your fingers.
   */
  const applyZoom = (next: number, anchor: { x: number; y: number }) => {
    const z0 = zoom;
    const z1 = Math.min(3, Math.max(1, next));
    setZoom(z1);
    if (!natural) return;
    const k = z1 / z0;
    const dw = FRAME_W * z1;
    const dh = dw * (natural.h / natural.w);
    const o = offsetRef.current;
    setOffset({
      x: Math.min(0, Math.max(FRAME_W - dw, anchor.x - (anchor.x - o.x) * k)),
      y: Math.min(0, Math.max(FRAME_H - dh, anchor.y - (anchor.y - o.y) * k)),
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Capture keeps a drag alive when the finger leaves the frame, but it throws if the pointer
    // isn't active — and an exception here would abort the gesture before it's even recorded.
    try { frameRef.current?.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    if (pts.length === 2) {
      // Second finger down: start a pinch and stop panning, or the image fights itself.
      pinchRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom };
      dragRef.current = null;
    } else if (pts.length === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offsetRef.current.x, origY: offsetRef.current.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = [...pointersRef.current.values()];
    if (pts.length >= 2 && pinchRef.current && pinchRef.current.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = frameRef.current?.getBoundingClientRect();
      const mid = {
        x: (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0),
        y: (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0),
      };
      // Scale from the gesture's start, not the last frame — incremental ratios accumulate drift.
      applyZoom(pinchRef.current.zoom * (dist / pinchRef.current.dist), mid);
      return;
    }

    if (!dragRef.current) return;
    setOffset(clamp({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    const rest = [...pointersRef.current.entries()];
    if (rest.length < 2) pinchRef.current = null;
    // Lifting one finger of a pinch hands control back to the other without a jump.
    dragRef.current = rest.length === 1
      ? { startX: rest[0][1].x, startY: rest[0][1].y, origX: offsetRef.current.x, origY: offsetRef.current.y }
      : null;
  };

  const onZoom = (v: number) => applyZoom(v, { x: FRAME_W / 2, y: FRAME_H / 2 });

  const confirm = () => {
    if (!natural) return;
    const crop: PhotoCrop = {
      size: Math.round(zoom * 1000) / 10,
      x: Math.round(pxToPct(offset.x, dispW, FRAME_W) * 10) / 10,
      y: Math.round(pxToPct(offset.y, dispH, FRAME_H) * 10) / 10,
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
        {!tooLarge && (
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 14, textAlign: 'center' }}>Drag to move &middot; pinch or use the slider to zoom</div>
        )}
        {src && (
        <div
          ref={frameRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}
          style={{ position: 'relative', width: FRAME_W, height: FRAME_H, margin: '0 auto 16px', borderRadius: 26, overflow: 'hidden', background: '#000', cursor: 'grab', touchAction: 'none' }}
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
        )}

        {src && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: failed ? 10 : 18 }}>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} style={{ flex: 1 }} />
          <button
            onClick={() => onZoom(1)}
            disabled={zoom === 1}
            style={{ flex: 'none', border: 'none', background: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: zoom === 1 ? 'var(--text-faint)' : 'var(--accent-soft)', cursor: zoom === 1 ? 'default' : 'pointer' }}
          >
            Original
          </button>
        </div>
        )}

        {failed && (
          <div style={{ fontSize: 13.5, color: 'var(--danger)', lineHeight: 1.45, marginBottom: 12, textAlign: 'center' }}>
            {tooLarge
              ? `That photo is ${Math.round((file?.size ?? 0) / 1024 / 1024)}MB, which is too large to open here. Resize it below 20MB and try again.`
              : 'This image can\u2019t be reframed here. Upload your own copy instead.'}
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
