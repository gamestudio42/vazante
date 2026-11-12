import * as THREE from 'three';
import { PRESENTATION, type MapInfo } from '@vazante/shared';
import { FACADE_COLOR, GROUND_COLOR, SURFACE_NOISE } from './surface-shaders.ts';

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

/** Shared quality controls for all procedural surfaces. */
function surfaceUniforms() {
  return {
    uSurfaceStart: { value: PRESENTATION.surface.detailFadeStartM },
    uSurfaceEnd: { value: PRESENTATION.surface.detailFadeEndM },
    uGrain: { value: PRESENTATION.surface.grainStrength },
  };
}

const SURFACE_UNIFORMS = /* glsl */ `
  uniform float uSurfaceStart;
  uniform float uSurfaceEnd;
  uniform float uGrain;
`;

export function buildingMaterial(): THREE.MeshToonMaterial {
  const m = toon();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms(), {
      uNight: cityUniforms.uNight,
      uDetailStart: { value: PRESENTATION.facade.detailFadeStart },
      uDetailEnd: { value: PRESENTATION.facade.detailFadeEnd },
      uFloorHeight: { value: PRESENTATION.architecture.floorHeight },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFacade;
        varying vec3 vFacadePos;
        varying vec3 vBuildingSize;
        varying vec3 vWorldNormal;
        varying vec4 vFacadeInfo;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        mat3 nm = mat3(modelMatrix);
        vBuildingSize = vec3(1.0);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
          vBuildingSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vFacadePos = position * vBuildingSize;
        vFacadeInfo = aFacade;
        vWorldNormal = normalize(nm * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFacadePos;
        varying vec3 vBuildingSize;
        varying vec3 vWorldNormal;
        varying vec4 vFacadeInfo;
        uniform float uNight;
        uniform float uDetailStart;
        uniform float uDetailEnd;
        uniform float uFloorHeight;
        ${SURFACE_UNIFORMS}
        ${SURFACE_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${FACADE_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * litWindow * uNight * 0.55;`);
  };
  return m;
}

/** Preserve the map's road paint and baked contact shade; add only close-range surface detail. */
export function groundMaterial(map: MapInfo, texture: THREE.DataTexture): THREE.MeshToonMaterial {
  const kind = new THREE.DataTexture(new Uint8Array(map.ground), map.width, map.height, THREE.RedFormat);
  kind.magFilter = kind.minFilter = THREE.NearestFilter;
  kind.unpackAlignment = 1;
  kind.needsUpdate = true;
  const m = toon({ map: texture });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms(), {
      uGroundKind: { value: kind },
      uGroundSize: { value: new THREE.Vector2(map.width * map.cellSize, map.height * map.cellSize) },
      uPavementTile: { value: PRESENTATION.surface.pavementTileM },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfaceWorld;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSurfaceWorld;
        uniform sampler2D uGroundKind;
        uniform vec2 uGroundSize;
        uniform float uPavementTile;
        ${SURFACE_UNIFORMS}
        ${SURFACE_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${GROUND_COLOR}`);
  };
  m.addEventListener('dispose', () => kind.dispose());
  return m;
}
