// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Light/dark theme toggle.
//
// index.html loads this file from <head> WITHOUT defer, so the stored
// preference lands on <html data-theme> before the first paint - deferring it
// would flash the other theme. With no stored preference the attribute stays
// off and style.css decides from prefers-color-scheme.

const THEME_STORAGE_KEY = 'fp-conv-theme';
const THEME_QUERY = '(prefers-color-scheme: dark)';

// localStorage is unavailable in private mode and on some file:// origins, and
// it throws rather than returning null. A theme preference is never worth an
// exception, so both accessors swallow it and behave as "no preference".
function readStoredTheme() {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
        return null;
    }
}

function storeTheme(theme) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // The choice just will not survive a reload.
    }
}

function systemTheme() {
    return window.matchMedia && window.matchMedia(THEME_QUERY).matches ? 'dark' : 'light';
}

// The theme actually in effect: an explicit choice if there is one, otherwise
// whatever the OS is asking for.
function resolvedTheme() {
    return readStoredTheme() || systemTheme();
}

// Anything other than 'light'/'dark' clears the override and hands control back
// to the prefers-color-scheme rules.
function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// The button advertises where a click will take you, not where you are.
function updateThemeToggle(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.textContent = next === 'dark' ? 'Dark' : 'Light';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
    btn.setAttribute('title', `Switch to ${next} theme`);
}

// The stylesheet reacts to data-theme on its own, but anything painted into a
// <canvas> has already baked in the old colors and has to be told to repaint.
function announceTheme(theme) {
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

function toggleTheme() {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    applyTheme(next);
    updateThemeToggle(next);
    announceTheme(next);
    return next;
}

function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    updateThemeToggle(resolvedTheme());

    // Until the reader picks a theme the OS stays in charge, so the button
    // label has to follow it.
    const query = window.matchMedia && window.matchMedia(THEME_QUERY);
    if (query && query.addEventListener) {
        query.addEventListener('change', () => {
            if (readStoredTheme()) return;
            const theme = systemTheme();
            updateThemeToggle(theme);
            announceTheme(theme);
        });
    }
}

applyTheme(readStoredTheme());
document.addEventListener('DOMContentLoaded', setupThemeToggle);

// Export for Node.js (testing). The browser loads this file as a plain script,
// so this block is inert there.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        THEME_STORAGE_KEY,
        readStoredTheme,
        storeTheme,
        systemTheme,
        resolvedTheme,
        applyTheme,
        announceTheme,
        updateThemeToggle,
        toggleTheme,
        setupThemeToggle,
    };
}
