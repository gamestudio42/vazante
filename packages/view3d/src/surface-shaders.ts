/** Original, static material patterns. Derivative filtering keeps distant pixels quiet. */
export const SURFACE_NOISE = /* glsl */ `
  float surfaceHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float surfaceNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(surfaceHash(cell), surfaceHash(cell + vec2(1, 0)), f.x),
               mix(surfaceHash(cell + vec2(0, 1)), surfaceHash(cell + vec2(1, 1)), f.x), f.y);
  }
  float panel(vec2 p, vec2 low, vec2 high) {
    return step(low.x, p.x) * step(p.x, high.x) * step(low.y, p.y) * step(p.y, high.y);
  }
`;

export const FACADE_COLOR = /* glsl */ `
  float litWindow = 0.0;
  vec3 n = normalize(vWorldNormal);
  vec3 footprint = fwidth(vFacadePos);
  float family = vFacadeInfo.x;
  float seed = vFacadeInfo.y;
  float wear = vFacadeInfo.z;
  bool residential = family < 0.5;
  bool commercial = family >= 0.5 && family < 1.5;
  bool industrial = family >= 1.5 && family < 2.5;
  float period = residential ? 2.8 : commercial ? 3.4 : industrial ? 5.2 : 3.8;
  float along = abs(n.x) > 0.5 ? vFacadePos.z : vFacadePos.x;
  float alongFootprint = abs(n.x) > 0.5 ? footprint.z : footprint.x;
  float detail = 1.0 - smoothstep(uDetailStart, uDetailEnd, max(alongFootprint / period, footprint.y / uFloorHeight));
  float fine = 1.0 - smoothstep(uSurfaceStart, uSurfaceEnd, max(alongFootprint, footprint.y));
  if (n.y > 0.5) {
    // Tile, membrane, ribbed steel and stone coping give roofs distinct large-scale colours.
    vec3 roof = residential ? mix(vec3(0.27, 0.16, 0.11), vec3(0.22, 0.24, 0.23), step(0.55, fract(seed * 0.618)))
      : commercial ? vec3(0.13, 0.22, 0.23) : industrial ? vec3(0.23, 0.28, 0.29) : vec3(0.35, 0.33, 0.27);
    float roofDetail = 1.0 - smoothstep(uSurfaceStart, uSurfaceEnd, max(footprint.x, footprint.z));
    vec2 roofCell = fract(vFacadePos.xz / (industrial ? vec2(0.8, 4.0) : vec2(1.2, 0.6)));
    float seam = max(step(0.9, roofCell.x), step(0.9, roofCell.y));
    float mottling = surfaceNoise(vFacadePos.xz * 0.17 + seed);
    // External skyline keeps its per-instance colour and distance attenuation.
    diffuseColor.rgb = (family < -0.5 ? diffuseColor.rgb * 0.62 : mix(diffuseColor.rgb * 0.65, roof, 0.8)) * (0.88 + mottling * 0.16);
    diffuseColor.rgb *= 1.0 - 0.15 * mix(0.19, seam, roofDetail);
    float rim = step(min(vBuildingSize.x * 0.5 - abs(vFacadePos.x), vBuildingSize.z * 0.5 - abs(vFacadePos.z)), 0.5);
    diffuseColor.rgb *= 1.0 - rim * wear * 0.4;
  } else {
    float floorY = fract(vFacadePos.y / uFloorHeight);
    float col = fract((along + seed * 0.31) / period);
    vec2 cell = vec2(col, floorY);
    float ground = 1.0 - step(uFloorHeight, vFacadePos.y);
    float window;
    float average;
    if (residential) {
      window = panel(cell, vec2(0.25, 0.32), vec2(0.75, 0.82));
      average = 0.25;
      float frame = panel(cell, vec2(0.20, 0.27), vec2(0.80, 0.87)) - window;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.50, 0.39), frame * detail * 0.65);
      float row = floor(vFacadePos.y / 0.45);
      vec2 brick = fract(vec2(along / 0.9 + mod(row, 2.0) * 0.5, vFacadePos.y / 0.45));
      float mortar = max(step(0.91, brick.x), step(0.87, brick.y));
      diffuseColor.rgb *= 1.0 - ground * 0.22;
      diffuseColor.rgb *= 1.0 - ground * mortar * fine * 0.16;
    } else if (commercial) {
      window = panel(cell, vec2(0.09, 0.22), vec2(0.91, 0.86));
      average = 0.5248;
      float mullion = step(0.93, col);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.29, 0.35, 0.34), mullion * detail * 0.6);
      float band = step(0.88, floorY);
      diffuseColor.rgb *= 1.0 - 0.2 * mix(0.12, band, detail);
    } else if (industrial) {
      float upper = step(vBuildingSize.y * 0.65, vFacadePos.y) * step(vFacadePos.y, vBuildingSize.y * 0.86);
      window = upper * step(0.16, col) * step(col, 0.84);
      average = upper * 0.68;
      float steel = step(vBuildingSize.y * 0.35, vFacadePos.y);
      float rib = step(0.72, fract(along / 0.65));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.25, 0.26), steel * 0.7);
      diffuseColor.rgb *= 1.0 - steel * 0.22 * mix(0.28, rib, fine);
      float row = floor(vFacadePos.y / 0.4);
      vec2 brick = fract(vec2(along / 0.85 + mod(row, 2.0) * 0.5, vFacadePos.y / 0.4));
      float mortar = max(step(0.9, brick.x), step(0.86, brick.y));
      diffuseColor.rgb *= 1.0 - (1.0 - steel) * mortar * fine * 0.28;
    } else {
      window = panel(cell, vec2(0.32, 0.19), vec2(0.68, 0.89));
      average = 0.252;
      vec2 stone = fract(vec2(along / 1.4 + mod(floor(vFacadePos.y / 0.7), 2.0) * 0.5, vFacadePos.y / 0.7));
      float joint = max(step(0.95, stone.x), step(0.93, stone.y));
      diffuseColor.rgb *= 1.0 - joint * fine * 0.18;
      float band = step(0.91, floorY);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.52, 0.43), band * detail * 0.4);
    }
    vec2 windowId = vec2(floor((along + seed * 0.31) / period), floor(vFacadePos.y / uFloorHeight));
    float rnd = surfaceHash(windowId + seed);
    float dirt = surfaceNoise(vec2(along * 0.28, vFacadePos.y * 0.15) + seed);
    float runoff = surfaceNoise(vec2(along * 1.3 + seed, floor(vFacadePos.y / uFloorHeight))) * (1.0 - floorY);
    diffuseColor.rgb *= 1.0 - wear * (dirt * 0.45 + runoff * detail * 0.3);
    diffuseColor.rgb *= 1.0 + (surfaceHash(floor(vec2(along, vFacadePos.y) * 8.0) + seed) - 0.5) * uGrain * fine;
    float damp = (1.0 - smoothstep(0.0, 2.2, vFacadePos.y)) * wear;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.065, 0.085, 0.065), damp);
    vec3 glass = commercial ? vec3(0.07, 0.15, 0.19) : vec3(0.055, 0.085, 0.10);
    glass *= mix(0.95, mix(0.65, 1.25, rnd), detail);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, mix(average, window, detail) * (1.0 - ground) * 0.9);
    litWindow = window * (1.0 - ground) * step(0.84, rnd) * detail;
    // Shuttered shops and loading doors: graphic treatment, not passable entrances.
    float door = panel(cell, vec2(0.16, 0.05), vec2(0.84, 0.8));
    vec3 shutter = industrial ? vec3(0.10, 0.14, 0.15) : commercial ? vec3(0.075, 0.12, 0.13) : vec3(0.17, 0.15, 0.12);
    float slat = step(0.8, fract(vFacadePos.y / 0.22));
    shutter *= 1.0 - slat * fine * 0.2;
    diffuseColor.rgb = mix(diffuseColor.rgb, shutter, ground * mix(0.51, door, detail) * 0.85);
  }
`;

