// utils.js
import { THREE } from './deps.js';

export function makeVariedStandardMaterial(baseColorHex) {
  const c = new THREE.Color(baseColorHex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.l += (Math.random() - 0.5) * 0.10; // ±5% Luminanz
  hsl.l = THREE.MathUtils.clamp(hsl.l, 0, 1);
  const varied = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
  return new THREE.MeshStandardMaterial({
    color: varied,
    roughness: THREE.MathUtils.clamp(0.6 + (Math.random() - 0.5) * 0.2, 0, 1),
    metalness: 0.0
  });
}

export function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

