# 2-Ball Slider Component (Dual Handle Range Slider)

## 1. CSS

Add this to your stylesheet.

```css
/* Dual Handle Range Slider */
.range-slider-container {
  position: relative;
  width: 100%;
  height: 30px;
  margin: 8px 0;
  touch-action: none; /* Important for drag handling */
}

.range-slider-track {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
}

.dark .range-slider-track {
  background: #334155;
}

.range-slider-fill {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  background: #9333ea;
  border-radius: 2px;
}

.range-slider-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  background: #9333ea;
  border: 3px solid white;
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

.range-slider-handle:active {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.1);
}

.dark .range-slider-handle {
  border-color: #1e293b;
}
```

## 2. JavaScript

### Usage Example
```javascript
// Example usage:
const container = document.getElementById('my-slider-container');
renderDualSlider(container, "Price Range", "price", { min: 0, max: 1000 });
```

### Implementation
```javascript
// State management (you might want to adapt this to your app's state)
let activeSlider = null;

// Function to render the slider
function renderDualSlider(container, label, propKey, metaRange) {
    if (!metaRange || metaRange.min >= metaRange.max) return;

    // Initial state (replace with your state management)
    const current = { min: metaRange.min, max: metaRange.max }; 
    const range = metaRange.max - metaRange.min;
    const minPct = ((current.min - metaRange.min) / range) * 100;
    const maxPct = ((current.max - metaRange.min) / range) * 100;

    const section = document.createElement('div');
    section.className = 'mt-4';
    section.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <label class="text-xs font-bold uppercase tracking-wider">${label}</label>
            <span class="text-xs font-mono">${current.min} – ${current.max}</span>
        </div>
        <div class="range-slider-container" data-prop="${propKey}" data-min="${metaRange.min}" data-max="${metaRange.max}">
            <div class="range-slider-track"></div>
            <div class="range-slider-fill" style="left: ${minPct}%; width: ${maxPct - minPct}%"></div>
            <div class="range-slider-handle" data-handle="min" style="left: ${minPct}%"></div>
            <div class="range-slider-handle" data-handle="max" style="left: ${maxPct}%"></div>
        </div>
    `;
    container.appendChild(section);

    // Add drag listeners
    const sliderContainer = section.querySelector('.range-slider-container');
    const handles = sliderContainer.querySelectorAll('.range-slider-handle');

    handles.forEach(handle => {
        handle.onmousedown = (e) => startSliderDrag(e);
        handle.ontouchstart = (e) => startSliderDrag(e);
    });
}

function startSliderDrag(e) {
    e.preventDefault();
    const handle = e.target;
    const container = handle.closest('.range-slider-container');
    const handleType = handle.dataset.handle; // 'min' or 'max'
    const propKey = container.dataset.prop;
    const minVal = parseInt(container.dataset.min);
    const maxVal = parseInt(container.dataset.max);

    activeSlider = { handle, container, handleType, propKey, minVal, maxVal };

    document.addEventListener('mousemove', dragSlider);
    document.addEventListener('mouseup', endSliderDrag);
    document.addEventListener('touchmove', dragSlider, { passive: false });
    document.addEventListener('touchend', endSliderDrag);
}

function dragSlider(e) {
    if (!activeSlider) return;
    e.preventDefault();

    const { container, handleType, propKey, minVal, maxVal } = activeSlider;
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;

    if (rect.width === 0) return;

    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));

    const newVal = Math.round(minVal + pct * (maxVal - minVal));

    // Update visuals
    updateSliderVisuals(container, propKey, minVal, maxVal, newVal, handleType);
}

function updateSliderVisuals(container, propKey, minVal, maxVal, newVal, handleType) {
    // NOTE: In a real app, you would update your state here
    // For this export, we'll read current visual state to simulate limits
    
    // Get current visual positions to enforce min < max
    // (This is a simplified adaptation of the original logic which relied on a central 'contentState')
    let currentMin = parseInt(container.dataset.currentMin || minVal);
    let currentMax = parseInt(container.dataset.currentMax || maxVal);

    if (handleType === 'min') {
        currentMin = Math.min(newVal, currentMax); 
        container.dataset.currentMin = currentMin;
    } else {
        currentMax = Math.max(newVal, currentMin);
        container.dataset.currentMax = currentMax;
    }

    const range = maxVal - minVal;
    if (range <= 0) return;

    const minPct = ((currentMin - minVal) / range) * 100;
    const maxPct = ((currentMax - minVal) / range) * 100;

    const fill = container.querySelector('.range-slider-fill');
    const handleMin = container.querySelector('.range-slider-handle[data-handle="min"]');
    const handleMax = container.querySelector('.range-slider-handle[data-handle="max"]');

    if (fill) {
        fill.style.left = `${minPct}%`;
        fill.style.width = `${maxPct - minPct}%`;
    }
    if (handleMin) handleMin.style.left = `${minPct}%`;
    if (handleMax) handleMax.style.left = `${maxPct}%`;

    // Update text label
    const labelSpan = container.previousElementSibling?.querySelector('span');
    if (labelSpan) {
        labelSpan.textContent = `${currentMin} – ${currentMax}`;
    }
}

function endSliderDrag() {
    activeSlider = null;
    document.removeEventListener('mousemove', dragSlider);
    document.removeEventListener('mouseup', endSliderDrag);
    document.removeEventListener('touchmove', dragSlider);
    document.removeEventListener('touchend', endSliderDrag);
}
```
