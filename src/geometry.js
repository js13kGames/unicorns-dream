const { sin, cos, hypot, max, min, floor, random, PI } = Math;
const TAU = PI * 2;

export function createMeshVAO(glCtx, { positions, normals, uvs, indices }) {
  const vao = glCtx.createVertexArray();
  glCtx.bindVertexArray(vao);

  const posBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(positions), glCtx.STATIC_DRAW);
  glCtx.enableVertexAttribArray(0);
  glCtx.vertexAttribPointer(0, 3, glCtx.FLOAT, false, 0, 0);

  const normBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, normBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(normals), glCtx.STATIC_DRAW);
  glCtx.enableVertexAttribArray(1);
  glCtx.vertexAttribPointer(1, 3, glCtx.FLOAT, false, 0, 0);

  if (uvs && uvs.length > 0) {
    const uvBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, uvBuffer);
    glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(uvs), glCtx.STATIC_DRAW);
    glCtx.enableVertexAttribArray(2);
    glCtx.vertexAttribPointer(2, 2, glCtx.FLOAT, false, 0, 0);
  }

  const indexBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, indexBuffer);
  glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), glCtx.STATIC_DRAW);

  glCtx.bindVertexArray(null);

  return {
    vao,
    indexCount: indices.length,
  };
}

export function createSphereMesh(glCtx, radius = 0.5, latSegments = 16, lonSegments = 16) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= latSegments; i++) {
    const theta = (i / latSegments) * PI;
    const sinTheta = sin(theta);
    const cosTheta = cos(theta);

    for (let j = 0; j <= lonSegments; j++) {
      const phi = (j / lonSegments) * TAU;
      const sinPhi = sin(phi);
      const cosPhi = cos(phi);

      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      normals.push(x, y, z);
      positions.push(radius * x, radius * y, radius * z);
    }
  }

  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lonSegments; j++) {
      const first = i * (lonSegments + 1) + j;
      const second = first + lonSegments + 1;

      indices.push(first, first + 1, second);
      indices.push(second, first + 1, second + 1);
    }
  }

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createHemisphereMesh(glCtx, radius = 0.52, height = 0.38, latSegments = 16, lonSegments = 24) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= latSegments; i++) {
    const theta = (i / latSegments) * (PI * 0.5);
    const sinTheta = sin(theta);
    const cosTheta = cos(theta);

    for (let j = 0; j <= lonSegments; j++) {
      const phi = (j / lonSegments) * TAU;
      const sinPhi = sin(phi);
      const cosPhi = cos(phi);

      const x = radius * sinTheta * cosPhi;
      const y = height * cosTheta;
      const z = radius * sinTheta * sinPhi;

      // Surface normal for semi-ellipsoid dome
      let nx = (radius > 0) ? (x / (radius * radius)) : 0;
      let ny = (height > 0) ? (y / (height * height)) : 1;
      let nz = (radius > 0) ? (z / (radius * radius)) : 0;
      const len = hypot(nx, ny, nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      positions.push(x, y, z);
      normals.push(nx, ny, nz);
    }
  }

  const ringVertCount = lonSegments + 1;
  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lonSegments; j++) {
      const first = i * ringVertCount + j;
      const second = (i + 1) * ringVertCount + j;

      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  const centerIdx = positions.length / 3;
  positions.push(0, 0, 0);
  normals.push(0, -1, 0);

  const diskStartIdx = positions.length / 3;
  for (let j = 0; j <= lonSegments; j++) {
    const phi = (j / lonSegments) * TAU;
    const x = radius * cos(phi);
    const z = radius * sin(phi);
    positions.push(x, 0, z);
    normals.push(0, -1, 0);
  }

  for (let j = 0; j < lonSegments; j++) {
    indices.push(centerIdx, diskStartIdx + j, diskStartIdx + j + 1);
  }

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createCylinderMesh(glCtx, radius = 0.20, height = 0.44, segments = 24) {
  const positions = [];
  const normals = [];
  const indices = [];

  const yBottom = -height;
  const yTop = 0.02; // Overlap slightly into cap

  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * TAU;
    const cosPhi = cos(phi);
    const sinPhi = sin(phi);

    const x = radius * cosPhi;
    const z = radius * sinPhi;

    positions.push(x, yTop, z);
    normals.push(cosPhi, 0, sinPhi);

    positions.push(x, yBottom, z);
    normals.push(cosPhi, 0, sinPhi);
  }

  for (let j = 0; j < segments; j++) {
    const topCurr = j * 2;
    const btmCurr = j * 2 + 1;
    const topNext = (j + 1) * 2;
    const btmNext = (j + 1) * 2 + 1;

    indices.push(topCurr, btmCurr, topNext);
    indices.push(topNext, btmCurr, btmNext);
  }

  const bottomCenterIdx = positions.length / 3;
  positions.push(0, yBottom, 0);
  normals.push(0, -1, 0);

  const btmCapStart = positions.length / 3;
  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * TAU;
    positions.push(radius * cos(phi), yBottom, radius * sin(phi));
    normals.push(0, -1, 0);
  }

  for (let j = 0; j < segments; j++) {
    indices.push(bottomCenterIdx, btmCapStart + j, btmCapStart + j + 1);
  }

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createStarfieldMesh(glCtx, count = 1800) {
  const positions = [];

  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 500;
    const y = (random() - 0.5) * 350;
    const z = (random() - 0.5) * 500;
    positions.push(x, y, z);
  }

  const vao = glCtx.createVertexArray();
  glCtx.bindVertexArray(vao);

  const posBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(positions), glCtx.STATIC_DRAW);
  glCtx.enableVertexAttribArray(0);
  glCtx.vertexAttribPointer(0, 3, glCtx.FLOAT, false, 0, 0);

  glCtx.bindVertexArray(null);

  return {
    vao,
    vertexCount: count,
  };
}

