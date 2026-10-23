/**
 * @jest-environment jsdom
 */

// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * Each format page carries its nav as static HTML, not built by JS, so a
 * crawler that never runs scripts still sees every page link to every other.
 * Twenty hand-held copies drift, so this checks each one against FORMAT_PAGES.
 */

const fs = require('fs');
const path = require('path');

const { FORMAT_PAGES, GROUP_LABELS } = require('../formats/format-common.js');

const FORMATS_DIR = path.join(__dirname, '..', 'formats');

function loadPage(file) {
    const html = fs.readFileSync(path.join(FORMATS_DIR, file), 'utf8');
    return new DOMParser().parseFromString(html, 'text/html');
}

// FORMAT_PAGES grouped in insertion order, the order the nav lists them in.
function expectedGroups() {
    const groups = new Map();
    for (const [key, info] of Object.entries(FORMAT_PAGES)) {
        if (!groups.has(info.group)) groups.set(info.group, []);
        groups.get(info.group).push({ key, ...info });
    }
    return groups;
}

test('every formats/*.html page is listed in FORMAT_PAGES', () => {
    const onDisk = fs.readdirSync(FORMATS_DIR).filter(f => f.endsWith('.html')).sort();
    const listed = Object.values(FORMAT_PAGES).map(p => p.file).sort();
    expect(onDisk).toEqual(listed);
});

describe.each(Object.entries(FORMAT_PAGES))('%s page', (key, info) => {
    const doc = loadPage(info.file);
    const nav = doc.querySelector('nav.format-nav');

    test('has a static nav', () => {
        expect(nav).not.toBeNull();
    });

    test('nav lists every format page, grouped and in order', () => {
        const groups = Array.from(nav.querySelectorAll('.nav-group'));
        const expected = Array.from(expectedGroups());
        expect(groups.length).toBe(expected.length);
        groups.forEach((group, i) => {
            const [groupId, items] = expected[i];
            expect(group.querySelector('.nav-group-label').textContent).toBe(`${GROUP_LABELS[groupId]}:`);
            const links = Array.from(group.querySelectorAll('a.nav-link'));
            expect(links.map(a => [a.getAttribute('href'), a.textContent]))
                .toEqual(items.map(item => [item.file, item.label]));
        });
    });

    test('marks only its own link as the current page', () => {
        const active = nav.querySelectorAll('a.nav-link.active');
        expect(active.length).toBe(1);
        expect(active[0].getAttribute('href')).toBe(info.file);
        expect(active[0].getAttribute('aria-current')).toBe('page');
        expect(nav.querySelectorAll('[aria-current]').length).toBe(1);
    });

    test('nav holds the theme toggle', () => {
        const btn = nav.querySelector('#theme-toggle');
        expect(btn).not.toBeNull();
        expect(btn.tagName).toBe('BUTTON');
        expect(btn.getAttribute('aria-label')).toBe('Switch to dark theme');
    });

    test('links to the converter at the site root, not index.html', () => {
        const hrefs = Array.from(doc.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
        expect(hrefs).toContain('../');
        expect(hrefs.filter(h => h.endsWith('index.html') && !h.startsWith('http'))).toEqual([]);
    });

    test('its FORMAT_CONFIG names this page', () => {
        const script = Array.from(doc.querySelectorAll('script:not([src])'))
            .map(s => s.textContent).find(t => t.includes('FORMAT_CONFIG'));
        expect(script).toMatch(new RegExp(`navKey:\\s*'${key}'`));
    });
});
