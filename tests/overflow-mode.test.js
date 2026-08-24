// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * Overflow behavior (saturation) modes.
 *
 * Two modes, `overflow` and `saturate`, matching the SAT / NONSAT pair OCP OFP8
 * §5.2.1 requires and the SAT / OVF pair OCP MX §5.3.1 Table 3 names, and the
 * saturating-cast option that CUDA (__NV_SATFINITE), OpenCL (convert_*_sat) and
 * LLVM (fptosi.sat) already expose.
 *
 * The compatibility commitment is pinned here: every existing format keeps the
 * behavior it had before the modes existed, because `defaultOverflowMode` is
 * derived from `hasInfinity`.
 */

const {
    FloatingPoint, Integer, FORMATS, OVERFLOW_MODES,
} = require('../lib/floating-point.js');

const fp = key => FloatingPoint.fromFormat(key);
const decode = (format, e) => format.decode(e.sign, e.exponent, e.mantissa);
const value = (format, input, options) => decode(format, format.encode(input, options));

describe('OVERFLOW_MODES', () => {
    test('exposes exactly the two modes and is frozen', () => {
        expect(Object.keys(OVERFLOW_MODES).sort()).toEqual(['overflow', 'saturate']);
        expect(Object.isFrozen(OVERFLOW_MODES)).toBe(true);
    });
});

describe('defaultOverflowMode (compatibility pin)', () => {
    const EXPECTED = {
        fp64: 'overflow', fp32: 'overflow', fp16: 'overflow',
        bf16: 'overflow', tf32: 'overflow',
        fp8_e5m2: 'overflow',
        fp8_e4m3: 'saturate',
        fp6_e3m2: 'saturate', fp6_e2m3: 'saturate', fp4_e2m1: 'saturate',
        e8m0: 'saturate',
    };

    for (const [key, mode] of Object.entries(EXPECTED)) {
        test(`${key} defaults to ${mode}`, () => {
            expect(fp(key).defaultOverflowMode).toBe(mode);
        });
    }

    test('every integer preset defaults to saturate', () => {
        for (const [key, preset] of Object.entries(FORMATS)) {
            if (!preset.isInteger) continue;
            const format = new Integer(preset.bits, preset.signed, preset);
            expect([key, format.defaultOverflowMode]).toEqual([key, 'saturate']);
        }
    });

    test('a fixed-point format defaults to saturate', () => {
        expect(new FloatingPoint(1, 0, 7).defaultOverflowMode).toBe('saturate');
    });

    test('an explicit constructor option overrides the derived default', () => {
        const format = new FloatingPoint(1, 5, 10, { overflowMode: 'saturate' });
        expect(format.defaultOverflowMode).toBe('saturate');
        expect(value(format, 1e5)).toBe(65504);
    });
});

describe('overflowTarget()', () => {
    const CASES = [
        ['fp64', 'infinity', 'maxNormal'],
        ['fp32', 'infinity', 'maxNormal'],
        ['fp16', 'infinity', 'maxNormal'],
        ['bf16', 'infinity', 'maxNormal'],
        ['tf32', 'infinity', 'maxNormal'],
        ['fp8_e5m2', 'infinity', 'maxNormal'],
        ['fp8_e4m3', 'nan', 'maxNormal'],
        ['fp6_e3m2', 'maxNormal', 'maxNormal'],
        ['fp6_e2m3', 'maxNormal', 'maxNormal'],
        ['fp4_e2m1', 'maxNormal', 'maxNormal'],
        ['e8m0', 'nan', 'maxNormal'],
    ];

    for (const [key, onOverflow, onSaturate] of CASES) {
        test(`${key}`, () => {
            const format = fp(key);
            expect(format.overflowTarget('overflow')).toBe(onOverflow);
            expect(format.overflowTarget('saturate')).toBe(onSaturate);
            // No argument resolves through the per-format default.
            expect(format.overflowTarget())
                .toBe(format.defaultOverflowMode === 'overflow' ? onOverflow : onSaturate);
        });
    }

    test('integers always report maxNormal', () => {
        const int8 = new Integer(8, true);
        expect(int8.overflowTarget('overflow')).toBe('maxNormal');
        expect(int8.overflowTarget('saturate')).toBe('maxNormal');
        expect(int8.overflowTarget()).toBe('maxNormal');
    });

    test('fixed-point reports maxNormal in both modes', () => {
        const fixed = new FloatingPoint(1, 0, 7);
        expect(fixed.overflowTarget('overflow')).toBe('maxNormal');
        expect(fixed.overflowTarget('saturate')).toBe('maxNormal');
    });

    test('a degenerate layout that claims NaN but cannot encode one clamps', () => {
        // s1e5m0 with infinity: the all-ones exponent IS infinity's encoding,
        // so there is no pattern left for NaN.
        const format = new FloatingPoint(1, 5, 0, { hasInfinity: true, hasNaN: true });
        expect(format.overflowTarget('overflow')).toBe('infinity');

        const noInf = new FloatingPoint(1, 5, 0, { hasInfinity: false, hasNaN: true });
        expect(noInf.overflowTarget('overflow')).toBe('nan');
    });
});

