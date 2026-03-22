/**
 * Comprehensive rounding mode validation tests.
 * Tests correctness of all 5 IEEE 754 rounding modes across:
 * - Normal values (halfway and non-halfway)
 * - Subnormal values
 * - Max/min normal boundaries
 * - Multiple format conversions (FP32→FP16, FP32→FP8, FP64→FP32, FP32→BF16)
 * - Negative value symmetry
 */

const { FloatingPoint, Integer, ROUNDING_MODES } = require('../lib/floating-point.js');

const fp32 = new FloatingPoint(1, 8, 23);
const fp16 = new FloatingPoint(1, 5, 10);
const fp8e5m2 = new FloatingPoint(1, 5, 2);
const fp8e4m3 = new FloatingPoint(1, 4, 3, { hasInfinity: false });
const bf16 = new FloatingPoint(1, 8, 7);
const fp64 = new FloatingPoint(1, 11, 52);

const ALL_MODES = [
    ROUNDING_MODES.tiesToEven,
    ROUNDING_MODES.tiesToAway,
    ROUNDING_MODES.towardZero,
    ROUNDING_MODES.towardPositive,
    ROUNDING_MODES.towardNegative,
];

function convert(value, inFmt, outFmt, roundingMode) {
    const inp = inFmt.encode(value);
    const decoded = inFmt.decode(inp.sign, inp.exponent, inp.mantissa);
    const out = outFmt.encode(decoded, { roundingMode });
    return outFmt.decode(out.sign, out.exponent, out.mantissa);
}

// ============================================================
// FP32 → FP16: Normal values
// ============================================================
describe('FP32 → FP16 normal rounding', () => {
    // True halfway between FP16 grid points near 1.0:
    // ULP at exponent=0 is 2^-10, half-ULP = 2^-11
    // 1 + 2^-11 = 1.00048828125 is exactly halfway between:
    //   1.0          (mantissa = 0000000000, even)
    //   1.0009765625 (mantissa = 0000000001, odd)
    describe('halfway 1.00048828125 (tiesToEven rounds DOWN to even mantissa)', () => {
        const v = 1 + Math.pow(2, -11); // 1.00048828125
        test('tiesToEven → 1.0 (even mantissa)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(1);
        });
        test('tiesToAway → 1.0009765625 (away from zero)', () => {
            expect(convert(v, fp32, fp16, 'tiesToAway')).toBe(1.0009765625);
        });
        test('towardZero → 1.0', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(1);
        });
        test('towardPositive → 1.0009765625', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(1.0009765625);
        });
        test('towardNegative → 1.0', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(1);
        });
    });

    // 1.00146484375 is exactly halfway between FP16 values:
    //   1.0009765625 (mantissa = 0000000001, odd)
    //   1.001953125  (mantissa = 0000000010, even)
    describe('halfway 1.00146484375 (tiesToEven rounds UP to even mantissa)', () => {
        const v = 1.00146484375;
        test('tiesToEven → 1.001953125 (even mantissa)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(1.001953125);
        });
        test('tiesToAway → 1.001953125', () => {
            expect(convert(v, fp32, fp16, 'tiesToAway')).toBe(1.001953125);
        });
        test('towardZero → 1.0009765625', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(1.0009765625);
        });
        test('towardPositive → 1.001953125', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(1.001953125);
        });
        test('towardNegative → 1.0009765625', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(1.0009765625);
        });
    });

    // 1.3 is not halfway - closer to lower FP16 value
    describe('non-halfway 1.3 (closer to lower grid point)', () => {
        test('tiesToEven equals tiesToAway (both round to nearer)', () => {
            const te = convert(1.3, fp32, fp16, 'tiesToEven');
            const ta = convert(1.3, fp32, fp16, 'tiesToAway');
            expect(te).toBe(ta);
        });
        test('towardPositive > towardZero', () => {
            const tp = convert(1.3, fp32, fp16, 'towardPositive');
            const tz = convert(1.3, fp32, fp16, 'towardZero');
            expect(tp).toBeGreaterThan(tz);
        });
        test('towardZero equals towardNegative (both truncate for positive)', () => {
            const tz = convert(1.3, fp32, fp16, 'towardZero');
            const tn = convert(1.3, fp32, fp16, 'towardNegative');
            expect(tz).toBe(tn);
        });
    });

    // Exactly representable value should be identical in all modes
    describe('exact value 1.0009765625', () => {
        test('all modes produce identical result', () => {
            const results = ALL_MODES.map(m => convert(1.0009765625, fp32, fp16, m));
            expect(new Set(results).size).toBe(1);
        });
    });
});

