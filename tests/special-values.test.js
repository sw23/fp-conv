// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// NaN and ±Infinity INPUTS, into every preset, under both overflow modes and
// all five rounding modes. An infinite input is infinite in every rounding
// mode, so IEEE 754 §7.4's clamp never applies: no cell may depend on the mode.
//
// The interesting rows are the formats that cannot hold the input. ±Infinity
// follows OFP8 / MX Table 3, and -Infinity into unsigned E8M0 is treated as
// +Infinity. NaN into a format with no NaN is implementation-defined per MX
// §5.3.2-5.3.4, so it takes PTX's "positive MAX_NORM"; plain integers keep 0.
const {
    FloatingPoint, Integer, FORMATS, sameValue,
    conversionLoss, convertEncoded, valueKeyword,
} = require('../lib/floating-point.js');

const ROUNDING_MODES = ['tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative'];

// A NaN with its sign bit set. JavaScript never produces one on its own, and
// every conversion must ignore the sign of a NaN.
const NEGATIVE_NAN = new Float64Array(new Uint32Array([0, 0xFFF80000]).buffer)[0];

function formatFor(key) {
    const preset = FORMATS[key];
    return preset.isInteger
        ? new Integer(preset.bits, preset.signed, preset)
        : FloatingPoint.fromFormat(key);
}

function hex(format, encoded) {
    return format.toHexString(encoded.sign, encoded.exponent, encoded.mantissa);
}

// [format, {nan, inf, -inf} under saturate, {nan, inf, -inf} under overflow]
const EXPECTED = {
    fp64: [
        ['0x7FF8000000000000', '0x7FEFFFFFFFFFFFFF', '0xFFEFFFFFFFFFFFFF'],
        ['0x7FF8000000000000', '0x7FF0000000000000', '0xFFF0000000000000'],
    ],
    fp32: [['0x7FC00000', '0x7F7FFFFF', '0xFF7FFFFF'], ['0x7FC00000', '0x7F800000', '0xFF800000']],
    fp16: [['0x7E00', '0x7BFF', '0xFBFF'], ['0x7E00', '0x7C00', '0xFC00']],
    bf16: [['0x7FC0', '0x7F7F', '0xFF7F'], ['0x7FC0', '0x7F80', '0xFF80']],
    tf32: [['0x3FE00', '0x3FBFF', '0x7FBFF'], ['0x3FE00', '0x3FC00', '0x7FC00']],
    // OFP8 Table 3. A produced NaN carries sign 0 (OFP8 §5.2.1 leaves it open).
    fp8_e5m2: [['0x7E', '0x7B', '0xFB'], ['0x7E', '0x7C', '0xFC']],
    fp8_e4m3: [['0x7F', '0x7E', '0xFE'], ['0x7F', '0x7F', '0x7F']],
    // No Inf, no NaN: NaN -> +max, ±Inf -> ±max, in both modes.
    fp6_e3m2: [['0x1F', '0x1F', '0x3F'], ['0x1F', '0x1F', '0x3F']],
    fp6_e2m3: [['0x1F', '0x1F', '0x3F'], ['0x1F', '0x1F', '0x3F']],
    fp4_e2m1: [['0x7', '0x7', '0xF'], ['0x7', '0x7', '0xF']],
    // Unsigned, NaN but no Inf: -Inf is +Inf, so 2^127 or NaN like +Inf.
    e8m0: [['0xFF', '0xFE', '0xFE'], ['0xFF', '0xFF', '0xFF']],
    // Symmetric range: -Inf clamps to 0x81, never the unused 0x80.
    mxint8: [['0x7F', '0x7F', '0x81'], ['0x7F', '0x7F', '0x81']],
    int32: [['0x00000000', '0x7FFFFFFF', '0x80000000'], ['0x00000000', '0x7FFFFFFF', '0x80000000']],
    uint32: [['0x00000000', '0xFFFFFFFF', '0x00000000'], ['0x00000000', '0xFFFFFFFF', '0x00000000']],
    int16: [['0x0000', '0x7FFF', '0x8000'], ['0x0000', '0x7FFF', '0x8000']],
    uint16: [['0x0000', '0xFFFF', '0x0000'], ['0x0000', '0xFFFF', '0x0000']],
    int8: [['0x00', '0x7F', '0x80'], ['0x00', '0x7F', '0x80']],
    uint8: [['0x00', '0xFF', '0x00'], ['0x00', '0xFF', '0x00']],
    int4: [['0x0', '0x7', '0x8'], ['0x0', '0x7', '0x8']],
    uint4: [['0x0', '0xF', '0x0'], ['0x0', '0xF', '0x0']],
};

