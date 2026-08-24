// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * OCP conformance: the normative tables, transcribed as data.
 *
 * Sources (cited so a reviewer can diff this file against the PDFs directly):
 *
 *   [OFP8] OCP 8-bit Floating Point Specification (OFP8), Revision 1.0,
 *          2023-12-01 (the revision that corrected the E4M3/E5M2 biases in
 *          §4.2). Tables 1, 2 and 3; §5.2.1 conversion rules.
 *   [MX]   OCP Microscaling Formats (MX) Specification, Version 1.0,
 *          2023-09-07. Tables 2, 3, 4, 5, 6 and 7; §4.1, §5.3.x, §5.4.1.
 *
 * Scope is SCALAR conformance. Block-level MX (32-element blocks with a shared
 * scale), the §6.3 scale-selection algorithm and the §6.1/§6.2 dot products are
 * deliberately out of scope; the two MX scalar types that needed new library
 * support, E8M0 and MXINT8, are in scope and covered below.
 *
 * Every tabulated value here is exactly representable as an fp64, so the
 * assertions use toBe rather than toBeCloseTo.
 */

const {
    FloatingPoint, Integer, FORMATS,
} = require('../lib/floating-point.js');

const fp = key => FloatingPoint.fromFormat(key);
const decode = (format, e) => format.decode(e.sign, e.exponent, e.mantissa);

// Strip the field separators the specification prints inside its bit patterns.
const bits = pattern => pattern.replace(/[ .]/g, '');

// ── [OFP8] Table 1 — exponent parameters ─────────────────────────────────
const OFP8_TABLE_1 = {
    fp8_e4m3: { bias: 7, emax: 8, emin: -6, binades: 18 },
    fp8_e5m2: { bias: 15, emax: 15, emin: -14, binades: 32 },
};

// ── [OFP8] Table 2 / [MX] Table 2 — FP8 value encodings ──────────────────
// `S` in the specification means either sign; each row is checked for both.
const OFP8_TABLE_2 = {
    fp8_e4m3: [
        { name: 'Zeros', pattern: 'S.0000.000', exponent: 0, mantissa: 0, value: 0 },
        { name: 'Max normal', pattern: 'S.1111.110', exponent: 15, mantissa: 6, value: 448 },
        { name: 'Min normal', pattern: 'S.0001.000', exponent: 1, mantissa: 0, value: Math.pow(2, -6) },
        { name: 'Max subnormal', pattern: 'S.0000.111', exponent: 0, mantissa: 7, value: 0.875 * Math.pow(2, -6) },
        { name: 'Min subnormal', pattern: 'S.0000.001', exponent: 0, mantissa: 1, value: Math.pow(2, -9) },
    ],
    fp8_e5m2: [
        { name: 'Zeros', pattern: 'S.00000.00', exponent: 0, mantissa: 0, value: 0 },
        { name: 'Max normal', pattern: 'S.11110.11', exponent: 30, mantissa: 3, value: 57344 },
        { name: 'Min normal', pattern: 'S.00001.00', exponent: 1, mantissa: 0, value: Math.pow(2, -14) },
        { name: 'Max subnormal', pattern: 'S.00000.11', exponent: 0, mantissa: 3, value: 0.75 * Math.pow(2, -14) },
        { name: 'Min subnormal', pattern: 'S.00000.01', exponent: 0, mantissa: 1, value: Math.pow(2, -16) },
    ],
};

// [OFP8] Table 2, Infinities and NaN rows.
const OFP8_SPECIALS = {
    fp8_e4m3: {
        infinities: null, // "N/A"
        nan: [{ pattern: 'S.1111.111', exponent: 15, mantissa: 7 }],
    },
    fp8_e5m2: {
        infinities: [{ pattern: 'S.11111.00', exponent: 31, mantissa: 0 }],
        nan: [
            { pattern: 'S.11111.01', exponent: 31, mantissa: 1 },
            { pattern: 'S.11111.10', exponent: 31, mantissa: 2 },
            { pattern: 'S.11111.11', exponent: 31, mantissa: 3 },
        ],
    },
};