// ============================================================
// FP32 → FP16: Subnormal values
// ============================================================
describe('FP32 → FP16 subnormal rounding', () => {
    // FP16 subnormal ULP = 2^-24
    // 1.5 * 2^-24 is halfway between:
    //   1 * 2^-24 (mantissa = 0000000001, odd)
    //   2 * 2^-24 (mantissa = 0000000010, even)
    describe('halfway 1.5*2^-24 (between subnormal grid points)', () => {
        const v = 1.5 * Math.pow(2, -24);
        const lower = Math.pow(2, -24);
        const upper = 2 * Math.pow(2, -24);

        test('tiesToEven → 2*2^-24 (even mantissa)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(upper);
        });
        test('tiesToAway → 2*2^-24 (away from zero)', () => {
            expect(convert(v, fp32, fp16, 'tiesToAway')).toBe(upper);
        });
        test('towardZero → 2^-24', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(lower);
        });
        test('towardPositive → 2*2^-24', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(upper);
        });
        test('towardNegative → 2^-24', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(lower);
        });
    });

    // 0.5 * 2^-24 is halfway between:
    //   0     (mantissa = 0000000000, even)
    //   2^-24 (mantissa = 0000000001, odd)
    describe('halfway 0.5*2^-24 (between zero and min subnormal)', () => {
        const v = 0.5 * Math.pow(2, -24);
        const minSub = Math.pow(2, -24);

        test('tiesToEven → 0 (even mantissa)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(0);
        });
        test('tiesToAway → min subnormal (away from zero)', () => {
            expect(convert(v, fp32, fp16, 'tiesToAway')).toBe(minSub);
        });
        test('towardZero → 0', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(0);
        });
        test('towardPositive → min subnormal', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(minSub);
        });
        test('towardNegative → 0', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(0);
        });
    });

    // Non-halfway subnormal: 1.3 * 2^-24 (closer to lower grid point)
    describe('non-halfway 1.3*2^-24 (closer to lower subnormal)', () => {
        const v = 1.3 * Math.pow(2, -24);
        const lower = Math.pow(2, -24);
        const upper = 2 * Math.pow(2, -24);

        test('tiesToEven → lower (nearer)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(lower);
        });
        test('towardZero → lower', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(lower);
        });
        test('towardPositive → upper (ceiling)', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(upper);
        });
        test('towardNegative → lower', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(lower);
        });
    });
});

// ============================================================
// FP32 → FP16: Max/min normal boundaries
// ============================================================
describe('FP32 → FP16 boundary rounding', () => {
    // FP16 max normal = 65504 (exactly representable)
    describe('max normal 65504 (exact)', () => {
        test('all modes agree', () => {
            const results = ALL_MODES.map(m => convert(65504, fp32, fp16, m));
            expect(new Set(results).size).toBe(1);
            expect(results[0]).toBe(65504);
        });
    });

    // 100000 is well above FP16 max
    describe('overflow 100000', () => {
        test('tiesToEven → Infinity', () => {
            expect(convert(100000, fp32, fp16, 'tiesToEven')).toBe(Infinity);
        });
        test('towardZero → 65504 (max normal)', () => {
            expect(convert(100000, fp32, fp16, 'towardZero')).toBe(65504);
        });
        test('towardPositive → Infinity', () => {
            expect(convert(100000, fp32, fp16, 'towardPositive')).toBe(Infinity);
        });
        test('towardNegative → 65504', () => {
            expect(convert(100000, fp32, fp16, 'towardNegative')).toBe(65504);
        });
    });

    // FP16 min normal = 2^-14 (exactly representable)
    describe('min normal 2^-14 (exact)', () => {
        test('all modes agree', () => {
            const v = Math.pow(2, -14);
            const results = ALL_MODES.map(m => convert(v, fp32, fp16, m));
            expect(new Set(results).size).toBe(1);
            expect(results[0]).toBe(v);
        });
    });
});