describe('NaN and Infinity inputs, every preset', () => {
    test('the table covers every preset', () => {
        expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(FORMATS).sort());
    });

    for (const [key, byMode] of Object.entries(EXPECTED)) {
        describe(key, () => {
            const format = formatFor(key);
            for (const [modeIndex, overflowMode] of ['saturate', 'overflow'].entries()) {
                const [nan, inf, negInf] = byMode[modeIndex];
                const CASES = [
                    ['NaN', NaN, 'NaN', nan],
                    ['-NaN', NEGATIVE_NAN, null, nan],
                    ['+Infinity', Infinity, 'Infinity', inf],
                    ['-Infinity', -Infinity, '-Infinity', negInf],
                ];
                for (const [label, value, literal, expected] of CASES) {
                    test(`${label} under ${overflowMode} -> ${expected}, every rounding mode`, () => {
                        for (const roundingMode of ROUNDING_MODES) {
                            const options = { roundingMode, overflowMode };
                            expect([roundingMode, hex(format, format.encode(value, options))])
                                .toEqual([roundingMode, expected]);
                            // The string path must agree with the number path.
                            if (literal !== null) {
                                expect([roundingMode, hex(format, format.encodeString(literal, options))])
                                    .toEqual([roundingMode, expected]);
                            }
                        }
                    });
                }
            }

            test('the per-format default overflow mode picks one of the two rows', () => {
                const row = byMode[format.defaultOverflowMode === 'saturate' ? 0 : 1];
                expect([NaN, Infinity, -Infinity].map((v) => hex(format, format.encode(v)))).toEqual(row);
            });
        });
    }
});

describe('NaN into a format with no NaN encoding', () => {
    test('FP4/FP6 NaN decodes as the positive maximum and is not NaN', () => {
        for (const key of ['fp4_e2m1', 'fp6_e2m3', 'fp6_e3m2']) {
            const format = formatFor(key);
            const encoded = format.encode(NaN);
            const max = format.getMaxNormal(false);
            expect(encoded.isNaN).toBe(false);
            expect(encoded.isNormal).toBe(true);
            expect(format.decode(encoded.sign, encoded.exponent, encoded.mantissa))
                .toBe(format.decode(max.sign, max.exponent, max.mantissa));
        }
    });

    test('a custom float layout with no NaN falls back to +max', () => {
        const format = new FloatingPoint(1, 3, 3, { bias: 3, hasInfinity: false, hasNaN: false });
        const encoded = format.encode(NaN);
        const max = format.getMaxNormal(false);
        expect([encoded.sign, encoded.exponent, encoded.mantissa])
            .toEqual([0, max.exponent, max.mantissa]);
    });

    test('a fixed-point float layout (no exponent field) falls back to +max', () => {
        for (const format of [new FloatingPoint(1, 0, 6), new FloatingPoint(0, 0, 8)]) {
            const encoded = format.encode(NaN);
            expect([encoded.sign, encoded.mantissa]).toEqual([0, format.maxMantissa]);
        }
    });

    test('a fixed-point integer (fractionBits > 0) falls back to +max', () => {
        for (const format of [
            new Integer(8, true, { fractionBits: 6 }),
            new Integer(16, false, { fractionBits: 4 }),
        ]) {
            expect(format.encode(NaN).mantissa).toBe(format.maxValue);
        }
    });

    test('a plain integer maps NaN to zero, the PTX float-to-integer rule', () => {
        for (const format of [new Integer(8, true), new Integer(16, false), new Integer(64, true)]) {
            // Number() so the assertion reads the same at a width whose raw
            // field is a BigInt (Integer(64)) as at one whose field is a number.
            expect(Number(format.encode(NaN).mantissa)).toBe(0);
        }
    });
});

// Above 53 bits, 2^n - 1 is not a representable double: it rounds up to 2^n,
// which needs one bit more than the field. Saturating onto that used to encode
// as the most NEGATIVE value in two's complement, or to render a bit string one
// character too long, for NaN, for Infinity and for ordinary overflow alike.
describe('fields wider than a double can address exactly', () => {
    const WIDE = [
        ['Integer(55) signed, 6 fraction bits', () => new Integer(55, true, { fractionBits: 6 })],
        ['Integer(64) signed', () => new Integer(64, true)],
        ['Integer(64) unsigned', () => new Integer(64, false)],
        ['FloatingPoint fixed-point, 54 mantissa bits', () => new FloatingPoint(1, 0, 54)],
        ['FloatingPoint 1/15/112', () => new FloatingPoint(1, 15, 112)],
    ];

    for (const [label, build] of WIDE) {
        describe(label, () => {
            test('every special and overflowing input encodes to a legal field', () => {
                const format = build();
                for (const value of [NaN, Infinity, -Infinity, 1e300, -1e300]) {
                    const encoded = format.encode(value);
                    const bits = format.toBinaryString(encoded.sign, encoded.exponent, encoded.mantissa);
                    expect([value, bits.length]).toEqual([value, format.totalBits]);
                    // Round-trips through the field, so no bit was lost or invented.
                    expect(() => format.decode(encoded.sign, encoded.exponent, encoded.mantissa))
                        .not.toThrow();
                }
            });

            test('a positive overflow stays positive and a negative one negative', () => {
                const format = build();
                const decode = (e) => format.decode(e.sign, e.exponent, e.mantissa);
                expect(decode(format.encode(1e300))).toBeGreaterThan(0);
                if (format.signed || format.signBits > 0) {
                    expect(decode(format.encode(-1e300))).toBeLessThan(0);
                }
                // A substituted NaN is the POSITIVE maximum, never the most
                // negative encoding two's complement would give for 2^(n-1).
                const nan = decode(format.encode(NaN));
                if (!Number.isNaN(nan) && nan !== 0) expect(nan).toBeGreaterThan(0);
            });

            test('the bound is the exact all-ones value, not a rounded neighbour', () => {
                const format = build();
                const bound = format.isInteger ? format.maxValue : format.maxMantissa;
                const width = format.isInteger
                    ? format.bits - (format.signed ? 1 : 0)
                    : format.mantissaBits;
                expect(BigInt(bound)).toBe(2n ** BigInt(width) - 1n);
            });
        });
    }

    test('the exact decimal of an encoding always names the decoded value', () => {
        // The UI offers this string as "the value we used", so it may never
        // disagree with the conversion itself.
        for (const [, build] of WIDE) {
            const format = build();
            for (const value of [NaN, Infinity, -Infinity, 1e300, 1.5, 0]) {
                const encoded = format.encode(value);
                const decoded = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                if (!Number.isFinite(decoded)) continue;
                expect(Number(format.toExactDecimalString(encoded))).toBe(decoded);
            }
        }
    });
});

