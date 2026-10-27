import * as THREE from 'three';

/**
 * Low-resolution composite: depth-edge outline, bloom and a soft shoulder for light above 1.0, colour
 * grade, posterize with ordered dither, vignette.
 * The scene renders into `target` at internal resolution; the quad writes to the canvas at the same size,
 * and CSS upscales it with nearest filtering.
 */
export class PixelPost {
  readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      // Half float: lights can push past 1.0 and the composite tone-maps and blooms the excess.
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        near: { value: 1 },
        far: { value: 1000 },
        ortho: { value: 1 },
        edgeThreshold: { value: 0.6 },
        outline: { value: new THREE.Color(0x0b0d10) },
        levels: { value: 28 },
        vignette: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float near;
        uniform float far;
        uniform float ortho;
        uniform float edgeThreshold;
        uniform vec3 outline;
        uniform float levels;
        uniform float vignette;
        varying vec2 vUv;

        float viewZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return ortho > 0.5 ? -orthographicDepthToViewZ(d, near, far) : -perspectiveDepthToViewZ(d, near, far);
        }

        // Only what lights pushed past white feeds the bloom.
        vec3 excess(vec2 uv) {
          return max(texture2D(tColor, uv).rgb - 0.85, 0.0);
        }

        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16];
          m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
          m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
          for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.5; }
          return 0.0;
        }

        void main() {
          vec2 px = 1.0 / resolution;
          vec4 col = texture2D(tColor, vUv);
          float zc = viewZ(vUv);
          float zl = viewZ(vUv - vec2(px.x, 0.0));
          float zr = viewZ(vUv + vec2(px.x, 0.0));
          float zu = viewZ(vUv + vec2(0.0, px.y));
          float zd = viewZ(vUv - vec2(0.0, px.y));
          // Outline the nearer side of a depth jump; threshold grows with distance in perspective.
          float thr = edgeThreshold * (ortho > 0.5 ? 1.0 : max(1.0, zc * 0.05));
          float nearer = max(max(zc - zl, zc - zr), max(zc - zu, zc - zd));
          float farther = max(max(zl - zc, zr - zc), max(zu - zc, zd - zc));
          float edge = step(thr, farther) * (1.0 - step(thr, nearer) * 0.5);
          vec3 c = col.rgb;
          // Bloom: two rings of taps around the pixel (cheap at this resolution).
          vec3 glow = vec3(0.0);
          for (int k = 0; k < 8; k++) {
            float a = float(k) * 0.785398;
            vec2 d = vec2(cos(a), sin(a)) * px;
            glow += excess(vUv + d * 2.0) * 0.6 + excess(vUv + d * 5.0) * 0.3;
          }
          c += glow * 0.16;
          // Soft shoulder: keep everything below 0.8 as is, roll the rest off toward white.
          vec3 hi = max(c - 0.8, 0.0);
          c = min(c, 0.8) + 0.2 * (1.0 - exp(-hi * 4.0));
          // Grade: gentle contrast and saturation.
          float luma = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(luma), c, 1.1);
          c = (c - 0.5) * 1.06 + 0.5;
          // Posterize in gamma space (keeps dark tones apart) with a light ordered dither.
          c = sqrt(max(c, 0.0));
          c = floor(c * levels + 0.5 + bayer4(gl_FragCoord.xy) * 0.5) / levels;
          c = c * c;
          c = mix(c, outline, edge * 0.85);
          vec2 q = vUv - 0.5;
          c *= 1.0 - vignette * dot(q, q) * 1.6;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
    this.material.uniforms.resolution.value.set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const u = this.material.uniforms;
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    u.near.value = cam.near;
    u.far.value = cam.far;
    u.ortho.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
