// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * docs/overflow-behavior.md's "NaN and Infinity inputs" table, as executable
 * assertions.
 *
 * That table is the only written-down statement of what a NaN or an Infinity
 * becomes in each format, and it was hand-maintained: nothing stopped it from
 * drifting away from the code. This test reads the table out of the markdown
 * file and encodes NaN, +Infinity and -Infinity into every format each row
 * names, under BOTH overflow modes, so a change to either side that the other
 * does not follow fails here.
 *
 * The cell conventions the parser understands, and nothing more:
 *   - "A or B"        A is the `overflow` answer, B is `saturate`
 *   - "A"             the same answer under both modes
 *   - "**A**"         bold marks a cell the specs leave open; it means nothing here
 *   - "A (`0xNN`)"    assert the value AND the bit pattern
 *   - "`0xNN`"        assert the bit pattern alone
 */

const fs = require('fs');
const path = require('path');

const {
    FloatingPoint, Integer, FORMATS,
} = require('../lib/floating-point.js');

// ---------------------------------------------------------------------------
// Reading the table out of the doc
// ---------------------------------------------------------------------------

const DOC = path.join(__dirname, '..', 'docs', 'overflow-behavior.md');
const SECTION = '## NaN and Infinity inputs';

function readTable() {
    const text = fs.readFileSync(DOC, 'utf8');
    const start = text.indexOf(SECTION);
    if (start === -1) throw new Error(`"${SECTION}" is gone from ${DOC}`);
    // Up to the next heading, so a later section's table can never be read here.
    const rest = text.slice(start + SECTION.length);
    const end = rest.indexOf('\n## ');
    const section = end === -1 ? rest : rest.slice(0, end);

    const rows = section
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('|'))
        // Drop the |---|---| separator.
        .filter(line => !/^\|[\s:|-]+\|$/.test(line))
        .map(line => line.slice(1, -1).split('|').map(cell => cell.trim()));

    if (rows.length < 2) throw new Error(`No table found under "${SECTION}"`);
    const [header, ...body] = rows;
    return { header, body };
}

// The doc writes the row labels for people; this is the mapping to preset keys,
// spelled out rather than inferred so a renamed row fails loudly.
const ROW_FORMATS = {
    'FP64 / FP32 / FP16 / BF16 / TF32 / E5M2':
        ['fp64', 'fp32', 'fp16', 'bf16', 'tf32', 'fp8_e5m2'],
    'FP8 E4M3': ['fp8_e4m3'],
    'FP6 E3M2 / E2M3, FP4 E2M1': ['fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1'],
    'E8M0': ['e8m0'],
    'MXINT8': ['mxint8'],
    'INT* / UINT*': ['int32', 'uint32', 'int16', 'uint16', 'int8', 'uint8', 'int4', 'uint4'],
};

// The value each column heading names.
const COLUMN_INPUTS = {
    'NaN': NaN,
    '+Infinity': Infinity,
    '−Infinity': -Infinity,
};

function buildFormat(key) {
    const preset = FORMATS[key];
    return preset.isInteger
        ? new Integer(preset.bits, preset.signed, preset)
        : FloatingPoint.fromFormat(key);
}

// ---------------------------------------------------------------------------
// Reading a cell
// ---------------------------------------------------------------------------

// "**+1.984375** (`0x7F`)" -> { value: '+1.984375', hex: '0x7F' }
function parseAlternative(raw) {
    let text = raw.replace(/\*\*/g, '').trim();
    let hex = null;
    const hexMatch = /`(0[xX][0-9a-fA-F]+)`/.exec(text);
    if (hexMatch) {
        hex = hexMatch[1].toUpperCase().replace('0X', '0x');
        text = text.replace(hexMatch[0], '').replace(/[()]/g, '').trim();
    }
    return { value: text === '' ? null : text, hex };
}

// A cell is one alternative (both modes) or two ("overflow or saturate").
function parseCell(cell) {
    const parts = cell.split(' or ').map(parseAlternative);
    if (parts.length === 1) return { overflow: parts[0], saturate: parts[0] };
    if (parts.length === 2) return { overflow: parts[0], saturate: parts[1] };
    throw new Error(`Cannot read table cell: "${cell}"`);
}

// The largest finite magnitude the format holds, positive.
function maxMagnitude(format) {
    if (format.isInteger) return format.maxRealValue;
    const max = format.getMaxNormal(false);
    return format.decode(max.sign, max.exponent, max.mantissa);
}

