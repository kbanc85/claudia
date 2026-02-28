/**
 * Claudia Brain v4 -- Camera modes
 *
 * 5 modes with auto-rotation and special effects.
 * Smooth transitions between modes. Pauses on user interaction.
 */

const MODES = {
  static:      { autoRotateSpeed: 0,   label: 'Static',       desc: 'No movement' },
  slowOrbit:   { autoRotateSpeed: 1.2, label: 'Slow Orbit',   desc: 'Gentle rotation' },
  cinematic:   { autoRotateSpeed: 0.5, label: 'Cinematic',    desc: 'Wide, slow arc' },
  gentleDrift: { autoRotateSpeed: 0.8, label: 'Gentle Drift', desc: 'Orbit + vertical bob' },
  pulse:       { autoRotateSpeed: 1.0, label: 'Pulse',        desc: 'Orbit + FOV breathing' },
};

let currentMode = 'slowOrbit';
let paused = false;
let pauseTimer = null;

export function getCameraModes() { return MODES; }
export function getCameraMode() { return currentMode; }

export function setCameraMode(id) {
  if (!MODES[id]) return;
  currentMode = id;
}

export function pauseCamera() {
  paused = true;
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => { paused = false; }, 5000);
}

export function resumeCamera() {
  paused = false;
  clearTimeout(pauseTimer);
}

/**
 * Called every frame. Applies rotation + mode effects.
 */
export function tickCamera(Graph, elapsed) {
  if (!Graph) return;
  const controls = Graph.controls();
  if (!controls) return;

  const mode = MODES[currentMode];
  if (!mode) return;

  if (paused || currentMode === 'static') {
    controls.autoRotate = false;
    return;
  }

  controls.autoRotate = true;
  controls.autoRotateSpeed = mode.autoRotateSpeed;

  // Gentle Drift: vertical bob on orbit target
  if (currentMode === 'gentleDrift') {
    const target = controls.target;
    if (target) target.y = Math.sin(elapsed * 0.2) * 15;
  }

  // Pulse: gentle FOV oscillation
  if (currentMode === 'pulse') {
    const camera = Graph.camera();
    if (camera) {
      camera.fov = 75 + Math.sin(elapsed * 0.4) * 5;
      camera.updateProjectionMatrix();
    }
  }
}