export const GROUND_COLOR = /* glsl */ `
  vec2 at = vSurfaceWorld.xz;
  float kind = floor(texture2D(uGroundKind, at / uGroundSize).r * 255.0 + 0.5);
  float footprint = max(fwidth(at.x), fwidth(at.y));
  float detail = 1.0 - smoothstep(uSurfaceStart, uSurfaceEnd, footprint);
  float grain = surfaceHash(floor(at * 12.0)) - 0.5;
  if (kind < 0.5) {
    // Fine aggregate and sparse rectangular repairs, beneath the existing road paint.
    vec2 patchCell = floor(at / 3.0);
    vec2 p = fract(at / 3.0);
    float repairPatch = step(0.82, surfaceHash(patchCell)) * panel(p, vec2(0.12), vec2(0.88));
    float crack = step(0.97, surfaceNoise(vec2(at.x * 1.6, at.y * 0.3)));
    diffuseColor.rgb *= 1.0 + grain * uGrain * detail - repairPatch * 0.09 * detail - crack * 0.12 * detail;
  } else if (kind < 1.5) {
    vec2 tile = fract(at / uPavementTile);
    float joint = max(step(0.93, tile.x), step(0.93, tile.y));
    float stone = surfaceHash(floor(at / uPavementTile)) - 0.5;
    diffuseColor.rgb *= 1.0 + (stone * 0.1 - joint * 0.18 + grain * 0.06) * detail;
  } else if (kind < 3.5) {
    diffuseColor.rgb *= 1.0 + grain * uGrain * detail;
  }
`;
