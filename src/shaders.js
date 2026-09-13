function createShader(glCtx, type, source) {
  const shader = glCtx.createShader(type);
  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);

  return shader;
}

function linkProgram(glCtx, vsSource, fsSource) {
  const vs = createShader(glCtx, glCtx.VERTEX_SHADER, vsSource);
  const fs = createShader(glCtx, glCtx.FRAGMENT_SHADER, fsSource);

  const program = glCtx.createProgram();
  glCtx.attachShader(program, vs);
  glCtx.attachShader(program, fs);
  glCtx.linkProgram(program);

  glCtx.detachShader(program, vs);
  glCtx.detachShader(program, fs);
  glCtx.deleteShader(vs);
  glCtx.deleteShader(fs);

  return program;
}

const fogUniforms = `uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;`;

const lightUniforms = `uniform vec3 uLightDirection;
uniform vec3 uAmbientColor;
uniform vec3 uLightColor;`;

const cameraUniforms = `uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;`;

const fogBlend = `  float fogFactor = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);`;

const rainbowLookup = `vec3 rainbowColor(float t) {
  float x = clamp(t, 0.0, 1.0) * 6.0;
  int i = int(min(x, 5.0));
  return mix(COLORS[i], COLORS[i + 1], x - float(i));
}`;

export const shieldVertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

${cameraUniforms}

out vec3 vNormal;
out vec3 vLocalPos;
out vec3 vPosition;
out float vFogDepth;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vec4 viewPos = uView * worldPos;

  gl_Position = uProjection * viewPos;

  vNormal = mat3(uModel) * aNormal;
  vLocalPos = aPosition;
  vPosition = worldPos.xyz;
  vFogDepth = -viewPos.z;
}`;

export const shieldFragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vPosition;
in float vFogDepth;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

out vec4 fragColor;

void main() {
  vec3 normal = normalize(vNormal);

  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.5);

  float pulse = sin(uTime * 6.0 + vPosition.y * 8.0) * 0.5 + 0.5;

  vec3 shieldColor = uColor * (fresnel * 1.5 + pulse * 0.3);
  float alpha = clamp(fresnel * 0.75 + pulse * 0.15, 0.05, 0.85);

${fogBlend}
  vec3 colorWithFog = mix(shieldColor, uFogColor, fogFactor);

  fragColor = vec4(colorWithFog, alpha);
}`;

export const vertexShaderSource = shieldVertexShaderSource;

export const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vLocalPos;
in vec3 vPosition;
in float vFogDepth;

uniform vec3 uColor;
${lightUniforms}
${fogUniforms}
uniform float uGlow;
uniform float uAlpha;
uniform bool uSpots;

out vec4 fragColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDirection);

  float diff = max(dot(normal, lightDir), 0.0);

  vec3 lighting = uAmbientColor + (diff * uLightColor) + vec3(uGlow * 0.4);
  vec3 finalColor = uColor * lighting;
  if (uSpots && vLocalPos.y > 0.015) {
    vec3 dir = normalize(vLocalPos / vec3(0.52, 0.38, 0.52));
    float nearest = dir.y;
    float angle = atan(dir.z, dir.x + 0.000001);
    // Find only the nearest spot on each ring instead of checking 21 centers.
    for (int ring = 0; ring < 3; ring++) {
      float y = ring == 0 ? 0.829 : (ring == 1 ? 0.559 : 0.276);
      float step = 6.2831853 / (ring == 0 ? 6.0 : 7.0);
      float phase = ring == 1 ? step * 0.5 : 0.0;
      float a = floor((angle - phase) / step + 0.5) * step + phase;
      nearest = max(nearest, dot(dir, vec3(cos(a) * sqrt(1.0-y*y), y, sin(a) * sqrt(1.0-y*y))));
    }
    vec3 white = min(lighting + vec3(uGlow * 0.15 + 0.2), vec3(1.25));
    finalColor = mix(finalColor, white, smoothstep(0.990, 0.9945, nearest));
  }

