const { min, max, ceil, floor } = Math;

// Bound movement between collision checks, including frames delayed up to 100ms.
export function advanceSimulation(dt, update) {
  const steps = max(1, ceil(dt / (1 / 120)));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    if (update(step) === false) break;
  }
}

// Keep DOM elements until their tooltip expires or the game clears its tips.
export function syncTooltips(container, elements, tips, project) {
  if (!container) return;
  const active = new Set(tips);
  for (const [tip, el] of elements) {
    if (!active.has(tip)) {
      el.remove();
      elements.delete(tip);
    }
  }
  for (const tip of tips) {
    let el = elements.get(tip);
    if (!el) {
      el = container.ownerDocument.createElement('div');
      el.className = 'tip';
      el.textContent = tip.text;
      container.appendChild(el);
      elements.set(tip, el);
    }
    // Project once so camera movement cannot carry the text off screen.
    const position = tip.screenPosition ?? project(tip);
    el.hidden = !position;
    if (!position) continue;
    tip.screenPosition = position;
    const age = tip.maxLife - tip.life;
    el.style.left = `${position.x}px`;
    el.style.top = `${position.y - age * 12}px`;
    el.style.opacity = max(0, min(1, tip.life / 0.8));
  }
}

// Render at most 60 times per second, without tying simulation speed to refresh rate.
export function createFrameLoop({ draw, isActive, request = requestAnimationFrame,
  cancel = cancelAnimationFrame, now = () => performance.now() }) {
  const interval = 1000 / 60;
  let pending = null;
  let previous = 0;
  let lastDraw = 0;
  let elapsed = 0;
  function frame(time) {
    pending = null;
    elapsed += time - previous;
    previous = time;
    if (elapsed + 1e-6 >= interval) {
      elapsed = max(0, elapsed - floor((elapsed + 1e-6) / interval) * interval);
      const dt = min((time - lastDraw) / 1000, .1);
      lastDraw = time;
      draw(time, dt);
    }
    if (isActive()) pending = request(frame);
  }
  return {
    start() {
      if (pending !== null) return;
      previous = lastDraw = now();
      elapsed = interval;
      pending = request(frame);
    },
    stop() {
      if (pending !== null) cancel(pending);
      pending = null;
    }
  };
}
