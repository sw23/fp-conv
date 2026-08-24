// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * Classic-script safety for the shipped HTML pages.
 *
 * Every `<script src>` on these pages is a CLASSIC script, not a module. All of
 * them therefore share ONE global lexical environment: a top-level `let`,
 * `const` or `class` declared in two different files is a redeclaration, and the
 * browser throws
 *
 *     SyntaxError: Identifier 'x' has already been declared
 *
 * *before running the second file at all*. That is a hard load failure, not a
 * warning — and it is invisible to the rest of the suite, because Jest loads
 * each module through CommonJS, where every file gets its own scope.
 *
 * That exact bug shipped once: src/url-state.js and src/webmcp.js both declared
 * `let _FloatingPoint, _Integer, _FORMATS`, so webmcp.js never executed in the
 * browser and registerWebMCP() silently never ran. The private library aliases
 * now carry a per-file prefix (_us*, _mcp*, _fc*); this test is what keeps them
 * that way, and generalizes the rule to any future top-level binding.
 *
 * The script list is read out of the HTML rather than hard-coded, so adding a
 * script to a page automatically brings it under the check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Local `<script src="...">` tags, in document order. Inline scripts and
// absolute/CDN URLs are irrelevant here.
function scriptSources(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const sources = [];
    const tag = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = tag.exec(html)) !== null) {
        const src = match[1];
        if (/^[a-z]+:|^\/\//i.test(src)) continue; // external
        sources.push(path.resolve(path.dirname(htmlPath), src));
    }
    return sources;
}

/**
 * Top-level lexical bindings (`let` / `const` / `class`) declared by a script.
 *
 * Deliberately a shallow scan: only column-zero declarations are top level, so
 * anything indented is inside a function or block and cannot collide. `var` and
 * `function` are excluded because redeclaring those across classic scripts is
 * legal and does not throw.
 */
function topLevelLexicalNames(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const names = new Set();

    for (const line of source.split('\n')) {
        const declaration = /^(?:let|const|class)\s+([^=;{]+)/.exec(line);
        if (!declaration) continue;
        for (const part of declaration[1].split(',')) {
            const name = part.trim().replace(/\s.*$/, '');
            if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        }
    }
    return names;
}

const PAGES = [
    { label: 'index.html', file: path.join(ROOT, 'index.html') },
    // One format page stands in for all 20: they share the same script pair.
    { label: 'formats/fp32.html', file: path.join(ROOT, 'formats', 'fp32.html') },
];

describe('classic scripts share one global lexical scope', () => {
    for (const page of PAGES) {
        describe(page.label, () => {
            const sources = scriptSources(page.file);

            test('loads at least two local scripts (otherwise this test is vacuous)', () => {
                expect(sources.length).toBeGreaterThan(1);
                for (const src of sources) {
                    expect(fs.existsSync(src)).toBe(true);
                }
            });

            test('no two scripts declare the same top-level lexical binding', () => {
                const owner = new Map();
                const collisions = [];

                for (const src of sources) {
                    const rel = path.relative(ROOT, src);
                    for (const name of topLevelLexicalNames(src)) {
                        if (owner.has(name)) {
                            collisions.push(`"${name}" declared by both ${owner.get(name)} and ${rel}`);
                        } else {
                            owner.set(name, rel);
                        }
                    }
                }

                // A collision here means the page fails to load in a browser.
                expect(collisions).toEqual([]);
            });
        });
    }

    test('the scanner actually detects a duplicate (guards the guard)', () => {
        // If topLevelLexicalNames() silently stopped finding declarations, the
        // test above would pass forever. Pin it against known real bindings.
        const urlState = topLevelLexicalNames(path.join(ROOT, 'src', 'url-state.js'));
        const webmcp = topLevelLexicalNames(path.join(ROOT, 'src', 'webmcp.js'));

        expect(urlState.has('_usFloatingPoint')).toBe(true);
        expect(urlState.has('ROUNDING_MODE_VALUES')).toBe(true);
        expect(webmcp.has('_mcpFloatingPoint')).toBe(true);

        // The original bug: both files used the same unprefixed names.
        for (const shared of ['_FloatingPoint', '_Integer', '_FORMATS']) {
            expect(urlState.has(shared)).toBe(false);
            expect(webmcp.has(shared)).toBe(false);
        }
    });
});
