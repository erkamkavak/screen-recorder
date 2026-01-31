<script lang="ts">
  import { reviewSessionStore } from "../../lib/stores/reviewSession";
  import { ANIMATION_STYLES } from "../../lib/rendering/cinematicEffects";
  
  const animationStyles = Object.keys(ANIMATION_STYLES) as (keyof typeof ANIMATION_STYLES)[];

  const onAnimationStyleChange = (e: Event) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    reviewSessionStore.setCinematicEffects({ animationStyle: val as any });
  };

  const onMotionBlurChange = (e: Event) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    reviewSessionStore.setCinematicEffects({ motionBlurStrength: parseFloat(val) });
  };

  const onZoomScaleChange = (e: Event) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    reviewSessionStore.setCinematicEffects({ zoomScale: parseFloat(val) });
  };

  const onDeadZoneChange = (e: Event) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    reviewSessionStore.setCinematicEffects({ deadZone: parseFloat(val) });
  };

  const onEasingChange = (e: Event) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    reviewSessionStore.setCinematicEffects({ easing: val as any });
  };

  const onGlideToggle = (e: Event) => {
    reviewSessionStore.setCinematicEffects({ glideEnabled: (e.currentTarget as HTMLInputElement).checked });
  };

  const onSmoothZoomToggle = (e: Event) => {
    reviewSessionStore.setCinematicEffects({ smoothZoomEnabled: (e.currentTarget as HTMLInputElement).checked });
  };

  const onHideStaticToggle = (e: Event) => {
    reviewSessionStore.setCinematicEffects({ hideWhenStatic: (e.currentTarget as HTMLInputElement).checked });
  };

  $: config = $reviewSessionStore.cinematicEffects;
</script>