describe('-Infinity into an unsigned float format', () => {
    test('E8M0 treats -Infinity as +Infinity, but finite negatives still clamp to the minimum', () => {
        const e8m0 = formatFor('e8m0');
        expect(e8m0.encode(-Infinity, { overflowMode: 'saturate' }).exponent).toBe(254);
        expect(e8m0.encode(-Infinity, { overflowMode: 'overflow' }).isNaN).toBe(true);
        // Only the infinity is reflected: a finite negative clamps to the
        // bottom of the range rather than taking |x|, as CUDA would.
        for (const value of [-4, -1e300, -0]) {
            expect([value, e8m0.encode(value, { overflowMode: 'saturate' }).exponent]).toEqual([value, 0]);
        }
    });

    test('an unsigned layout with an infinity overflows -Infinity to +Infinity', () => {
        const format = new FloatingPoint(0, 5, 2, { bias: 15 });
        const overflowed = format.encode(-Infinity, { overflowMode: 'overflow' });
        expect(overflowed.isInfinite).toBe(true);
        expect(overflowed.sign).toBe(0);
        expect(format.decode(overflowed.sign, overflowed.exponent, overflowed.mantissa)).toBe(Infinity);

        const saturated = format.encode(-Infinity, { overflowMode: 'saturate' });
        const max = format.getMaxNormal(false);
        expect([saturated.sign, saturated.exponent, saturated.mantissa])
            .toEqual([0, max.exponent, max.mantissa]);
    });

    test('unsigned fixed-point and integer layouts still clamp -Infinity to zero', () => {
        expect(new FloatingPoint(0, 0, 8).encode(-Infinity).mantissa).toBe(0);
        expect(new Integer(8, false).encode(-Infinity).mantissa).toBe(0);
    });
});

// The rule: only an actual infinity is reflected to the top of an unsigned
// format. A decimal literal whose magnitude merely overflows is a finite
// negative, however large, so it clamps to the bottom like any other negative -
// and both encoders have to say so, since encodeString() and _encodeNumber()
// reach the same formats by different routes.
describe('an overflowing negative literal is not an infinity', () => {
    // [label, format, the field that reads "bottom of the range"]
    const UNSIGNED = [
        ['E8M0', () => formatFor('e8m0')],
        ['a custom unsigned layout with an infinity', () => new FloatingPoint(0, 5, 2, { bias: 15 })],
    ];

    for (const [label, build] of UNSIGNED) {
        for (const overflowMode of ['overflow', 'saturate']) {
            test(`${label} clamps "-1e999" to the bottom under ${overflowMode}`, () => {
                const format = build();
                const viaString = format.encodeString('-1e999', { overflowMode });
                // encode() routes a string here, so the two must not differ.
                const viaEncode = format.encode('-1e999', { overflowMode });

                expect([viaString.sign, viaString.exponent, viaString.mantissa]).toEqual([0, 0, 0]);
                expect(viaEncode).toEqual(viaString);

                // ...and it is the same answer an ordinary finite negative gets.
                expect(format.encode(-4, { overflowMode })).toEqual(viaString);
            });

            test(`${label} still reflects the VALUE -Infinity under ${overflowMode}`, () => {
                const format = build();
                const reflected = format.encode(-Infinity, { overflowMode });
                expect(reflected).not.toEqual(format.encode('-1e999', { overflowMode }));
                // The spelling of the infinity must not matter: a string the
                // library can parse as one goes down the same path.
                expect(format.encode('-Infinity', { overflowMode })).toEqual(reflected);
                // And it is exactly what +Infinity gets, which is the rule.
                expect(format.encode(Infinity, { overflowMode })).toEqual(reflected);
            });
        }
    }
});