// ── [MX] Table 4 — FP6 encodings ─────────────────────────────────────────
const MX_TABLE_4 = {
    fp6_e2m3: {
        bias: 1,
        rows: [
            { name: 'Zeros', pattern: 'S 00 000', exponent: 0, mantissa: 0, value: 0 },
            { name: 'Max normal', pattern: 'S 11 111', exponent: 3, mantissa: 7, value: 7.5 },
            { name: 'Min normal', pattern: 'S 01 000', exponent: 1, mantissa: 0, value: 1.0 },
            { name: 'Max subnormal', pattern: 'S 00 111', exponent: 0, mantissa: 7, value: 0.875 },
            { name: 'Min subnormal', pattern: 'S 00 001', exponent: 0, mantissa: 1, value: 0.125 },
        ],
    },
    fp6_e3m2: {
        bias: 3,
        rows: [
            { name: 'Zeros', pattern: 'S 000 00', exponent: 0, mantissa: 0, value: 0 },
            { name: 'Max normal', pattern: 'S 111 11', exponent: 7, mantissa: 3, value: 28.0 },
            { name: 'Min normal', pattern: 'S 001 00', exponent: 1, mantissa: 0, value: 0.25 },
            { name: 'Max subnormal', pattern: 'S 000 11', exponent: 0, mantissa: 3, value: 0.1875 },
            { name: 'Min subnormal', pattern: 'S 000 01', exponent: 0, mantissa: 1, value: 0.0625 },
        ],
    },
};

// ── [MX] Table 5 — FP4 E2M1 ──────────────────────────────────────────────
const MX_TABLE_5 = {
    bias: 1,
    rows: [
        { name: 'Zeros', pattern: 'S 00 0', exponent: 0, mantissa: 0, value: 0 },
        { name: 'Max normal', pattern: 'S 11 1', exponent: 3, mantissa: 1, value: 6.0 },
        { name: 'Min normal', pattern: 'S 01 0', exponent: 1, mantissa: 0, value: 1.0 },
        { name: 'Max subnormal', pattern: 'S 00 1', exponent: 0, mantissa: 1, value: 0.5 },
        { name: 'Min subnormal', pattern: 'S 00 1', exponent: 0, mantissa: 1, value: 0.5 },
    ],
};

// ── [MX] Table 6 — MXINT8 ────────────────────────────────────────────────
const MX_TABLE_6 = [
    { name: 'Zeros', pattern: '0 0.000000', raw: 0x00, value: 0 },
    { name: 'Max positive', pattern: '0 1.111111', raw: 0x7F, value: 1.984375 },
    { name: 'Max negative', pattern: '1 0.000001', raw: 0x81, value: -1.984375 },
    { name: 'Min positive', pattern: '0 0.000001', raw: 0x01, value: 0.015625 },
    { name: 'Min negative', pattern: '1 1.111111', raw: 0xFF, value: -0.015625 },
];

// ── [MX] Table 7 — E8M0 scale type ───────────────────────────────────────
const MX_TABLE_7 = {
    bias: 127,
    minSupportedExponent: -127,
    maxSupportedExponent: 127,
    nan: '11111111',
};

// ═════════════════════════════════════════════════════════════════════════

describe('[OFP8] Table 1 — exponent parameters', () => {
    for (const [key, t] of Object.entries(OFP8_TABLE_1)) {
        describe(key, () => {
            test(`exponent bias is ${t.bias}`, () => {
                expect(fp(key).bias).toBe(t.bias);
            });

            test(`emax is ${t.emax}`, () => {
                const format = fp(key);
                const max = format.getMaxNormal(false);
                expect(max.exponent - format.bias).toBe(t.emax);
            });

            test(`emin is ${t.emin}`, () => {
                const format = fp(key);
                expect(1 - format.bias).toBe(t.emin);
            });

            test(`dynamic range is ${t.binades} binades`, () => {
                const format = fp(key);
                const max = format.getMaxNormal(false);
                const maxBinade = max.exponent - format.bias;
                // Min subnormal is 2^(emin - mantissaBits); the count of
                // binades from there up to emax is inclusive of both ends
                // (E4M3: 2^-9 .. 2^8 = 18; E5M2: 2^-16 .. 2^15 = 32).
                const minBinade = t.emin - format.mantissaBits;
                expect(maxBinade - minBinade + 1).toBe(t.binades);
            });
        });
    }
});

