import * as THREE from 'three';
import { PRESENTATION } from '@vazante/shared';

let gradient: THREE.DataTexture | null = null;

/** Three-band toon ramp shared by every lit material. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

/**
 * Toon material for buildings that paints floors, windows and a roof parapet procedurally
 * from world position, so instanced boxes read as buildings without textures.
 */
/** Shared by every building: 0 by day, 1 at night (lit windows). */
export const cityUniforms = { uNight: { value: 0 } };

export function buildingMaterial(): THREE.MeshToonMaterial {
  const m = toon();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = cityUniforms.uNight;
    shader.uniforms.uDetailStart = { value: PRESENTATION.facade.detailFadeStart };
    shader.uniforms.uDetailEnd = { value: PRESENTATION.facade.detailFadeEnd };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWorldPos = wp.xyz;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
        #endif
        vWorldNormal = normalize(nm * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform float uNight;\nuniform float uDetailStart;\nuniform float uDetailEnd;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * litWindow * uNight * 0.55;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float litWindow = 0.0;
        vec3 n = normalize(vWorldNormal);
        // Fade subpixel patterning by projected footprint in either camera. The building
        // keeps its average facade tone instead of flashing between solid wall and window.
        vec3 footprint = fwidth(vWorldPos);
        float alongFootprint = abs(n.x) > 0.5 ? footprint.z : footprint.x;
        float detail = 1.0 - smoothstep(uDetailStart, uDetailEnd, max(alongFootprint / 2.6, footprint.y / 3.0));
        if (n.y > 0.5) {
          // Roof: darker with a light parapet line every few metres for texture.
          diffuseColor.rgb *= 0.62;
          float g = step(0.92, fract(vWorldPos.x * 0.25)) + step(0.92, fract(vWorldPos.z * 0.25));
          float roofDetail = 1.0 - smoothstep(uDetailStart, uDetailEnd, max(footprint.x, footprint.z) * 0.25);
          diffuseColor.rgb *= 1.0 - 0.08 * mix(0.16, clamp(g, 0.0, 1.0), roofDetail);
        } else {
          float along = abs(n.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
          float floorY = fract(vWorldPos.y / 3.0);
          float col = fract(along / 2.6);
          float window = step(0.35, floorY) * step(floorY, 0.8) * step(0.25, col) * step(col, 0.75);
          float windowCoverage = mix(0.225, window, detail);
          // Ground floor: shop fronts, no windows above 0.5 m slab line.
          float ground = 1.0 - step(3.0, vWorldPos.y);
          float slab = mix(0.06, step(0.94, floorY), detail);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.15, 0.19), windowCoverage * (1.0 - ground) * 0.85);
          // A few windows stay lit at night: survivors, or lights nobody switched off.
          float across = abs(n.x) > 0.5 ? vWorldPos.x : vWorldPos.z;
          vec3 cellId = vec3(floor(along / 2.6), floor(vWorldPos.y / 3.0), floor(across * 0.5));
          float rnd = fract(sin(dot(cellId, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          litWindow = window * (1.0 - ground) * step(0.86, rnd) * detail;
          float storefront = mix(0.51, step(0.3, col) * step(col, 0.9) * step(0.15, floorY), detail);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.16), ground * storefront * 0.7);
          diffuseColor.rgb *= 1.0 - slab * 0.18;
        }`,
      );
  };
  return m;
}