<div class="effects-container">
  <!-- Motion Physics Group -->
  <div class="effect-group">
    <div class="group-header">
      <div class="group-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>
      <div class="group-info">
        <h3>Motion Physics</h3>
        <p>Control how elements move and react</p>
      </div>
    </div>

    <div class="group-content">
      <div class="setting-card" class:active={config.glideEnabled}>
        <div class="setting-main">
          <div class="setting-text">
            <h4>Glide Effect</h4>
            <p>Adds momentum and weight to cursor movement for a professional look.</p>
          </div>
          <div class="toggle-wrapper">
            <input type="checkbox" checked={config.glideEnabled} on:change={onGlideToggle} id="glide-toggle" />
            <label for="glide-toggle" class="toggle-switch"></label>
          </div>
        </div>
        
        {#if config.glideEnabled}
          <div class="sub-settings">
            <div class="field">
              <label for="anim-style">Animation Style</label>
              <div class="select-glow">
                <select id="anim-style" value={config.animationStyle} on:change={onAnimationStyleChange}>
                  {#each animationStyles as style}
                    <option value={style}>{style.charAt(0).toUpperCase() + style.slice(1)} Physics</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Perspective Group -->
  <div class="effect-group">
    <div class="group-header">
      <div class="group-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </div>
      <div class="group-info">
        <h3>Zoom & Viewport</h3>
        <p>Configure dynamic camera behavior</p>
      </div>
    </div>

    <div class="group-content">
      <div class="setting-card" class:active={config.smoothZoomEnabled}>
        <div class="setting-main">
          <div class="setting-text">
            <h4>Smooth Transitions</h4>
            <p>Animate zoom and pans using critically damped springs to avoid jarring jumps.</p>
          </div>
          <div class="toggle-wrapper">
            <input type="checkbox" checked={config.smoothZoomEnabled} on:change={onSmoothZoomToggle} id="zoom-toggle" />
            <label for="zoom-toggle" class="toggle-switch"></label>
          </div>
        </div>

        <div class="sub-settings-grid">
          <div class="slider-field">
            <div class="label-row">
              <label for="zoom-lvl">Zoom Level</label>
              <span class="val-badge">{config.zoomScale.toFixed(1)}x</span>
            </div>
            <input id="zoom-lvl" type="range" min="1.5" max="3.0" step="0.1" value={config.zoomScale} on:input={onZoomScaleChange} />
          </div>

          <div class="slider-field">
            <div class="label-row">
              <label for="dz">Dead Zone</label>
              <span class="val-badge">{Math.round(config.deadZone * 100)}%</span>
            </div>
            <input id="dz" type="range" min="0" max="0.5" step="0.05" value={config.deadZone} on:input={onDeadZoneChange} />
          </div>
        </div>

        <div class="field mt-3">
          <label for="ease">Easing System</label>
          <div class="select-glow">
            <select id="ease" value={config.easing} on:change={onEasingChange}>
              <option value="linear">Linear (Consistent)</option>
              <option value="easeIn">Ease In (Accelerating)</option>
              <option value="easeOut">Ease Out (Decelerating)</option>
              <option value="easeInOut">Ease In Out (Natural)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Finishing Touches Group -->
  <div class="effect-group">
    <div class="group-header">
      <div class="group-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
      </div>
      <div class="group-info">
        <h3>Visual Polish</h3>
        <p>Extra layers for high-end production</p>
      </div>
    </div>

    <div class="group-content">
      <div class="setting-row">
        <div class="setting-text">
          <h4>Directional Motion Blur</h4>
          <p>Adds realistic camera blur based on movement speed.</p>
        </div>
        <div class="blur-control">
          <input type="range" min="0" max="1" step="0.1" value={config.motionBlurStrength} on:input={onMotionBlurChange} />
          <span class="percent-label">{Math.round(config.motionBlurStrength * 100)}%</span>
        </div>
      </div>

      <div class="setting-card mini" class:active={config.hideWhenStatic}>
        <div class="setting-main">
          <div class="setting-text">
            <h4>Auto-hide Stationary Cursor</h4>
            <p>Hides the cursor automatically after 1s of inactivity.</p>
          </div>
          <div class="toggle-wrapper">
            <input type="checkbox" checked={config.hideWhenStatic} on:change={onHideStaticToggle} id="hide-toggle" />
            <label for="hide-toggle" class="toggle-switch"></label>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .effects-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding-bottom: 2rem;
  }

  .effect-group {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0 0.5rem;
  }

  .group-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: #f1f5f9;
    color: #3b82f6;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .group-icon svg {
    width: 20px;
    height: 20px;
  }

  .group-info h3 {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-info p {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .group-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Setting Cards */
  .setting-card {
    background: #ffffff;
    border: 1.5px solid #f1f5f9;
    border-radius: 20px;
    padding: 1.25rem;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .setting-card:hover {
    border-color: #e2e8f0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  }

  .setting-card.active {
    border-color: #3b82f6;
    background: #f8fbff;
    box-shadow: 0 8px 24px -4px rgba(59, 130, 246, 0.08);
  }

  .setting-card.mini {
    padding: 1rem 1.25rem;
  }

  .setting-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .setting-text h4 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: #1e293b;
  }

  .setting-text p {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: #64748b;
    line-height: 1.5;
  }

  /* Sub Settings */
  .sub-settings {
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 1px solid #eef2f6;
  }

  .sub-settings-grid {
    margin-top: 1.25rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .mt-3 { margin-top: 0.75rem; }

  /* Fields */
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field label, .slider-field label {
    font-size: 0.65rem;
    font-weight: 800;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .val-badge {
    font-size: 0.7rem;
    font-weight: 700;
    color: #3b82f6;
    background: #eff6ff;
    padding: 2px 6px;
    border-radius: 6px;
  }

  /* Select Styling */
  .select-glow {
    position: relative;
  }

  .select-glow select {
    width: 100%;
    padding: 0.625rem 0.875rem;
    border-radius: 12px;
    border: 1.5px solid #e2e8f0;
    background: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #334155;
    appearance: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .select-glow:after {
    content: '';
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 10px;
    background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>') no-repeat center;
    pointer-events: none;
    opacity: 0.5;
  }

  .select-glow select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.06);
  }

  /* Toggles */
  .toggle-wrapper {
    position: relative;
    width: 44px;
    height: 24px;
    flex: 0 0 auto;
  }

  .toggle-wrapper input {
    opacity: 0;
    width: 0; height: 0;
  }

  .toggle-switch {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #e2e8f0;
    transition: .3s;
    border-radius: 24px;
  }

  .toggle-switch:after {
    content: "";
    position: absolute;
    height: 18px; width: 18px;
    left: 3px; bottom: 3px;
    background-color: white;
    transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  input:checked + .toggle-switch { background-color: #3b82f6; }
  input:checked + .toggle-switch:after { transform: translateX(20px); }

  /* Sliders */
  input[type="range"] {
    width: 100%;
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    appearance: none;
    outline: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border: 3px solid #ffffff;
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  /* Row items */
  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0.5rem;
    gap: 2rem;
  }

  .blur-control {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    max-width: 12rem;
  }

  .percent-label {
    min-width: 2.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: #3b82f6;
    text-align: right;
  }
</style>