describe('[OFP8] Table 2 / [MX] Table 2 — FP8 value encodings', () => {
    for (const [key, rows] of Object.entries(OFP8_TABLE_2)) {
        describe(key, () => {
            for (const row of rows) {
                for (const sign of [0, 1]) {
                    const signed = sign ? -row.value : row.value;
                    const label = `${row.name} ${row.pattern.replace('S', String(sign))}`;

                    test(`${label} decodes to ${signed}`, () => {
                        const format = fp(key);
                        expect(format.decode(sign, row.exponent, row.mantissa)).toBe(signed);
                    });

                    test(`${label} is the encoding of ${signed}`, () => {
                        const format = fp(key);
                        // Zero's sign is carried by -0, not by the literal 0.
                        const input = row.value === 0 ? (sign ? -0 : 0) : signed;
                        const encoded = format.encode(input);
                        expect([encoded.sign, encoded.exponent, encoded.mantissa])
                            .toEqual([sign, row.exponent, row.mantissa]);
                    });

                    test(`${label} has the tabulated bit pattern`, () => {
                        const format = fp(key);
                        expect(format.toBinaryString(sign, row.exponent, row.mantissa))
                            .toBe(bits(row.pattern.replace('S', String(sign))));
                    });
                }
            }
        });
    }
});

describe('[OFP8] Table 2 — Infinities and NaN', () => {
    test('E4M3 has no infinities', () => {
        const format = fp('fp8_e4m3');
        expect(format.hasInfinity).toBe(false);
        expect(() => format.getInfinity()).toThrow('Format does not support Infinity');
    });

    test('E4M3 NaN is the single pattern S.1111.111, both signs', () => {
        const format = fp('fp8_e4m3');
        for (const sign of [0, 1]) {
            expect(format.classify(sign, 15, 7)).toBe('NaN');
            expect(format.decode(sign, 15, 7)).toBeNaN();
        }
        // Every other max-exponent pattern is a normal number.
        for (let m = 0; m < 7; m++) {
            for (const sign of [0, 1]) {
                expect([m, format.classify(sign, 15, m)]).toEqual([m, 'Normal']);
            }
        }
        expect(format.decode(0, 15, 6)).toBe(448);
        expect(format.decode(1, 15, 6)).toBe(-448);
    });

    test('E5M2 infinity is S.11111.00, both signs', () => {
        const format = fp('fp8_e5m2');
        for (const { exponent, mantissa } of OFP8_SPECIALS.fp8_e5m2.infinities) {
            expect(format.classify(0, exponent, mantissa)).toBe('Infinity');
            expect(format.decode(0, exponent, mantissa)).toBe(Infinity);
            expect(format.decode(1, exponent, mantissa)).toBe(-Infinity);
        }
    });

    test('E5M2 NaN is S.11111.{01,10,11}, both signs', () => {
        const format = fp('fp8_e5m2');
        for (const { exponent, mantissa } of OFP8_SPECIALS.fp8_e5m2.nan) {
            for (const sign of [0, 1]) {
                expect([mantissa, format.classify(sign, exponent, mantissa)])
                    .toEqual([mantissa, 'NaN']);
                expect(format.decode(sign, exponent, mantissa)).toBeNaN();
            }
        }
    });
});

