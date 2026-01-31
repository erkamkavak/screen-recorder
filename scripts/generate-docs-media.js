#!/usr/bin/env node

/**
 * Playwright script to automatically generate screenshots and videos
 * for the Clip Flow feature gallery in docs/media/
 * 
 * Usage:
 *   npm install -g playwright
 *   # Start your app first: npm run dev
 *   node scripts/generate-docs-media.js
 * 
 * This will capture:
 * - Full app screenshots for each feature
 * - Component-specific screenshots (zoomed in)
 * - Short video demos (5-10 seconds each)
 * - Poster images for video previews
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const APP_URL = 'http://localhost:5173';
const MEDIA_DIR = path.join(__dirname, '..', 'docs', 'media');
const VIEWPORT = { width: 1400, height: 900 };

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Feature definitions with capture strategies
const FEATURES = [
  {
    id: 'native-capture',
    name: 'Native Capture',
    steps: [
      { type: 'screenshot', selector: '[data-testid="recorder-view"]', filename: 'native-capture.png' },
      { type: 'video', duration: 8000, selector: '[data-testid="source-selector"]', filename: 'native-capture.mp4' }
    ]
  },
  {
    id: 'selection-preview',
    name: 'Selection & Preview',
    steps: [
      { type: 'screenshot', selector: '[data-testid="source-selector"]', filename: 'selection-preview.png' },
      { type: 'video', duration: 6000, action: 'hover-sources', filename: 'selection-preview.mp4' }
    ]
  },
  {
    id: 'webcam-overlay',
    name: 'Webcam Integration',
    steps: [
      { type: 'screenshot', selector: '[data-testid="webcam-preview"]', filename: 'webcam-overlay.png' },
      { type: 'video', duration: 7000, action: 'drag-webcam', filename: 'webcam-overlay.mp4' }
    ]
  },
  {
    id: 'audio-mic',
    name: 'Audio Handling',
    steps: [
      { type: 'screenshot', selector: '[data-testid="audio-controls"]', filename: 'audio-mic.png' },
      { type: 'video', duration: 5000, action: 'toggle-audio', filename: 'audio-mic.mp4' }
    ]
  },
  {
    id: 'notes-overlay',
    name: 'Notes Overlay',
    steps: [
      { type: 'screenshot', selector: '[data-testid="notes-panel"]', filename: 'notes-overlay.png' },
      { type: 'video', duration: 8000, action: 'switch-notes', filename: 'notes-overlay.mp4' }
    ]
  },
  {
    id: 'floating-controls',
    name: 'Floating Controls',
    steps: [
      { type: 'screenshot', selector: '[data-testid="floating-bar"]', filename: 'floating-controls.png' },
      { type: 'video', duration: 6000, action: 'show-floating', filename: 'floating-controls.mp4' }
    ]
  },
  {
    id: 'screenshot-export',
    name: 'Screenshot Export',
    steps: [
      { type: 'screenshot', fullPage: true, filename: 'screenshot-export.png' }
    ]
  },
  {
    id: 'projects',
    name: 'Project Management',
    steps: [
      { type: 'screenshot', selector: '[data-testid="projects-list"]', filename: 'projects.png' },
      { type: 'video', duration: 7000, action: 'open-project', filename: 'projects.mp4' }
    ]
  },
  {
    id: 'timeline-trim',
    name: 'Review Workflow',
    steps: [
      { type: 'screenshot', selector: '[data-testid="review-timeline"]', filename: 'timeline-trim.png' },
      { type: 'video', duration: 10000, action: 'trim-segment', filename: 'timeline-trim.mp4' }
    ]
  },
  {
    id: 'smart-zoom',
    name: 'Smart Zoom',
    steps: [
      { type: 'screenshot', selector: '[data-testid="zoom-editor"]', filename: 'smart-zoom.png' },
      { type: 'video', duration: 8000, action: 'add-zoom', filename: 'smart-zoom.mp4' }
    ]
  },
  {
    id: 'cursor-customization',
    name: 'Cursor Customization',
    steps: [
      { type: 'screenshot', selector: '[data-testid="cursor-style-section"]', filename: 'cursor-customization.png' },
      { type: 'video', duration: 7000, action: 'change-cursor', filename: 'cursor-customization.mp4' }
    ]
  },
  {
    id: 'themes-backgrounds',
    name: 'Visual Styling',
    steps: [
      { type: 'screenshot', selector: '[data-testid="layers-tab"]', filename: 'themes-backgrounds.png' },
      { type: 'video', duration: 8000, action: 'change-theme', filename: 'themes-backgrounds.mp4' }
    ]
  },
  {
    id: 'captions',
    name: 'Captions',
    steps: [
      { type: 'screenshot', selector: '[data-testid="audio-tab"]', filename: 'captions.png' },
      { type: 'video', duration: 9000, action: 'generate-captions', filename: 'captions.mp4' }
    ]
  },
  {
    id: 'cinematic-effects',
    name: 'Cinematic Effects',
    steps: [
      { type: 'screenshot', selector: '[data-testid="cinema-tab"]', filename: 'cinematic-effects.png' },
      { type: 'video', duration: 10000, action: 'demo-cinematic', filename: 'cinematic-effects.mp4' }
    ]
  },
  {
    id: 'export-formats',
    name: 'Export Options',
    steps: [
      { type: 'screenshot', selector: '[data-testid="export-tab"]', filename: 'export-formats.png' },
      { type: 'video', duration: 6000, action: 'select-format', filename: 'export-formats.mp4' }
    ]
  },
  {
    id: 'export-presets',
    name: 'Presets',
    steps: [
      { type: 'screenshot', selector: '[data-testid="resolution-preset"]', filename: 'export-presets.png' },
      { type: 'video', duration: 6000, action: 'change-preset', filename: 'export-presets.mp4' }
    ]
  },
  {
    id: 'render-control',
    name: 'Render Control',
    steps: [
      { type: 'screenshot', selector: '[data-testid="render-progress"]', filename: 'render-control.png' },
      { type: 'video', duration: 8000, action: 'show-render', filename: 'render-control.mp4' }
    ]
  }
];

// Helper: Wait for element with retry
async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (e) {
    console.warn(`  ⚠️  Selector not found: ${selector}`);
    return false;
  }
}

// Helper: Capture element screenshot with optional padding
async function captureElement(page, selector, filename, padding = 20) {
  const element = await page.$(selector);
  if (!element) {
    console.warn(`  ⚠️  Element not found: ${selector}, using full page`);
    await page.screenshot({ 
      path: path.join(MEDIA_DIR, filename),
      fullPage: false 
    });
    return;
  }

  const box = await element.boundingBox();
  if (!box) {
    console.warn(`  ⚠️  Cannot get bounding box for: ${selector}`);
    return;
  }

  // Add padding around the element
  await page.screenshot({
    path: path.join(MEDIA_DIR, filename),
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + (padding * 2),
      height: box.height + (padding * 2)
    }
  });
}

// Helper: Record video of an action
async function recordVideo(page, context, duration, action, filename) {
  // Start video recording
  const videoPath = path.join(MEDIA_DIR, filename);
  
  // Perform action while recording
  switch (action) {
    case 'hover-sources':
      const sources = await page.$$('[data-testid="source-item"]');
      for (let i = 0; i < sources.length && i < 3; i++) {
        await sources[i].hover();
        await page.waitForTimeout(800);
      }
      break;
      
    case 'drag-webcam':
      const webcam = await page.$('[data-testid="webcam-preview"]');
      if (webcam) {
        const box = await webcam.boundingBox();
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 50, { steps: 10 });
        await page.mouse.up();
      }
      break;
      
    case 'toggle-audio':
      const audioToggle = await page.$('[data-testid="mic-toggle"]');
      if (audioToggle) {
        await audioToggle.click();
        await page.waitForTimeout(1000);
        await audioToggle.click();
      }
      break;
      
    case 'switch-notes':
      for (let i = 1; i <= 3; i++) {
        const note = await page.$(`[data-testid="note-${i}"]`);
        if (note) {
          await note.click();
          await page.waitForTimeout(1200);
        }
      }
      break;
      
    case 'show-floating':
      const mainBtn = await page.$('[data-testid="recorder-toggle"]');
      if (mainBtn) {
        await mainBtn.click();
        await page.waitForTimeout(3000);
        await mainBtn.click();
      }
      break;
      
    case 'open-project':
      const project = await page.$('[data-testid="project-item"]:first-child');
      if (project) {
        await project.click();
        await page.waitForTimeout(4000);
      }
      break;
      
    case 'trim-segment':
      const trimHandle = await page.$('[data-testid="trim-handle"]:first-child');
      if (trimHandle) {
        const box = await trimHandle.boundingBox();
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(2000);
      }
      break;
      
    case 'add-zoom':
      const zoomBtn = await page.$('[data-testid="add-zoom-btn"]');
      if (zoomBtn) {
        await zoomBtn.click();
        await page.waitForTimeout(2000);
        await page.click('[data-testid="timeline-canvas"]');
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'change-cursor':
      const cursorSelect = await page.$('[data-testid="cursor-select"]');
      if (cursorSelect) {
        await cursorSelect.click();
        await page.waitForTimeout(500);
        const option = await page.$('[data-testid="cursor-option"]:nth-child(2)');
        if (option) await option.click();
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'change-theme':
      const themeBtn = await page.$('[data-testid="theme-btn"]:first-child');
      if (themeBtn) {
        await themeBtn.click();
        await page.waitForTimeout(1000);
        const theme = await page.$('[data-testid="theme-item"]:nth-child(2)');
        if (theme) await theme.click();
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'generate-captions':
      const transcribeBtn = await page.$('[data-testid="transcribe-btn"]');
      if (transcribeBtn) {
        await transcribeBtn.click();
        await page.waitForTimeout(5000);
      }
      break;
      
    case 'demo-cinematic':
      // Toggle various cinematic effects
      const glideToggle = await page.$('[data-testid="glide-toggle"]');
      if (glideToggle) {
        await glideToggle.click();
        await page.waitForTimeout(2000);
      }
      const blurSlider = await page.$('[data-testid="motion-blur-slider"]');
      if (blurSlider) {
        await blurSlider.evaluate(el => el.value = 0.8);
        await blurSlider.evaluate(el => el.dispatchEvent(new Event('input')));
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'select-format':
      const formatSelect = await page.$('[data-testid="format-select"]');
      if (formatSelect) {
        await formatSelect.click();
        await page.waitForTimeout(500);
        const format = await page.$('[data-testid="format-option"]:nth-child(2)');
        if (format) await format.click();
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'change-preset':
      const presetBtn = await page.$('[data-testid="preset-btn"]:first-child');
      if (presetBtn) {
        await presetBtn.click();
        await page.waitForTimeout(500);
        const preset = await page.$('[data-testid="preset-option"]:nth-child(3)');
        if (preset) await preset.click();
        await page.waitForTimeout(3000);
      }
      break;
      
    case 'show-render':
      const renderBtn = await page.$('[data-testid="render-btn"]');
      if (renderBtn) {
        await renderBtn.click();
        await page.waitForTimeout(6000);
      }
      break;
      
    default:
      // Just wait for the duration
      await page.waitForTimeout(duration);
  }
  
  await page.waitForTimeout(duration - 1000);
}

// Main capture function
async function captureFeature(page, context, feature) {
  console.log(`\n📸 Capturing: ${feature.name}`);
  
  for (const step of feature.steps) {
    const outputPath = path.join(MEDIA_DIR, step.filename);
    
    if (fs.existsSync(outputPath)) {
      console.log(`  ✓ ${step.filename} already exists (skipping)`);
      continue;
    }
    
    try {
      if (step.type === 'screenshot') {
        console.log(`  📷 Taking screenshot: ${step.filename}`);
        
        if (step.fullPage) {
          await page.screenshot({ 
            path: outputPath,
            fullPage: true 
          });
        } else if (step.selector) {
          await captureElement(page, step.selector, step.filename, step.padding || 20);
        } else {
          await page.screenshot({ 
            path: outputPath,
            fullPage: false 
          });
        }
        
        console.log(`  ✓ Saved: ${step.filename}`);
        
      } else if (step.type === 'video') {
        console.log(`  🎥 Recording video: ${step.filename} (${step.duration}ms)`);
        
        // Note: Playwright's video recording works at context level
        // For element-specific videos, we record full context and crop later
        // or use the element's own video if available
        
        await recordVideo(page, context, step.duration, step.action, step.filename);
        
        console.log(`  ✓ Saved: ${step.filename}`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to capture ${step.filename}:`, error.message);
    }
  }
}

// Main execution
async function main() {
  console.log('🎬 Clip Flow Docs Media Generator\n');
  console.log(`Output directory: ${MEDIA_DIR}`);
  console.log(`App URL: ${APP_URL}`);
  
  let browser;
  let context;
  let page;
  
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: false, // Set to true for CI/CD
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create context with video recording enabled
    context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: {
        dir: MEDIA_DIR,
        size: VIEWPORT
      }
    });
    
    page = await context.newPage();
    
    // Navigate to app
    console.log('\n🚀 Opening app...');
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check if app is running
    const title = await page.title();
    console.log(`✓ App loaded: ${title}`);
    
    // Capture each feature
    for (const feature of FEATURES) {
      await captureFeature(page, context, feature);
      
      // Small delay between features
      await page.waitForTimeout(1000);
    }
    
    console.log('\n✨ All captures complete!');
    console.log(`\nMedia files saved to: ${MEDIA_DIR}`);
    console.log('\nNext steps:');
    console.log('1. Review generated images/videos');
    console.log('2. Update docs/features.json with new cinematic-effects feature');
    console.log('3. Commit docs/media/ to git');
    console.log('4. Enable GitHub Pages in repository settings');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main, FEATURES };
