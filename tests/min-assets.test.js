// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * index.html loads minified copies of its scripts and stylesheet, which are
 * committed because GitHub Pages serves the repository as-is. They are written
 * by scripts/build-min.js; a source edit that is not followed by
 * `npm run build:min` fails here.
 */

const fs = require('fs');
const path = require('path');

const { SOURCES, minPath, buildMin } = require('../scripts/build-min.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe.each(SOURCES)('%s', (source) => {
    const built = buildMin(source);

    test(`${minPath(source)} is up to date (npm run build:min)`, () => {
        expect(read(minPath(source))).toBe(built.code);
    });

    test(`${minPath(source)}.map is up to date (npm run build:min)`, () => {
        expect(read(minPath(source) + '.map')).toBe(built.map);
    });

    test('its source map points at the readable file beside it', () => {
        const map = JSON.parse(built.map);
        expect(map.sources).toEqual([path.basename(source)]);
        expect(built.code).toContain(`sourceMappingURL=${path.basename(minPath(source))}.map`);
    });
});

describe('index.html', () => {
    const html = read('index.html');

    // Every local script and stylesheet the page loads.
    const assets = [
        ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]),
        ...[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]),
    ].filter(url => !/^[a-z]+:/i.test(url));

    test('loads only minified scripts and stylesheets', () => {
        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) expect(asset).toMatch(/\.min\.(js|css)$/);
    });

    test('loads exactly the files build-min.js produces', () => {
        expect([...assets].sort()).toEqual(SOURCES.map(minPath).sort());
    });
});

describe('the minified library', () => {
    test('exports the same API as its source', () => {
        const source = require('../lib/floating-point.js');
        const min = require('../lib/floating-point.min.js');
        expect(Object.keys(min)).toEqual(Object.keys(source));
        // One real round trip through the minified code.
        const fp16 = new min.FloatingPoint(1, 5, 10);
        const enc = fp16.encode(Math.PI);
        expect(fp16.toHexString(enc.sign, enc.exponent, enc.mantissa))
            .toBe(new source.FloatingPoint(1, 5, 10).toHexString(enc.sign, enc.exponent, enc.mantissa));
    });
});
