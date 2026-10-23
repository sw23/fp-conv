// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// Writes the generated parts of each format page into its HTML: the nav, the
// bit layout, and the range, special-value and comparison tables. The pages
// still draw the tables on load, but a crawler that never runs JS would
// otherwise see empty <div>s where the page's most specific content goes.
//
//   npm run render:formats               rewrite formats/*.html in place
//   npm run render:formats -- --check    list stale pages, exit 1 if any
//
// Run it after changing FORMAT_PAGES, a page's FORMAT_CONFIG, or a renderer
// in formats/format-common.js. tests/format-pages-render.test.js fails until
// the pages match.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
    FORMAT_PAGES, GROUP_LABELS, renderStaticSections,
} = require('../formats/format-common.js');

const FORMATS_DIR = path.join(__dirname, '..', 'formats');
const INDENT = '        ';

function renderNav(currentKey) {
    const groups = new Map();
    for (const [key, info] of Object.entries(FORMAT_PAGES)) {
        if (!groups.has(info.group)) groups.set(info.group, []);
        groups.get(info.group).push({ key, ...info });
    }

    const lines = [
        '<nav class="format-nav" aria-label="Format guides">',
        '    <div class="nav-top">',
        '        <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Switch to dark theme" title="Switch to dark theme">Dark</button>',
        '    </div>',
        '    <div class="nav-groups">',
    ];
    for (const [groupId, items] of groups) {
        lines.push('        <div class="nav-group">');
        lines.push(`            <span class="nav-group-label">${GROUP_LABELS[groupId]}:</span>`);
        for (const item of items) {
            lines.push(item.key === currentKey
                ? `            <a class="nav-link active" href="${item.file}" aria-current="page">${item.label}</a>`
                : `            <a class="nav-link" href="${item.file}">${item.label}</a>`);
        }
        lines.push('        </div>');
    }
    lines.push('    </div>', '</nav>');
    return lines.map(line => INDENT + line).join('\n');
}

// The page's own FORMAT_CONFIG literal, evaluated on its own.
function readConfig(html, file) {
    const match = html.match(/window\.FORMAT_CONFIG = (\{[\s\S]*?\n\s*\});/);
    if (!match) throw new Error(`${file}: no window.FORMAT_CONFIG`);
    const sandbox = { window: {} };
    vm.runInNewContext(`window.FORMAT_CONFIG = ${match[1]};`, sandbox);
    return sandbox.window.FORMAT_CONFIG;
}

// Runs the same renderers the page runs on load, against a stand-in document
// that only records what each one writes.
function renderSections(cfg) {
    const written = new Map();
    const previous = global.document;
    global.document = {
        getElementById(id) {
            if (!written.has(id)) written.set(id, { innerHTML: '' });
            return written.get(id);
        },
    };
    try {
        renderStaticSections(cfg);
    } finally {
        global.document = previous;
    }
    return written;
}

function renderPage(html, key, file = FORMAT_PAGES[key].file) {
    const cfg = readConfig(html, file);
    if (cfg.navKey !== key) throw new Error(`${file}: navKey is '${cfg.navKey}', expected '${key}'`);

    const navPattern = / *<nav class="format-nav"[^>]*>[\s\S]*?<\/nav>/;
    if (!navPattern.test(html)) throw new Error(`${file}: no <nav class="format-nav">`);
    let out = html.replace(navPattern, () => renderNav(key));

    // Each container sits on one line of its own, and the generated markup has
    // no newlines, so a rerun replaces exactly what the last one wrote.
    for (const [id, { innerHTML }] of renderSections(cfg)) {
        const line = new RegExp(`^( *<div id="${id}"[^>]*>).*(</div>)$`, 'm');
        if (!line.test(out)) throw new Error(`${file}: no one-line <div id="${id}">`);
        out = out.replace(line, (_, open, close) => open + innerHTML + close);
    }
    return out;
}

function main(args) {
    const check = args.includes('--check');
    const stale = [];
    for (const [key, { file }] of Object.entries(FORMAT_PAGES)) {
        const target = path.join(FORMATS_DIR, file);
        const html = fs.readFileSync(target, 'utf8');
        const rendered = renderPage(html, key, file);
        if (rendered === html) continue;
        stale.push(file);
        if (!check) fs.writeFileSync(target, rendered);
    }
    if (check) {
        if (stale.length) {
            console.error(`Out of date: ${stale.join(', ')}\nRun: npm run render:formats`);
            process.exitCode = 1;
        }
    } else {
        console.log(stale.length ? `Rewrote ${stale.join(', ')}` : 'All format pages up to date');
    }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { renderNav, readConfig, renderPage };