// ============================================================
// FP32 → FP8 E4M3 (OCP): 3-bit mantissa rounding
// ============================================================
describe('FP32 → FP8 E4M3 rounding', () => {
    // At exponent=0: grid = 1.0, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875
    // ULP = 0.125, half-ULP = 0.0625

    // 1.3125 = halfway between 1.25 (mantissa=010, even) and 1.375 (mantissa=011, odd)
    describe('halfway 1.3125 (tiesToEven rounds DOWN to even)', () => {
        const v = 1.3125;
        test('tiesToEven → 1.25 (even mantissa 010)', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToEven')).toBe(1.25);
        });
        test('tiesToAway → 1.375 (away from zero)', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToAway')).toBe(1.375);
        });
        test('towardZero → 1.25', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardZero')).toBe(1.25);
        });
        test('towardPositive → 1.375', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardPositive')).toBe(1.375);
        });
        test('towardNegative → 1.25', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardNegative')).toBe(1.25);
        });
    });

    // 1.4375 = halfway between 1.375 (mantissa=011, odd) and 1.5 (mantissa=100, even)
    describe('halfway 1.4375 (tiesToEven rounds UP to even)', () => {
        const v = 1.4375;
        test('tiesToEven → 1.5 (even mantissa 100)', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToEven')).toBe(1.5);
        });
        test('tiesToAway → 1.5', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToAway')).toBe(1.5);
        });
        test('towardZero → 1.375', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardZero')).toBe(1.375);
        });
        test('towardPositive → 1.5', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardPositive')).toBe(1.5);
        });
        test('towardNegative → 1.375', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardNegative')).toBe(1.375);
        });
    });

    // Normal value 0.02: in E4M3 at exponent=1 (actual exp=-6)
    // Grid: 0.015625, 0.017578125, 0.01953125, 0.021484375, ...
    // 0.02 is between 0.01953125 (m=2) and 0.021484375 (m=3)
    describe('normal 0.02 (between grid points)', () => {
        test('towardZero → 0.01953125', () => {
            expect(convert(0.02, fp32, fp8e4m3, 'towardZero')).toBe(0.01953125);
        });
        test('towardPositive → 0.021484375', () => {
            expect(convert(0.02, fp32, fp8e4m3, 'towardPositive')).toBe(0.021484375);
        });
        test('towardNegative → 0.01953125', () => {
            expect(convert(0.02, fp32, fp8e4m3, 'towardNegative')).toBe(0.01953125);
        });
    });

    // FP8 E4M3 max normal = 448 (exp=15, mant=6; only all-ones mantissa at maxExp is NaN)
    describe('overflow 500 (above max=448, no infinity)', () => {
        test('towardZero → 448 (clamped to max)', () => {
            expect(convert(500, fp32, fp8e4m3, 'towardZero')).toBe(448);
        });
        test('towardNegative → 448', () => {
            expect(convert(500, fp32, fp8e4m3, 'towardNegative')).toBe(448);
        });
    });
});