describe('nanTarget()', () => {
    // Every preset, so a new format cannot be added without deciding this.
    const EXPECTED = {
        fp64: 'nan', fp32: 'nan', fp16: 'nan', bf16: 'nan', tf32: 'nan',
        fp8_e5m2: 'nan', fp8_e4m3: 'nan', e8m0: 'nan',
        fp6_e3m2: 'maxNormal', fp6_e2m3: 'maxNormal', fp4_e2m1: 'maxNormal',
        mxint8: 'maxNormal',
        int32: 'zero', uint32: 'zero', int16: 'zero', uint16: 'zero',
        int8: 'zero', uint8: 'zero', int4: 'zero', uint4: 'zero',
    };

    test('covers every preset', () => {
        expect(Object.keys(EXPECTED).slice().sort()).toEqual(Object.keys(FORMATS).slice().sort());
    });

    for (const [key, target] of Object.entries(EXPECTED)) {
        test(`${key} reports ${target} and encodes a NaN that way`, () => {
            const format = formatFor(key);
            expect(format.nanTarget()).toBe(target);

            const encoded = format.encode(NaN);
            const value = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
            if (target === 'nan') {
                expect(value).toBeNaN();
            } else if (target === 'zero') {
                expect(value).toBe(0);
            } else {
                const max = format.isInteger
                    ? format.maxRealValue
                    : (() => {
                        const m = format.getMaxNormal(false);
                        return format.decode(m.sign, m.exponent, m.mantissa);
                    })();
                expect(value).toBe(max);
            }
        });
    }

    test('the overflow mode does not change it', () => {
        for (const key of Object.keys(FORMATS)) {
            const format = formatFor(key);
            expect([key, hex(format, format.encode(NaN, { overflowMode: 'overflow' }))])
                .toEqual([key, hex(format, format.encode(NaN, { overflowMode: 'saturate' }))]);
        }
    });

    test('a custom fixed-point layout substitutes its all-ones magnitude', () => {
        const fixed = new FloatingPoint(1, 0, 8);
        expect(fixed.nanTarget()).toBe('maxNormal');
        expect(fixed.encode(NaN).mantissa).toBe(255);
    });

    test('a layout that claims NaN but has no pattern for it substitutes instead', () => {
        // s1e5m0 with both flags: Infinity already owns the only maxExponent
        // pattern, so there is nothing left to spell NaN with.
        const degenerate = new FloatingPoint(1, 5, 0, { hasInfinity: true, hasNaN: true });
        expect(degenerate.nanTarget()).toBe('maxNormal');
        expect(degenerate.encode(NaN).isNaN).toBe(false);
    });
});

describe('sameValue()', () => {
    test('sameValue matches NaN with NaN and nothing else with it', () => {
        expect(sameValue(NaN, NaN)).toBe(true);
        expect(sameValue(NaN, 0)).toBe(false);
        expect(sameValue(0, NaN)).toBe(false);
        expect(sameValue(Infinity, Infinity)).toBe(true);
        expect(sameValue(Infinity, -Infinity)).toBe(false);
        expect(sameValue(1.5, 1.5)).toBe(true);
        expect(sameValue(0, -0)).toBe(true);
    });

    test('only "exact" and "rounded" leave a difference worth measuring', () => {
        for (const [input, output] of [[1e40, Infinity], [Infinity, 448], [-Infinity, Infinity], [NaN, 6]]) {
            expect(Number.isFinite(Math.abs(input - output))).toBe(false);
        }
        expect(Number.isFinite(Math.abs(Math.PI - 3.140625))).toBe(true);
    });
});

// ── The keyword spellings ─────────────────────────────────────────
//
// "-inf" is not a decimal, so encodeString() falls through to a numeric parse -
// and Number('-inf') is NaN. On a format with no NaN that used to hand back the
// POSITIVE maximum, the exact opposite end of the range. The keywords live in
// the library now, so every format and every surface agrees on them.
describe('non-decimal value keywords', () => {
    const KEYWORDS = {
        'inf': Infinity, '+inf': Infinity, 'INF': Infinity,
        'infinity': Infinity, '+infinity': Infinity, 'Infinity': Infinity,
        '-inf': -Infinity, '-INF': -Infinity, '-infinity': -Infinity, '-Infinity': -Infinity,
        'nan': NaN, '+nan': NaN, '-nan': NaN, 'NaN': NaN,
    };

    test('valueKeyword() knows exactly these spellings, and nothing else', () => {
        for (const [text, value] of Object.entries(KEYWORDS)) {
            expect([text, valueKeyword(text)]).toEqual([text, value]);
        }
        for (const text of ['', '1', '1e5', 'infi', 'na', '0x10', 'inf inity']) {
            expect([text, valueKeyword(text)]).toEqual([text, null]);
        }
    });

    const FORMATS_UNDER_TEST = [
        ['fp16', () => FloatingPoint.fromFormat('fp16')],
        ['a NaN-less float', () =>
            new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false })],
        ['int8', () => new Integer(8, true)],
        ['mxint8', () => new Integer(8, true, { fractionBits: 6, symmetric: true })],
        ['a fixed-point layout', () => new FloatingPoint(1, 0, 8)],
    ];

    for (const [label, build] of FORMATS_UNDER_TEST) {
        test(`${label} encodes every spelling exactly as it encodes the value`, () => {
            const format = build();
            const bits = (encoded) =>
                format.toHexString(encoded.sign, encoded.exponent, encoded.mantissa);
            for (const [text, value] of Object.entries(KEYWORDS)) {
                expect([text, bits(format.encode(text))])
                    .toEqual([text, bits(format.encode(value))]);
            }
        });
    }

    test('a NaN-less format sends "-inf" to its NEGATIVE end, not its positive one', () => {
        const format = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
        const decode = (encoded) => format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        expect(decode(format.encode('-inf'))).toBe(-6);
        expect(decode(format.encode('inf'))).toBe(6);

        expect(new Integer(8, true).encode('inf').intValue).toBe(127);
        expect(new Integer(8, true).encode('-inf').intValue).toBe(-128);

        const mxint8 = new Integer(8, true, { fractionBits: 6, symmetric: true });
        const hex = (encoded) =>
            mxint8.toHexString(encoded.sign, encoded.exponent, encoded.mantissa);
        expect(hex(mxint8.encode('-inf'))).toBe('0x81');
        expect(hex(mxint8.encode('inf'))).toBe('0x7F');
    });
});

