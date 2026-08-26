/**
 * @jest-environment jsdom
 */

// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

const path = require('path');

const MODE_PATH = path.join(__dirname, '..', 'src', 'mode.js');
const MODE_KEY = 'fp-conv-mode';

// mode.js applies the resolved mode and registers a DOMContentLoaded listener at
// require time, so every test needs a fresh copy against a fresh DOM. Jest keeps
// its own module registry, so require.cache surgery would not re-run the file -
// only resetModules() does.
function freshMode() {
    jest.resetModules();
    return require(MODE_PATH);
}

function setSearch(search) {
    window.history.replaceState(null, '', search || '/');
}

// jsdom's own matchMedia never matches anything, so the viewport has to be
// stated outright. Returns the registered change listeners so a resize across
// the breakpoint can be simulated.
function setViewport(narrow) {
    const listeners = [];
    window.matchMedia = jest.fn().mockReturnValue({
        matches: narrow,
        addEventListener: (_event, fn) => listeners.push(fn),
    });
    return listeners;
}

beforeEach(() => {
    document.documentElement.removeAttribute('data-mode');
    document.body.innerHTML =
        '<button type="button" id="mode-toggle" class="mode-toggle">Advanced</button>';
    window.localStorage.clear();
    setSearch('/');
    setViewport(true);
});