describe('[MX] Table 4 — FP6 encodings', () => {
    for (const [key, table] of Object.entries(MX_TABLE_4)) {
        describe(key, () => {
            test(`exponent bias is ${table.bias}`, () => {
                expect(fp(key).bias).toBe(table.bias);
            });

            test('has no infinities and no NaN', () => {
                const format = fp(key);
                expect(format.hasInfinity).toBe(false);
                expect(format.hasNaN).toBe(false);
                expect(() => format.getInfinity()).toThrow();
                expect(() => format.getNaN()).toThrow();
            });

            for (const row of table.rows) {
                for (const sign of [0, 1]) {
                    const signed = sign ? -row.value : row.value;
                    const label = `${row.name} ${row.pattern.replace('S', String(sign))}`;

                    test(`${label} round-trips as ${signed}`, () => {
                        const format = fp(key);
                        expect(format.decode(sign, row.exponent, row.mantissa)).toBe(signed);
                        const input = row.value === 0 ? (sign ? -0 : 0) : signed;
                        const encoded = format.encode(input);
                        expect([encoded.sign, encoded.exponent, encoded.mantissa])
                            .toEqual([sign, row.exponent, row.mantissa]);
                        expect(format.toBinaryString(sign, row.exponent, row.mantissa))
                            .toBe(bits(row.pattern.replace('S', String(sign))));
                    });
                }
            }
        });
    }
});

describe('[MX] Table 5 — FP4 E2M1', () => {
    test(`exponent bias is ${MX_TABLE_5.bias}`, () => {
        expect(fp('fp4_e2m1').bias).toBe(MX_TABLE_5.bias);
    });

    test('has no infinities and no NaN', () => {
        const format = fp('fp4_e2m1');
        expect(format.hasInfinity).toBe(false);
        expect(format.hasNaN).toBe(false);
    });

    test('has exactly one subnormal magnitude, ±0.5', () => {
        const format = fp('fp4_e2m1');
        expect(format.decode(0, 0, 1)).toBe(0.5);
        expect(format.decode(1, 0, 1)).toBe(-0.5);
        // maxMantissa is 1, so max and min subnormal are the same encoding.
        expect(format.maxMantissa).toBe(1);
    });

    for (const row of MX_TABLE_5.rows) {
        for (const sign of [0, 1]) {
            const signed = sign ? -row.value : row.value;
            const label = `${row.name} ${row.pattern.replace('S', String(sign))}`;

            test(`${label} round-trips as ${signed}`, () => {
                const format = fp('fp4_e2m1');
                expect(format.decode(sign, row.exponent, row.mantissa)).toBe(signed);
                const input = row.value === 0 ? (sign ? -0 : 0) : signed;
                const encoded = format.encode(input);
                expect([encoded.sign, encoded.exponent, encoded.mantissa])
                    .toEqual([sign, row.exponent, row.mantissa]);
                expect(format.toBinaryString(sign, row.exponent, row.mantissa))
                    .toBe(bits(row.pattern.replace('S', String(sign))));
            });
        }
    }
});

