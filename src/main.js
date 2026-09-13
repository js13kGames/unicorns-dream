import { advanceSimulation, syncTooltips, createFrameLoop } from './runtime.js';
  import {
    mat4Create,
    mat4Identity,
    mat4Translate,
    mat4RotateX,
    mat4RotateY,
    mat4RotateZ,
    mat4Scale,
    mat4Perspective,
    mat4LookAt,
    lerp,
  } from './matrix.js';

  import {
    createProgram,
    vertexShaderSource, fragmentShaderSource,
    trackVertexShaderSource, trackFragmentShaderSource,
    starVertexShaderSource, starFragmentShaderSource,
    shieldVertexShaderSource, shieldFragmentShaderSource,
    hornVertexShaderSource, hornFragmentShaderSource,
    maneVertexShaderSource, maneFragmentShaderSource,
  } from './shaders.js';

  import {
    createSphereMesh,
    createHemisphereMesh,
    createCylinderMesh,
    createPlaneMesh,
    createTriangleShardMesh,
    createStarfieldMesh,
    createRingMesh,
    createConeMesh,
    createManeMesh,
  } from './geometry.js';

  import { TrackEngine } from './game.js';
  import { LEVELS } from './levels.js';
  import {
     playStarChime,
     playBonusPickupSound,
     playTaaDaaSound,
     playJumpSwoosh,
     playBoostSound,
     playCrashSound,
     playGlassShatterSound,
     playSlowMotionSound,
     playAllLivesLostSound,
     playShieldSound,
     playDashSound,
     startSynthwaveMusic,
     stopSynthwaveMusic,
     updateMusicLevel,
     updatePlayerLane,
     getMusicBeatPhase
   } from './audio.js';

  const { sin, cos, abs, max, min, floor, random, hypot, PI } = Math;
  const TAU = PI * 2;