// ── A layout with no exponent field ───────────────────────────────
//
// hasInfinity/hasNaN default to true, which on a fixed-point layout described
// something it cannot encode: getNaN() handed back the finite 0.5, and
// getMaxNormal() threw looking for a binade below the one it has.
describe('zero-exponent layouts cannot claim Infinity or NaN', () => {
    test('the constructor normalizes both flags to false', () => {
        for (const format of [
            new FloatingPoint(1, 0, 8),
            new FloatingPoint(0, 0, 8),
            new FloatingPoint(1, 0, 0),
            new FloatingPoint(1, 0, 8, { hasInfinity: true, hasNaN: true }),
        ]) {
            expect(format.hasInfinity).toBe(false);
            expect(format.hasNaN).toBe(false);
            expect(format.defaultOverflowMode).toBe('saturate');
            expect(format.overflowTarget('overflow')).toBe('maxNormal');
            expect(format.overflowTarget('saturate')).toBe('maxNormal');
            expect(() => format.getNaN()).toThrow(/does not support NaN/);
            expect(() => format.getInfinity()).toThrow(/does not support Infinity/);
        }
    });

    test('getMaxNormal() is the all-ones magnitude, and classifies as Normal', () => {
        const fixed = new FloatingPoint(1, 0, 8);
        const max = fixed.getMaxNormal(false);
        expect([max.sign, max.exponent, max.mantissa]).toEqual([0, 0, 255]);
        expect(max.isNormal).toBe(true);
        expect(fixed.classify(max.sign, max.exponent, max.mantissa)).toBe('Normal');
        expect(fixed.decode(max.sign, max.exponent, max.mantissa)).toBe(255 / 256);

        const negative = fixed.getMaxNormal(true);
        expect([negative.sign, negative.mantissa]).toEqual([1, 255]);
        // ... and it is the same pattern a NaN input substitutes.
        expect(fixed.encode(NaN)).toEqual(max);
    });

    test('the subnormal flag is ignored too: a fixed-point layout always has its zero', () => {
        // hasSubnormals: false used to leave a zero pattern that getZero()
        // refused, and a significand() reading 1.x for a value that is 0.x.
        const fixed = new FloatingPoint(1, 0, 8, { hasSubnormals: false });
        expect(fixed.hasSubnormals).toBe(true);
        expect(fixed.getZero()).toMatchObject({ sign: 0, exponent: 0, mantissa: 0, isZero: true });
        expect(fixed.decode(0, 0, 128)).toBe(0.5);
        expect(fixed.significand(0, 128)).toBe(0.5);
        expect(fixed.encode(0)).toEqual(fixed.getZero());
    });

    test('a degenerate layout whose maximum IS the zero pattern says so', () => {
        // s1e1m0 with an infinity: field 1 is the infinity, so the only finite
        // exponent left is field 0, whose empty mantissa spells zero.
        const degenerate = new FloatingPoint(1, 1, 0, { hasInfinity: true });
        const max = degenerate.getMaxNormal(false);
        expect(max.isZero).toBe(true);
        expect(degenerate.nanTarget()).toBe('zero');
        // Which is what encode(NaN) really produces - the report and the result
        // used to disagree.
        expect(degenerate.encode(NaN)).toEqual(max);
    });
});

describe('getMinNormal(), getMaxSubnormal() and getMinSubnormal()', () => {
    const fields = (e) => e && [e.sign, e.exponent, e.mantissa];

    test('an IEEE layout has all three', () => {
        const fp16 = FloatingPoint.fromFormat('fp16');
        expect(fields(fp16.getMinNormal())).toEqual([0, 1, 0]);
        expect(fields(fp16.getMaxSubnormal())).toEqual([0, 0, 1023]);
        expect(fields(fp16.getMinSubnormal())).toEqual([0, 0, 1]);
        expect(fp16.getMinNormal().isNormal).toBe(true);
        expect(fp16.getMinSubnormal().isSubnormal).toBe(true);
    });

    test('E8M0 has its min normal at field 0 and no subnormals', () => {
        const e8m0 = FloatingPoint.fromFormat('e8m0');
        expect(fields(e8m0.getMinNormal())).toEqual([0, 0, 0]);
        expect(e8m0.getMaxSubnormal()).toBeNull();
        expect(e8m0.getMinSubnormal()).toBeNull();
    });

    test('a fixed-point layout has a smallest nonzero magnitude and no subnormals', () => {
        // Otherwise the min-normal and min-subnormal presets name one pattern.
        const fixed = new FloatingPoint(1, 0, 8);
        expect(fields(fixed.getMinNormal())).toEqual([0, 0, 1]);
        expect(fixed.getMaxSubnormal()).toBeNull();
        expect(fixed.getMinSubnormal()).toBeNull();
        expect(new FloatingPoint(1, 0, 0).getMinNormal()).toBeNull();
    });

    test('a pattern the layout spends on something else is not offered', () => {
        // s1e1m0 with an Infinity: field 1 is the Infinity, so no normal.
        expect(new FloatingPoint(1, 1, 0, { hasInfinity: true }).getMinNormal()).toBeNull();
        // No mantissa field, so no subnormal to hold.
        expect(new FloatingPoint(1, 5, 0).getMinSubnormal()).toBeNull();
    });

    test('the mantissa comes back in the width\'s representation', () => {
        const wide = new FloatingPoint(1, 15, 112);
        expect(wide.getMaxSubnormal().mantissa).toBe(2n ** 112n - 1n);
        expect(wide.getMinSubnormal().mantissa).toBe(1n);
    });
});