// OFP8 Table 3 / MX Table 3, over the formats where the choice is observable.
describe('the two modes across formats', () => {
    const MAX = {
        fp32: 3.4028234663852886e38,
        fp16: 65504,
        fp8_e5m2: 57344,
        fp8_e4m3: 448,
        fp6_e3m2: 28,
        fp6_e2m3: 7.5,
        fp4_e2m1: 6,
    };

    const OVER = {
        fp32: 1e40, fp16: 1e5, fp8_e5m2: 1e5, fp8_e4m3: 1000,
        fp6_e3m2: 1000, fp6_e2m3: 1000, fp4_e2m1: 1000,
    };

    for (const key of Object.keys(MAX)) {
        describe(key, () => {
            test('saturate clamps a finite overflow, both signs', () => {
                const format = fp(key);
                expect(value(format, OVER[key], { overflowMode: 'saturate' })).toBe(MAX[key]);
                expect(value(format, -OVER[key], { overflowMode: 'saturate' })).toBe(-MAX[key]);
            });

            test('saturate clamps an infinite input, both signs', () => {
                const format = fp(key);
                expect(value(format, Infinity, { overflowMode: 'saturate' })).toBe(MAX[key]);
                expect(value(format, -Infinity, { overflowMode: 'saturate' })).toBe(-MAX[key]);
            });

            test('overflow produces the format out-of-range encoding', () => {
                const format = fp(key);
                const expected = format.overflowTarget('overflow');
                const got = value(format, OVER[key], { overflowMode: 'overflow' });
                if (expected === 'infinity') expect(got).toBe(Infinity);
                else if (expected === 'nan') expect(got).toBeNaN();
                else expect(got).toBe(MAX[key]);
            });

            test('an in-range value is untouched by either mode', () => {
                const format = fp(key);
                expect(value(format, 1, { overflowMode: 'saturate' })).toBe(1);
                expect(value(format, 1, { overflowMode: 'overflow' })).toBe(1);
            });

            test('a magnitude below the minimum still becomes a signed zero', () => {
                const format = fp(key);
                for (const mode of ['saturate', 'overflow']) {
                    expect(value(format, 1e-60, { overflowMode: mode })).toBe(0);
                    expect(Object.is(value(format, -1e-60, { overflowMode: mode }), -0)).toBe(true);
                }
            });

            test('zero and NaN pass through unchanged in both modes', () => {
                const format = fp(key);
                for (const mode of ['saturate', 'overflow']) {
                    expect(value(format, 0, { overflowMode: mode })).toBe(0);
                    expect(Object.is(value(format, -0, { overflowMode: mode }), -0)).toBe(true);
                    if (format.hasNaN) {
                        expect(value(format, NaN, { overflowMode: mode })).toBeNaN();
                    }
                }
            });
        });
    }

    test('E5M2 saturating an infinite input is the OFP8 Table 3 cell', () => {
        expect(value(fp('fp8_e5m2'), Infinity, { overflowMode: 'saturate' })).toBe(57344);
        expect(value(fp('fp8_e5m2'), -Infinity, { overflowMode: 'saturate' })).toBe(-57344);
    });

    test('E4M3 non-saturating overflow is the OFP8 Table 3 cell', () => {
        expect(value(fp('fp8_e4m3'), 1000, { overflowMode: 'overflow' })).toBeNaN();
        expect(value(fp('fp8_e4m3'), Infinity, { overflowMode: 'overflow' })).toBeNaN();
        expect(value(fp('fp8_e4m3'), -Infinity, { overflowMode: 'overflow' })).toBeNaN();
    });

    test('E4M3 overflow catches a value that ROUNDS past max normal', () => {
        // 470 is below the 480 slot but rounds up into it, which is an
        // overflow: 480 is the reserved NaN encoding, not a finite value.
        const format = fp('fp8_e4m3');
        expect(value(format, 470, { overflowMode: 'saturate' })).toBe(448);
        expect(value(format, 470, { overflowMode: 'overflow' })).toBeNaN();
        // 456 is exactly the midpoint between 448 and 464; ties-to-even keeps it
        // in range at 448 either way.
        expect(value(format, 456, { overflowMode: 'overflow' })).toBe(448);
    });
});

