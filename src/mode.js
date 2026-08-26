// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Basic/advanced view mode for the converter.
//
// Basic hides the format-authoring controls (custom bit widths, rounding and
// overflow selection) and the component breakdowns, leaving the preset formats,
// the value, and the precision loss readout. Advanced shows everything.
//
// Three states, like the theme: an explicit choice (stored or carried by a
// link) pins the mode; with no choice the viewport decides, so a screen too
// narrow for the two-column layout starts out simplified.
//
// index.html loads this file from <head> WITHOUT defer so <html data-mode>
// is set before the first paint; deferring it would flash the advanced
// controls. All hiding is done by style.css from that attribute - never write
// element.style.display from here, because ui.js already owns the inline
// display of the very controls involved.

const MODE_STORAGE_KEY = 'fp-conv-mode';
const MODE_PARAM = 'mode';
const MODE_VALUES = ['basic', 'advanced'];
// Also the fallback where matchMedia is unavailable.
const DEFAULT_MODE = 'basic';
// The width at which style.css drops .main-content to a single column.
const MODE_NARROW_QUERY = '(max-width: 1120px)';

function normalizeMode(mode) {
    return MODE_VALUES.indexOf(mode) === -1 ? null : mode;
}

// localStorage is unavailable in private mode and on some file:// origins, and
// it throws rather than returning null, so both accessors swallow it.
function readStoredMode() {
    try {
        return normalizeMode(window.localStorage.getItem(MODE_STORAGE_KEY));
    } catch {
        return null;
    }
}

function storeMode(mode) {
    try {
        window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
        // The choice just will not survive a reload.
    }
}

// A shared link carries the sender's mode, which outranks the reader's own
// stored preference for that visit.
function modeFromUrl() {
    try {
        return normalizeMode(new URLSearchParams(window.location.search).get(MODE_PARAM));
    } catch {
        return null;
    }
}

// Any explicit choice, from either source. While this is null the viewport is
// in charge and the mode has to stay free to follow it.
function pinnedMode() {
    return modeFromUrl() || readStoredMode();
}

// Too narrow for the two-column layout means too narrow for the advanced
// controls.
function viewportMode() {
    if (!window.matchMedia) return DEFAULT_MODE;
    return window.matchMedia(MODE_NARROW_QUERY).matches ? 'basic' : 'advanced';
}

function resolvedMode() {
    return pinnedMode() || viewportMode();
}

// The applied mode, which is what a toggle acts on. resolvedMode() cannot be
// used for that: the URL still holds the pre-toggle value until ui.js rewrites
// it.
function currentMode() {
    return normalizeMode(document.documentElement.getAttribute('data-mode')) || DEFAULT_MODE;
}

function applyMode(mode) {
    document.documentElement.setAttribute('data-mode', normalizeMode(mode) || DEFAULT_MODE);
}

// What ui.js should put in the shareable link, or null. Only an explicit choice
// belongs there - otherwise the recipient's own screen would be overruled.
function modeUrlValue() {
    return pinnedMode() ? currentMode() : null;
}

// The button advertises where a click will take you, not where you are.
function updateModeToggle(mode) {
    const btn = document.getElementById('mode-toggle');
    if (!btn) return;
    const next = mode === 'advanced' ? 'basic' : 'advanced';
    btn.textContent = next === 'advanced' ? 'Advanced' : 'Basic';
    btn.setAttribute('aria-label', `Switch to ${next} mode`);
    btn.setAttribute('title', `Switch to ${next} mode`);
}

// ui.js listens for this to write the mode into the shareable URL.
function announceMode(mode) {
    window.dispatchEvent(new CustomEvent('modechange', { detail: { mode } }));
}

function toggleMode() {
    const next = currentMode() === 'advanced' ? 'basic' : 'advanced';
    storeMode(next);
    applyMode(next);
    updateModeToggle(next);
    announceMode(next);
    return next;
}

function setupModeToggle() {
    const btn = document.getElementById('mode-toggle');
    if (btn) btn.addEventListener('click', toggleMode);
    updateModeToggle(currentMode());

    // Until the reader picks a mode the viewport stays in charge, so rotating a
    // tablet or dragging the window across the breakpoint has to re-decide.
    const query = window.matchMedia && window.matchMedia(MODE_NARROW_QUERY);
    if (query && query.addEventListener) {
        query.addEventListener('change', () => {
            if (pinnedMode()) return;
            const mode = viewportMode();
            applyMode(mode);
            updateModeToggle(mode);
            announceMode(mode);
        });
    }
}

applyMode(resolvedMode());
document.addEventListener('DOMContentLoaded', setupModeToggle);

// Export for Node.js (testing). The browser loads this file as a plain script,
// so this block is inert there.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MODE_STORAGE_KEY,
        MODE_PARAM,
        MODE_VALUES,
        DEFAULT_MODE,
        MODE_NARROW_QUERY,
        readStoredMode,
        storeMode,
        modeFromUrl,
        pinnedMode,
        viewportMode,
        resolvedMode,
        currentMode,
        applyMode,
        modeUrlValue,
        updateModeToggle,
        announceMode,
        toggleMode,
        setupModeToggle,
    };
}