// ============================================================
// FP32 → FP8 E5M2: 2-bit mantissa rounding
// ============================================================
describe('FP32 → FP8 E5M2 rounding', () => {
    // At exponent=0: grid = 1.0, 1.25, 1.5, 1.75; ULP = 0.25

    // 1.125 = halfway between 1.0 (mantissa=00, even) and 1.25 (mantissa=01, odd)
    describe('halfway 1.125 (tiesToEven rounds DOWN to even)', () => {
        const v = 1.125;
        test('tiesToEven → 1.0 (even mantissa 00)', () => {
            expect(convert(v, fp32, fp8e5m2, 'tiesToEven')).toBe(1.0);
        });
        test('tiesToAway → 1.25 (away from zero)', () => {
            expect(convert(v, fp32, fp8e5m2, 'tiesToAway')).toBe(1.25);
        });
        test('towardZero → 1.0', () => {
            expect(convert(v, fp32, fp8e5m2, 'towardZero')).toBe(1.0);
        });
        test('towardPositive → 1.25', () => {
            expect(convert(v, fp32, fp8e5m2, 'towardPositive')).toBe(1.25);
        });
        test('towardNegative → 1.0', () => {
            expect(convert(v, fp32, fp8e5m2, 'towardNegative')).toBe(1.0);
        });
    });

    // 1.375 = halfway between 1.25 (mantissa=01, odd) and 1.5 (mantissa=10, even)
    describe('halfway 1.375 (tiesToEven rounds UP to even)', () => {
        const v = 1.375;
        test('tiesToEven → 1.5 (even mantissa 10)', () => {
            expect(convert(v, fp32, fp8e5m2, 'tiesToEven')).toBe(1.5);
        });
        test('tiesToAway → 1.5', () => {
            expect(convert(v, fp32, fp8e5m2, 'tiesToAway')).toBe(1.5);
        });
        test('towardZero → 1.25', () => {
            expect(convert(v, fp32, fp8e5m2, 'towardZero')).toBe(1.25);
        });
    });
});

// ============================================================
// FP32 → BF16: 7-bit mantissa rounding
// ============================================================
describe('FP32 → BF16 rounding', () => {
    // BF16 ULP at exponent=0 (biased 127) = 2^-7 = 0.0078125
    // Half ULP = 2^-8 = 0.00390625

    // 1.00390625 = 1 + 2^-8 = halfway between 1.0 (mantissa=0, even) and 1.0078125 (mantissa=1, odd)
    describe('halfway 1.00390625 (tiesToEven rounds DOWN to even)', () => {
        const v = 1.00390625;
        test('tiesToEven → 1.0 (even mantissa)', () => {
            expect(convert(v, fp32, bf16, 'tiesToEven')).toBe(1.0);
        });
        test('tiesToAway → 1.0078125', () => {
            expect(convert(v, fp32, bf16, 'tiesToAway')).toBe(1.0078125);
        });
        test('towardZero → 1.0', () => {
            expect(convert(v, fp32, bf16, 'towardZero')).toBe(1.0);
        });
        test('towardPositive → 1.0078125', () => {
            expect(convert(v, fp32, bf16, 'towardPositive')).toBe(1.0078125);
        });
        test('towardNegative → 1.0', () => {
            expect(convert(v, fp32, bf16, 'towardNegative')).toBe(1.0);
        });
    });

    // 1.01171875 = 1 + 3*2^-8 = halfway between 1.0078125 (mantissa=1, odd) and 1.015625 (mantissa=10, even)
    describe('halfway 1.01171875 (tiesToEven rounds UP to even)', () => {
        const v = 1.01171875;
        test('tiesToEven → 1.015625 (even mantissa)', () => {
            expect(convert(v, fp32, bf16, 'tiesToEven')).toBe(1.015625);
        });
        test('tiesToAway → 1.015625', () => {
            expect(convert(v, fp32, bf16, 'tiesToAway')).toBe(1.015625);
        });
        test('towardZero → 1.0078125', () => {
            expect(convert(v, fp32, bf16, 'towardZero')).toBe(1.0078125);
        });
    });
});

// ============================================================
// FP64 → FP32: 52-bit to 23-bit mantissa
// ============================================================
describe('FP64 → FP32 rounding', () => {
    // 1 + 2^-24 is halfway between FP32 values:
    //   1.0       (mantissa = 0...0, even)
    //   1 + 2^-23 (mantissa = 0...01, odd)
    describe('halfway 1+2^-24 (tiesToEven rounds DOWN to even)', () => {
        const v = 1 + Math.pow(2, -24);
        test('tiesToEven → 1.0 (even mantissa)', () => {
            expect(convert(v, fp64, fp32, 'tiesToEven')).toBe(1.0);
        });
        test('tiesToAway → 1+2^-23', () => {
            expect(convert(v, fp64, fp32, 'tiesToAway')).toBe(1 + Math.pow(2, -23));
        });
        test('towardZero → 1.0', () => {
            expect(convert(v, fp64, fp32, 'towardZero')).toBe(1.0);
        });
        test('towardPositive → 1+2^-23', () => {
            expect(convert(v, fp64, fp32, 'towardPositive')).toBe(1 + Math.pow(2, -23));
        });
        test('towardNegative → 1.0', () => {
            expect(convert(v, fp64, fp32, 'towardNegative')).toBe(1.0);
        });
    });
});

