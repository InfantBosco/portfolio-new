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

  // Copy Email to Clipboard
  const copyEmailBtn = document.getElementById('copy-email-btn');
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', () => {
      const email = 'boscoinfant18@gmail.com';
      navigator.clipboard.writeText(email).then(() => {
        const originalHTML = copyEmailBtn.innerHTML;
        copyEmailBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          copyEmailBtn.innerHTML = originalHTML;
        }, 2000);
      }).catch(() => {});
    });
  }

  // Contact Form Submission
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('contact-submit-btn');
      const originalHTML = submitBtn.innerHTML;
      submitBtn.innerHTML = `<span>Message Sent!</span> <span style="color:#22c55e;">✔</span>`;
      submitBtn.disabled = true;
      contactForm.reset();
      setTimeout(() => {
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
      }, 3500);
    });
  }

  // Scroll to Top Button
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // Glitter Canvas Engine (Effect 1)
  function initGlitterCanvas() {
    const canvas = document.getElementById('glitter-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles = [];
    let isActive = false;

    const handleResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });

    // View-awareness via IntersectionObserver
    const contactSec = document.getElementById('contact');
    if (contactSec && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          isActive = entry.isIntersecting;
        });
      }, { threshold: 0.1 });
      observer.observe(contactSec);
    } else {
      isActive = true;
    }

    // Spawn 4-point diamond particles
    const spawn = () => {
      const count = isActive ? 6 : 2;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: canvas.height + 10,
          size: 1.5 + Math.random() * 3.5,
          speedY: -(0.5 + Math.random() * 1.5),
          speedX: (Math.random() - 0.5) * 0.8,
          alpha: 0.8 + Math.random() * 0.2,
          decay: 0.005 + Math.random() * 0.008,
          hue: Math.random() > 0.5 ? '#ffe600' : '#ffffff',
          spin: (Math.random() - 0.5) * 0.1,
          angle: Math.random() * Math.PI * 2,
        });
      }
    };

    let frame = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      if (frame % 3 === 0) spawn();
      particles = particles.filter((p) => p.alpha > 0.01);
      particles.forEach((p) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.alpha -= p.decay;
        p.angle += p.spin;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        // 4-point diamond star geometry
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.38, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.38, 0);
        ctx.closePath();
        // Luminous outer glow
        ctx.shadowColor = p.hue;
        ctx.shadowBlur = p.size * 4;
        ctx.fill();
        ctx.restore();
      });
      requestAnimationFrame(render);
    };
    render();
  }

  // Event Listeners
  window.addEventListener('resize', resizeCanvas);

  // Initialize
  resizeCanvas();
  preloadAllFrames();
  initGlitterCanvas();
  requestAnimationFrame(animationLoop);
})();
