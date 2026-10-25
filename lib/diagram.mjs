// SVG allowlist and inlining for the request-paths site.
// Vendored from cholateio/repobox web/lib/diagram.mjs at commit 60e57ed (MIT License,
// Copyright (c) 2026 cholateio; see LICENSE). Only ELEMENTS, ATTRS, the paint grammars,
// elementAllowed, attrAllowed, checkSvgDoc and prepareSvg are kept; the animation,
// node-focus and lightbox parts are not used here.
// Coupled with repobox action/scripts/validate.py: ELEMENTS, ATTRS and paint grammars must match.

export const ELEMENTS = new Set(['svg', 'title', 'desc', 'defs', 'symbol', 'g', 'rect', 'path', 'line', 'polyline',
  'polygon', 'circle', 'ellipse', 'text', 'tspan', 'use', 'marker']);
export const ATTRS = new Set(['aria-hidden', 'aria-labelledby', 'class', 'cx', 'cy', 'd', 'data-edge', 'fill',
  'fill-opacity', 'font-family', 'font-size', 'font-weight', 'height', 'href', 'id', 'letter-spacing', 'marker-end',
  'marker-start', 'markerHeight', 'markerWidth', 'orient', 'points', 'r', 'refX', 'refY', 'role', 'rx', 'ry', 'stroke',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-width', 'text-anchor', 'transform',
  'viewBox', 'width', 'x', 'x1', 'x2', 'y', 'y1', 'y2', 'dominant-baseline', 'opacity', 'xmlns', 'version']);
const URL_REF = String.raw`url\(#[A-Za-z0-9_-]+\)`;
const PAINT = new RegExp(String.raw`^(none|transparent|currentColor|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|${URL_REF})$`);
const MARKER = new RegExp(`^${URL_REF}$`);
const STRICT = { fill: PAINT, stroke: PAINT, 'marker-start': MARKER, 'marker-end': MARKER };
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function elementAllowed(name) { return ELEMENTS.has(name); }

export function attrAllowed(name, value) {
  const low = value.trim().toLowerCase();
  if (name.startsWith('on') || name === 'style' || !ATTRS.has(name)) return false;
  if (value.includes('\\') || CONTROL.test(value)) return false;
  if (name === 'href') return value.startsWith('#');
  if (STRICT[name]) return STRICT[name].test(value.trim());
  if (low.includes('url(') || low.includes('javascript:') || low.includes('data:')) return false;
  return true;
}

export function checkSvgDoc(root) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!elementAllowed(el.localName)) return false;
    for (const a of el.attributes) {
      if (a.name.startsWith('xmlns')) continue;
      if (!attrAllowed(a.localName, a.value)) return false;
    }
  }
  return true;
}

// Returns null when the SVG fails the allowlist; callers then show rejectedNotice and must not
// expose the bytes through any URL.
export function prepareSvg(text, prefix, doc = document) {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror') || !checkSvgDoc(root)) return null;
  const ids = new Map();
  for (const el of root.querySelectorAll('[id]')) { const n = `${prefix}-${el.id}`; ids.set(el.id, n); el.id = n; }
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (a.localName === 'href' || a.value.includes('url(#')) {
        a.value = a.value.replace(/#([\w-]+)/g, (m, id) => (ids.has(id) ? `#${ids.get(id)}` : m));
      } else if (a.localName === 'aria-labelledby') {
        a.value = a.value.split(/\s+/).map((id) => ids.get(id) || id).join(' ');
      }
    }
  }
  // <use> clones ignore page CSS, so icon and arrowhead ink follows currentColor instead.
  for (const el of root.querySelectorAll('symbol, symbol *, marker, marker *')) {
    for (const a of ['stroke', 'fill']) if ((el.getAttribute(a) || '').toLowerCase() === '#1a1a1a') el.setAttribute(a, 'currentColor');
  }
  const vb = (root.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const first = root.querySelector(':scope > rect');
  if (first && Number(first.getAttribute('width')) >= vb[2] - 1) first.classList.add('canvas');
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.classList.add('dia');
  return doc.importNode(root, true);
}