// ── [OFP8] Table 3 / [MX] Table 3 — conversion behavior matrix ───────────
//
// MX calls the non-saturating mode OVF; OFP8 calls it NONSAT. Same mode.
describe('[OFP8] Table 3 / [MX] Table 3 — conversion behavior', () => {
    const MAX = { fp8_e5m2: 57344, fp8_e4m3: 448 };

    // Each cell is [source description, source value, expected E5M2 SAT,
    // E5M2 OVF, E4M3 SAT, E4M3 OVF]. 'max' resolves per format.
    const ROWS = [
        ['NaN', NaN, 'nan', 'nan', 'nan', 'nan'],
        ['+Inf', Infinity, 'max', 'inf', 'max', 'nan'],
        ['-Inf', -Infinity, '-max', '-inf', '-max', 'nan'],
        ['greater than max magnitude', 1e6, 'max', 'inf', 'max', 'nan'],
        ['less than -max magnitude', -1e6, '-max', '-inf', '-max', 'nan'],
        ['in range', 1.5, 1.5, 1.5, 1.5, 1.5],
        ['in range, negative', -1.5, -1.5, -1.5, -1.5, -1.5],
        ['smaller than min subnormal', 1e-30, 0, 0, 0, 0],
        ['smaller than min subnormal, negative', -1e-30, '-0', '-0', '-0', '-0'],
        ['+0', 0, 0, 0, 0, 0],
        ['-0', -0, '-0', '-0', '-0', '-0'],
    ];

    const CELLS = [
        ['fp8_e5m2', 'saturate', 2],
        ['fp8_e5m2', 'overflow', 3],
        ['fp8_e4m3', 'saturate', 4],
        ['fp8_e4m3', 'overflow', 5],
    ];

    for (const [key, overflowMode, column] of CELLS) {
        describe(`${key} ${overflowMode === 'saturate' ? 'SAT' : 'OVF'}`, () => {
            for (const row of ROWS) {
                const expected = row[column];
                test(`${row[0]} \u2192 ${String(expected)}`, () => {
                    const format = fp(key);
                    const got = decode(format, format.encode(row[1], { overflowMode }));

                    if (expected === 'nan') expect(got).toBeNaN();
                    else if (expected === 'inf') expect(got).toBe(Infinity);
                    else if (expected === '-inf') expect(got).toBe(-Infinity);
                    else if (expected === 'max') expect(got).toBe(MAX[key]);
                    else if (expected === '-max') expect(got).toBe(-MAX[key]);
                    else if (expected === '-0') expect(Object.is(got, -0)).toBe(true);
                    else expect(got).toBe(expected);
                });
            }
        });
    }

    test('§5.2.1: the sign of the source is preserved except when NaN is produced', () => {
        const e5m2 = fp('fp8_e5m2');
        expect(e5m2.encode(-1e6, { overflowMode: 'saturate' }).sign).toBe(1);
        expect(e5m2.encode(-1e6, { overflowMode: 'overflow' }).sign).toBe(1);
        // NaN sign is implementation-defined; this library always emits 0.
        expect(fp('fp8_e4m3').encode(-1e6, { overflowMode: 'overflow' }).sign).toBe(0);
    });
});

