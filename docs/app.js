/**
 * Clip Flow Feature Gallery - Modern, Interactive, Polished
 */

// Global State
const state = {
  features: [],
  activeFeature: null
};

/**
 * Initialize the Gallery
 */
async function init() {
  try {
    const response = await fetch('./features.json', { cache: 'no-store' });
    const data = await response.json();
    state.features = Array.isArray(data?.features) ? data.features : [];
    
    renderGallery();
    initModalEvents();
    initScrollObserver();
    handleInitialHash();
  } catch (error) {
    console.error('[Gallery] Initialization failed:', error);
    const container = document.getElementById('featureGroups');
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <p>Failed to load feature data. Please ensure the app is running and features.json is available.</p>
          <p>Error: ${error.message}</p>
        </div>
      `;
    }
  }
}

/**
 * Render the entire gallery grouped by category
 */
function renderGallery() {
  const container = document.getElementById('featureGroups');
  if (!container) {
    console.error('[Gallery] Container not found!');
    return;
  }

  // Group features by their "group" property
  const groups = state.features.reduce((acc, feature) => {
    const group = feature.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(feature);
    return acc;
  }, {});

  container.innerHTML = Object.entries(groups).map(([groupName, groupFeatures]) => `
    <section class="feature-group">
      <header class="group-header">
        <div class="group-icon">${getGroupIcon(groupName)}</div>
        <div class="group-info">
          <h2 class="group-title">${groupName}</h2>
          <span class="group-count">${groupFeatures.length} feature${groupFeatures.length !== 1 ? 's' : ''}</span>
        </div>
      </header>
      
      <div class="features-grid">
        ${groupFeatures.map((feature, index) => renderFeatureCard(feature, index)).join('')}
      </div>
    </section>
  `).join('');

  // Attach click and hover events to cards
  container.querySelectorAll('.feature-card').forEach(card => {
    const featureId = card.dataset.featureId;
    const feature = state.features.find(f => f.id === featureId);
    
    // Click to open modal
    card.addEventListener('click', () => {
      if (feature) openFeatureModal(feature);
    });
    
    // Hover to show preview
    if (feature) {
      initHoverPreview(card, feature);
    }
  });
}

/**
 * Initialize hover preview for a feature card
 */
function initHoverPreview(card, feature) {
  let previewTimeout;
  const preview = document.getElementById('hoverPreview');
  
  card.addEventListener('mouseenter', () => {
    previewTimeout = setTimeout(() => {
      showHoverPreview(feature, card);
    }, 400);
  });
  
  card.addEventListener('mouseleave', () => {
    clearTimeout(previewTimeout);
    hideHoverPreview();
  });
}

/**
 * Show hover preview
 */
function showHoverPreview(feature, card) {
  const preview = document.getElementById('hoverPreview');
  const mediaList = Array.isArray(feature.media) ? feature.media : (feature.media ? [feature.media] : []);
  
  // Get first available image
  const imageItem = mediaList.find(item => item.type === 'image') || 
                   mediaList.find(item => item.type === 'video' && item.poster);
  
  if (!imageItem) return;
  
  const imageSrc = imageItem.type === 'image' ? imageItem.src : imageItem.poster;
  
  preview.innerHTML = `
    <img src="${imageSrc}" alt="${feature.title}" />
    <div class="preview-info">
      <h4>${feature.title}</h4>
      <p>${feature.summary || ''}</p>
    </div>
  `;
  
  // Position the preview
  const rect = card.getBoundingClientRect();
  const previewWidth = Math.min(800, window.innerWidth - 40);
  const previewHeight = 600;
  
  let left = rect.right + 20;
  let top = rect.top + (rect.height / 2) - (previewHeight / 2);
  
  // Adjust if going off screen to the right
  if (left + previewWidth > window.innerWidth - 20) {
    left = rect.left - previewWidth - 20;
  }
  
  // Adjust if going off screen to the left
  if (left < 20) {
    left = 20;
  }
  
  // Adjust vertical position
  if (top < 20) top = 20;
  if (top + previewHeight > window.innerHeight - 20) {
    top = window.innerHeight - previewHeight - 20;
  }
  
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.classList.add('active');
}

/**
 * Hide hover preview
 */
function hideHoverPreview() {
  const preview = document.getElementById('hoverPreview');
  preview.classList.remove('active');
}

/**
 * Render an individual feature card
 */
function renderFeatureCard(feature, index) {
  // Use the first media item as the thumbnail
  const media = Array.isArray(feature.media) ? feature.media[0] : feature.media;
  const thumbUrl = media?.poster || (media?.type === 'image' ? media.src : '');
  
  return `
    <article 
      class="feature-card animate-in" 
      data-feature-id="${feature.id}"
      style="animation-delay: ${index * 50}ms"
    >
      <div class="card-media">
        ${thumbUrl 
          ? `<img src="${thumbUrl}" alt="${feature.title}" loading="lazy" />`
          : `<div class="media-placeholder"></div>`
        }
      </div>
      <div class="card-content">
        <h3 class="card-title">${feature.title}</h3>
        <p class="card-summary">${feature.summary || ''}</p>
        <div class="card-tags">
          ${(feature.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </div>
    </article>
  `;
}

/**
 * SVG Icons for groups
 */
function getGroupIcon(groupName) {
  const icons = {
    'Recording': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
    'Editing & Review': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    'Export': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
  };
  return icons[groupName] || icons['Recording'];
}

/**
 * Modal Logic
 */
function initModalEvents() {
  const backdrop = document.getElementById('backdrop');
  const modal = document.getElementById('modal');
  const closeBtn = document.getElementById('modalClose');

  const close = () => {
    modal.close();
    backdrop.hidden = true;
    document.body.style.overflow = '';
    // Don't clear hash to prevent scroll jump
    
    // Stop any playing videos in the modal
    modal.querySelectorAll('video').forEach(v => v.pause());
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.open) close();
  });
}

function openFeatureModal(feature) {
  const modal = document.getElementById('modal');
  const backdrop = document.getElementById('backdrop');

  // Update UI
  document.getElementById('modalKicker').textContent = feature.group || 'Feature';
  document.getElementById('modalTitle').textContent = feature.title;
  document.getElementById('modalDesc').textContent = feature.description || feature.summary;
  
  // Media Gallery - Only show images
  const mediaContainer = document.getElementById('modalMedia');
  const mediaList = Array.isArray(feature.media) ? feature.media : (feature.media ? [feature.media] : []);
  
  // Filter to only image items, and also use poster images from videos as images
  const imageList = mediaList.map(item => {
    if (item.type === 'video' && item.poster) {
      return { src: item.poster, alt: item.alt || feature.title };
    }
    if (item.type === 'image') {
      return { src: item.src, alt: item.alt || feature.title };
    }
    return null;
  }).filter(Boolean);
  
  // Show first image only (for now)
  const displayItem = imageList.length > 0 ? imageList[0] : null;
  
  mediaContainer.innerHTML = displayItem 
    ? `<div class="media-item"><img src="${displayItem.src}" alt="${displayItem.alt}" /></div>`
    : `<div class="media-item"><div class="media-placeholder large"></div></div>`;

  // Tags
  const metaContainer = document.getElementById('modalMeta');
  metaContainer.innerHTML = (feature.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('');

  // Handle Gallery Dots
  const existingDots = modal.querySelector('.gallery-dots');
  if (existingDots) existingDots.remove();

  // Show dots if we have multiple images
  if (imageList.length > 1) {
    const mediaSection = modal.querySelector('.modal-media-section');
    const dotsWrapper = document.createElement('div');
    dotsWrapper.className = 'gallery-dots';
    dotsWrapper.innerHTML = imageList.map((_, i) => `
      <button class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
    `).join('');
    
    mediaSection.appendChild(dotsWrapper);
    
    const dots = dotsWrapper.querySelectorAll('.dot');

    // Click to switch image
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        mediaContainer.innerHTML = `<div class="media-item"><img src="${imageList[i].src}" alt="${imageList[i].alt}" /></div>`;
      });
    });
  }

  // Show Modal
  backdrop.hidden = false;
  modal.showModal();
  document.body.style.overflow = 'hidden';
  window.location.hash = encodeURIComponent(feature.id);
}

/**
 * Handle initial URL hash for deep linking
 */
function handleInitialHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  
  const id = decodeURIComponent(hash);
  const feature = state.features.find(f => f.id === id);
  if (feature) {
    // Small delay to let initial render finish
    setTimeout(() => openFeatureModal(feature), 100);
  }
}

/**
 * Reveal elements on scroll
 */
function initScrollObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  // Observe existing elements immediately
  const observeElements = () => {
    document.querySelectorAll('.feature-group, .feature-card').forEach(el => {
      observer.observe(el);
    });
  };

  // Initial observation
  observeElements();

  // Also watch for dynamically added content
  const mainObserver = new MutationObserver(() => {
    observeElements();
  });

  const container = document.getElementById('featureGroups');
  if (container) {
    mainObserver.observe(container, { childList: true });
  }
}

// Start the app
init();
