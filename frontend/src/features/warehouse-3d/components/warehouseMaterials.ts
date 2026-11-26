import * as THREE from 'three';
import type { ZoneKind } from '../data/contracts';

/**
 * WARETRACE 3D Palette — communicates real data and zone state, never decorative noise.
 */
export const WARETRACE_COLORS = {
  background: '#091321',
  slate: '#142439',
  concreteBase: '#283445',
  steelFrame: '#4B5E75',
  steelDark: '#233347',
  wallPanel: '#162538',
  woodPallet: '#A68259',
  cardboardLight: '#C59A6C',
  cardboardMid: '#B18558',
  cardboardDark: '#9A7047',
  receiving: '#35D6F2',
  storage: '#5EA88A',
  quarantine: '#FFB547',
  selected: '#407BFF',
  auditAffected: '#FFB547',
  hover: '#35D6F2',
  inaccessible: '#EF4444',
  aisleLine: '#CBD5E1',
  cautionDark: '#16202F',
} as const;

export const ZONE_STYLE: Record<
  ZoneKind,
  { accent: string; padFill: string; label: string; shortTag: string }
> = {
  RECEIVING: {
    accent: WARETRACE_COLORS.receiving,
    padFill: '#123147',
    label: 'Receiving',
    shortTag: 'RECEIVING',
  },
  STORAGE: {
    accent: WARETRACE_COLORS.storage,
    padFill: '#1A2D36',
    label: 'Storage',
    shortTag: 'STORAGE',
  },
  QUARANTINE: {
    accent: WARETRACE_COLORS.quarantine,
    padFill: '#33281A',
    label: 'Quarantine',
    shortTag: 'QUARANTINE',
  },
};

let cachedSoftwareGl: boolean | null = null;

/**
 * Detect software WebGL renderers (SwiftShader, llvmpipe, WARP) from the WebGL renderer string.
 * Used strictly for rendering cost tuning (pixel ratio, shadows, damping) — never changes scene content.
 */
export function isSoftwareWebGL(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  if (typeof document === 'undefined') {
    cachedSoftwareGl = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    cachedSoftwareGl = false;
  }
  return cachedSoftwareGl;
}

/**
 * Deterministic seeded PRNG (Mulberry32) so parcel placement and procedural noise never flicker.
 */
export function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Procedural sealed concrete floor albedo + bump map with subtle troweled grain and slab expansion joints.
 */
export function createConcreteFloorTextures(maxAnisotropy = 4): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  ctx.fillStyle = '#2A3647';
  ctx.fillRect(0, 0, size, size);

  const rand = createSeededRandom('waretrace-concrete-slab');

  // Subtle aggregate mottling
  for (let i = 0; i < 2400; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 14;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(180, 198, 220, 0.032)' : 'rgba(12, 20, 32, 0.045)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Control joint seams (2x2 slab grid per tile)
  ctx.strokeStyle = 'rgba(10, 18, 30, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  // Subtle highlight bevel along control joints
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size / 2 + 2, 0);
  ctx.lineTo(size / 2 + 2, size);
  ctx.moveTo(0, size / 2 + 2);
  ctx.lineTo(size, size / 2 + 2);
  ctx.stroke();

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 5;
    const shade = Math.floor(110 + rand() * 36);
    bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bCtx.fillRect(x, y, r, r);
  }
  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 3;
  bCtx.strokeRect(1.5, 1.5, size - 3, size - 3);
  bCtx.beginPath();
  bCtx.moveTo(size / 2, 0);
  bCtx.lineTo(size / 2, size);
  bCtx.moveTo(0, size / 2);
  bCtx.lineTo(size, size / 2);
  bCtx.stroke();

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(9, 6);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(9, 6);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Procedural corrugated cardboard box texture with packing tape and shipping label.
 */
export function createCardboardTexture(
  baseColor: string,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Subtle fiber ribbing
  ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 2);
  }

  // Border shadow crease
  ctx.strokeStyle = 'rgba(55, 34, 16, 0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  // Center reinforced packing tape
  ctx.fillStyle = 'rgba(232, 211, 178, 0.55)';
  ctx.fillRect(0, size / 2 - 14, size, 28);
  ctx.fillStyle = 'rgba(92, 62, 34, 0.28)';
  ctx.fillRect(0, size / 2 - 1, size, 2);

  // Crisp white shipping label patch with barcode bars
  const lx = size - 96;
  const ly = 26;
  ctx.fillStyle = '#EAECEF';
  ctx.fillRect(lx, ly, 72, 46);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(lx + 6, ly + 6, 44, 5);
  for (let bx = 0; bx < 56; bx += 4) {
    const w = (bx * 7) % 3 === 0 ? 2 : 1;
    ctx.fillRect(lx + 6 + bx, ly + 17, w, 20);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Procedural diagonal yellow/dark industrial caution stripe texture for Quarantine borders.
 */
export function createCautionStripeTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = WARETRACE_COLORS.quarantine;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = WARETRACE_COLORS.cautionDark;
  const stripeW = 32;
  for (let i = -size; i < size * 2; i += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + stripeW, 0);
    ctx.lineTo(i + stripeW - size, size);
    ctx.lineTo(i - size, size);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Crisp industrial signage plaque texture for zones and dock headers.
 */
export function createSignTexture(
  primaryText: string,
  secondaryText: string,
  accentHex: string,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const width = 512;
  const height = 144;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Dark anodized aluminum placard backing
  ctx.fillStyle = '#0B1626';
  ctx.fillRect(0, 0, width, height);

  // Clean outer border
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  // Top accent strip
  ctx.fillStyle = accentHex;
  ctx.fillRect(10, 10, width - 20, 12);

  // Primary code/title (padded safely inside placard frame)
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(primaryText, width / 2, 68, width - 48);

  // Secondary subtitle
  ctx.fillStyle = accentHex;
  ctx.font = '600 20px "IBM Plex Mono", monospace';
  ctx.fillText(secondaryText, width / 2, 112, width - 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Compact bin beam label plate texture (e.g., "A-01", "RCV-01", "QA-01").
 */
export function createBinPlateTexture(
  code: string,
  accentHex: string,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const width = 256;
  const height = 80;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0D1B2E';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, width - 6, height - 6);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 42px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}