// ── [MX] Table 7 — E8M0 ──────────────────────────────────────────────────
describe('[MX] Table 7 — E8M0 scale type', () => {
    let format;
    beforeEach(() => { format = fp('e8m0'); });

    test('§4.1: no sign bit, no mantissa bits, 8 bits total', () => {
        expect(format.signBits).toBe(0);
        expect(format.exponentBits).toBe(8);
        expect(format.mantissaBits).toBe(0);
        expect(format.totalBits).toBe(8);
    });

    test(`exponent bias is ${MX_TABLE_7.bias}`, () => {
        expect(format.bias).toBe(MX_TABLE_7.bias);
    });

    test('supported exponent range is -127 to 127', () => {
        expect(format.decode(0, 0, 0)).toBe(Math.pow(2, MX_TABLE_7.minSupportedExponent));
        const max = format.getMaxNormal(false);
        expect(decode(format, max)).toBe(Math.pow(2, MX_TABLE_7.maxSupportedExponent));
        expect(max.exponent).toBe(254);
    });

    test(`NaN is the single pattern ${MX_TABLE_7.nan}`, () => {
        expect(format.classify(0, 255, 0)).toBe('NaN');
        expect(format.decode(0, 255, 0)).toBeNaN();
        const nan = format.getNaN();
        expect([nan.sign, nan.exponent, nan.mantissa]).toEqual([0, 255, 0]);
        expect(format.toBinaryString(0, 255, 0)).toBe(MX_TABLE_7.nan);
    });

    test('Infinities: N/A', () => {
        expect(format.hasInfinity).toBe(false);
        expect(() => format.getInfinity()).toThrow('Format does not support Infinity');
    });

    test('Zeros: N/A', () => {
        expect(format.hasSubnormals).toBe(false);
        expect(() => format.getZero()).toThrow('Format does not support Zero');
        // Exponent field 0 is a NORMAL value, not zero and not subnormal.
        expect(format.classify(0, 0, 0)).toBe('Normal');
    });

    test('all 255 finite fields decode to their exact power of two', () => {
        for (let field = 0; field <= 254; field++) {
            expect([field, format.decode(0, field, 0)])
                .toEqual([field, Math.pow(2, field - 127)]);
            expect([field, format.classify(0, field, 0)]).toEqual([field, 'Normal']);
        }
    });

    test('decode → encode is the identity over the whole bit space', () => {
        for (let field = 0; field <= 254; field++) {
            const value = format.decode(0, field, 0);
            const encoded = format.encode(value);
            expect([field, encoded.exponent, encoded.mantissa]).toEqual([field, field, 0]);
        }
        // The NaN pattern round-trips through the NaN encoding.
        expect(format.encode(NaN).exponent).toBe(255);
    });

    test('encode(0) saturates to the minimum representable magnitude', () => {
        expect(format.encode(0).exponent).toBe(0);
        expect(format.encode(-0).exponent).toBe(0);
        expect(decode(format, format.encode(0))).toBe(Math.pow(2, -127));
    });

    test('a magnitude below 2^-127 saturates to 2^-127', () => {
        expect(format.encode(1e-60).exponent).toBe(0);
        expect(format.encodeString('1e-60').exponent).toBe(0);
        expect(format.encodeString('1e-30000').exponent).toBe(0);
        for (const roundingMode of
            ['tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative']) {
            expect([roundingMode, format.encode(1e-60, { roundingMode }).exponent])
                .toEqual([roundingMode, 0]);
        }
    });

    test('rounding acts on the exponent selection', () => {
        // 1.5 is above the geometric midpoint sqrt(2), so nearest is 2^1.
        expect(decode(format, format.encode(1.5))).toBe(2);
        expect(decode(format, format.encode(1.5, { roundingMode: 'towardZero' }))).toBe(1);
        expect(decode(format, format.encode(1.5, { roundingMode: 'towardPositive' }))).toBe(2);
        expect(decode(format, format.encode(1.5, { roundingMode: 'towardNegative' }))).toBe(1);
        // 1.25 is below sqrt(2): nearest is 2^0.
        expect(decode(format, format.encode(1.25))).toBe(1);
    });

    test('overflow above 2^127 follows the overflow mode', () => {
        expect(decode(format, format.encode(1e40, { overflowMode: 'saturate' })))
            .toBe(Math.pow(2, 127));
        expect(decode(format, format.encode(1e40, { overflowMode: 'overflow' }))).toBeNaN();
        // Default is saturate (no infinity).
        expect(decode(format, format.encode(1e40))).toBe(Math.pow(2, 127));
        // IEEE §7.4 still wins for a finite value under a clamping mode.
        expect(decode(format, format.encode(1e40, {
            overflowMode: 'overflow', roundingMode: 'towardZero',
        }))).toBe(Math.pow(2, 127));
    });

    test('a negative input clamps to the minimum magnitude (unsigned format)', () => {
        expect(format.encode(-4).exponent).toBe(0);
        expect(format.encodeString('-4').exponent).toBe(0);
    });

    test('encodeString agrees with encode on exact powers of two', () => {
        for (let k = -20; k <= 20; k++) {
            const literal = k >= 0 ? String(Math.pow(2, k)) : (Math.pow(2, k)).toFixed(30);
            const viaString = format.encodeString(literal);
            expect([k, viaString.exponent]).toEqual([k, k + 127]);
        }
    });

    test('a format WITH subnormals is unaffected (fp16 field 0 is still Zero)', () => {
        const fp16 = fp('fp16');
        expect(fp16.hasSubnormals).toBe(true);
        expect(fp16.classify(0, 0, 0)).toBe('Zero');
        expect(fp16.classify(0, 0, 1)).toBe('Subnormal');
        expect(fp16.getZero().exponent).toBe(0);
    });
});