${fogBlend}
  vec3 colorWithFog = mix(finalColor, uFogColor, fogFactor);
  fragColor = vec4(colorWithFog, uAlpha);
}`;

export const trackVertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aUv;

${cameraUniforms}

out vec2 vUv;
out float vFogDepth;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vec4 viewPos = uView * worldPos;

  gl_Position = uProjection * viewPos;

  vUv = aUv;
  vFogDepth = -viewPos.z;
}`;

export const trackFragmentShaderSource = `#version 300 es
precision mediump float;

in vec2 vUv;
in float vFogDepth;

// 7 Rainbow Lane Energy Levels (1.0 = solid to far horizon, 0.0 = completely dissolved to player)
uniform float uLaneEnergy[7];
uniform float uTime;
uniform float uDash;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

out vec4 fragColor;

const vec3 LANE_COLORS[7] = vec3[7](
  vec3(1.0, 0.15, 0.25),
  vec3(1.0, 0.55, 0.05),
  vec3(1.0, 0.92, 0.10),
  vec3(0.1, 0.95, 0.40),
  vec3(0.05, 0.85, 1.0),
  vec3(0.2, 0.45, 1.00),
  vec3(0.75, 0.20, 0.95)
);

void main() {
  float edgeGlow = 0.0;
  float uClamped = clamp(vUv.x, 0.0, 0.9999);
  int lane = int(floor(uClamped * 7.0));

  float energy = uLaneEnergy[lane];

  // Progressive dissolve depth: shrinks from far horizon towards character (~5.8)
  float playerDepth = 5.8;
  float maxReach = playerDepth + (uFogFar + 15.0 - playerDepth) * energy;
  float distToEdge = maxReach - vFogDepth;

  if (distToEdge < 0.0) {
    discard;
  }

  float burnZone = 5.0;
  if (distToEdge < burnZone) {
    float normDist = distToEdge / burnZone;
    float burnCurve = normDist + sin(vUv.x * 25.0 + uTime * 6.0) * 0.15;
    if (burnCurve < 0.3) {
      discard;
    }
    edgeGlow = max(edgeGlow, (1.0 - smoothstep(0.3, 0.7, burnCurve)) * 4.0);
  }

  vec3 laneColor = LANE_COLORS[lane];

  if (uDash > 0.005) {
    float blurSpread = uDash * 0.045;
    vec3 blurredColor = vec3(0.0);
    blurredColor += LANE_COLORS[int(floor(clamp(vUv.x - blurSpread * 1.6, 0.0, 0.9999) * 7.0))] * 0.12;
    blurredColor += LANE_COLORS[int(floor(clamp(vUv.x - blurSpread * 0.8, 0.0, 0.9999) * 7.0))] * 0.24;
    blurredColor += laneColor * 0.28;
    blurredColor += LANE_COLORS[int(floor(clamp(vUv.x + blurSpread * 0.8, 0.0, 0.9999) * 7.0))] * 0.24;
    blurredColor += LANE_COLORS[int(floor(clamp(vUv.x + blurSpread * 1.6, 0.0, 0.9999) * 7.0))] * 0.12;
    laneColor = mix(laneColor, blurredColor, min(1.0, uDash * 1.3));
  }

  float laneLocalCoord = fract(uClamped * 7.0);

  float laneLine = smoothstep(0.0, 0.04, laneLocalCoord) * smoothstep(1.0, 0.96, laneLocalCoord);
  vec3 surfaceColor = mix(laneColor * 0.75, laneColor, laneLine * 0.85 + 0.15);

  surfaceColor += (laneColor * 1.8 + vec3(0.15)) * edgeGlow;

  float outerDist = min(vUv.x, 1.0 - vUv.x);
  float outerGlow = smoothstep(0.0, 0.015, outerDist);
  surfaceColor = mix(surfaceColor + laneColor * 0.6, surfaceColor, outerGlow);

${fogBlend}
  vec3 finalColor = mix(surfaceColor, uFogColor, fogFactor);

  fragColor = vec4(finalColor, 1.0);
}`;