describe('IEEE 754 §7.4 precedence over the overflow mode', () => {
    // A directed mode pointing toward zero may never produce an infinity, no
    // matter what the saturation mode says.
    const CLAMPING = [
        ['towardZero', 0], ['towardZero', 1],
        ['towardNegative', 0],
        ['towardPositive', 1],
    ];

    for (const [roundingMode, sign] of CLAMPING) {
        test(`${roundingMode} clamps a finite ${sign ? 'negative' : 'positive'} overflow`, () => {
            const format = fp('fp32');
            const input = sign ? -1e40 : 1e40;
            const max = sign ? -3.4028234663852886e38 : 3.4028234663852886e38;
            expect(value(format, input, { roundingMode, overflowMode: 'overflow' })).toBe(max);
            expect(value(format, input, { roundingMode, overflowMode: 'saturate' })).toBe(max);
        });
    }

    test('the rounding mode does NOT clamp an infinite input', () => {
        const format = fp('fp16');
        expect(value(format, Infinity, { roundingMode: 'towardZero', overflowMode: 'overflow' }))
            .toBe(Infinity);
        expect(value(format, Infinity, { roundingMode: 'towardZero', overflowMode: 'saturate' }))
            .toBe(65504);
    });

    test('a directed mode pointing AWAY from zero still honors the mode', () => {
        const format = fp('fp32');
        expect(value(format, 1e40, { roundingMode: 'towardPositive', overflowMode: 'overflow' }))
            .toBe(Infinity);
        expect(value(format, 1e40, { roundingMode: 'towardPositive', overflowMode: 'saturate' }))
            .toBe(3.4028234663852886e38);
    });
});

describe('encodeString honors overflowMode identically', () => {
    test('a literal just above max normal', () => {
        const format = fp('fp32');
        const literal = '340282366920938463463374607431768211456'; // 2^128
        expect(decode(format, format.encodeString(literal, { overflowMode: 'overflow' })))
            .toBe(Infinity);
        expect(decode(format, format.encodeString(literal, { overflowMode: 'saturate' })))
            .toBe(3.4028234663852886e38);
    });

    test('the out-of-range shortcut path (1e30000)', () => {
        const format = fp('fp32');
        expect(value(format, '1e30000', { overflowMode: 'overflow' })).toBe(Infinity);
        expect(value(format, '1e30000', { overflowMode: 'saturate' }))
            .toBe(3.4028234663852886e38);
        // Rule 1 still wins.
        expect(value(format, '1e30000', {
            overflowMode: 'overflow', roundingMode: 'towardZero',
        })).toBe(3.4028234663852886e38);
    });

    test('E4M3 via the string path', () => {
        expect(value(fp('fp8_e4m3'), '1000', { overflowMode: 'overflow' })).toBeNaN();
        expect(value(fp('fp8_e4m3'), '1000', { overflowMode: 'saturate' })).toBe(448);
    });
});