// ── [MX] Table 6 — MXINT8 ────────────────────────────────────────────────
describe('[MX] Table 6 — MXINT8', () => {
    let format;
    beforeEach(() => {
        const preset = FORMATS.mxint8;
        format = new Integer(preset.bits, preset.signed, preset);
    });

    test('§5.3.4: 8-bit two\u2019s complement with an implicit 2^-6 scale', () => {
        expect(format.bits).toBe(8);
        expect(format.signed).toBe(true);
        expect(format.fractionBits).toBe(6);
        expect(format.scale).toBe(64);
        expect(format.symmetric).toBe(true);
    });

    for (const row of MX_TABLE_6) {
        test(`${row.name} ${row.pattern} decodes to ${row.value}`, () => {
            expect(format.decodeBits(row.raw)).toBe(row.value);
        });

        test(`${row.name} is the encoding of ${row.value}`, () => {
            expect(format.encode(row.value).mantissa).toBe(row.raw);
        });
    }

    test('the symmetric range excludes 0x80', () => {
        expect(format.minValue).toBe(-127);
        expect(format.maxValue).toBe(127);
        expect(format.minRealValue).toBe(-1.984375);
        expect(format.maxRealValue).toBe(1.984375);
        // encode never produces 0x80 ...
        expect(format.encode(-2).mantissa).toBe(0x81);
        expect(format.encode(-1e9).mantissa).toBe(0x81);
        expect(format.encode(-Infinity).mantissa).toBe(0x81);
        // ... but decode is total over the bit space.
        expect(format.decodeBits(0x80)).toBe(-2);
    });

    test('decode → encode is the identity for all 256 patterns except 0x80', () => {
        for (let raw = 0; raw < 256; raw++) {
            const value = format.decodeBits(raw);
            const expected = raw === 0x80 ? 0x81 : raw;
            expect([raw, format.encode(value).mantissa]).toEqual([raw, expected]);
        }
    });

    test('rounding happens at the 1/64 grid, not at whole numbers', () => {
        // 1/128 is exactly half of one step.
        expect(format.encode(1 / 128, { roundingMode: 'tiesToEven' }).mantissa).toBe(0);
        expect(format.encode(1 / 128, { roundingMode: 'tiesToAway' }).mantissa).toBe(1);
        // 3/128 is one and a half steps: ties-to-even goes to 2.
        expect(format.encode(3 / 128, { roundingMode: 'tiesToEven' }).mantissa).toBe(2);
        expect(format.encode(0.5).mantissa).toBe(32);
        expect(format.encode(-0.5).mantissa).toBe(256 - 32);
    });

    test('saturation and special values', () => {
        expect(format.encode(10).mantissa).toBe(0x7F);
        expect(format.encode(-10).mantissa).toBe(0x81);
        expect(format.encode(Infinity).mantissa).toBe(0x7F);
        // MX §5.3.4 leaves NaN conversion implementation-defined; this library
        // maps it to zero, matching every other integer format.
        expect(format.encode(NaN).mantissa).toBe(0);
    });

    test('encodeString rounds the exact decimal in one step', () => {
        for (const roundingMode of
            ['tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative']) {
            expect([roundingMode, format.encodeString('0.0078125', { roundingMode }).mantissa])
                .toEqual([roundingMode, format.encode(0.0078125, { roundingMode }).mantissa]);
        }
        expect(format.encodeString('1.5').mantissa).toBe(0x60);
        expect(format.encodeString('-1.5').mantissa).toBe(256 - 0x60);
    });

    test('the out-of-range shortcut lands on one raw unit = 2^-6', () => {
        expect(format.encodeString('1e-30000', { roundingMode: 'towardPositive' }).mantissa)
            .toBe(0x01);
        expect(format.encodeString('-1e-30000', { roundingMode: 'towardNegative' }).mantissa)
            .toBe(0xFF);
        expect(format.encodeString('1e-30000', { roundingMode: 'towardZero' }).mantissa).toBe(0);
        expect(format.encodeString('1e30000').mantissa).toBe(0x7F);
    });

    test('fractionBits is validated', () => {
        expect(() => new Integer(8, true, { fractionBits: 8 })).toThrow(RangeError);
        expect(() => new Integer(8, true, { fractionBits: -1 })).toThrow(RangeError);
        expect(() => new Integer(8, true, { fractionBits: 1.5 })).toThrow(RangeError);
    });
});