describe('resolving the mode', () => {
    test('follows a narrow viewport when nothing is pinned', () => {
        const mode = freshMode();
        expect(mode.pinnedMode()).toBeNull();
        expect(mode.resolvedMode()).toBe('basic');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('follows a wide viewport when nothing is pinned', () => {
        setViewport(false);
        const mode = freshMode();
        expect(mode.resolvedMode()).toBe('advanced');
        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
    });

    test('falls back to basic without matchMedia', () => {
        delete window.matchMedia;
        const mode = freshMode();
        expect(mode.viewportMode()).toBe('basic');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('a stored preference outranks a wide viewport', () => {
        setViewport(false);
        window.localStorage.setItem(MODE_KEY, 'basic');
        const mode = freshMode();
        expect(mode.readStoredMode()).toBe('basic');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('a stored preference outranks a narrow viewport', () => {
        window.localStorage.setItem(MODE_KEY, 'advanced');
        const mode = freshMode();
        expect(mode.readStoredMode()).toBe('advanced');
        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
    });

    test('ignores a stored value that is not a known mode', () => {
        window.localStorage.setItem(MODE_KEY, 'expert');
        const mode = freshMode();
        expect(mode.readStoredMode()).toBeNull();
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('lets a shared link outrank the stored preference', () => {
        window.localStorage.setItem(MODE_KEY, 'basic');
        setSearch('/?in=fp16&out=bf16&mode=advanced');
        const mode = freshMode();
        expect(mode.modeFromUrl()).toBe('advanced');
        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
    });

    test('lets a shared link outrank the viewport', () => {
        setViewport(false);
        setSearch('/?mode=basic');
        const mode = freshMode();
        expect(mode.resolvedMode()).toBe('basic');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('ignores an unknown mode in the URL', () => {
        setSearch('/?mode=expert');
        const mode = freshMode();
        expect(mode.modeFromUrl()).toBeNull();
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('survives a search string it cannot parse', () => {
        const mode = freshMode();
        const original = global.URLSearchParams;
        global.URLSearchParams = function () { throw new Error('denied'); };
        try {
            expect(mode.modeFromUrl()).toBeNull();
        } finally {
            global.URLSearchParams = original;
        }
    });

    test('survives localStorage throwing', () => {
        const getItem = jest.spyOn(window.localStorage.__proto__, 'getItem')
            .mockImplementation(() => { throw new Error('denied'); });
        const setItem = jest.spyOn(window.localStorage.__proto__, 'setItem')
            .mockImplementation(() => { throw new Error('denied'); });

        const mode = freshMode();
        expect(mode.readStoredMode()).toBeNull();
        expect(() => mode.storeMode('advanced')).not.toThrow();
        expect(mode.toggleMode()).toBe('advanced');

        getItem.mockRestore();
        setItem.mockRestore();
    });
});

describe('applyMode', () => {
    test('falls back to basic for an unknown mode', () => {
        const mode = freshMode();
        mode.applyMode('advanced');
        mode.applyMode('expert');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('currentMode reads back what was applied', () => {
        const mode = freshMode();
        mode.applyMode('advanced');
        expect(mode.currentMode()).toBe('advanced');
    });

    test('currentMode defaults to basic when the attribute is missing', () => {
        const mode = freshMode();
        document.documentElement.removeAttribute('data-mode');
        expect(mode.currentMode()).toBe('basic');
    });
});

describe('the toggle button', () => {
    test('advertises the mode a click switches to', () => {
        const mode = freshMode();
        mode.setupModeToggle();

        const btn = document.getElementById('mode-toggle');
        expect(btn.textContent).toBe('Advanced');
        expect(btn.getAttribute('aria-label')).toBe('Switch to advanced mode');
        expect(btn.getAttribute('title')).toBe('Switch to advanced mode');
    });

    test('flips the attribute, the label and storage on click', () => {
        const mode = freshMode();
        mode.setupModeToggle();

        const btn = document.getElementById('mode-toggle');
        btn.click();

        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
        expect(btn.textContent).toBe('Basic');
        expect(btn.getAttribute('aria-label')).toBe('Switch to basic mode');
        expect(window.localStorage.getItem(MODE_KEY)).toBe('advanced');

        btn.click();
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
        expect(btn.textContent).toBe('Advanced');
        expect(window.localStorage.getItem(MODE_KEY)).toBe('basic');
    });

    test('toggles away from a mode the URL asked for, not the stale URL value', () => {
        setSearch('/?mode=advanced');
        const mode = freshMode();
        mode.setupModeToggle();

        expect(mode.toggleMode()).toBe('basic');
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');
    });

    test('is a no-op when the button is absent', () => {
        document.body.innerHTML = '';
        const mode = freshMode();
        expect(() => mode.setupModeToggle()).not.toThrow();
        expect(() => mode.updateModeToggle('basic')).not.toThrow();
    });

    test('tolerates matchMedia without addEventListener', () => {
        window.matchMedia = jest.fn().mockReturnValue({ matches: true });
        const mode = freshMode();
        expect(() => mode.setupModeToggle()).not.toThrow();
    });
});

describe('following the viewport', () => {
    test('re-decides when the breakpoint is crossed while unpinned', () => {
        const listeners = setViewport(true);
        const mode = freshMode();
        mode.setupModeToggle();
        expect(document.documentElement.getAttribute('data-mode')).toBe('basic');

        setViewport(false);
        listeners.forEach((fn) => fn());

        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
        expect(document.getElementById('mode-toggle').textContent).toBe('Basic');
    });

    test('stops following once the reader has chosen', () => {
        const listeners = setViewport(true);
        const mode = freshMode();
        mode.setupModeToggle();
        document.getElementById('mode-toggle').click();

        setViewport(false);
        listeners.forEach((fn) => fn());

        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');

        setViewport(true);
        listeners.forEach((fn) => fn());
        expect(document.documentElement.getAttribute('data-mode')).toBe('advanced');
    });
});

describe('modeUrlValue', () => {
    test('is null while the viewport is in charge', () => {
        const mode = freshMode();
        expect(mode.modeUrlValue()).toBeNull();
    });

    test('reports the applied mode once it is stored', () => {
        const mode = freshMode();
        mode.setupModeToggle();
        document.getElementById('mode-toggle').click();
        expect(mode.modeUrlValue()).toBe('advanced');
    });

    test('reports the applied mode when a link pinned it', () => {
        setViewport(false);
        setSearch('/?mode=basic');
        const mode = freshMode();
        expect(mode.modeUrlValue()).toBe('basic');
    });
});

describe('the modechange broadcast', () => {
    test('carries the new mode', () => {
        const mode = freshMode();
        const seen = [];
        window.addEventListener('modechange', (e) => seen.push(e.detail.mode));

        mode.setupModeToggle();
        document.getElementById('mode-toggle').click();

        expect(seen).toEqual(['advanced']);
    });
});