// ============================================================
// Negative value symmetry
// ============================================================
describe('Negative value rounding symmetry', () => {
    // -1.3125 in FP8 E4M3: halfway between -1.25 and -1.375
    describe('FP32 → FP8 E4M3: -1.3125 halfway', () => {
        const v = -1.3125;
        test('tiesToEven → -1.25 (even mantissa)', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToEven')).toBe(-1.25);
        });
        test('tiesToAway → -1.375 (away from zero)', () => {
            expect(convert(v, fp32, fp8e4m3, 'tiesToAway')).toBe(-1.375);
        });
        test('towardZero → -1.25 (toward zero)', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardZero')).toBe(-1.25);
        });
        test('towardPositive → -1.25 (ceiling for negative = toward zero)', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardPositive')).toBe(-1.25);
        });
        test('towardNegative → -1.375 (floor)', () => {
            expect(convert(v, fp32, fp8e4m3, 'towardNegative')).toBe(-1.375);
        });
    });

    // Negative overflow in FP16
    describe('FP32 → FP16: -100000 overflow', () => {
        test('tiesToEven → -Infinity', () => {
            expect(convert(-100000, fp32, fp16, 'tiesToEven')).toBe(-Infinity);
        });
        test('towardZero → -65504 (toward zero)', () => {
            expect(convert(-100000, fp32, fp16, 'towardZero')).toBe(-65504);
        });
        test('towardPositive → -65504 (ceiling = toward zero for negative)', () => {
            expect(convert(-100000, fp32, fp16, 'towardPositive')).toBe(-65504);
        });
        test('towardNegative → -Infinity (floor)', () => {
            expect(convert(-100000, fp32, fp16, 'towardNegative')).toBe(-Infinity);
        });
    });

    // Negative subnormal halfway
    describe('FP32 → FP16: -1.5*2^-24 subnormal halfway', () => {
        const v = -1.5 * Math.pow(2, -24);
        test('tiesToEven → -2*2^-24 (even mantissa)', () => {
            expect(convert(v, fp32, fp16, 'tiesToEven')).toBe(-2 * Math.pow(2, -24));
        });
        test('towardZero → -2^-24', () => {
            expect(convert(v, fp32, fp16, 'towardZero')).toBe(-Math.pow(2, -24));
        });
        test('towardPositive → -2^-24 (ceiling = toward zero for negative)', () => {
            expect(convert(v, fp32, fp16, 'towardPositive')).toBe(-Math.pow(2, -24));
        });
        test('towardNegative → -2*2^-24 (floor)', () => {
            expect(convert(v, fp32, fp16, 'towardNegative')).toBe(-2 * Math.pow(2, -24));
        });
    });

    // Verify sign symmetry: |round(x)| should equal |round(-x)| for symmetric modes
    describe('sign symmetry for tiesToEven and tiesToAway', () => {
        const testValues = [1.3, 1.3125, 1.4375, 0.02, 1.5 * Math.pow(2, -24)];
        const formats = [
            { name: 'FP16', fmt: fp16 },
            { name: 'FP8E4M3', fmt: fp8e4m3 },
        ];

        for (const { name, fmt } of formats) {
            for (const v of testValues) {
                test(`${name}: |tiesToEven(${v})| = |tiesToEven(${-v})|`, () => {
                    const pos = convert(v, fp32, fmt, 'tiesToEven');
                    const neg = convert(-v, fp32, fmt, 'tiesToEven');
                    expect(Math.abs(pos)).toBe(Math.abs(neg));
                });
                test(`${name}: |tiesToAway(${v})| = |tiesToAway(${-v})|`, () => {
                    const pos = convert(v, fp32, fmt, 'tiesToAway');
                    const neg = convert(-v, fp32, fmt, 'tiesToAway');
                    expect(Math.abs(pos)).toBe(Math.abs(neg));
                });
            }
        }
    });

    // Verify directional mode asymmetry for negative values
    describe('directional modes flip for negative values', () => {
        test('towardPositive(-1.3) = -towardNegative(1.3) in FP8E4M3', () => {
            const tp_neg = convert(-1.3, fp32, fp8e4m3, 'towardPositive');
            const tn_pos = convert(1.3, fp32, fp8e4m3, 'towardNegative');
            expect(tp_neg).toBe(-tn_pos);
        });
        test('towardNegative(-1.3) = -towardPositive(1.3) in FP8E4M3', () => {
            const tn_neg = convert(-1.3, fp32, fp8e4m3, 'towardNegative');
            const tp_pos = convert(1.3, fp32, fp8e4m3, 'towardPositive');
            expect(tn_neg).toBe(-tp_pos);
        });
    });
});