// Flat annulus: two vertices per segment, with the same outer/inner radius as the torus.
export function createRingMesh(glCtx, radius = 4.4, halfWidth = 0.045, segments = 48) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * TAU;
    for (const r of [radius - halfWidth, radius + halfWidth]) {
      positions.push(r * cos(angle), r * sin(angle), 0);
      normals.push(0, 0, 1);
    }
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createPlaneMesh(glCtx, width = 1.0, height = 1.0) {
  const w = width / 2;
  const h = height / 2;

  const positions = [
    -w, -h, 0,
     w, -h, 0,
     w,  h, 0,
    -w,  h, 0,
  ];

  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ];

  const indices = [
    0, 1, 2,
    0, 2, 3,
  ];

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createTriangleShardMesh(glCtx) {
  const positions = [
    -0.25, -0.2, 0,
     0.25, -0.2, 0,
     0.0,   0.3, 0,
  ];

  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ];

  const indices = [
    0, 1, 2,
  ];

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createConeMesh(glCtx, radius = 0.25, height = 1.15, segments = 32) {
  const positions = [];
  const normals = [];
  const indices = [];

  const slant = hypot(radius, height);
  const cosSlant = height / slant;
  const sinSlant = radius / slant;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const midAngle = (a0 + a1) * 0.5;

    const x0 = cos(a0) * radius;
    const y0 = sin(a0) * radius;
    const x1 = cos(a1) * radius;
    const y1 = sin(a1) * radius;

    const nx0 = cos(a0) * cosSlant;
    const ny0 = sin(a0) * cosSlant;
    const nx1 = cos(a1) * cosSlant;
    const ny1 = sin(a1) * cosSlant;
    const nxMid = cos(midAngle) * cosSlant;
    const nyMid = sin(midAngle) * cosSlant;

    const baseIdx = positions.length / 3;

    positions.push(x0, y0, 0);
    normals.push(nx0, ny0, sinSlant);

    positions.push(x1, y1, 0);
    normals.push(nx1, ny1, sinSlant);

    positions.push(0, 0, height);
    normals.push(nxMid, nyMid, sinSlant);

    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  const baseCenterIdx = positions.length / 3;
  positions.push(0, 0, 0);
  normals.push(0, 0, -1);

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    positions.push(cos(a) * radius, sin(a) * radius, 0);
    normals.push(0, 0, -1);
  }

  for (let i = 0; i < segments; i++) {
    const curr = baseCenterIdx + 1 + i;
    const next = baseCenterIdx + 1 + ((i + 1) % segments);
    indices.push(baseCenterIdx, next, curr);
  }

  return createMeshVAO(glCtx, { positions, normals, indices });
}