export const starVertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;

uniform mat4 uView;
uniform mat4 uProjection;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uDash;

out float vAlpha;
out vec3 vColor;

void main() {
  vec3 pos = aPosition;

  float boxSize = 240.0;
  pos.x = mod(pos.x - uCameraPos.x + boxSize * 0.5, boxSize) - boxSize * 0.5 + uCameraPos.x;
  pos.y = mod(pos.y - uCameraPos.y + boxSize * 0.5, boxSize) - boxSize * 0.5 + uCameraPos.y;
  pos.z = mod(pos.z - uCameraPos.z + boxSize * 0.5, boxSize) - boxSize * 0.5 + uCameraPos.z;

  if (uDash > 0.01) {
    pos.z -= (sin(uTime * 15.0 + aPosition.x) * 0.5 + 0.5) * uDash * 2.8;
  }

  vec4 viewPos = uView * vec4(pos, 1.0);
  gl_Position = uProjection * viewPos;

  float dist = length(viewPos.xyz);
  float baseSize = 4.2;
  gl_PointSize = clamp((baseSize * 180.0) / max(dist, 1.0), 1.5, 14.0);
  if (uDash > 0.01) {
    gl_PointSize *= (1.0 + uDash * 0.6);
  }

  float twinkle = 0.75 + 0.25 * sin(uTime * 3.5 + aPosition.x * 0.1 + aPosition.z * 0.2);
  vAlpha = clamp(1.0 - (dist / 220.0), 0.0, 1.0) * twinkle;

  float colorSeed = fract(sin(dot(aPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (colorSeed > 0.75) {
    vColor = vec3(0.65, 0.85, 1.0);
  } else if (colorSeed > 0.5) {
    vColor = vec3(1.0, 0.92, 0.7);
  } else if (colorSeed > 0.3) {
    vColor = vec3(0.9, 0.7, 1.0);
  } else {
    vColor = vec3(1.0, 1.0, 1.0);
  }
}`;

export const starFragmentShaderSource = `#version 300 es
precision mediump float;

in float vAlpha;
in vec3 vColor;
out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }
  float radialGlow = 1.0 - smoothstep(0.0, 0.5, dist);
  fragColor = vec4(vColor, vAlpha * radialGlow);
}`;

export const hornVertexShaderSource = shieldVertexShaderSource;

export const hornFragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vPosition;
in vec3 vLocalPos;
in float vFogDepth;

${lightUniforms}
${fogUniforms}
uniform float uHeight;
uniform float uTime;
uniform float uGlow;

out vec4 fragColor;

const vec3 COLORS[7] = vec3[7](
  vec3(1.0, 0.15, 0.25),
  vec3(1.0, 0.55, 0.05),
  vec3(1.0, 0.92, 0.10),
  vec3(0.1, 0.95, 0.40),
  vec3(0.05, 0.85, 1.0),
  vec3(0.2, 0.45, 1.00),
  vec3(0.75, 0.20, 0.95)
);

${rainbowLookup}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDirection);

  float diff = max(dot(normal, lightDir), 0.0);

  vec3 viewDir = normalize(-vPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfVector), 0.0), 32.0) * 0.8;

  float normZ = clamp(vLocalPos.z / max(uHeight, 0.001), 0.0, 1.0);

  vec3 rainbow = rainbowColor(normZ);

  float angle = atan(vLocalPos.y, vLocalPos.x);
  float spiral = sin(angle * 3.0 - normZ * 18.0 + uTime * 2.0);
  float shimmer = smoothstep(-0.2, 0.9, spiral) * 0.25;

  vec3 lighting = uAmbientColor + (diff * uLightColor) + vec3(uGlow * 0.45) + vec3(shimmer);
  vec3 finalColor = rainbow * lighting + vec3(spec);

${fogBlend}
  vec3 colorWithFog = mix(finalColor, uFogColor, fogFactor);
  fragColor = vec4(colorWithFog, 1.0);
}`;

export const maneVertexShaderSource = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv; // x: angle, y: spline t (0..1)

${cameraUniforms}
uniform float uTime;

out vec3 vNormal;
out vec3 vPosition;
out float vSplineT;
out float vFogDepth;

void main() {
  float t = aUv.y;

  float wavePhase = uTime * 6.5 - t * 7.5;
  float wave1 = sin(wavePhase);
  float wave2 = sin(uTime * 11.0 - t * 12.0) * 0.25;
  float wobbleAmp = (0.04 + 0.16 * t * t);
  float wobbleX = (wave1 + wave2) * wobbleAmp;

  float wobbleY = cos(uTime * 5.5 - t * 6.5) * 0.05 * t;
  float rollAngle = sin(wavePhase * 0.8) * 0.18 * t;
  float cT = cos(rollAngle);
  float sT = sin(rollAngle);

  vec3 localPos = aPosition;
  float px = localPos.x * cT - localPos.y * sT * 0.2;
  float py = localPos.x * sT * 0.2 + localPos.y;
  localPos.x = px + wobbleX;
  localPos.y = py + wobbleY;

  vec3 localNorm = aNormal;
  localNorm.x = localNorm.x * cT - localNorm.y * sT * 0.2;
  localNorm.y = localNorm.x * sT * 0.2 + localNorm.y;
  localNorm.x += cos(wavePhase) * wobbleAmp * 1.5;
  localNorm = normalize(localNorm);

  vec4 worldPos = uModel * vec4(localPos, 1.0);
  vec4 viewPos = uView * worldPos;

  gl_Position = uProjection * viewPos;

  vNormal = mat3(uModel) * localNorm;
  vPosition = worldPos.xyz;
  vSplineT = t;
  vFogDepth = -viewPos.z;
}`;

export const maneFragmentShaderSource = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
in float vSplineT;
in float vFogDepth;

${fogUniforms}
uniform float uTime;
uniform float uGlow;
uniform vec3 uAmbientColor;

out vec4 fragColor;

const vec3 COLORS[7] = vec3[7](
  vec3(1.0, 0.18, 0.75),
  vec3(0.50, 0.22, 1.0),
  vec3(0.06, 0.82, 1.0),
  vec3(0.12, 0.98, 0.45),
  vec3(1.0, 0.92, 0.12),
  vec3(1.0, 0.50, 0.08),
  vec3(1.0, 0.18, 0.38)
);

${rainbowLookup}

void main() {
  vec3 baseRainbow = rainbowColor(vSplineT);

  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.4, 0.85, 0.45));
  float diff = max(dot(normal, lightDir), 0.0);

  vec3 viewDir = normalize(-vPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfVector), 0.0), 16.0) * 0.5;

  float flow = sin(vSplineT * 12.0 - uTime * 4.0);
  float highlight = smoothstep(0.4, 0.95, flow) * 0.35;

  vec3 lighting = uAmbientColor + (diff * vec3(0.65, 0.65, 0.7)) + vec3(uGlow * 0.45) + vec3(highlight);
  vec3 color = baseRainbow * lighting + vec3(spec);

${fogBlend}
  vec3 colorWithFog = mix(color, uFogColor, fogFactor);

  fragColor = vec4(colorWithFog, 1.0);
}`;

// Build only the uniforms declared by each shader, including shared vertex uniforms.
export function createProgram(glCtx, vertex, fragment) {
  const program = linkProgram(glCtx, vertex, fragment);
  const uniforms = {};
  for (const [, name] of (vertex + fragment).matchAll(/uniform\s+\w+\s+u(\w+)/g)) {
    const key = name === 'LaneEnergy' ? 'laneEnergyArray' : name[0].toLowerCase() + name.slice(1);
    if (!(key in uniforms)) uniforms[key] = glCtx.getUniformLocation(program, 'u' + name);
  }
  return { program, uniforms };
}