// ============================================================
// Integer rounding modes
// ============================================================
describe('Integer rounding with modes', () => {
    const int8 = new Integer(8, true);

    function intConvert(value, fmt, roundingMode) {
        const enc = fmt.encode(value, { roundingMode });
        return fmt.decode(enc.sign, enc.exponent, enc.mantissa);
    }

    describe('halfway 2.5 (between 2 even and 3 odd)', () => {
        test('tiesToEven → 2 (even)', () => {
            expect(intConvert(2.5, int8, 'tiesToEven')).toBe(2);
        });
        test('tiesToAway → 3 (away from zero)', () => {
            expect(intConvert(2.5, int8, 'tiesToAway')).toBe(3);
        });
        test('towardZero → 2', () => {
            expect(intConvert(2.5, int8, 'towardZero')).toBe(2);
        });
        test('towardPositive → 3', () => {
            expect(intConvert(2.5, int8, 'towardPositive')).toBe(3);
        });
        test('towardNegative → 2', () => {
            expect(intConvert(2.5, int8, 'towardNegative')).toBe(2);
        });
    });

    describe('negative halfway -2.5 (between -2 even and -3 odd)', () => {
        test('tiesToEven → -2 (even)', () => {
            expect(intConvert(-2.5, int8, 'tiesToEven')).toBe(-2);
        });
        test('tiesToAway → -3 (away from zero)', () => {
            expect(intConvert(-2.5, int8, 'tiesToAway')).toBe(-3);
        });
        test('towardZero → -2', () => {
            expect(intConvert(-2.5, int8, 'towardZero')).toBe(-2);
        });
        test('towardPositive → -2 (ceiling)', () => {
            expect(intConvert(-2.5, int8, 'towardPositive')).toBe(-2);
        });
        test('towardNegative → -3 (floor)', () => {
            expect(intConvert(-2.5, int8, 'towardNegative')).toBe(-3);
        });
    });

    describe('non-halfway 3.7', () => {
        test('towardZero → 3 (truncate)', () => {
            expect(intConvert(3.7, int8, 'towardZero')).toBe(3);
        });
        test('towardPositive → 4 (ceiling)', () => {
            expect(intConvert(3.7, int8, 'towardPositive')).toBe(4);
        });
        test('towardNegative → 3 (floor)', () => {
            expect(intConvert(3.7, int8, 'towardNegative')).toBe(3);
        });
    });

    describe('negative non-halfway -3.7', () => {
        test('towardZero → -3 (toward zero)', () => {
            expect(intConvert(-3.7, int8, 'towardZero')).toBe(-3);
        });
        test('towardPositive → -3 (ceiling = toward zero for neg)', () => {
            expect(intConvert(-3.7, int8, 'towardPositive')).toBe(-3);
        });
        test('towardNegative → -4 (floor)', () => {
            expect(intConvert(-3.7, int8, 'towardNegative')).toBe(-4);
        });
    });
});
