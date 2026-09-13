const { sin, cos, sqrt, hypot, max, min, floor, ceil, random } = Math;

function vec3Normalize(v) {
  const len = hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function computeFrenetFrame(tangent, rollAngle = 0) {
  const forward = vec3Normalize(tangent);
  const worldUp = [0, 1, 0];

  let right = vec3Normalize(vec3Cross(forward, worldUp));
  if (hypot(right[0], right[1], right[2]) < 0.001) {
    right = [1, 0, 0];
  }

  let up = vec3Normalize(vec3Cross(right, forward));

  if (rollAngle !== 0) {
    const cosR = cos(rollAngle);
    const sinR = sin(rollAngle);
    const newRight = [
      right[0] * cosR + up[0] * sinR,
      right[1] * cosR + up[1] * sinR,
      right[2] * cosR + up[2] * sinR,
    ];
    const newUp = [
      -right[0] * sinR + up[0] * cosR,
      -right[1] * sinR + up[1] * cosR,
      -right[2] * sinR + up[2] * cosR,
    ];
    right = newRight;
    up = newUp;
  }

  return { forward, right, up };
}

// One analytic path supplies the road, camera, player and item positions.
export class TrackEngine {
  constructor(trackWidth = 10.5, segmentLength = 35, levelConfig) {
    this.trackWidth = trackWidth;
    this.segmentLength = segmentLength;
    this.curvature = levelConfig.curvature;
    this.length = levelConfig.targetDistance + 200;
    this.obstacleChance = levelConfig.obstacleChance;
    this.starCount = levelConfig.starCount;
    this.stars = [];
    this.obstacles = [];
    this.laneColors = [
      [1.0, 0.2, 0.3],
      [1.0, 0.55, 0.1],
      [1.0, 0.9, 0.1],
      [0.2, 0.9, 0.4],
      [0.1, 0.85, 1.0],
      [0.25, 0.45, 1.0],
      [0.75, 0.2, 0.95]
    ];

    for (let distance = 0; distance < levelConfig.targetDistance; distance += segmentLength) {
      this.spawnSegmentItems(distance, min(segmentLength, levelConfig.targetDistance - distance));
    }
  }

  get playerLateralRange() {
    return this.trackWidth * 3 / 7;
  }

  laneAtLateral(lateral) {
    return max(0, min(6, floor(lateral * 3 + 3.5)));
  }

  sampleTrack(distance) {
    const f = 0.006 * sqrt(this.curvature);
    const t = distance * f;
    const bend = 0.32 * min(2.2, this.curvature);
    const hill = 0.08 * min(2, this.curvature);
    const pos = [bend * (1 - cos(t)) / f, hill * (1 - cos(t * 0.65)) / (f * 0.65), -distance];
    const tangent = [bend * sin(t), hill * sin(t * 0.65), -1];
    const roll = -0.18 * bend * sin(t);
    return { pos, tangent, ...computeFrenetFrame(tangent, roll) };
  }

  spawnSegmentItems(segStartDist, segLen) {
    const starCount = this.starCount;
    for (let s = 0; s < starCount; s++) {
      if (random() >= 0.3) continue;
      const t = (s + 0.5) / starCount;
      const lane = floor(random() * 7);
      const colorLane = floor(random() * 7);

      this.stars.push({
        distance: segStartDist + t * segLen,
        lane,
        colorLane,
        color: this.laneColors[colorLane],
        collected: false
      });
    }

    if (segStartDist >= this.segmentLength * 2 && random() < this.obstacleChance) {
      const t = 0.5;
      const lane = floor(random() * 7);
      const colorLane = (lane + 1) % 7;

      this.obstacles.push({
        distance: segStartDist + t * segLen,
        lane,
        colorLane,
        color: this.laneColors[colorLane]
      });
    }
  }

  // Build the entire short level once; no node extension or pruning is needed.
  buildTrackMesh(glCtx, oldMesh = null) {
    if (oldMesh) {
      for (const key of ['posBuffer', 'uvBuffer', 'indexBuffer']) glCtx.deleteBuffer(oldMesh[key]);
      glCtx.deleteVertexArray(oldMesh.vao);
    }
    const positions = [], uvs = [], indices = [];
    const steps = ceil((this.length + 60) / 4);
    for (let row = 0; row <= steps; row++) {
      const distance = -60 + row * 4;
      const { pos, right } = this.sampleTrack(distance);
      for (let col = 0; col < 8; col++) {
        const lateral = (col / 7 - 0.5) * this.trackWidth;
        for (let axis = 0; axis < 3; axis++) positions.push(pos[axis] + right[axis] * lateral);
        uvs.push(col / 7, distance);
        if (row < steps && col < 7) {
          const i = row * 8 + col;
          indices.push(i, i + 8, i + 1, i + 1, i + 8, i + 9);
        }
      }
    }

    const vao = glCtx.createVertexArray();
    glCtx.bindVertexArray(vao);

    const posBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBuffer);
    glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(positions), glCtx.STATIC_DRAW);
    glCtx.enableVertexAttribArray(0);
    glCtx.vertexAttribPointer(0, 3, glCtx.FLOAT, false, 0, 0);

    const uvBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, uvBuffer);
    glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(uvs), glCtx.STATIC_DRAW);
    glCtx.enableVertexAttribArray(2);
    glCtx.vertexAttribPointer(2, 2, glCtx.FLOAT, false, 0, 0);

    const indexBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, indexBuffer);
    glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), glCtx.STATIC_DRAW);

    glCtx.bindVertexArray(null);

    return {
      vao,
      posBuffer,
      uvBuffer,
      indexBuffer,
      indexCount: indices.length,
    };
  }
}
