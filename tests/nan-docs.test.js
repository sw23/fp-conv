// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * docs/nan-behavior.md's two tables, as executable assertions.
 *
 * "Vectors" is the doc's worked examples of the preserve rule; "What each
 * format can keep" is its summary of the rule per format. Both were written by
 * hand, so this reads them out of the markdown and checks every cell against
 * the library: a change to either side that the other does not follow fails
 * here.
 *
 * The cell conventions the parser understands, and nothing more:
 *   Vectors
 *     - Source / Target   a label from FORMAT_LABELS; a target may be a chain
 *                         "A → B", converted step by step under the same mode
 *     - Input and both mode columns: exactly one "`0xHEX`"
 *     - Why               prose, ignored, but must not be empty
 *   What each format can keep
 *     - Target            a label from KEEP_ROWS
 *     - Sign              "✓" kept, "✗" dropped, "—" no NaN at all
 *     - Payload bits      a whole number, or "—" with no NaN at all
 *     - Notes             prose, ignored
 * Anything else throws, so an unknown spelling fails loudly rather than
 * skipping an assertion.
 */

const fs = require('fs');
const path = require('path');

const {
    FloatingPoint, Integer, FORMATS, convertEncoded,
} = require('../lib/floating-point.js');

// ---------------------------------------------------------------------------
// Reading a table out of the doc
// ---------------------------------------------------------------------------

const DOC = path.join(__dirname, '..', 'docs', 'nan-behavior.md');
const TEXT = fs.readFileSync(DOC, 'utf8');

function readTable(heading) {
    const start = TEXT.indexOf(heading + '\n');
    if (start === -1) throw new Error(`"${heading}" is gone from ${DOC}`);
    // Up to the next heading, so a later section's table can never be read here.
    const rest = TEXT.slice(start + heading.length);
    const end = rest.indexOf('\n## ');
    const section = end === -1 ? rest : rest.slice(0, end);

    const rows = section
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('|'))
        // Drop the |---|---| separator.
        .filter(line => !/^\|[\s:|-]+\|$/.test(line))
        .map(line => line.slice(1, -1).split('|').map(cell => cell.trim()));

    if (rows.length < 2) throw new Error(`No table found under "${heading}"`);
    const [header, ...body] = rows;
    for (const row of body) {
        if (row.length !== header.length) {
            throw new Error(`Row has ${row.length} cells, header has ${header.length}: ${row.join(' | ')}`);
        }
    }
    return { header, body };
}

function buildFormat(key) {
    const layout = /^s([01])e(\d+)m(\d+)$/.exec(key);
    if (layout) return new FloatingPoint(Number(layout[1]), Number(layout[2]), Number(layout[3]));
    const preset = FORMATS[key];
    return preset.isInteger
        ? new Integer(preset.bits, preset.signed, preset)
        : FloatingPoint.fromFormat(key);
}

const hexOf = (format, e) => format.toHexString(e.sign, e.exponent, e.mantissa);

// ---------------------------------------------------------------------------
// "Vectors"
// ---------------------------------------------------------------------------

// The doc writes format names for people; this is the mapping, spelled out
// rather than inferred so a renamed label fails loudly.
const FORMAT_LABELS = {
    'FP64': 'fp64',
    'FP32': 'fp32',
    'FP16': 'fp16',
    'BF16': 'bf16',
    'FP8 E4M3': 'fp8_e4m3',
    'E8M0': 'e8m0',
    'FP4 E2M1': 'fp4_e2m1',
    'INT8': 'int8',
    '`s0e8m23`': 's0e8m23',
    '`s1e15m112`': 's1e15m112',
};

function formatKey(label) {
    if (!Object.prototype.hasOwnProperty.call(FORMAT_LABELS, label)) {
        throw new Error(`Unknown format label in ${DOC}: "${label}"`);
    }
    return FORMAT_LABELS[label];
}

function patternCell(cell) {
    const match = /^`(0x[0-9A-F]+)`$/.exec(cell);
    if (!match) throw new Error(`Cannot read bit-pattern cell: "${cell}"`);
    return match[1];
}

const VECTOR_HEADER = ['Source', 'Input', 'Target', '`canonical`', '`preserve`', 'Why'];
const vectors = readTable('## Vectors');

describe('docs/nan-behavior.md "Vectors" table', () => {
    test('the table has the shape the parser assumes', () => {
        expect(vectors.header).toEqual(VECTOR_HEADER);
        expect(vectors.body.length).toBeGreaterThanOrEqual(14);
    });

    for (const [sourceLabel, inputCell, targetCell, canonicalCell, preserveCell, why] of vectors.body) {
        const steps = [sourceLabel, ...targetCell.split(' → ')].map(formatKey);
        const input = patternCell(inputCell);
        const expected = { canonical: patternCell(canonicalCell), preserve: patternCell(preserveCell) };

        for (const nanMode of ['canonical', 'preserve']) {
            test(`${sourceLabel} ${input} -> ${targetCell} | ${nanMode} -> ${expected[nanMode]}`, () => {
                expect(why).not.toBe('');
                let from = buildFormat(steps[0]);
                let encoded = from.fromHexString(input);
                // Every row is about a NaN input; a typo that made it a number
                // would otherwise pass in whichever mode it happened to match.
                expect(encoded.sign !== undefined &&
                    from.classify(encoded.sign, encoded.exponent, encoded.mantissa)).toBe('NaN');
                for (const key of steps.slice(1)) {
                    const to = buildFormat(key);
                    encoded = convertEncoded(from, encoded, to, { nanMode });
                    from = to;
                }
                expect(hexOf(from, encoded)).toBe(expected[nanMode]);
            });
        }
    }
});

