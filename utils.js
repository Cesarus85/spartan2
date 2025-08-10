// utils.js
import { THREE } from './deps.js';

export function makeVariedStandardMaterial(baseColorHex, options = {}) {
  const {
    roughnessRange = 0.3,
    metalnessRange = 0.1,
    luminanceRange = 0.15,
    emissiveChance = 0.0,
    emissiveColor = 0x444444,
    normalScale = 0.0
  } = options;

  const c = new THREE.Color(baseColorHex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  
  // Mehr dramatische Luminanz-Variation
  hsl.l += (Math.random() - 0.5) * luminanceRange;
  hsl.l = THREE.MathUtils.clamp(hsl.l, 0.1, 0.9);
  
  // Leichte Hue-Shift für mehr Lebendigkeit
  hsl.h += (Math.random() - 0.5) * 0.05;
  hsl.h = (hsl.h + 1) % 1;
  
  const varied = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
  
  const material = new THREE.MeshStandardMaterial({
    color: varied,
    roughness: THREE.MathUtils.clamp(0.6 + (Math.random() - 0.5) * roughnessRange, 0.1, 1),
    metalness: THREE.MathUtils.clamp(0.1 + (Math.random() - 0.5) * metalnessRange, 0, 0.3)
  });

  // Gelegentlich emissive Highlights
  if (Math.random() < emissiveChance) {
    material.emissive = new THREE.Color(emissiveColor);
    material.emissiveIntensity = Math.random() * 0.3;
  }

  return material;
}

export function makeMetallicMaterial(baseColorHex, options = {}) {
  const {
    metalnessMin = 0.7,
    metalnessMax = 1.0,
    roughnessMin = 0.1,
    roughnessMax = 0.4
  } = options;

  const c = new THREE.Color(baseColorHex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.l += (Math.random() - 0.5) * 0.1;
  hsl.l = THREE.MathUtils.clamp(hsl.l, 0.2, 0.8);
  
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l),
    metalness: randBetween(metalnessMin, metalnessMax),
    roughness: randBetween(roughnessMin, roughnessMax)
  });
}

export function makeEmissiveMaterial(baseColorHex, intensity = 0.5) {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(baseColorHex),
    emissiveIntensity: intensity
  });
}

export function createDetailedGeometry(type, params = {}) {
  switch (type) {
    case 'crate':
      return createCrateGeometry(params);
    case 'pillar':
      return createPillarGeometry(params);
    case 'platform':
      return createPlatformGeometry(params);
    case 'barrier':
      return createBarrierGeometry(params);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createCrateGeometry({ width = 1, height = 1, depth = 1, segments = 1 } = {}) {
  const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  
  // Leichte Verzerrung für organischeren Look
  const vertices = geo.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i]     += (Math.random() - 0.5) * 0.02 * width;
    vertices[i + 1] += (Math.random() - 0.5) * 0.02 * height;
    vertices[i + 2] += (Math.random() - 0.5) * 0.02 * depth;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  
  return geo;
}

function createPillarGeometry({ radius = 0.5, height = 3, segments = 8 } = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius * 0.8, height, segments);
  
  // Füge Details hinzu
  const vertices = geo.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    const y = vertices[i + 1];
    if (Math.abs(y) < height * 0.4) { // Mittlerer Bereich
      const factor = 1.1; // Leichte Ausbuchtung
      vertices[i] *= factor;
      vertices[i + 2] *= factor;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  
  return geo;
}

function createPlatformGeometry({ width = 2, height = 0.2, depth = 2 } = {}) {
  const geo = new THREE.BoxGeometry(width, height, depth, 4, 1, 4);
  
  // Wellige Oberfläche
  const vertices = geo.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i + 1] > 0) { // Nur obere Fläche
      vertices[i + 1] += Math.sin(vertices[i] * 3) * Math.sin(vertices[i + 2] * 3) * 0.02;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  
  return geo;
}

function createBarrierGeometry({ width = 2, height = 1.5, depth = 0.3 } = {}) {
  const geo = new THREE.BoxGeometry(width, height, depth, 4, 6, 1);
  
  // Schadenssimulation - zufällige Einschläge
  const vertices = geo.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    if (Math.random() < 0.1) { // 10% Chance für "Schaden"
      const factor = 0.95 + Math.random() * 0.05;
      vertices[i] *= factor;
      vertices[i + 1] *= factor;
      vertices[i + 2] *= factor;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  
  return geo;
}

export function createComplexGround(width, depth, heightVariation = 0.5) {
  const segments = Math.max(20, Math.floor(width / 2));
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);
  
  const vertices = geo.attributes.position.array;
  
  // Perlin-noise-ähnliche Höhenvariation
  for (let i = 2; i < vertices.length; i += 3) {
    const x = vertices[i - 2];
    const z = vertices[i - 1];
    
    // Mehrere Noise-Oktaven für natürlicheren Look
    let height = 0;
    height += Math.sin(x * 0.1) * Math.cos(z * 0.1) * heightVariation * 0.5;
    height += Math.sin(x * 0.3) * Math.cos(z * 0.25) * heightVariation * 0.3;
    height += Math.sin(x * 0.8) * Math.cos(z * 0.6) * heightVariation * 0.2;
    height += (Math.random() - 0.5) * heightVariation * 0.1;
    
    vertices[i] = height;
  }
  
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  
  return geo;
}

export function addVertexColors(geometry, colorFunc) {
  const vertices = geometry.attributes.position.array;
  const colors = new Float32Array(vertices.length);
  
  for (let i = 0; i < vertices.length; i += 3) {
    const pos = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
    const color = colorFunc(pos);
    colors[i]     = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export function randChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function createParticleSystem(count = 100, color = 0xffffff) {
  const vertices = [];
  const colors = [];
  
  for (let i = 0; i < count; i++) {
    vertices.push(
      (Math.random() - 0.5) * 100,
      Math.random() * 50,
      (Math.random() - 0.5) * 100
    );
    
    const c = new THREE.Color(color);
    c.multiplyScalar(0.5 + Math.random() * 0.5);
    colors.push(c.r, c.g, c.b);
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const material = new THREE.PointsMaterial({
    size: 0.1,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    fog: false
  });
  
  return new THREE.Points(geometry, material);
}