// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * The format pages carry their nav and tables as static HTML, written by
 * scripts/render-format-pages.js from the same renderers the pages run on
 * load. A renderer, FORMAT_PAGES or FORMAT_CONFIG change that is not followed
 * by `npm run render:formats` fails here.
 */

const fs = require('fs');
const path = require('path');

const { FORMAT_PAGES } = require('../formats/format-common.js');
const { readConfig, renderPage } = require('../scripts/render-format-pages.js');

const FORMATS_DIR = path.join(__dirname, '..', 'formats');

describe.each(Object.entries(FORMAT_PAGES))('%s page', (key, { file }) => {
    const html = fs.readFileSync(path.join(FORMATS_DIR, file), 'utf8');

    test('is up to date (npm run render:formats)', () => {
        expect(renderPage(html, key, file)).toBe(html);
    });

    test('has every generated section filled in', () => {
        const cfg = readConfig(html, file);
        const ids = [cfg.bitLayoutId, cfg.rangeTableId, cfg.specialTableId, cfg.comparisonTableId];
        for (const id of ids) {
            expect(id).toBeTruthy();
            expect(html).not.toContain(`<div id="${id}"></div>`);
            expect(html).toMatch(new RegExp(`<div id="${id}"[^>]*><`));
        }
    });
});

describe('renderPage', () => {
    const fp16 = fs.readFileSync(path.join(FORMATS_DIR, 'fp16.html'), 'utf8');

    test('fills empty containers and an empty nav placeholder', () => {
        const blank = fp16
            .replace(/<nav class="format-nav"[^>]*>[\s\S]*?<\/nav>/, '<nav class="format-nav"></nav>')
            .replace(/^( *<div id="range-table"[^>]*>).*(<\/div>)$/m, '$1$2');
        expect(renderPage(blank, 'fp16')).toBe(fp16);
    });

    test('refuses a page whose navKey names another format', () => {
        expect(() => renderPage(fp16, 'fp32')).toThrow(/navKey is 'fp16'/);
    });

    test('refuses a page with no FORMAT_CONFIG', () => {
        expect(() => renderPage('<html></html>', 'fp16')).toThrow(/no window.FORMAT_CONFIG/);
    });

    test('refuses a container that is not on a line of its own', () => {
        const wrapped = fp16.replace(/^( *)(<div id="range-table")/m, '$1<span></span>$2');
        expect(() => renderPage(wrapped, 'fp16')).toThrow(/no one-line <div id="range-table">/);
    });
});
