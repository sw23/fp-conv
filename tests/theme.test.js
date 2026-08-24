/**
 * @jest-environment jsdom
 */

// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

const path = require('path');

const THEME_PATH = path.join(__dirname, '..', 'src', 'theme.js');

// theme.js applies the stored theme and registers a DOMContentLoaded listener at
// require time, so every test needs a fresh copy against a fresh DOM. Jest keeps
// its own module registry, so require.cache surgery would not re-run the file -
// only resetModules() does.
function freshTheme() {
    jest.resetModules();
    return require(THEME_PATH);
}

function setSystemTheme(prefersDark) {
    window.matchMedia = jest.fn().mockReturnValue({
        matches: prefersDark,
        addEventListener: jest.fn(),
    });
}

beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML =
        '<button type="button" id="theme-toggle" class="theme-toggle">Dark</button>';
    window.localStorage.clear();
    setSystemTheme(false);
});

describe('stored preference', () => {
    test('is absent by default, leaving the OS in charge', () => {
        const theme = freshTheme();
        expect(theme.readStoredTheme()).toBeNull();
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    test('is applied to <html> at load time', () => {
        window.localStorage.setItem(theme_key(), 'dark');
        freshTheme();
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test('ignores a value that is not a known theme', () => {
        window.localStorage.setItem(theme_key(), 'solarized');
        const theme = freshTheme();
        expect(theme.readStoredTheme()).toBeNull();
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    test('survives localStorage throwing', () => {
        const getItem = jest.spyOn(window.localStorage.__proto__, 'getItem')
            .mockImplementation(() => { throw new Error('denied'); });
        const setItem = jest.spyOn(window.localStorage.__proto__, 'setItem')
            .mockImplementation(() => { throw new Error('denied'); });

        const theme = freshTheme();
        expect(theme.readStoredTheme()).toBeNull();
        expect(() => theme.storeTheme('dark')).not.toThrow();
        expect(theme.toggleTheme()).toBe('dark');

        getItem.mockRestore();
        setItem.mockRestore();
    });
});

describe('resolvedTheme', () => {
    test('falls back to the OS preference', () => {
        setSystemTheme(true);
        const theme = freshTheme();
        expect(theme.systemTheme()).toBe('dark');
        expect(theme.resolvedTheme()).toBe('dark');
    });

    test('lets an explicit choice beat the OS preference', () => {
        setSystemTheme(true);
        const theme = freshTheme();
        theme.storeTheme('light');
        expect(theme.resolvedTheme()).toBe('light');
    });

    test('treats a missing matchMedia as light', () => {
        delete window.matchMedia;
        const theme = freshTheme();
        expect(theme.systemTheme()).toBe('light');
    });
});

describe('applyTheme', () => {
    test('sets and clears the override attribute', () => {
        const theme = freshTheme();
        theme.applyTheme('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        theme.applyTheme('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        theme.applyTheme(null);
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });
});

describe('the toggle button', () => {
    test('advertises the theme a click will switch to', () => {
        const theme = freshTheme();
        theme.setupThemeToggle();

        const btn = document.getElementById('theme-toggle');
        expect(btn.textContent).toBe('Dark');
        expect(btn.getAttribute('aria-label')).toBe('Switch to dark theme');
        expect(btn.getAttribute('title')).toBe('Switch to dark theme');
    });

    test('starts from the OS preference rather than a hardcoded light', () => {
        setSystemTheme(true);
        const theme = freshTheme();
        theme.setupThemeToggle();
        expect(document.getElementById('theme-toggle').textContent).toBe('Light');
    });

    test('flips the theme, the label and storage on click', () => {
        const theme = freshTheme();
        theme.setupThemeToggle();
        const btn = document.getElementById('theme-toggle');

        btn.click();
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(theme.readStoredTheme()).toBe('dark');
        expect(btn.textContent).toBe('Light');
        expect(btn.getAttribute('aria-label')).toBe('Switch to light theme');

        btn.click();
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(theme.readStoredTheme()).toBe('light');
        expect(btn.textContent).toBe('Dark');
    });

    test('pins the theme even when it matches the OS, so later OS changes do not move it', () => {
        setSystemTheme(true);
        const theme = freshTheme();
        theme.setupThemeToggle();

        document.getElementById('theme-toggle').click();
        expect(theme.readStoredTheme()).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    test('is optional - setup is a no-op without the button', () => {
        document.body.innerHTML = '';
        const theme = freshTheme();
        expect(() => theme.setupThemeToggle()).not.toThrow();
        expect(() => theme.updateThemeToggle('dark')).not.toThrow();
    });

    test('follows the OS while no choice has been made', () => {
        const listeners = [];
        window.matchMedia = jest.fn().mockReturnValue({
            matches: false,
            addEventListener: (_event, fn) => listeners.push(fn),
        });

        const theme = freshTheme();
        theme.setupThemeToggle();
        const btn = document.getElementById('theme-toggle');
        expect(btn.textContent).toBe('Dark');

        setSystemTheme(true);
        listeners.forEach((fn) => fn());
        expect(btn.textContent).toBe('Light');
    });

    test('stops following the OS once a choice has been made', () => {
        const listeners = [];
        window.matchMedia = jest.fn().mockReturnValue({
            matches: false,
            addEventListener: (_event, fn) => listeners.push(fn),
        });

        const theme = freshTheme();
        theme.setupThemeToggle();
        const btn = document.getElementById('theme-toggle');
        btn.click();
        expect(btn.textContent).toBe('Light');

        setSystemTheme(true);
        listeners.forEach((fn) => fn());
        expect(btn.textContent).toBe('Light');
    });

    test('tolerates a matchMedia without addEventListener', () => {
        window.matchMedia = jest.fn().mockReturnValue({ matches: false });
        const theme = freshTheme();
        expect(() => theme.setupThemeToggle()).not.toThrow();
    });
});

// Canvas-based UI cannot react to CSS, so it listens for this instead.
describe('the themechange broadcast', () => {
    test('fires on click, carrying the new theme', () => {
        const seen = [];
        window.addEventListener('themechange', (e) => seen.push(e.detail.theme));

        const theme = freshTheme();
        theme.setupThemeToggle();
        document.getElementById('theme-toggle').click();
        document.getElementById('theme-toggle').click();

        expect(seen).toEqual(['dark', 'light']);
    });

    test('fires when the OS flips and no choice has been made', () => {
        const listeners = [];
        window.matchMedia = jest.fn().mockReturnValue({
            matches: false,
            addEventListener: (_event, fn) => listeners.push(fn),
        });
        const seen = [];
        window.addEventListener('themechange', (e) => seen.push(e.detail.theme));

        const theme = freshTheme();
        theme.setupThemeToggle();
        setSystemTheme(true);
        listeners.forEach((fn) => fn());

        expect(seen).toEqual(['dark']);
    });

    test('stays quiet when the OS flips under an explicit choice', () => {
        const listeners = [];
        window.matchMedia = jest.fn().mockReturnValue({
            matches: false,
            addEventListener: (_event, fn) => listeners.push(fn),
        });

        const theme = freshTheme();
        theme.setupThemeToggle();
        theme.storeTheme('light');

        const seen = [];
        window.addEventListener('themechange', (e) => seen.push(e.detail.theme));
        setSystemTheme(true);
        listeners.forEach((fn) => fn());

        expect(seen).toEqual([]);
    });
});

function theme_key() {
    return 'fp-conv-theme';
}