// ---------------------------------------------------------------------------
// "What each format can keep"
// ---------------------------------------------------------------------------

const KEEP_ROWS = {
    'FP64': ['fp64'],
    'FP32': ['fp32'],
    'FP16 / TF32': ['fp16', 'tf32'],
    'BF16': ['bf16'],
    'FP8 E5M2': ['fp8_e5m2'],
    'FP8 E4M3': ['fp8_e4m3'],
    'E8M0': ['e8m0'],
    'FP6 E3M2 / E2M3, FP4 E2M1': ['fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1'],
    'INT* / UINT* / MXINT8': ['int32', 'uint32', 'int16', 'uint16', 'int8', 'uint8',
        'int4', 'uint4', 'mxint8'],
};

function signCell(cell) {
    switch (cell) {
    case '✓': return true;
    case '✗': return false;
    case '—': return null;
    default: throw new Error(`Cannot read sign cell: "${cell}"`);
    }
}

function payloadCell(cell) {
    if (cell === '—') return null;
    if (!/^\d+$/.test(cell)) throw new Error(`Cannot read payload cell: "${cell}"`);
    return Number(cell);
}

// Measured, not derived from the layout: start from a quiet NaN of the widest
// layout the library has (112 mantissa bits, quiet bit 111) and count the
// payload bits whose flip changes what preserve produces. That is how many the
// target can carry, whatever the format's flags claim.
const WIDEST = new FloatingPoint(1, 15, 112);
const QUIET_BIT = 111n;

function preserved(target, sign, mantissa) {
    return convertEncoded(WIDEST, { sign, exponent: WIDEST.maxExponent, mantissa },
        target, { nanMode: 'preserve' });
}

function keptPayloadBits(target) {
    const base = hexOf(target, preserved(target, 0, 1n << QUIET_BIT));
    let kept = 0;
    for (let bit = 0n; bit < QUIET_BIT; bit++) {
        const flipped = preserved(target, 0, (1n << QUIET_BIT) | (1n << bit));
        if (hexOf(target, flipped) !== base) kept++;
    }
    return kept;
}

const keep = readTable('## What each format can keep');

describe('docs/nan-behavior.md "What each format can keep" table', () => {
    test('the table has the shape the parser assumes', () => {
        expect(keep.header).toEqual(['Target', 'Sign', 'Payload bits', 'Notes']);
    });

    test('the row labels are the ones this test knows how to map', () => {
        const labels = keep.body.map(row => row[0].replace(/\\/g, ''));
        expect(labels).toEqual(Object.keys(KEEP_ROWS));
    });

    test('the rows between them cover every preset format', () => {
        const covered = Object.values(KEEP_ROWS).flat();
        expect(covered.slice().sort()).toEqual(Object.keys(FORMATS).slice().sort());
    });

    for (const [rawLabel, signText, payloadText] of keep.body) {
        const label = rawLabel.replace(/\\/g, '');
        const keys = KEEP_ROWS[label] || [];
        const sign = signCell(signText);
        const payload = payloadCell(payloadText);

        for (const key of keys) {
            test(`${label} (${key}): sign ${signText}, payload ${payloadText}`, () => {
                const target = buildFormat(key);
                // "—" in one column means no NaN, so it must be "—" in both.
                expect(sign === null).toBe(payload === null);
                if (sign === null) {
                    expect(target.nanTarget()).not.toBe('nan');
                    return;
                }
                expect(target.nanTarget()).toBe('nan');
                expect(preserved(target, 1, 1n << QUIET_BIT).sign).toBe(sign ? 1 : 0);
                expect(keptPayloadBits(target)).toBe(payload);
            });
        }
    }
});

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

describe('docs/nan-behavior.md: the claims around the tables', () => {
    test('a typed -nan is canonical, positive, under both modes', () => {
        expect(TEXT).toMatch(/typed `-nan` encodes as a positive NaN/);
        for (const key of ['fp32', 'fp16', 'fp8_e4m3']) {
            const format = buildFormat(key);
            for (const nanMode of ['canonical', 'preserve']) {
                const encoded = format.encode('-nan', { nanMode });
                expect(hexOf(format, encoded)).toBe(hexOf(format, format.getNaN()));
                expect(encoded.sign).toBe(0);
            }
        }
    });

    test('the naive Infinity the rule avoids is spelled correctly', () => {
        // "FP32 0x7F800001 naively narrowed to FP16 is 0x7C00": a zero
        // mantissa at the top exponent really is FP16's +Infinity.
        expect(TEXT).toContain('`0x7F800001` naively narrowed to FP16 is `0x7C00`');
        const fp16 = buildFormat('fp16');
        const { sign, exponent, mantissa } = fp16.fromHexString('0x7C00');
        expect(fp16.decode(sign, exponent, mantissa)).toBe(Infinity);
    });

    test('it cites the specs, not another implementation', () => {
        expect(TEXT).toContain('IEEE 754-2019 §6.2.3');
        expect(TEXT).toContain('Intel SDM Vol. 1');
        expect(TEXT).toContain('FPCR.DN');
    });
});