describe('back-compatibility of the Integer changes', () => {
    test('new Integer(8, true) with no options still behaves as INT8', () => {
        const int8 = new Integer(8, true);
        expect(int8.fractionBits).toBe(0);
        expect(int8.scale).toBe(1);
        expect(int8.symmetric).toBe(false);
        expect(int8.minValue).toBe(-128);
        expect(int8.maxValue).toBe(127);
        expect(int8.minRealValue).toBe(-128);
        expect(int8.maxRealValue).toBe(127);
        expect(int8.encode(100).intValue).toBe(100);
        expect(int8.encode(-128).mantissa).toBe(128);
        expect(int8.decodeBits(0x80)).toBe(-128);
    });

    test('fractionBits: 0 is indistinguishable from the default', () => {
        const a = new Integer(8, true);
        const b = new Integer(8, true, { fractionBits: 0 });
        for (let raw = 0; raw < 256; raw++) {
            expect(a.decodeBits(raw)).toBe(b.decodeBits(raw));
        }
        for (const v of [0, 1, -1, 127, -128, 1000, -1000, 1.5, -1.5]) {
            expect(a.encode(v).mantissa).toBe(b.encode(v).mantissa);
        }
    });
});

// ── Exhaustive sweeps (cheap at these widths) ────────────────────────────
describe('exhaustive decode → encode identity', () => {
    const KEYS = ['fp8_e4m3', 'fp8_e5m2', 'fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1'];
    const ROUNDING = [
        'tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative',
    ];

    for (const key of KEYS) {
        test(`${key}: every non-NaN pattern, all rounding and overflow modes`, () => {
            const format = fp(key);
            for (let sign = 0; sign <= 1; sign++) {
                for (let e = 0; e <= format.maxExponent; e++) {
                    for (let m = 0; m <= format.maxMantissa; m++) {
                        const kind = format.classify(sign, e, m);
                        if (kind === 'NaN') continue;
                        const value = format.decode(sign, e, m);
                        for (const roundingMode of ROUNDING) {
                            for (const overflowMode of ['saturate', 'overflow']) {
                                const back = format.encode(value, { roundingMode, overflowMode });
                                // Infinity under `saturate` deliberately becomes
                                // max normal; every other pattern is exact.
                                if (kind === 'Infinity' && overflowMode === 'saturate') continue;
                                expect([key, sign, e, m, roundingMode, overflowMode,
                                    back.sign, back.exponent, back.mantissa])
                                    .toEqual([key, sign, e, m, roundingMode, overflowMode,
                                        sign, e, m]);
                            }
                        }
                    }
                }
            }
        });
    }

    test('e8m0: every non-NaN pattern, all rounding and overflow modes', () => {
        const format = fp('e8m0');
        const ROUNDING_MODES_ALL = ROUNDING;
        for (let e = 0; e <= 254; e++) {
            const value = format.decode(0, e, 0);
            for (const roundingMode of ROUNDING_MODES_ALL) {
                for (const overflowMode of ['saturate', 'overflow']) {
                    const back = format.encode(value, { roundingMode, overflowMode });
                    expect([e, roundingMode, overflowMode, back.exponent, back.mantissa])
                        .toEqual([e, roundingMode, overflowMode, e, 0]);
                }
            }
        }
    });

    test('mxint8: every pattern except the unused 0x80', () => {
        const preset = FORMATS.mxint8;
        const format = new Integer(preset.bits, preset.signed, preset);
        for (let raw = 0; raw < 256; raw++) {
            if (raw === 0x80) continue;
            const value = format.decodeBits(raw);
            for (const roundingMode of ROUNDING) {
                for (const overflowMode of ['saturate', 'overflow']) {
                    expect([raw, roundingMode, overflowMode,
                        format.encode(value, { roundingMode, overflowMode }).mantissa])
                        .toEqual([raw, roundingMode, overflowMode, raw]);
                }
            }
        }
    });
});