// Turn a cell's value token into the number it names. Everything the table
// actually uses, and nothing else: an unknown token is a test failure, not a
// silently skipped assertion.
function expectedValue(token, format) {
    switch (token) {
    case 'NaN': return NaN;
    case '+∞': return Infinity;
    case '−∞': return -Infinity;
    case '+max': return maxMagnitude(format);
    case '−max': return -maxMagnitude(format);
    // The integer row speaks of the format's bounds rather than a magnitude,
    // because UINT's "min" is zero, not the negative of its max.
    case 'max': return format.maxRealValue;
    case 'min': return format.minRealValue;
    case '2^127': return Math.pow(2, 127);
    default: {
        const n = Number(token.replace('−', '-'));
        if (Number.isNaN(n)) throw new Error(`Cannot read table value: "${token}"`);
        return n;
    }
    }
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

const { header, body } = readTable();

describe('docs/overflow-behavior.md "NaN and Infinity inputs" table', () => {
    test('the table has the shape the parser assumes', () => {
        expect(header[0]).toBe('Target');
        expect(header.slice(1)).toEqual(Object.keys(COLUMN_INPUTS));
        expect(body.length).toBe(Object.keys(ROW_FORMATS).length);
    });

    test('the row labels are the ones this test knows how to map', () => {
        const labels = body.map(row => row[0].replace(/\\/g, ''));
        expect(labels).toEqual(Object.keys(ROW_FORMATS));
    });

    test('the rows between them cover every preset format', () => {
        const covered = Object.values(ROW_FORMATS).flat();
        expect(covered.slice().sort()).toEqual(Object.keys(FORMATS).slice().sort());
    });

    for (const row of body) {
        const label = row[0].replace(/\\/g, '');
        const keys = ROW_FORMATS[label] || [];

        for (const [columnIndex, column] of Object.keys(COLUMN_INPUTS).entries()) {
            const cell = row[columnIndex + 1];
            const input = COLUMN_INPUTS[column];
            const parsed = parseCell(cell);

            for (const overflowMode of ['overflow', 'saturate']) {
                for (const key of keys) {
                    test(`${label} | ${column} | ${overflowMode} -> "${cell}" (${key})`, () => {
                        const format = buildFormat(key);
                        const encoded = format.encode(input, { overflowMode });
                        const expectation = parsed[overflowMode];

                        if (expectation.value !== null) {
                            const actual = format.decode(
                                encoded.sign, encoded.exponent, encoded.mantissa);
                            const expected = expectedValue(expectation.value, format);
                            if (Number.isNaN(expected)) {
                                expect(actual).toBeNaN();
                            } else {
                                expect(actual).toBe(expected);
                            }
                        }

                        if (expectation.hex !== null) {
                            expect(format.toHexString(
                                encoded.sign, encoded.exponent, encoded.mantissa))
                                .toBe(expectation.hex);
                        }
                    });
                }
            }
        }
    }
});

// ---------------------------------------------------------------------------
// The prose beneath the table
// ---------------------------------------------------------------------------

// The table above is executable; the paragraph that explains the web UI's
// precision-loss row was not, and it drifted: it glossed `sign not
// representable` as "the reflection above", pointing at the -Infinity -> E8M0
// bullet - the one reflection that cannot produce that label, because E8M0 has
// no infinity to reflect towards and the conversion reports what happened to
// the value instead. tests/ui.test.js drives the page for each word; this
// guards the sentence that names them.
describe('docs/overflow-behavior.md: the precision-loss vocabulary', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    // The labels src/ui.js actually puts in the row.
    const LABELS = [
        'saturated', 'overflow', 'sign not representable', 'NaN not representable',
    ];

    test('the doc names every label the row can show', () => {
        for (const label of LABELS) {
            expect(text).toContain(`\`${label}\``);
        }
    });

    test('it does not pin "sign not representable" on the E8M0 reflection', () => {
        // The old wording, in any spacing.
        expect(text).not.toMatch(/`sign not representable`\s*\(the reflection above\)/);
    });

    test('it says which conversions do report it', () => {
        const paragraph = text.slice(text.indexOf('`sign not representable` is the'));
        expect(paragraph).toContain('−0 into any unsigned format');
        expect(paragraph).toContain('s0e8m23');
        // ...and says explicitly that E8M0 is not one of them.
        expect(paragraph).toMatch(/E8M0 has no infinity/);
    });
});