describe('an Infinity decides NaN, not the flag', () => {
    test('with a mantissa field the rest of the top binade is NaN', () => {
        // s1e2m1 with hasNaN: false used to classify (3, 1) as the normal 6
        // while every encoder reserved the binade: encode(6) was Infinity,
        // getMaxNormal() was 3 and converting the pattern onto its own format
        // was an overflow. Declining NaN there is now refused outright, so a
        // caller can never hold a flag the format quietly ignored.
        expect(() => new FloatingPoint(1, 2, 1, { hasInfinity: true, hasNaN: false }))
            .toThrow(/hasNaN cannot be false with hasInfinity/);
        expect(() => new FloatingPoint(1, 5, 10, { hasNaN: false })).toThrow(RangeError);
        const fp = new FloatingPoint(1, 2, 1, { hasInfinity: true });
        expect(fp.hasNaN).toBe(true);
        expect(fp.classify(0, 3, 1)).toBe('NaN');
        expect(fp.getMaxNormal(false)).toMatchObject({ exponent: 2, mantissa: 1 });
        expect(fp.encode(6).isInfinite).toBe(true);
        expect(fp.encode(NaN).isNaN).toBe(true);
        const max = fp.getMaxNormal(false);
        expect(conversionLoss(fp, max, fp, convertEncoded(fp, max, fp, {}), {}).kind).toBe('exact');
    });

    test('without a mantissa field nothing is left for NaN', () => {
        const fp = new FloatingPoint(1, 5, 0, { hasInfinity: true, hasNaN: true });
        expect(fp.hasNaN).toBe(false);
        expect(fp.nanTarget()).toBe('maxNormal');
    });

    test('without an Infinity the flag is the user\'s (OCP-style)', () => {
        expect(new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: true }).hasNaN).toBe(true);
        expect(new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: false }).hasNaN).toBe(false);
        expect(new FloatingPoint(1, 4, 0, { hasInfinity: false, hasNaN: true }).hasNaN).toBe(true);
    });
});

describe('isExactlyRepresentable("-0") follows the sign, like conversionLoss()', () => {
    test.each([
        ['a signed float keeps -0', new FloatingPoint(1, 5, 2), true, true],
        ['an unsigned float drops the sign', new FloatingPoint(0, 5, 2), false, true],
        ['an unsigned fixed-point layout drops the sign', new FloatingPoint(0, 0, 8), false, true],
        ['E8M0 has no zero at all', FloatingPoint.fromFormat('e8m0'), false, false],
        ['a signed integer has one zero', new Integer(8, true), true, true],
        ['an unsigned integer drops the sign', new Integer(8, false), false, true],
    ])('%s', (_label, format, negativeZero, positiveZero) => {
        expect(format.isExactlyRepresentable('-0')).toBe(negativeZero);
        expect(format.isExactlyRepresentable('0')).toBe(positiveZero);
    });
});