export function createManeMesh(glCtx, segments = 32, radialSegments = 12) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Smooth Catmull-Rom spline control points in player coordinate space (+Z is forward, +Y is up)
  // Positioned along the crown and cascading backward, clear of the front face and horn
  const controlPoints = [
    [0.0, 0.45, 0.22],
    [0.0, 0.52, 0.14],
    [0.0, 0.70, -0.06],
    [0.0, 0.68, -0.32],
    [0.0, 0.54, -0.60],
    [0.0, 0.35, -0.90],
    [0.0, 0.16, -1.18],
    [0.0, 0.06, -1.36],
  ];

  function catmullRom(p0, p1, p2, p3, u) {
    const u2 = u * u;
    const u3 = u2 * u;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * u + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * u2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * u3),
    ];
  }

  function sampleSpline(t) {
    const numIntervals = 5;
    const p = max(0, min(1.0, t)) * numIntervals;
    let idx = floor(p);
    if (idx >= numIntervals) idx = numIntervals - 1;
    const u = p - idx;
    return catmullRom(
      controlPoints[idx],
      controlPoints[idx + 1],
      controlPoints[idx + 2],
      controlPoints[idx + 3],
      u
    );
  }

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = sampleSpline(t);

    // Compute tangent via central difference
    const pPrev = sampleSpline(max(0, t - 0.01));
    const pNext = sampleSpline(min(1.0, t + 0.01));
    let tx = pNext[0] - pPrev[0];
    let ty = pNext[1] - pPrev[1];
    let tz = pNext[2] - pPrev[2];
    const tLen = hypot(tx, ty, tz) || 1.0;
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;

    const nLat = [1.0, 0.0, 0.0];
    let upX = nLat[1] * tz - nLat[2] * ty;
    let upY = nLat[2] * tx - nLat[0] * tz;
    let upZ = nLat[0] * ty - nLat[1] * tx;
    const upLen = hypot(upX, upY, upZ) || 1.0;
    upX /= upLen;
    upY /= upLen;
    upZ /= upLen;

    const baseRx = 0.15 + 0.09 * sin(t * PI * 0.95);
    const baseRy = 0.13 + 0.08 * sin(t * PI * 0.95);

    const tuft = 1.0 + 0.20 * sin(t * PI * 4.0 - 0.4);
    const Rx = baseRx * tuft;
    const Ry = baseRy * tuft;

    for (let j = 0; j <= radialSegments; j++) {
      const phi = (j / radialSegments) * TAU;

      const lobe = 1.0 + 0.12 * cos(3.0 * phi);
      const radX = Rx * lobe;
      const radY = Ry * lobe;

      const cosP = cos(phi);
      const sinP = sin(phi);

      const vx = center[0] + sinP * radX * nLat[0] + cosP * radY * upX;
      const vy = center[1] + sinP * radX * nLat[1] + cosP * radY * upY;
      const vz = center[2] + sinP * radX * nLat[2] + cosP * radY * upZ;

      let nx = sinP * nLat[0] + cosP * upX;
      let ny = sinP * nLat[1] + cosP * upY;
      let nz = sinP * nLat[2] + cosP * upZ;
      const nLen = hypot(nx, ny, nz) || 1.0;

      positions.push(vx, vy, vz);
      normals.push(nx / nLen, ny / nLen, nz / nLen);
      uvs.push(j / radialSegments, t);
    }
  }

  const ringVertCount = radialSegments + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const curr = i * ringVertCount + j;
      const next = (i + 1) * ringVertCount + j;

      indices.push(curr, next, curr + 1);
      indices.push(curr + 1, next, next + 1);
    }
  }

  const frontCenterIdx = positions.length / 3;
  const pFront = sampleSpline(0);
  positions.push(pFront[0], pFront[1], pFront[2]);
  normals.push(0.0, -0.4, 0.9);
  uvs.push(0.5, 0.0);

  for (let j = 0; j < radialSegments; j++) {
    indices.push(frontCenterIdx, j, j + 1);
  }

  const rearCenterIdx = positions.length / 3;
  const pRear = sampleSpline(1.0);
  positions.push(pRear[0], pRear[1] + 0.02, pRear[2] - 0.06);
  normals.push(0.0, -0.2, -0.98);
  uvs.push(0.5, 1.0);

  const lastRingStart = segments * ringVertCount;
  for (let j = 0; j < radialSegments; j++) {
    indices.push(rearCenterIdx, lastRingStart + j + 1, lastRingStart + j);
  }

  return createMeshVAO(glCtx, { positions, normals, uvs, indices });
}