describe('validation', () => {
    const MESSAGE = 'Unknown overflow mode: "bogus". Valid modes: saturate, overflow.';

    test('FloatingPoint.encode rejects an unknown mode for an overflowing value', () => {
        expect(() => fp('fp32').encode(1e40, { overflowMode: 'bogus' })).toThrow(MESSAGE);
    });

    test('FloatingPoint.encode rejects an unknown mode for an IN-RANGE value', () => {
        // Validation must not depend on the input taking the overflow path.
        expect(() => fp('fp32').encode(1, { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => fp('fp32').encode(0, { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => fp('fp32').encode(NaN, { overflowMode: 'bogus' })).toThrow(MESSAGE);
    });

    test('FloatingPoint.encodeString rejects an unknown mode', () => {
        expect(() => fp('fp32').encodeString('1', { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => fp('fp32').encodeString('1e40', { overflowMode: 'bogus' })).toThrow(MESSAGE);
    });

    test('the fixed-point path validates too', () => {
        const fixed = new FloatingPoint(1, 0, 7);
        expect(() => fixed.encode(0.5, { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => fixed.encodeString('0.5', { overflowMode: 'bogus' })).toThrow(MESSAGE);
    });

    test('Integer rejects an unknown mode from both entry points', () => {
        const int8 = new Integer(8, true);
        expect(() => int8.encode(1, { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => int8.encode(1000, { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => int8.encodeString('1', { overflowMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => int8.encodeString('1e40', { overflowMode: 'bogus' })).toThrow(MESSAGE);
    });
});

describe('inert cases: both modes agree', () => {
    const INERT_FLOATS = ['fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1'];

    for (const key of INERT_FLOATS) {
        test(`${key} gives identical results in both modes`, () => {
            const format = fp(key);
            for (const input of [1000, -1000, Infinity, -Infinity, 1, 0]) {
                expect(value(format, input, { overflowMode: 'overflow' }))
                    .toBe(value(format, input, { overflowMode: 'saturate' }));
            }
        });
    }

    test('integers give identical results in both modes', () => {
        const int8 = new Integer(8, true);
        for (const input of [1000, -1000, Infinity, -Infinity, 1, 0]) {
            expect(int8.encode(input, { overflowMode: 'overflow' }).intValue)
                .toBe(int8.encode(input, { overflowMode: 'saturate' }).intValue);
        }
        expect(int8.encodeString('1e40', { overflowMode: 'overflow' }).intValue).toBe(127);
        expect(int8.encodeString('1e40', { overflowMode: 'saturate' }).intValue).toBe(127);
    });

    test('fixed-point gives identical results in both modes', () => {
        const fixed = new FloatingPoint(1, 0, 7);
        for (const input of [1000, -1000, Infinity, -Infinity, 0.5, 0]) {
            expect(value(fixed, input, { overflowMode: 'overflow' }))
                .toBe(value(fixed, input, { overflowMode: 'saturate' }));
        }
    });
});

describe('the produced NaN', () => {
    test('has sign 0 (OFP8 §5.2.1 leaves this implementation-defined)', () => {
        const format = fp('fp8_e4m3');
        expect(format.encode(-1000, { overflowMode: 'overflow' }).sign).toBe(0);
        expect(format.encode(-Infinity, { overflowMode: 'overflow' }).sign).toBe(0);
    });
});

describe('generality: saturate on IEEE formats', () => {
    test('FP32 saturates on request', () => {
        expect(value(fp('fp32'), 1e40, { overflowMode: 'saturate' }))
            .toBe(3.4028234663852886e38);
    });

    test('FP16 saturates on request', () => {
        expect(value(fp('fp16'), 1e5, { overflowMode: 'saturate' })).toBe(65504);
    });

    test('FP64 saturates on request', () => {
        expect(value(fp('fp64'), Infinity, { overflowMode: 'saturate' }))
            .toBe(Number.MAX_VALUE);
    });

    test('omitting the option reproduces the historical behavior', () => {
        expect(value(fp('fp32'), 1e40)).toBe(Infinity);
        expect(value(fp('fp16'), 1e5)).toBe(Infinity);
        expect(value(fp('fp8_e4m3'), 1000)).toBe(448);
        expect(value(fp('fp4_e2m1'), 1000)).toBe(6);
    });
});