// ── conversionLoss(): what happened, on the EXACT values ──────────
describe('conversionLoss()', () => {
    const fp32 = FloatingPoint.fromFormat('fp32');
    const fp16 = FloatingPoint.fromFormat('fp16');
    const uint8 = new Integer(8, false);
    const int8 = new Integer(8, true);
    const mxint8 = new Integer(8, true, { fractionBits: 6, symmetric: true });
    const int64 = new Integer(64, true);
    const unsignedFixed = new FloatingPoint(0, 0, 8);
    const unsignedFloat = new FloatingPoint(0, 5, 10);
    const e8m0 = FloatingPoint.fromFormat('e8m0');

    // [label, input format, input value, output format, encode options, kind, output value]
    const CASES = [
        ['an unchanged value', fp16, '1.5', fp32, {}, 'exact', 1.5],
        ['NaN carried through', fp32, 'nan', fp16, {}, 'exact', NaN],
        ['ordinary precision loss', fp32, '3.14159265', fp16, {}, 'rounded', 3.140625],
        ['an underflow to zero', fp32, '1e-30', fp16, {}, 'rounded', 0],
        ['a finite value clamped by the overflow clamp',
            fp32, '1e10', fp16, { overflowMode: 'saturate' }, 'saturated', 65504],
        ['the same value under overflow',
            fp32, '1e10', fp16, { overflowMode: 'overflow' }, 'overflow', Infinity],
        ['a negative an unsigned format clamps to the BOTTOM of its range',
            fp32, '-5', uint8, {}, 'saturated', 0],
        ['-Infinity clamped to the bottom of an unsigned integer',
            fp32, '-inf', uint8, {}, 'saturated', 0],
        ['-Infinity clamped to the bottom of an unsigned fixed-point layout',
            fp32, '-inf', unsignedFixed, {}, 'saturated', 0],
        ['+Infinity clamped to the top', fp32, 'inf', uint8, {}, 'saturated', 255],
        ['-0 into an unsigned format', fp32, '-0', uint8, {}, 'reflected', 0],
        ['-0 into an unsigned FLOAT', fp32, '-0', unsignedFloat, {}, 'reflected', 0],
        ['-0 into a signed format keeps its sign', fp32, '-0', fp16, {}, 'exact', -0],
        // Two's complement has one zero, so there is no sign on it to lose -
        // isExactlyRepresentable('-0') agrees. This used to read 'reflected'.
        ['-0 into a signed integer', fp32, '-0', int8, {}, 'exact', 0],
        ['-0 into a signed fixed-point integer (MXINT8)', fp32, '-0', mxint8, {}, 'exact', 0],
        ['a NaN a format cannot hold', fp32, 'nan', uint8, {}, 'nanSubstituted', 0],
        // E8M0 has no zero: both land on its smallest magnitude, and neither
        // rounded onto it.
        ['zero into a format with no zero', fp32, '0', e8m0, {}, 'saturated', 2 ** -127],
        ['a magnitude below a format with no zero', fp32, '1e-40', e8m0, {}, 'saturated', 2 ** -127],
    ];

    for (const [label, inFormat, value, outFormat, options, kind, outputValue] of CASES) {
        test(`${label} is ${kind}`, () => {
            const inEncoded = inFormat.encode(value);
            const outEncoded = convertEncoded(inFormat, inEncoded, outFormat, options);
            const decoded = outFormat.decode(
                outEncoded.sign, outEncoded.exponent, outEncoded.mantissa);
            expect(Object.is(decoded, outputValue)).toBe(true);
            expect(conversionLoss(inFormat, inEncoded, outFormat, outEncoded, options).kind)
                .toBe(kind);
        });
    }

    test('the difference is a number whenever both sides are finite, null otherwise', () => {
        const clamped = (mode) => {
            const inEncoded = fp32.encode('1e10');
            const outEncoded = convertEncoded(fp32, inEncoded, fp16, { overflowMode: mode });
            return conversionLoss(fp32, inEncoded, fp16, outEncoded);
        };
        // A finite clamp has a real difference to report as well as a reason.
        expect(clamped('saturate').absolute).toBeCloseTo(1e10 - 65504, 0);
        expect(clamped('saturate').relativePercent).toBeGreaterThan(99);
        // An infinite side has none.
        expect(clamped('overflow').absolute).toBeNull();
        expect(clamped('overflow').relativePercent).toBeNull();
        // 'exact' is 0 even where the subtraction would be NaN.
        const nan = fp32.encode(NaN);
        const loss = conversionLoss(fp32, nan, fp16, convertEncoded(fp32, nan, fp16));
        expect([loss.kind, loss.absolute, loss.relativePercent]).toEqual(['exact', 0, 0]);
    });

    test('a wide field is compared exactly, not through a rounded double', () => {
        // 2^53 + 1 is the smallest integer a double cannot name. The identity
        // conversion used to drop the low bit AND report 'exact'.
        const inEncoded = int64.encode('9007199254740993');
        const outEncoded = convertEncoded(int64, inEncoded, int64);
        expect(int64.toExactDecimalString(outEncoded)).toBe('9007199254740993');
        expect(conversionLoss(int64, inEncoded, int64, outEncoded).kind).toBe('exact');

        // ... and a conversion that really does lose the low bits says so, even
        // where the doubles on both sides are equal.
        const maxInt = int64.encode('9223372036854775807');
        const toFp32 = convertEncoded(int64, maxInt, fp32);
        const loss = conversionLoss(int64, maxInt, fp32, toFp32);
        expect(loss.kind).toBe('rounded');
        expect(fp32.toExactDecimalString(toFp32)).toBe('9223372036854775808');
        // The difference is measured exactly too: the doubles on both sides
        // are 2^63, but the loss is 1.
        expect(loss.absolute).toBe(1);
        expect(loss.relativePercent / (100 / 2 ** 63)).toBeCloseTo(1, 12);
    });

    test('the difference is measured on the exact values', () => {
        const uint64 = new Integer(64, false);
        const max = uint64.getMaxValue();
        const loss = conversionLoss(uint64, max, fp32, convertEncoded(uint64, max, fp32));
        // 2^64 - 1 -> 2^64. Subtracting the decoded doubles gave 0.
        expect([loss.kind, loss.absolute]).toEqual(['rounded', 1]);
        expect(loss.relativePercent / (100 / 2 ** 64)).toBeCloseTo(1, 12);

        // Both sides finite but past fp64's range, so both decode to Infinity,
        // yet one step of a 64-bit mantissa at 2^1030 is an ordinary 2^966.
        const wide = new FloatingPoint(1, 15, 64);
        const low = wide.encode(2n ** 1030n);
        const high = { ...low, mantissa: low.mantissa + 1n };
        expect(wide.decode(high.sign, high.exponent, high.mantissa)).toBe(Infinity);
        const step = conversionLoss(wide, high, wide, low);
        expect([step.kind, step.absolute]).toEqual(['rounded', 2 ** 966]);
        expect(step.relativePercent / (100 / 2 ** 64)).toBeCloseTo(1, 12);
    });

    test('a difference too large for a double is null, not Infinity', () => {
        const wideRange = new FloatingPoint(1, 15, 10);
        const max = wideRange.getMaxNormal(false);
        const options = { overflowMode: 'saturate' };
        const loss = conversionLoss(wideRange, max, fp32,
            convertEncoded(wideRange, max, fp32, options), options);
        expect(loss).toEqual({ kind: 'saturated', absolute: null, relativePercent: null });
    });

    // [input format, input value, output format, options, kind, output value]
    test.each([
        // Past fp16's 65504 but short of the 65520 overflow threshold, so RNE
        // rounds it down onto the maximum under either overflow mode.
        [fp32, '65510', fp16, {}, 'rounded', 65504],
        [fp32, '65510', fp16, { overflowMode: 'saturate' }, 'rounded', 65504],
        // At the threshold RNE rounds up past the range, so saturate clamps.
        [fp32, '65520', fp16, { overflowMode: 'saturate' }, 'saturated', 65504],
        // towardZero never overflows (IEEE 754 §7.4): whether landing on the
        // maximum was a clamp depends on where the value truncates to.
        [fp32, '65530', fp16, { roundingMode: 'towardZero' }, 'rounded', 65504],
        [fp32, '70000', fp16, { roundingMode: 'towardZero' }, 'saturated', 65504],
        [fp32, '255.4', uint8, {}, 'rounded', 255],
        [fp32, '255.6', uint8, {}, 'saturated', 255],
        [fp32, '-0.3', uint8, {}, 'rounded', 0],
        [fp32, '-0.6', uint8, {}, 'saturated', 0],
        // An unsigned float clamps a negative it would otherwise round to a
        // nonzero magnitude, and merely rounds one that rounds to zero on its
        // own - the same rule as the unsigned integer rows above. The zero
        // itself comes from the sign: that is the clamp, not the rounding.
        [fp32, '-0.3', unsignedFloat, {}, 'saturated', 0],
        [fp32, '-1e-30', unsignedFloat, {}, 'rounded', 0],
        // A fixed-point layout's maximum is 255/256: just past it rounds back
        // down, well past it clamps. Its grid is 1/256, so -0.001 rounds to
        // zero under the default mode and away from it under towardNegative.
        [fp32, '0.997', unsignedFixed, {}, 'rounded', 255 / 256],
        [fp32, '1.5', unsignedFixed, {}, 'saturated', 255 / 256],
        [fp32, '-0.001', unsignedFixed, {}, 'rounded', 0],
        [fp32, '-0.001', unsignedFixed, { roundingMode: 'towardNegative' }, 'saturated', 0],
        // E8M0 has no zero for a negative to round to, however small.
        [fp32, '-1e-40', e8m0, {}, 'saturated', 2 ** -127],
        [fp32, '-0.3', e8m0, {}, 'saturated', 2 ** -127],
    ])('%#: %p %s -> rounded or clamped onto an edge', (inFormat, value, outFormat, options, kind, outputValue) => {
        const inEncoded = inFormat.encode(value);
        const outEncoded = convertEncoded(inFormat, inEncoded, outFormat, options);
        expect(outFormat.decode(outEncoded.sign, outEncoded.exponent, outEncoded.mantissa))
            .toBe(outputValue);
        expect(conversionLoss(inFormat, inEncoded, outFormat, outEncoded, options).kind)
            .toBe(kind);
    });

    test('a difference below fp64\'s range is null, not a loss of 0', () => {
        // s1e15m10 reaches 2^-16382, so a value near 2^-16276 rounded to a
        // 5-bit mantissa loses about 2^-16286: nonzero, but a double rounds it
        // to 0, which would read as no loss for a 'rounded' conversion.
        const wide = new FloatingPoint(1, 15, 10);
        const narrow = new FloatingPoint(1, 15, 5);
        const inEncoded = wide.encode('1.234e-4900');
        expect(inEncoded.isZero).toBe(false);
        const outEncoded = convertEncoded(wide, inEncoded, narrow);
        expect(conversionLoss(wide, inEncoded, narrow, outEncoded))
            .toEqual({ kind: 'rounded', absolute: null, relativePercent: null });
    });

    test('a value that merely rounds ONTO the maximum is not a clamp', () => {
        // 65504 is fp16's maximum and 65520 is where fp16 overflows; 65503 is
        // below the maximum, so it is an ordinary rounding either way.
        const inEncoded = fp32.encode('65503');
        const outEncoded = convertEncoded(fp32, inEncoded, fp16);
        expect(fp16.decode(outEncoded.sign, outEncoded.exponent, outEncoded.mantissa)).toBe(65504);
        expect(conversionLoss(fp32, inEncoded, fp16, outEncoded).kind).toBe('rounded');
    });

    test('convertEncoded() is exact however far the exponent range reaches', () => {
        // Max normals near 2^65533 and 2^-32768 at the smallest subnormal: the
        // far edges the bias bound allows, where the BigInts are widest. (A
        // bias past the bound, which used to reach 2^200000, is refused; see
        // tests/fixed-point.test.js.)
        for (const bias of [-32767, 32767]) {
            const withInfinity = new FloatingPoint(1, 15, 10, { bias });
            const saturating = new FloatingPoint(1, 15, 10, { bias, hasInfinity: false, hasNaN: false });
            const inEncoded = withInfinity.getMaxNormal(false);
            const outEncoded = convertEncoded(withInfinity, inEncoded, saturating);
            expect(saturating.toExactDecimalString(outEncoded))
                .toBe(withInfinity.toExactDecimalString(inEncoded));
            expect(conversionLoss(withInfinity, inEncoded, saturating, outEncoded).kind).toBe('exact');
        }
    });
});
