/**
 * @jest-environment jsdom
 */

// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// The inline pre-paint bootstrap in index.html's <head>.
//
// It sets <html data-theme> and <html data-mode> before the first paint so that
// src/theme.js and src/mode.js can load deferred instead of blocking render.
// That makes it a second copy of two decisions, and an inline script under a
// `script-src 'self'` policy, so two things can silently go wrong:
//
//  - it drifts from readStoredTheme()/resolvedMode(), and the page paints in one
//    theme or mode and then snaps to another when the deferred scripts run;
//  - it is edited without updating its sha256 in the CSP, and the browser
//    blocks it (and logs a console error) - the flash comes back on every load.
//
// This file pins both.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];

// Executable inline scripts: no src, and not a JSON-LD data block.
const inlineScripts = [...head.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\bsrc\s*=/.test(m[1] || '') && !/type\s*=\s*["']application\/ld\+json/.test(m[1] || ''))
    .map(m => m[2]);

describe('index.html pre-paint bootstrap', () => {
    test('there is exactly one inline script in <head>', () => {
        expect(inlineScripts).toHaveLength(1);
    });

    test('its sha256 is allowed by the page CSP', () => {
        const csp = head.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
        const scriptSrc = csp.split(';').map(d => d.trim()).find(d => d.startsWith('script-src'));
        const hash = crypto.createHash('sha256').update(inlineScripts[0], 'utf8').digest('base64');
        expect(scriptSrc.split(/\s+/)).toContain(`'sha256-${hash}'`);
    });

    test('theme.js and mode.js are deferred, so they no longer block render', () => {
        expect(head).toMatch(/<script src="src\/theme\.min\.js" defer><\/script>/);
        expect(head).toMatch(/<script src="src\/mode\.min\.js" defer><\/script>/);
    });
});

describe('the bootstrap decides exactly as theme.js and mode.js do', () => {
    const THEME_PATH = path.join(ROOT, 'src', 'theme.js');
    const MODE_PATH = path.join(ROOT, 'src', 'mode.js');
    const root = document.documentElement;

    afterEach(() => {
        jest.restoreAllMocks();
        delete window.matchMedia;
        window.localStorage.clear();
        window.history.replaceState(null, '', '/');
    });

    function runBootstrap() {
        root.removeAttribute('data-theme');
        root.removeAttribute('data-mode');
        new Function(inlineScripts[0])();
        return { theme: root.getAttribute('data-theme'), mode: root.getAttribute('data-mode') };
    }

    // What the deferred scripts put on <html> when they run against the same
    // storage, URL and viewport.
    function runScripts() {
        root.removeAttribute('data-theme');
        root.removeAttribute('data-mode');
        jest.resetModules();
        require(THEME_PATH);
        require(MODE_PATH);
        return { theme: root.getAttribute('data-theme'), mode: root.getAttribute('data-mode') };
    }

    const storedThemes = [null, 'light', 'dark', 'purple'];
    const urlModes = [null, 'basic', 'advanced', 'nonsense'];
    const storedModes = [null, 'basic', 'advanced', 'nonsense'];
    const viewports = ['narrow', 'wide', 'no-matchMedia'];

    const cases = [];
    for (const t of storedThemes) {
        for (const u of urlModes) {
            for (const s of storedModes) {
                for (const v of viewports) cases.push([t, u, s, v]);
            }
        }
    }

    test.each(cases)('theme=%s url mode=%s stored mode=%s viewport=%s', (theme, urlMode, storedMode, viewport) => {
        if (theme !== null) window.localStorage.setItem('fp-conv-theme', theme);
        if (storedMode !== null) window.localStorage.setItem('fp-conv-mode', storedMode);
        window.history.replaceState(null, '', urlMode === null ? '/' : `/?mode=${urlMode}`);
        if (viewport !== 'no-matchMedia') {
            const narrow = viewport === 'narrow';
            // Answer only the mode breakpoint; theme.js asks about the color
            // scheme, which neither copy writes to <html>.
            window.matchMedia = (query) => ({
                matches: query === '(max-width: 1120px)' ? narrow : false,
                addEventListener() {},
            });
        }

        expect(runBootstrap()).toEqual(runScripts());
    });

    test('storage that throws falls back the same way in both', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        window.matchMedia = () => ({ matches: false, addEventListener() {} });
        expect(runBootstrap()).toEqual(runScripts());
        expect(runBootstrap()).toEqual({ theme: null, mode: 'advanced' });
    });
});
