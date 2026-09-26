(function () {
  'use strict';

  const TOTAL_FRAMES = 300;
  const FPS = 28; // Cinematic frame rate
  const FRAME_DURATION = 1000 / FPS;

  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const loaderLine = document.getElementById('loader');

  // Cache for loaded Image elements (index 1 to 300)
  const images = new Array(TOTAL_FRAMES + 1);
  let loadedCount = 0;

  // Playback state
  let currentExactFrame = 1;
  let targetFrame = 1;
  let renderedFrame = 1;
  let playDirection = 1; // 1 = forward, -1 = reverse (ping-pong loop)
  let lastTimestamp = 0;

  // Interaction state (mouse / touch scrub)
  let isInteracting = false;
  let interactionTimeout = null;

  let lastDrawnImage = null;
  let lastDrawnIndex = -1;
  const LERP_FACTOR = 0.14;

  // Generate frame path: Hero/ezgif-frame-001.jpg -> Hero/ezgif-frame-300.jpg
  function getFramePath(index) {
    const padded = String(index).padStart(3, '0');
    return `Hero/ezgif-frame-${padded}.jpg`;
  }

  const textOverlay = document.querySelector('.hero-text-overlay');

  // Compute exact chest level matching image aspect ratio
  function updateTextPosition() {
    if (!textOverlay) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const iw = 1920;
    const ih = 1080;
    const r = Math.max(w / iw, h / ih);
    const nh = ih * r;
    const cy = (h - nh) * 0.5;
    // Chest is situated at ~68.5% of the frame height
    const chestY = cy + (ih * 0.685) * r;
    textOverlay.style.top = `${Math.round(chestY)}px`;
  }

  // High-DPI canvas sizing
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);

    updateTextPosition();

    if (lastDrawnImage) {
      drawImageProp(lastDrawnImage);
    } else {
      drawFrame(Math.round(renderedFrame));
    }
  }

  // Draw image to fill canvas proportionally (object-fit: cover)
  function drawImageProp(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const r = Math.max(cw / iw, ch / ih);
    const nw = iw * r;
    const nh = ih * r;
    const cx = (cw - nw) * 0.5;
    const cy = (ch - nh) * 0.5;

    ctx.drawImage(img, 0, 0, iw, ih, cx, cy, nw, nh);
  }

  // Find the closest available loaded frame to prevent any blank frames
  function getBestAvailableImage(index) {
    if (images[index] && images[index].complete && images[index].naturalWidth > 0) {
      return images[index];
    }
    // Search radiating outwards
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = index - offset;
      if (prev >= 1 && images[prev] && images[prev].complete && images[prev].naturalWidth > 0) {
        return images[prev];
      }
      const next = index + offset;
      if (next <= TOTAL_FRAMES && images[next] && images[next].complete && images[next].naturalWidth > 0) {
        return images[next];
      }
    }
    return null;
  }

  // Draw specific frame
  function drawFrame(frameIndex) {
    const clamped = Math.max(1, Math.min(TOTAL_FRAMES, frameIndex));
    const img = getBestAvailableImage(clamped);
    if (img) {
      drawImageProp(img);
      lastDrawnImage = img;
      lastDrawnIndex = clamped;
    }
  }

  // Main animation loop
  function animationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (!isInteracting) {
      // Auto-play mode: advance smoothly based on elapsed time
      const framesToAdvance = (delta / FRAME_DURATION) * playDirection;
      currentExactFrame += framesToAdvance;

      // Handle ping-pong loop at edges
      if (currentExactFrame >= TOTAL_FRAMES) {
        currentExactFrame = TOTAL_FRAMES;
        playDirection = -1;
      } else if (currentExactFrame <= 1) {
        currentExactFrame = 1;
        playDirection = 1;
      }
      targetFrame = currentExactFrame;
    }

    // Smooth Lerp interpolation towards targetFrame
    const diff = targetFrame - renderedFrame;
    if (Math.abs(diff) > 0.001) {
      renderedFrame += diff * LERP_FACTOR;
    } else {
      renderedFrame = targetFrame;
    }

    const frameToDraw = Math.round(renderedFrame);
    const bestImg = getBestAvailableImage(frameToDraw);

    if (bestImg && (bestImg !== lastDrawnImage || frameToDraw !== lastDrawnIndex)) {
      drawImageProp(bestImg);
      lastDrawnImage = bestImg;
      lastDrawnIndex = frameToDraw;
    }

    requestAnimationFrame(animationLoop);
  }

  // Interactive mouse / touch move handlers
  function handlePointerMove(clientX) {
    const ratio = Math.max(0, Math.min(1, clientX / window.innerWidth));
    targetFrame = 1 + ratio * (TOTAL_FRAMES - 1);
    currentExactFrame = targetFrame;
    isInteracting = true;

    if (interactionTimeout) clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
      isInteracting = false;
    }, 1800);
  }

  window.addEventListener('mousemove', (e) => {
    if (window.scrollY < window.innerHeight * 0.8) {
      handlePointerMove(e.clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (window.scrollY < window.innerHeight * 0.8 && e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX);
    }
  }, { passive: true });

  // Single frame loader
  function loadFrame(index) {
    if (images[index]) return Promise.resolve(images[index]);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loadedCount++;
        if (loaderLine) {
          loaderLine.style.width = `${(loadedCount / TOTAL_FRAMES) * 100}%`;
          if (loadedCount >= TOTAL_FRAMES) {
            setTimeout(() => loaderLine.classList.add('loaded'), 350);
          }
        }
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = getFramePath(index);
    });
  }

  // Preloader with priority:
  // 1. Immediately load frame 1 (instant display)
  // 2. Load keyframes
  // 3. Concurrently load all remaining frames
  async function preloadAllFrames() {
    const firstImg = await loadFrame(1);
    if (firstImg) {
      drawFrame(1);
    }

    const keyframes = [];
    for (let i = 8; i <= TOTAL_FRAMES; i += 8) {
      keyframes.push(i);
    }

    const remaining = [];
    for (let i = 2; i <= TOTAL_FRAMES; i++) {
      if (i % 8 !== 0) {
        remaining.push(i);
      }
    }

    const queue = [...keyframes, ...remaining];
    const CONCURRENCY = 12;

    async function worker() {
      while (queue.length > 0) {
        const nextIndex = queue.shift();
        await loadFrame(nextIndex);
      }
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  // Live Skill Search Filter
  const searchInput = document.getElementById('skills-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const badges = document.querySelectorAll('.skill-badge');

      badges.forEach((badge) => {
        const text = badge.textContent.toLowerCase();
        if (!query) {
          badge.classList.remove('dimmed');
          if (badge.textContent.trim() === 'Tailwind CSS') {
            badge.classList.add('highlighted');
          } else {
            badge.classList.remove('highlighted');
          }
        } else if (text.includes(query)) {
          badge.classList.add('highlighted');
          badge.classList.remove('dimmed');
        } else {
          badge.classList.remove('highlighted');
          badge.classList.add('dimmed');
        }
      });
    });
  }

  // Project Category Filter
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      projectCards.forEach((card) => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // Event Listeners
  window.addEventListener('resize', resizeCanvas);

  // Initialize
  resizeCanvas();
  preloadAllFrames();
  requestAnimationFrame(animationLoop);
})();