const LEVEL_PORTAL_COLORS = [
    [1.0, 0.15, 0.25],
    [1.0, 0.55, 0.05],
    [1.0, 0.92, 0.10],
    [0.1, 0.95, 0.40],
    [0.05, 0.85, 1.0],
    [0.2, 0.45, 1.0],
    [0.75, 0.2, 0.95],
  ];

  const canvas = document.getElementById('game');
  const glCtx = canvas ? canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' }) : null;

  glCtx.enable(glCtx.DEPTH_TEST);
  glCtx.depthFunc(glCtx.LEQUAL);
  glCtx.disable(glCtx.CULL_FACE);

  const objectShader = createProgram(glCtx, vertexShaderSource, fragmentShaderSource);
  const trackShader = createProgram(glCtx, trackVertexShaderSource, trackFragmentShaderSource);
  const starfieldShader = createProgram(glCtx, starVertexShaderSource, starFragmentShaderSource);
  const shieldShader = createProgram(glCtx, shieldVertexShaderSource, shieldFragmentShaderSource);
  const hornShader = createProgram(glCtx, hornVertexShaderSource, hornFragmentShaderSource);
  const maneShader = createProgram(glCtx, maneVertexShaderSource, maneFragmentShaderSource);

  const sphereMesh = createSphereMesh(glCtx, 0.58, 24, 24);
  const mushroomCapMesh = createHemisphereMesh(glCtx, 0.52, 0.38, 16, 24);
  const mushroomStemMesh = createCylinderMesh(glCtx, 0.20, 0.44, 24);
  const planeMesh = createPlaneMesh(glCtx, 1.3, 1.3);
  const triangleShardMesh = createTriangleShardMesh(glCtx);
  const ringMesh = createRingMesh(glCtx);
  const coneMesh = createConeMesh(glCtx, 0.22, 1.25, 32);
  const maneMesh = createManeMesh(glCtx, 36);
  const starfieldMesh = createStarfieldMesh(glCtx, 1500);

  let currentLevelIndex = 0;
  let track = new TrackEngine(10.5, 35, LEVELS[currentLevelIndex]);
  let trackMesh = track.buildTrackMesh(glCtx);

  const INITIAL_LANE_ENERGIES = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  let laneEnergy = [...INITIAL_LANE_ENERGIES];
  let targetLaneEnergy = [...INITIAL_LANE_ENERGIES];
  const laneEnergyBuffer = new Float32Array(7);

  let nextNeutralJumpRollDir = -1;

  let player = {
    distance: 0,
    lateral: 0,
    targetLateral: 0,
    tilt: 0,
    jumpRollAngle: 0,
    jumpRollTime: 0,
    jumpRollDuration: 0.78,
    jumpRollDirection: -1,
    y: 0,
    vy: 0,
    isJumping: false,
    isFalling: false,
    fallTime: 0,
    fallSpin: 0,
    fallStartDistance: 0,
    fallStartLateral: 0,
    speed: LEVELS[0].speed,
    baseSpeed: LEVELS[0].speed,
    starsCollectedCount: 0,
    shieldActive: false,
    isDashing: false,
    dashTime: 0,
  };

  let obstacleShards = [];

  function spawnObstacleShards(obs, count, isShield) {
    const spread = isShield ? 1.4 : 1.2;
    const speedMult = isShield ? 1.2 : 1.0;
    const life = isShield ? 1.4 : 1.0;
    for (let k = 0; k < count; k++) {
      const localLat = (random() - 0.5) * spread;
      const localHeight = 0.45 + (random() - 0.5) * spread;
      const localDist = (random() - 0.5) * (spread + 0.8);
      obstacleShards.push({
        distance: obs.distance + localDist,
        lateral: (obs.lane - 3) * 1.5 + localLat,
        height: localHeight,
        vDistance: (random() - 0.5) * 15 * speedMult,
        vLateral: localLat * 6 * speedMult + (random() - 0.5) * 8 * speedMult,
        vHeight: (localHeight - 0.45) * 6 * speedMult + random() * 6 * speedMult + 2 * speedMult,
        rotX: random() * TAU,
        rotY: random() * TAU,
        rotZ: random() * TAU,
        vRotX: (random() - 0.5) * 14 * speedMult,
        vRotY: (random() - 0.5) * 14 * speedMult,
        vRotZ: (random() - 0.5) * 14 * speedMult,
        color: obs.color || [0.1, 0.85, 1.0],
        life,
        maxLife: life
      });
    }
  }

  const PICKUP_POINTS = 90;
  let score = 0;

  let lives = 3;
  const MAX_LIVES = 3;
  let dashCooldown = 0;
  const DASH_COOLDOWN = 3.5;
  let dashIntensity = 0;
  const SLOW_MOTION_DURATION = 0.85;
  let slowMotionTimer = 0;
  let slowMotionIntensity = 0;
  let gameOver = false;
  let levelComplete = false;
  let mouseSteerOffset = 0;
  let lastPointerX = null;

  const RESPAWN_FREEZE_TIME = 1.8;
  const RESPAWN_ACCEL_TIME = 2.2;
  const RESPAWN_START_SPEED = 6.5;
  let levelCountdown = 0;
  const countdownDisplay = document.getElementById('count');
  let respawnFreezeTimer = 0;
  let respawnAccelTimer = 0;

  function updateLivesDisplay() {
    const el = document.getElementById('lives');
    if (!el) return;
    let html = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      if (i < lives) {
        html += '<span>❤️</span>';
      } else {
        html += '<span style="opacity: 0.22;">❤️</span>';
      }
    }
    el.innerHTML = html;
  }
  updateLivesDisplay();

  const FOG_NEAR = 30.0;
  const FOG_FAR = 180.0;
  const FOG_COLOR = [0.012, 0.005, 0.025];

  const projMatrix = mat4Create();
  const viewMatrix = mat4Create();
  const modelMatrix = mat4Create();
  const bodyMatrix = mat4Create();
  const hornMatrix = mat4Create();
  const maneMatrix = mat4Create();
  const eyeVec = [0, 0, 0];
  const targetVec = [0, 0, 0];

  const floatingTooltips = [];
  const tipElements = new Map();
  const tipsContainer = document.getElementById('tips');

  const hudPower = document.getElementById('power');
  const hudLevel = document.getElementById('level');
  const progressFill = document.getElementById('fill');
  function updateHud() {
    const power = dashCooldown <= 0 ? 'READY' : `${dashCooldown.toFixed(1)}s`;
    if (hudPower && hudPower.textContent !== power) {
      hudPower.textContent = power;
      hudPower.style.color = dashCooldown <= 0 ? '#f472b6' : '#f9a8d4';
    }
    const level = `${currentLevelIndex + 1} / ${LEVELS.length}`;
    if (hudLevel && hudLevel.textContent !== level) hudLevel.textContent = level;
    const progress = min(100, max(0, player.distance / LEVELS[currentLevelIndex].targetDistance * 100));
    const height = `${progress.toFixed(1)}%`;
    if (progressFill && progressFill.style.height !== height) progressFill.style.height = height;
  }

  function project3DtoScreen(x, y, z, view, proj, width, height) {
    const vx = view[0]*x + view[4]*y + view[8]*z + view[12];
    const vy = view[1]*x + view[5]*y + view[9]*z + view[13];
    const vz = view[2]*x + view[6]*y + view[10]*z + view[14];
    const vw = view[3]*x + view[7]*y + view[11]*z + view[15];

    const px = proj[0]*vx + proj[4]*vy + proj[8]*vz + proj[12]*vw;
    const py = proj[1]*vx + proj[5]*vy + proj[9]*vz + proj[13]*vw;
    const pw = proj[3]*vx + proj[7]*vy + proj[11]*vz + proj[15]*vw;

    if (pw <= 0 || vz > 0) return null;
    const ndcX = px / pw;
    const ndcY = py / pw;

    if (abs(ndcX) > 1.5 || abs(ndcY) > 1.5) return null;

    const screenX = (ndcX * 0.5 + 0.5) * width;
    const screenY = (1.0 - (ndcY * 0.5 + 0.5)) * height;
    return { x: screenX, y: screenY };
  }

  const keys = {};

  let gameStarted = false;

  const rainbowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];

  function drawRainbowArch(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = 2;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h - 24;
    const innerRadius = 55;
    const outerRadius = 115;
    const totalLevels = LEVELS.length;
    const numLanes = 7;

    const maxDisplayedLevel = min(totalLevels, currentLevelIndex + 1);
    for (let i = 0; i < maxDisplayedLevel; i++) {
      const angleStart = PI + (i / totalLevels) * PI;
      const angleEnd = PI + ((i + 1) / totalLevels) * PI;
      const isSelected = (i === currentLevelIndex);

      const laneWidth = (outerRadius - innerRadius) / numLanes;
      for (let l = 0; l < numLanes; l++) {
        const r1 = innerRadius + l * laneWidth;
        const r2 = innerRadius + (l + 1) * laneWidth;

        ctx.beginPath();
        ctx.arc(cx, cy, r2, angleStart, angleEnd, false);
        ctx.arc(cx, cy, r1, angleEnd, angleStart, true);
        ctx.closePath();

        ctx.fillStyle = rainbowColors[l % rainbowColors.length];
        ctx.globalAlpha = isSelected ? 1.0 : 0.7;
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1.0;
    }

    function drawCloud(x, y) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 15, y, 18, 0, TAU);
      ctx.arc(x + 15, y - 8, 22, 0, TAU);
      ctx.arc(x + 35, y, 15, 0, TAU);
      ctx.closePath();
      ctx.fill();
    }

    drawCloud(cx - 85, cy);
    drawCloud(cx + 85, cy);

    ctx.restore();
  }

  drawRainbowArch(document.getElementById('start-art'));

  function startGame(e) {
    gameStarted = true;
    frameLoop.start();
    if (e && e.clientX !== undefined) {
      mouseSteerOffset = max(-1.0, min(1.0, ((e.clientX / window.innerWidth) * 2 - 1) * 1.05));
      lastPointerX = e.clientX;
    } else {
      mouseSteerOffset = 0;
      lastPointerX = null;
    }
    player.targetLateral = 0;
    player.lateral = 0;
    player.tilt = 0;
    const introScreen = document.getElementById('intro');
    if (introScreen) introScreen.style.display = 'none';
    playBoostSound();
    updateMusicLevel(currentLevelIndex);
    startSynthwaveMusic();
  }

  document.getElementById('start').addEventListener('click', startGame);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!gameStarted) {
        startGame();
      } else if (!gameOver) {
        jump();
      }
    } else if (e.code === 'KeyE') {
      e.preventDefault();
      triggerDash();
    }
  });

  function inputLocked() {
    return gameOver || levelComplete || levelCountdown > 0 || respawnFreezeTimer > 0 || player.isFalling;
  }

  function triggerDash() {
    if (inputLocked() || dashCooldown > 0) return;
    dashCooldown = DASH_COOLDOWN;
    player.isDashing = true;
    player.dashTime = 0.38;
    playDashSound();
  }

  const MAX_TILT_ANGLE = 25.0;
  window.addEventListener('deviceorientation', (e) => {
    if (inputLocked()) return;
    if (e.gamma !== null && e.gamma !== undefined) {
      player.targetLateral = max(-1.0, min(1.0, e.gamma / MAX_TILT_ANGLE));
      mouseSteerOffset = 0;
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (inputLocked()) return;
    if (e.pointerType === 'mouse') {
      const rawNormX = max(-1.0, min(1.0, ((e.clientX / window.innerWidth) * 2 - 1) * 1.05));
      if (abs(mouseSteerOffset) > 0.001) {
        const dx = lastPointerX !== null ? (e.clientX - lastPointerX) : (e.movementX || 0);
        const distNorm = abs(dx) / (window.innerWidth * 0.35);
        mouseSteerOffset = lerp(mouseSteerOffset, 0, min(1.0, distNorm * 3.0));
        if (abs(mouseSteerOffset) < 0.005) mouseSteerOffset = 0;
      }
      lastPointerX = e.clientX;

      const effectiveNormX = rawNormX - mouseSteerOffset;
      player.targetLateral = max(-1.0, min(1.0, effectiveNormX));
    }
  });

  window.addEventListener('pointerdown', (e) => {
    if (inputLocked()) return;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission();
    }

    if (!gameStarted) {
      startGame(e);
    } else {
      jump();
    }
  });

  (document.getElementById('restart'))?.addEventListener('click', (e) => {
    mouseSteerOffset = 0;
    lastPointerX = e ? e.clientX : null;
    restartGame();
  });

  function resetLaneEnergy() {
    laneEnergy = [...INITIAL_LANE_ENERGIES];
    targetLaneEnergy = [...INITIAL_LANE_ENERGIES];
  }

  function selectLevel(idx, resetShield = false, isRespawn = false) {
    const validIdx = max(0, min(idx, LEVELS.length - 1));
    levelCountdown = validIdx > currentLevelIndex ? 3 : 0;
    currentLevelIndex = validIdx;
    floatingTooltips.length = 0;
    dashIntensity = 0;
    slowMotionTimer = 0;
    slowMotionIntensity = 0;
    const nextLevel = LEVELS[currentLevelIndex];
    track = new TrackEngine(10.5, 35, nextLevel);
    trackMesh = track.buildTrackMesh(glCtx, trackMesh);
    player.distance = 0;
    player.baseSpeed = nextLevel.speed;
    player.speed = isRespawn ? 0 : nextLevel.speed;
    player.y = 0;
    player.vy = 0;
    player.isJumping = false;
    player.isFalling = false;
    player.fallTime = 0;
    player.fallSpin = 0;
    player.fallStartDistance = 0;
    player.fallStartLateral = 0;
    player.tilt = 0;
    player.jumpRollAngle = 0;
    player.jumpRollTime = 0;

    updateHud();
    respawnFreezeTimer = isRespawn ? RESPAWN_FREEZE_TIME : 0;
    respawnAccelTimer = isRespawn ? RESPAWN_ACCEL_TIME : 0;

    player.lateral = 0;
    player.targetLateral = 0;
    if (resetShield) player.shieldActive = false;
    resetLaneEnergy();

    if (!isRespawn && levelCountdown === 0) {
      playBoostSound();
    }
  }

  function jump() {
    if (inputLocked()) return;
    if (!player.isJumping) {
      player.isJumping = true;
      player.vy = 12.5;

      const lateralDelta = player.targetLateral - player.lateral;
      if (keys['KeyA'] || keys['ArrowLeft'] || lateralDelta < -0.04) {
        player.jumpRollDirection = 1;
        nextNeutralJumpRollDir = -1;
      } else if (keys['KeyD'] || keys['ArrowRight'] || lateralDelta > 0.04) {
        player.jumpRollDirection = -1;
        nextNeutralJumpRollDir = 1;
      } else {
        player.jumpRollDirection = nextNeutralJumpRollDir;
        nextNeutralJumpRollDir = -nextNeutralJumpRollDir;
      }

      player.jumpRollTime = 0;
      player.jumpRollDuration = (2 * 12.5) / 32;
      player.jumpRollAngle = 0;

      playJumpSwoosh();
    }
  }

  function restartGame() {
    stopSynthwaveMusic();
    currentLevelIndex = 0;
    updateMusicLevel(0);
    lives = MAX_LIVES;
    updateLivesDisplay();
    selectLevel(0, true, false);
    score = 0;

    dashCooldown = 0;
    player.isDashing = false;
    player.dashTime = 0;
    player.starsCollectedCount = 0;
    gameOver = false;
    levelComplete = false;
    obstacleShards = [];
    (document.getElementById('end'))?.classList.remove('active');
    randomizeMetaballBorders();
    startSynthwaveMusic();
    frameLoop.start();
  }

  const METABALL_BORDER_PALETTE = [
    '#00f5ff',
    '#ff2d88',
    '#a855f7',
    '#ffaa00',
    '#00ff99',
    '#38bdf8',
    '#ff4757',
    '#ffffff',
    '#ffd32a',
    '#70a1ff',
  ];

  function randomizeMetaballBorders() {
    const hollowBalls = document.querySelectorAll('.r');
    if (hollowBalls && hollowBalls.length > 0) {
      hollowBalls.forEach((ball, idx) => {
        const color = METABALL_BORDER_PALETTE[(idx + floor(random() * METABALL_BORDER_PALETTE.length)) % METABALL_BORDER_PALETTE.length];
        ball.style.borderColor = color;
      });
    }

    const filledColorBalls = document.querySelectorAll('.c');
    if (filledColorBalls && filledColorBalls.length > 0) {
      filledColorBalls.forEach((ball, idx) => {
        const color = METABALL_BORDER_PALETTE[(idx + 3 + floor(random() * METABALL_BORDER_PALETTE.length)) % METABALL_BORDER_PALETTE.length];
        ball.style.backgroundColor = color;
        ball.style.border = 'none';
      });
    }
  }

  randomizeMetaballBorders();

  function showEndScreen(heading, completed) {
    document.getElementById('heading').textContent = heading;
    document.getElementById('score-key').textContent = levelComplete ? 'Total Score: ' : 'Final Score: ';
    document.getElementById('score').textContent = floor(score).toLocaleString();
    document.getElementById('restart').hidden = levelComplete;
    document.getElementById('next').hidden = !levelComplete;
    document.getElementById('win-art').hidden = !completed;
    if (completed) drawRainbowArch(document.getElementById('win-canvas'));
    document.getElementById('end').classList.add('active');
  }

  function triggerLevelComplete() {
    if (gameOver || levelComplete) return;
    if (currentLevelIndex >= LEVELS.length - 1) {
      triggerGameOver(true);
      return;
    }
    levelComplete = true;
    stopSynthwaveMusic();
    playTaaDaaSound();
    showEndScreen(`LEVEL ${currentLevelIndex + 1} COMPLETE!`, true);
    document.getElementById('next').focus();
  }

  document.getElementById('next').addEventListener('click', () => {
    if (!levelComplete) return;
    levelComplete = false;
    document.getElementById('end').classList.remove('active');
    updateMusicLevel(currentLevelIndex + 1);
    selectLevel(currentLevelIndex + 1, false);
    randomizeMetaballBorders();
    startSynthwaveMusic();
    frameLoop.start();
    document.getElementById('next').blur();
  });

  function handlePlayerDeath() {
    if (gameOver) return;

    lives--;
    updateLivesDisplay();

    if (lives > 0) {
      mouseSteerOffset = 0;
      lastPointerX = null;
      playCrashSound();
      selectLevel(currentLevelIndex, true, true);

      dashCooldown = 0;
      player.isDashing = false;
      player.dashTime = 0;
      obstacleShards = [];
    } else {
      player.isFalling = false;
      player.fallTime = 0;
      player.fallSpin = 0;
      player.fallStartDistance = 0;
      player.fallStartLateral = 0;
      triggerGameOver();
    }
  }

  function triggerGameOver(completed = false) {
    if (gameOver) return;
    gameOver = true;
    player.speed = 0;
    stopSynthwaveMusic();

    if (completed) playTaaDaaSound();
    else playAllLivesLostSound();

    document.getElementById('restart').textContent = 'Play Again';
    showEndScreen(completed ? 'Congratulations! You completed the Unicorn Dream!' : 'GAME OVER', completed);
  }

  function resize() {
    const dpr = min(window.devicePixelRatio || 1, 1.5);
    const displayWidth = floor(canvas.clientWidth * dpr);
    const displayHeight = floor(canvas.clientHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    glCtx.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', () => {
    resize();
    if (!document.hidden) frameLoop.start();
  });
  resize();

  function startFall() {
    player.isFalling = true;
    player.isJumping = false;
    player.fallTime = player.fallSpin = 0;
    player.fallStartDistance = player.distance;
    player.fallStartLateral = player.lateral;
    player.vy = -4.5;
    playCrashSound();
  }

  function trackPosition(sample, lateral, height) {
    const out = [];
    for (let i = 0; i < 3; i++) out[i] = sample.pos[i] + sample.right[i] * lateral + sample.up[i] * height;
    return out;
  }

  function drawMesh(mesh) {
    glCtx.drawElements(glCtx.TRIANGLES, mesh.indexCount, glCtx.UNSIGNED_SHORT, 0);
  }

  function update(dt) {
    if (!gameStarted || gameOver || levelComplete || levelCountdown > 0) return false;

    if (respawnFreezeTimer > 0) {
      const prevFreeze = respawnFreezeTimer;
      respawnFreezeTimer = max(0, respawnFreezeTimer - dt);
      player.targetLateral = 0;
      player.lateral = 0;
      player.tilt = 0;
      player.y = 0;
      player.vy = 0;
      player.isJumping = false;
      player.isFalling = false;

      if (prevFreeze > 0 && respawnFreezeTimer === 0) {
        playBoostSound();
      }
    } else if (!player.isFalling) {
      if (keys['KeyA'] || keys['ArrowLeft']) {
        player.targetLateral -= 2.2 * dt;
        mouseSteerOffset = 0;
      }
      if (keys['KeyD'] || keys['ArrowRight']) {
        player.targetLateral += 2.2 * dt;
        mouseSteerOffset = 0;
      }
      player.targetLateral = max(-1.0, min(1.0, player.targetLateral));

      if (abs(mouseSteerOffset) > 0.001) {
        mouseSteerOffset = lerp(mouseSteerOffset, 0, 0.8 * dt);
        if (abs(mouseSteerOffset) < 0.005) mouseSteerOffset = 0;
      }

      player.lateral = lerp(player.lateral, player.targetLateral, 14 * dt);

      // Steer left -> rolls left (positive angle around local forward Z axis)
      // Steer right -> rolls right (negative angle around local forward Z axis)
      let steerDemand = (player.targetLateral - player.lateral) * 2.4;
      if (keys['KeyA'] || keys['ArrowLeft']) steerDemand -= 0.45;
      if (keys['KeyD'] || keys['ArrowRight']) steerDemand += 0.45;

      const targetTilt = -max(-0.46, min(0.46, steerDemand));
      player.tilt = lerp(player.tilt, targetTilt, 12 * dt);
    }

    if (player.isDashing) {
      player.dashTime -= dt;
      if (player.dashTime <= 0) {
        player.isDashing = false;
      }
    }

    const targetDash = player.isDashing ? 1.0 : 0.0;
    dashIntensity = lerp(dashIntensity, targetDash, (player.isDashing ? 20.0 : 7.0) * dt);
    if (dashIntensity < 0.0005) dashIntensity = 0;

    if (dashCooldown > 0) {
      dashCooldown = max(0, dashCooldown - dt);
    }

    if (respawnFreezeTimer > 0) {
      player.speed = 0;
    } else if (respawnAccelTimer > 0) {
      respawnAccelTimer = max(0, respawnAccelTimer - dt);
      const accelProgress = 1.0 - (respawnAccelTimer / RESPAWN_ACCEL_TIME);
      const ease = accelProgress * accelProgress * (3.0 - 2.0 * accelProgress);
      const startSpeed = RESPAWN_START_SPEED;
      const targetSpeed = player.baseSpeed + min(25, player.distance * 0.008);
      player.speed = startSpeed + (targetSpeed - startSpeed) * ease;
    } else {
      player.speed = player.baseSpeed + min(25, player.distance * 0.008);
    }

    const effectiveSpeed = player.isFalling ? player.speed * 0.2 : (player.isDashing ? player.speed * 2.3 : player.speed);
    // Distance is the path parameter; compensate for bends to keep world speed steady.
    player.distance += effectiveSpeed * dt / hypot(...track.sampleTrack(player.distance).tangent);

    for (let i = obstacleShards.length - 1; i >= 0; i--) {
      const s = obstacleShards[i];
      s.distance += s.vDistance * dt;
      s.lateral += s.vLateral * dt;
      s.height += s.vHeight * dt;
      s.vHeight -= 9.8 * dt;
      s.rotX += s.vRotX * dt;
      s.rotY += s.vRotY * dt;
      s.rotZ += s.vRotZ * dt;
      s.life -= dt * 1.0;
      if (s.life <= 0) {
        obstacleShards.splice(i, 1);
      }
    }

    if (player.isJumping || player.isFalling) {
      if (player.isFalling) {
        player.fallTime += dt;
        player.fallSpin += 5.5 * dt;
        player.vy -= 22.0 * dt;
        player.y += player.vy * dt;

        if (player.fallTime >= 0.7) {
          player.isFalling = false;
          handlePlayerDeath();
          return false;
        }
      } else {
        player.vy -= 32 * dt;
        player.y += player.vy * dt;

        player.jumpRollTime += dt;
        const progress = min(1.0, player.jumpRollTime / player.jumpRollDuration);
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - (-2 * progress + 2) ** 3 / 2;
        player.jumpRollAngle = player.jumpRollDirection * TAU * ease;

        if (player.y <= 0) {
          player.y = 0;
          player.vy = 0;
          player.isJumping = false;
          player.jumpRollAngle = 0;
          player.jumpRollTime = 0;
        }
      }
    } else {
      if (abs(player.jumpRollAngle) > 0.001) {
        player.jumpRollAngle = lerp(player.jumpRollAngle, 0, 15 * dt);
      } else {
        player.jumpRollAngle = 0;
      }
    }

    for (let i = 0; i < 7; i++) {
      if (respawnFreezeTimer <= 0) {
        targetLaneEnergy[i] = max(0, targetLaneEnergy[i] - 0.038 * dt);
      }

      if (laneEnergy[i] < targetLaneEnergy[i]) {
        laneEnergy[i] = min(targetLaneEnergy[i], laneEnergy[i] + 1.35 * dt);
      } else if (laneEnergy[i] > targetLaneEnergy[i]) {
        laneEnergy[i] = max(targetLaneEnergy[i], laneEnergy[i] - 1.0 * dt);
      } else {
        laneEnergy[i] = targetLaneEnergy[i];
      }

    }

    const currentLane = track.laneAtLateral(player.lateral);
    updatePlayerLane(currentLane);

    if (!player.isJumping && !player.isFalling && !player.isDashing && respawnFreezeTimer <= 0) {
      if (laneEnergy[currentLane] <= 0.01 || abs(player.lateral) > 1.25) {
        startFall();
      }
    }

    const sample = track.sampleTrack(player.distance);
    const playerLatWorld = player.lateral * track.playerLateralRange;
    const playerWorldX = sample.pos[0] + sample.right[0] * playerLatWorld + sample.up[0] * (0.45 + player.y);
    const playerWorldY = sample.pos[1] + sample.right[1] * playerLatWorld + sample.up[1] * (0.45 + player.y);
    const playerWorldZ = sample.pos[2] + sample.right[2] * playerLatWorld + sample.up[2] * (0.45 + player.y);

    if (!player.isFalling) {
      for (const star of track.stars) {
        if (star.collected) continue;
        const zDiff = abs(star.distance - player.distance);
        if (zDiff < 2.0) {
          const starSample = track.sampleTrack(star.distance);
          const starLatWorld = (star.lane - 3) * 1.5;
          const starWorldX = starSample.pos[0] + starSample.right[0] * starLatWorld + starSample.up[0] * 0.6;
          const starWorldY = starSample.pos[1] + starSample.right[1] * starLatWorld + starSample.up[1] * 0.6;
          const starWorldZ = starSample.pos[2] + starSample.right[2] * starLatWorld + starSample.up[2] * 0.6;

          const dist = hypot(
            playerWorldX - starWorldX,
            playerWorldY - starWorldY,
            playerWorldZ - starWorldZ
          );

          if (dist < 1.4) {
            star.collected = true;
            // Target Refill Lane Energy for the lane matching the star's color!
            const targetColorLane = star.colorLane !== undefined ? star.colorLane : star.lane;
            targetLaneEnergy[targetColorLane] = min(1.0, targetLaneEnergy[targetColorLane] + 0.15);
            score += PICKUP_POINTS;

            playBonusPickupSound();
            playStarChime(targetColorLane);

            floatingTooltips.push({
              x: playerWorldX,
              y: playerWorldY + 1.2,
              z: playerWorldZ,
              text: `+${PICKUP_POINTS}`,
              life: 1.5,
              maxLife: 1.5
            });

            // Shield Charge Mechanism: Every 5 stars charges an Energy Shield!
            player.starsCollectedCount++;
            if (player.starsCollectedCount >= 5 && !player.shieldActive) {
              player.starsCollectedCount = 0;
              player.shieldActive = true;
              playShieldSound();
            }
          }
        }
      }
    }

    for (let i = track.obstacles.length - 1; i >= 0; i--) {
      const obs = track.obstacles[i];
      if (abs(obs.distance - player.distance) < 1.8) {
        const obsSample = track.sampleTrack(obs.distance);
        const obsLatWorld = (obs.lane - 3) * 1.5;
        const obsWorldX = obsSample.pos[0] + obsSample.right[0] * obsLatWorld + obsSample.up[0] * 0.45;
        const obsWorldY = obsSample.pos[1] + obsSample.right[1] * obsLatWorld + obsSample.up[1] * 0.45;
        const obsWorldZ = obsSample.pos[2] + obsSample.right[2] * obsLatWorld + obsSample.up[2] * 0.45;

        const dist = hypot(
          playerWorldX - obsWorldX,
          playerWorldY - obsWorldY,
          playerWorldZ - obsWorldZ
        );

        if (!player.isFalling && dist < 1.1 && player.y < 0.65) {
          if (player.shieldActive) {
            slowMotionTimer = SLOW_MOTION_DURATION;
            slowMotionIntensity = 1.0;
            playSlowMotionSound();

            player.shieldActive = false;
            playGlassShatterSound();
            spawnObstacleShards(obs, 32, true);
            track.obstacles.splice(i, 1);
          } else {
            spawnObstacleShards(obs, 24, false);
            playCrashSound();
            handlePlayerDeath();
            return false;
          }
        }
      }
    }

    const currentLevel = LEVELS[currentLevelIndex];
    if (player.distance >= currentLevel.targetDistance) {
      triggerLevelComplete();
    }

    for (let i = floatingTooltips.length - 1; i >= 0; i--) {
      const tip = floatingTooltips[i];
      tip.life -= dt;
      if (tip.life <= 0) {
        floatingTooltips.splice(i, 1);
      }
    }
  }

  function setMushroomMatrix(star, time) {
    const starSample = track.sampleTrack(star.distance);
    const lateralOffset = (star.lane - 3) * 1.5;
    const heightOffset = 0.8 + sin(time * 0.004 + star.distance) * 0.15;
    const starPos = trackPosition(starSample, lateralOffset, heightOffset);

    const inclineDir = (star.distance * 0.73 + star.lane * 1.618) % TAU;
    const inclineTilt = 0.38 + 0.10 * sin(star.distance * 0.31);

    mat4Identity(modelMatrix);
    mat4Translate(modelMatrix, modelMatrix, starPos[0], starPos[1], starPos[2]);
    mat4RotateY(modelMatrix, modelMatrix, inclineDir);
    mat4RotateZ(modelMatrix, modelMatrix, inclineTilt);
    mat4RotateY(modelMatrix, modelMatrix, (time * 0.003) * 1.2 + star.distance);
    mat4Scale(modelMatrix, modelMatrix, 0.7, 0.7, 0.7);
  }

  function setShaderCamera(shader) {
    glCtx.uniformMatrix4fv(shader.uniforms.view, false, viewMatrix);
    glCtx.uniformMatrix4fv(shader.uniforms.projection, false, projMatrix);
  }

  function setShaderFog(shader) {
    glCtx.uniform1f(shader.uniforms.fogNear, FOG_NEAR);
    glCtx.uniform1f(shader.uniforms.fogFar, FOG_FAR);
    glCtx.uniform3fv(shader.uniforms.fogColor, FOG_COLOR);
  }

  function render(time, rawDt) {
    if (levelCountdown > 0) {
      levelCountdown = max(0, levelCountdown - rawDt);
      if (levelCountdown === 0) playBoostSound();
    }

    let timeScale = 1.0;
    if (slowMotionTimer > 0) {
      slowMotionTimer = max(0, slowMotionTimer - rawDt);
      const progress = 1.0 - (slowMotionTimer / SLOW_MOTION_DURATION);
      timeScale = 0.20 + 0.80 * (progress * progress);
      slowMotionIntensity = max(0, slowMotionTimer / SLOW_MOTION_DURATION);
    } else {
      slowMotionIntensity = 0;
    }

    const dt = rawDt * timeScale;

    advanceSimulation(dt, update);
    countdownDisplay.textContent = levelCountdown > 0 ? Math.ceil(levelCountdown) : '';
    updateHud();
    // Clear Screen to 100% transparent so CSS gooey metaballs show through
    glCtx.clearColor(0.0, 0.0, 0.0, 0.0);
    glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);

    // Periodic time modulo for GPU shader uniforms to prevent float precision degradation
    const shaderTime = (time * 0.001) % 3600.0;

    const aspect = canvas.width / canvas.height;
    const fov = (PI / 3.0) + dashIntensity * 0.16 - slowMotionIntensity * 0.05;
    mat4Perspective(projMatrix, fov, aspect, 0.5, 350.0);

    // When player falls, camera holds position at track point where the fall began instead of following the falling character
    const camTrackDist = player.isFalling ? player.fallStartDistance : player.distance;
    const camTrackLateral = player.isFalling ? player.fallStartLateral : player.lateral;

    const currentSample = track.sampleTrack(camTrackDist);
    const lookAheadSample = track.sampleTrack(camTrackDist + 18.0);

    const camDist = 6.0 + dashIntensity * 0.8;
    const camHeight = 2.8 - dashIntensity * 0.25;
    const camLateral = camTrackLateral * 3.2;

    eyeVec[0] = currentSample.pos[0] - currentSample.forward[0] * camDist + currentSample.up[0] * camHeight + currentSample.right[0] * camLateral;
    eyeVec[1] = currentSample.pos[1] - currentSample.forward[1] * camDist + currentSample.up[1] * camHeight + currentSample.right[1] * camLateral;
    eyeVec[2] = currentSample.pos[2] - currentSample.forward[2] * camDist + currentSample.up[2] * camHeight + currentSample.right[2] * camLateral;

    if (dashIntensity > 0.01) {
      const shakeX = (random() - 0.5) * 0.035 * dashIntensity;
      const shakeY = (random() - 0.5) * 0.025 * dashIntensity;
      eyeVec[0] += shakeX;
      eyeVec[1] += shakeY;
    }

    if (slowMotionIntensity > 0.02) {
      const smShakeX = (sin(time * 0.08) + (random() - 0.5) * 0.4) * 0.06 * slowMotionIntensity;
      const smShakeY = (cos(time * 0.07) + (random() - 0.5) * 0.4) * 0.05 * slowMotionIntensity;
      eyeVec[0] += smShakeX;
      eyeVec[1] += smShakeY;
    }

    targetVec[0] = lookAheadSample.pos[0] + lookAheadSample.right[0] * camLateral + lookAheadSample.up[0] * 0.8;
    targetVec[1] = lookAheadSample.pos[1] + lookAheadSample.right[1] * camLateral + lookAheadSample.up[1] * 0.8;
    targetVec[2] = lookAheadSample.pos[2] + lookAheadSample.right[2] * camLateral + lookAheadSample.up[2] * 0.8;

    mat4LookAt(viewMatrix, eyeVec, targetVec, currentSample.up);

    const warpOverlay = document.getElementById('warp');
    if (warpOverlay) {
      warpOverlay.style.opacity = (dashIntensity * 0.85).toFixed(3);
    }
    const slowmoOverlay = document.getElementById('impact');
    if (slowmoOverlay) {
      slowmoOverlay.style.opacity = (slowMotionIntensity * 0.85).toFixed(3);
    }

    glCtx.enable(glCtx.BLEND);
    glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE);
    glCtx.depthMask(false);

    glCtx.useProgram(starfieldShader.program);
    setShaderCamera(starfieldShader);
    glCtx.uniform3fv(starfieldShader.uniforms.cameraPos, eyeVec);
    glCtx.uniform1f(starfieldShader.uniforms.time, shaderTime);
    if (starfieldShader.uniforms.dash) {
      glCtx.uniform1f(starfieldShader.uniforms.dash, dashIntensity);
    }

    glCtx.bindVertexArray(starfieldMesh.vao);
    glCtx.drawArrays(glCtx.POINTS, 0, starfieldMesh.vertexCount);

    glCtx.depthMask(true);
    glCtx.disable(glCtx.BLEND);

    glCtx.useProgram(trackShader.program);
    mat4Identity(modelMatrix);

    glCtx.uniformMatrix4fv(trackShader.uniforms.model, false, modelMatrix);
    setShaderCamera(trackShader);
    glCtx.uniform1f(trackShader.uniforms.time, shaderTime);
    setShaderFog(trackShader);
    if (trackShader.uniforms.dash) {
      glCtx.uniform1f(trackShader.uniforms.dash, dashIntensity);
    }

    if (trackShader.uniforms.laneEnergyArray) {
      laneEnergyBuffer.set(laneEnergy);
      glCtx.uniform1fv(trackShader.uniforms.laneEnergyArray, laneEnergyBuffer);
    }

    glCtx.bindVertexArray(trackMesh.vao);
    glCtx.drawElements(glCtx.TRIANGLES, trackMesh.indexCount, glCtx.UNSIGNED_INT, 0);

    glCtx.useProgram(objectShader.program);
    setShaderCamera(objectShader);
    glCtx.uniform3fv(objectShader.uniforms.lightDirection, [0.4, 0.8, 0.5]);
    glCtx.uniform3fv(objectShader.uniforms.ambientColor, [0.35, 0.35, 0.45]);
    glCtx.uniform3fv(objectShader.uniforms.lightColor, [0.95, 0.95, 1.0]);
    setShaderFog(objectShader);
    glCtx.uniform1f(objectShader.uniforms.alpha, 1.0);

    glCtx.bindVertexArray(mushroomStemMesh.vao);
    glCtx.uniform1f(objectShader.uniforms.glow, 0.3);
    glCtx.uniform3fv(objectShader.uniforms.color, [0.52, 0.54, 0.58]);

    for (const star of track.stars) {
      if (star.collected) continue;
      if (star.distance < player.distance - 20 || star.distance > player.distance + 150) continue;

      setMushroomMatrix(star, time);

      glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, modelMatrix);
      drawMesh(mushroomStemMesh);
    }

    glCtx.uniform1i(objectShader.uniforms.spots, 1);
    glCtx.uniform1f(objectShader.uniforms.glow, 0.85);

    glCtx.bindVertexArray(mushroomCapMesh.vao);

    for (const star of track.stars) {
      if (star.collected) continue;
      if (star.distance < player.distance - 20 || star.distance > player.distance + 150) continue;

      setMushroomMatrix(star, time);

      glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, modelMatrix);
      glCtx.uniform3fv(objectShader.uniforms.color, star.color);
      drawMesh(mushroomCapMesh);
    }

    glCtx.uniform1i(objectShader.uniforms.spots, 0);

    glCtx.useProgram(objectShader.program);
    glCtx.bindVertexArray(planeMesh.vao);
    glCtx.uniform1f(objectShader.uniforms.glow, 0.4);

    for (const obs of track.obstacles) {
      if (obs.distance < player.distance - 20 || obs.distance > player.distance + 150) continue;

      const obsSample = track.sampleTrack(obs.distance);
      const lateralOffset = (obs.lane - 3) * 1.5;
      const heightOffset = 0.6;

      const obsPos = trackPosition(obsSample, lateralOffset, heightOffset);

      mat4Identity(modelMatrix);
      mat4Translate(modelMatrix, modelMatrix, obsPos[0], obsPos[1], obsPos[2]);

      // Billboarding: Align model matrix rotation with camera view rotation so plane faces camera
      modelMatrix[0] = viewMatrix[0]; modelMatrix[1] = viewMatrix[4]; modelMatrix[2] = viewMatrix[8]; modelMatrix[3] = 0;
      modelMatrix[4] = viewMatrix[1]; modelMatrix[5] = viewMatrix[5]; modelMatrix[6] = viewMatrix[9]; modelMatrix[7] = 0;
      modelMatrix[8] = viewMatrix[2]; modelMatrix[9] = viewMatrix[6]; modelMatrix[10]= viewMatrix[10];modelMatrix[11]= 0;

      mat4Scale(modelMatrix, modelMatrix, 1.2, 1.2, 1.2);

      glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, modelMatrix);
      glCtx.uniform3fv(objectShader.uniforms.color, obs.color || [0.1, 0.85, 1.0]);
      drawMesh(planeMesh);
    }

    if (obstacleShards.length > 0) {
      glCtx.enable(glCtx.BLEND);
      glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);
      glCtx.depthMask(false);
      glCtx.bindVertexArray(triangleShardMesh.vao);

      for (const s of obstacleShards) {
        if (s.distance < player.distance - 20 || s.distance > player.distance + 150) continue;
        const sample = track.sampleTrack(s.distance);
        const shardX = sample.pos[0] + sample.right[0] * s.lateral + sample.up[0] * s.height;
        const shardY = sample.pos[1] + sample.right[1] * s.lateral + sample.up[1] * s.height;
        const shardZ = sample.pos[2] + sample.right[2] * s.lateral + sample.up[2] * s.height;

        mat4Identity(modelMatrix);
        mat4Translate(modelMatrix, modelMatrix, shardX, shardY, shardZ);
        mat4RotateX(modelMatrix, modelMatrix, s.rotX);
        mat4RotateY(modelMatrix, modelMatrix, s.rotY);
        mat4RotateZ(modelMatrix, modelMatrix, s.rotZ);
        const scale = (s.life / s.maxLife) * 0.5;
        mat4Scale(modelMatrix, modelMatrix, scale, scale, scale);
        glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, modelMatrix);
        glCtx.uniform3fv(objectShader.uniforms.color, s.color || [0.1, 0.85, 1.0]);
        glCtx.uniform1f(objectShader.uniforms.alpha, s.life / s.maxLife);
        glCtx.uniform1f(objectShader.uniforms.glow, s.life * 0.8);
        drawMesh(triangleShardMesh);
      }

      glCtx.depthMask(true);
      glCtx.disable(glCtx.BLEND);
    }

    const pSample = track.sampleTrack(player.distance);
    const lateralOffset = player.lateral * track.playerLateralRange;
    const ballPos = trackPosition(pSample, lateralOffset, (0.58 + player.y));

    const right = pSample.right;
    const up = pSample.up;
    const forward = pSample.forward;

    mat4Identity(modelMatrix);
    modelMatrix[0] = right[0];   modelMatrix[1] = right[1];   modelMatrix[2] = right[2];   modelMatrix[3] = 0;
    modelMatrix[4] = up[0];      modelMatrix[5] = up[1];      modelMatrix[6] = up[2];      modelMatrix[7] = 0;
    modelMatrix[8] = forward[0]; modelMatrix[9] = forward[1]; modelMatrix[10] = forward[2]; modelMatrix[11] = 0;
    modelMatrix[12] = ballPos[0]; modelMatrix[13] = ballPos[1]; modelMatrix[14] = ballPos[2]; modelMatrix[15] = 1;

    if (abs(player.tilt) > 0.0005) {
      mat4RotateZ(modelMatrix, modelMatrix, player.tilt);
    }

    if (abs(player.jumpRollAngle) > 0.0005) {
      mat4RotateZ(modelMatrix, modelMatrix, player.jumpRollAngle);
    }

    if (player.isFalling) {
      mat4RotateX(modelMatrix, modelMatrix, player.fallSpin * 1.3);
      mat4RotateZ(modelMatrix, modelMatrix, player.fallSpin * 0.85);
    }

    const beatPhase = getMusicBeatPhase(time * 0.001);
    const beatAngle = beatPhase * TAU;
    const squishWave = cos(beatAngle);
    const squishFactor = squishWave * 0.024;

    let jumpStretchY = 1.0;
    let jumpSquashXZ = 1.0;
    if (player.isJumping) {
      const normVy = max(-1.0, min(1.0, player.vy / 12.0));
      jumpStretchY = 1.0 + normVy * 0.06;
      jumpSquashXZ = 1.0 - normVy * 0.03;
    }

    const bodyScaleX = (1.0 + squishFactor * 0.5) * jumpSquashXZ;
    const bodyScaleY = (1.0 - squishFactor) * jumpStretchY;
    const bodyScaleZ = (1.0 + squishFactor * 0.5) * jumpSquashXZ;

    const squishBob = -squishFactor * 0.012;
    mat4Translate(modelMatrix, modelMatrix, 0.0, squishBob, 0.0);

    // Blinking logic during respawn freeze (blinks slowly 3 times)
    let isPlayerModelVisible = !gameOver;
    if (respawnFreezeTimer > 0) {
      const elapsed = RESPAWN_FREEZE_TIME - respawnFreezeTimer;
      const cycleDuration = RESPAWN_FREEZE_TIME / 3.0;
      const cycleProgress = elapsed % cycleDuration;
      isPlayerModelVisible = cycleProgress < (cycleDuration * 0.5);
    }

    if (isPlayerModelVisible) {
      for (let m = 0; m < 16; m++) bodyMatrix[m] = modelMatrix[m];
      mat4Scale(bodyMatrix, bodyMatrix, bodyScaleX, bodyScaleY, bodyScaleZ);

      glCtx.bindVertexArray(sphereMesh.vao);
      glCtx.uniform1f(objectShader.uniforms.glow, 0.78 + squishFactor * 0.08);
      glCtx.uniform3fv(objectShader.uniforms.color, [1.0, 1.0, 1.0]);
      glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, bodyMatrix);
      drawMesh(sphereMesh);

      for (let m = 0; m < 16; m++) hornMatrix[m] = modelMatrix[m];
      mat4Translate(hornMatrix, hornMatrix, 0.0, 0.32 * bodyScaleY, 0.46 * bodyScaleZ);
      mat4RotateX(hornMatrix, hornMatrix, -0.38 - squishFactor * 0.08);

      glCtx.useProgram(hornShader.program);
      setShaderCamera(hornShader);
      glCtx.uniform3fv(hornShader.uniforms.lightDirection, [0.4, 0.8, 0.5]);
      glCtx.uniform3fv(hornShader.uniforms.ambientColor, [0.45, 0.45, 0.55]);
      glCtx.uniform3fv(hornShader.uniforms.lightColor, [1.0, 1.0, 1.0]);
      setShaderFog(hornShader);
      glCtx.uniform1f(hornShader.uniforms.height, 1.25);
      glCtx.uniform1f(hornShader.uniforms.time, shaderTime);
      glCtx.uniform1f(hornShader.uniforms.glow, 1.25 + squishFactor * 0.08);
      glCtx.uniformMatrix4fv(hornShader.uniforms.model, false, hornMatrix);

      glCtx.bindVertexArray(coneMesh.vao);
      drawMesh(coneMesh);

      for (let m = 0; m < 16; m++) maneMatrix[m] = modelMatrix[m];
      mat4Scale(maneMatrix, maneMatrix, bodyScaleX, bodyScaleY, bodyScaleZ);

      glCtx.useProgram(maneShader.program);
      setShaderCamera(maneShader);
      setShaderFog(maneShader);
      glCtx.uniform1f(maneShader.uniforms.time, shaderTime);
      glCtx.uniform1f(maneShader.uniforms.glow, 0.85 + squishFactor * 0.06);
      glCtx.uniform3fv(maneShader.uniforms.ambientColor, [0.35, 0.35, 0.45]);
      glCtx.uniformMatrix4fv(maneShader.uniforms.model, false, maneMatrix);

      glCtx.bindVertexArray(maneMesh.vao);
      drawMesh(maneMesh);

      if (player.shieldActive) {
        glCtx.enable(glCtx.BLEND);
        glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE);
        glCtx.depthMask(false);

        glCtx.useProgram(shieldShader.program);
        setShaderCamera(shieldShader);
        glCtx.uniform1f(shieldShader.uniforms.time, shaderTime);
        setShaderFog(shieldShader);

        glCtx.uniform3fv(shieldShader.uniforms.color, [0.12, 0.85, 1.0]);

        for (let m = 0; m < 16; m++) bodyMatrix[m] = modelMatrix[m];
        mat4Scale(bodyMatrix, bodyMatrix, 1.15, 1.15, 1.15);

        glCtx.uniformMatrix4fv(shieldShader.uniforms.model, false, bodyMatrix);
        glCtx.bindVertexArray(sphereMesh.vao);
        drawMesh(sphereMesh);

        glCtx.depthMask(true);
        glCtx.disable(glCtx.BLEND);
      }
    }

    const portalDist = LEVELS[currentLevelIndex].targetDistance;
    if (player.distance >= portalDist - 160 && player.distance <= portalDist + 20) {
      glCtx.useProgram(objectShader.program);
      setShaderCamera(objectShader);
      glCtx.uniform3fv(objectShader.uniforms.lightDirection, [0.4, 0.8, 0.5]);
      glCtx.uniform3fv(objectShader.uniforms.ambientColor, [0.4, 0.4, 0.5]);
      glCtx.uniform3fv(objectShader.uniforms.lightColor, [1.0, 1.0, 1.0]);
      setShaderFog(objectShader);

      glCtx.enable(glCtx.BLEND);
      glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE);
      glCtx.depthMask(false);

      glCtx.bindVertexArray(ringMesh.vao);

      const levelColor = LEVEL_PORTAL_COLORS[max(0, min(currentLevelIndex, LEVEL_PORTAL_COLORS.length - 1))];
      const ringCount = 6;
      const ringSpacing = 3.8;

      for (let i = 0; i < ringCount; i++) {
        const distOffset = (i - 2.5) * ringSpacing;
        const sample = track.sampleTrack(portalDist + distOffset);
        const ringPos = [
          sample.pos[0] + sample.up[0] * 2.8,
          sample.pos[1] + sample.up[1] * 2.8,
          sample.pos[2] + sample.up[2] * 2.8,
        ];

        const pulse = 1.0 + 0.06 * sin(time * 0.006 + i * 0.9);
        const scale = 2.2 * pulse;

        mat4Identity(modelMatrix);
        modelMatrix[0] = sample.right[0] * scale;
        modelMatrix[1] = sample.right[1] * scale;
        modelMatrix[2] = sample.right[2] * scale;
        modelMatrix[4] = sample.up[0] * scale;
        modelMatrix[5] = sample.up[1] * scale;
        modelMatrix[6] = sample.up[2] * scale;
        modelMatrix[8] = sample.forward[0] * scale;
        modelMatrix[9] = sample.forward[1] * scale;
        modelMatrix[10] = sample.forward[2] * scale;
        modelMatrix[12] = ringPos[0];
        modelMatrix[13] = ringPos[1];
        modelMatrix[14] = ringPos[2];

        const glowIntensity = 1.8 + 0.5 * sin(time * 0.007 + i * 1.1);
        glCtx.uniform1f(objectShader.uniforms.glow, glowIntensity);
        glCtx.uniform3fv(objectShader.uniforms.color, levelColor);
        glCtx.uniformMatrix4fv(objectShader.uniforms.model, false, modelMatrix);
        drawMesh(ringMesh);
      }

      glCtx.depthMask(true);
      glCtx.disable(glCtx.BLEND);
    }

    glCtx.bindVertexArray(null);

    syncTooltips(tipsContainer, tipElements, floatingTooltips, tip =>
      project3DtoScreen(tip.x, tip.y, tip.z, viewMatrix, projMatrix, canvas.clientWidth, canvas.clientHeight)
    );

  }

  const frameLoop = createFrameLoop({
    draw: render,
    isActive: () => gameStarted && !gameOver && !levelComplete && !document.hidden
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      frameLoop.stop();
      stopSynthwaveMusic();
      for (const key in keys) keys[key] = false;
    } else {
      frameLoop.start();
      if (gameStarted && !gameOver && !levelComplete) startSynthwaveMusic();
    }
  });
  if (!document.hidden) frameLoop.start();
