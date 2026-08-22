// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Exact decimal-string encoding.
//
// Every expected value in this file was produced by David M. Gay's dtoa.c
// (netlib "gdtoa"), the reference correctly-rounded decimal<->binary
// implementation, driven by a C harness:
//
//   cc -O2 -DIEEE_8087 -DHonor_FLT_ROUNDS \
//      -Dstrtod=gay_strtod -Ddtoa=gay_dtoa -Dfreedtoa=gay_freedtoa dtoa.c ...
//
// fp64 expectations come straight from strtod(). Narrow-format expectations
// come from an exact three-way comparison of the decimal against the format's
// midpoints: with strtod under FE_DOWNWARD/FE_UPWARD the two results bracket the
// true decimal exactly, and every narrow-format midpoint is itself an exactly
// representable double, so the comparison is decided without any rounding.
//
// These cases exist because the obvious pipeline (decimal -> fp64 -> format)
// rounds twice. A decimal sitting just off a *format* midpoint collapses onto
// that midpoint as a double, after which ties-to-even picks the even neighbour
// rather than the side the decimal was actually on. encodeString() keeps the
// decimal exact so only one rounding happens.

const { FloatingPoint, Integer, FORMATS, ROUNDING_MODES } = require('../lib/floating-point');

function makeFormat(key) {
    const preset = FORMATS[key];
    return new FloatingPoint(preset.sign, preset.exponent, preset.mantissa, preset);
}

function toBits(encoded) {
    return ((BigInt(encoded.sign) << 63n) |
        (BigInt(encoded.exponent) << 52n) |
        BigInt(encoded.mantissa)).toString(16).padStart(16, '0');
}

describe('Exact decimal strings - fp64 against Gay strtod', () => {
    const fp64 = makeFormat('fp64');

    // [decimal string, expected fp64 bit pattern]
    const VECTORS = [
        // Cases called out in dtoa.c's own comments as needing a second residual.
        ['8.3e26', '4585747ab143e353'],
        ['6.3876e-16', '3cc703856844bdbf'],
        ['0.1', '3fb999999999999a'],
        ['0.3', '3fd3333333333333'],
        ['1e23', '44b52d02c7e14af6'],
        ['9007199254740993', '4340000000000000'],
        // The normal/subnormal boundary (the "PHP strtod hang" family).
        ['2.2250738585072011e-308', '000fffffffffffff'],
        ['2.2250738585072012e-308', '0010000000000000'],
        ['2.2250738585072013e-308', '0010000000000000'],
        ['2.2250738585072014e-308', '0010000000000000'],
        // Extremes: smallest subnormal, largest normal, over/underflow.
        ['4.9e-324', '0000000000000001'],
        ['5e-324', '0000000000000001'],
        ['1e-323', '0000000000000002'],
        ['1e-320', '00000000000007e8'],
        ['2.47032822920623272e-324', '0000000000000000'],
        ['2.4703282292062327e-308', '0011c37937e08000'],
        ['1.7976931348623157e308', '7fefffffffffffff'],
        ['1.7976931348623159e308', '7ff0000000000000'],
        ['1e308', '7fe1ccf385ebc8a0'],
        ['1e309', '7ff0000000000000'],
        ['1e-400', '0000000000000000'],
        ['1e400', '7ff0000000000000'],
        ['0', '0000000000000000'],
        ['-0', '8000000000000000'],
        // Long digit strings: past STRTOD_DIGLIM these take dtoa's bigcomp path.
        ['3.14159265358979323846264338327950288', '400921fb54442d18'],
        ['1234567890123456789012345678901234567890e-40', '3fbf9add3746f65f'],
        ['123456789012345678901234567890', '45f8ee90ff6c373e'],
        ['2.718281828459045235360287471352662497757247093699959574966', '4005bf0a8b145769'],
        ['0.000000000000000000000000000000000000000000001', '3696d601ad376ab9'],
        // 1 + 2^-54 and 1 + 2^-53 written out exactly, then nudged past their
        // last digit: both stay below the 1.0 / 1+2^-52 midpoint.
        ['0.5000000000000000166533453693773481063544750213623046875', '3fe0000000000000'],
        ['1.00000000000000005551115123125782702118158340454101562500000000000000', '3ff0000000000000'],
        ['1.00000000000000005551115123125782702118158340454101562500000000000001', '3ff0000000000000'],
    ];

    test.each(VECTORS)('encodeString(%p) -> %s', (input, expected) => {
        expect(toBits(fp64.encodeString(input))).toBe(expected);
    });
});

describe('Exact decimal strings - fp64 directed rounding', () => {
    const fp64 = makeFormat('fp64');

    // Number() rounds to nearest before encode() ever sees the value, which for
    // fp64 leaves nothing for a directed mode to do. Rounding the string itself
    // is the only way these modes can produce the neighbouring double.
    // [string, tiesToEven, towardNegative, towardPositive, towardZero]
    const VECTORS = [
        ['0.1', '3fb999999999999a', '3fb9999999999999', '3fb999999999999a', '3fb9999999999999'],
        ['0.2', '3fc999999999999a', '3fc9999999999999', '3fc999999999999a', '3fc9999999999999'],
        ['0.3', '3fd3333333333333', '3fd3333333333333', '3fd3333333333334', '3fd3333333333333'],
        ['1.1', '3ff199999999999a', '3ff1999999999999', '3ff199999999999a', '3ff1999999999999'],
        ['3.14159', '400921f9f01b866e', '400921f9f01b866e', '400921f9f01b866f', '400921f9f01b866e'],
        ['2.718281828459045', '4005bf0a8b145769', '4005bf0a8b145768', '4005bf0a8b145769', '4005bf0a8b145768'],
        ['1e-3', '3f50624dd2f1a9fc', '3f50624dd2f1a9fb', '3f50624dd2f1a9fc', '3f50624dd2f1a9fb'],
        ['0.7', '3fe6666666666666', '3fe6666666666666', '3fe6666666666667', '3fe6666666666666'],
        ['123.456', '405edd2f1a9fbe77', '405edd2f1a9fbe76', '405edd2f1a9fbe77', '405edd2f1a9fbe76'],
        ['1e23', '44b52d02c7e14af6', '44b52d02c7e14af6', '44b52d02c7e14af7', '44b52d02c7e14af6'],
        ['6.02214076e23', '44dfe185ca57c517', '44dfe185ca57c517', '44dfe185ca57c518', '44dfe185ca57c517'],
        ['1.5e-10', '3de49da7e361ce4c', '3de49da7e361ce4c', '3de49da7e361ce4d', '3de49da7e361ce4c'],
        ['0.0001', '3f1a36e2eb1c432d', '3f1a36e2eb1c432c', '3f1a36e2eb1c432d', '3f1a36e2eb1c432c'],
    ];

    test.each(VECTORS)('%p rounds correctly in every direction',
        (input, near, down, up, zero) => {
            const bits = (mode) => toBits(fp64.encodeString(input, { roundingMode: mode }));
            expect(bits(ROUNDING_MODES.tiesToEven)).toBe(near);
            expect(bits(ROUNDING_MODES.towardNegative)).toBe(down);
            expect(bits(ROUNDING_MODES.towardPositive)).toBe(up);
            expect(bits(ROUNDING_MODES.towardZero)).toBe(zero);
        });

    test('negated inputs mirror the directed modes', () => {
        const bits = (mode) => toBits(fp64.encodeString('-0.1', { roundingMode: mode }));
        // -0.1 lies between -0x3FB999999999999A and -0x3FB9999999999999.
        expect(bits(ROUNDING_MODES.towardNegative)).toBe('bfb999999999999a');
        expect(bits(ROUNDING_MODES.towardPositive)).toBe('bfb9999999999999');
        expect(bits(ROUNDING_MODES.towardZero)).toBe('bfb9999999999999');
    });
});

describe('Exact decimal strings - narrow formats straddling a midpoint', () => {
    // [format key, decimal string, expected exponent field, expected mantissa field]
    const VECTORS = [
        ['fp16', '0.894069671630859374999999999999999999999e-7', 0, 1],
        ['fp16', '0.298917293548583984374999999999999999999999e-4', 0, 501],
        ['fp16', '0.894963741302490234374999999999999999999999e-4', 1, 477],
        ['fp16', '0.176131725311279296874999999999999999999999e-3', 2, 453],
        ['fp8_e5m2', '0.2288818359374999999999999999999999e-4', 0, 1],
        ['fp8_e5m2', '0.54931640624999999999999999999999e-3', 4, 0],
        ['fp8_e5m2', '0.732421875000000000000000000001e-2', 8, 0],
        ['fp8_e5m2', '0.1015625000000000000000000001e0', 11, 3],
        ['fp8_e5m2', '0.1624999999999999999999999e1', 15, 2],
        ['fp8_e5m2', '0.288000000000000000000001e3', 23, 1],
        ['fp8_e4m3', '0.29296874999999999999999999999e-2', 0, 1],
        ['fp8_e4m3', '0.33203125000000000000000000001e-1', 2, 1],
        ['fp8_e4m3', '0.1328124999999999999999999999e0', 4, 0],
        ['fp8_e4m3', '0.484375000000000000000000001e0', 6, 0],
        ['fp8_e4m3', '0.774999999999999999999999e1', 9, 7],
        ['fp8_e4m3', '0.115999999999999999999999e3', 13, 6],
        ['fp6_e3m2', '0.9374999999999999999999999e-1', 0, 1],
        ['fp6_e3m2', '0.28125000000000000000000001e0', 1, 1],
        ['fp6_e3m2', '0.1124999999999999999999999e1', 3, 0],
        ['fp6_e3m2', '0.14999999999999999999999e2', 6, 3],
        ['fp6_e2m3', '0.1874999999999999999999999e0', 0, 1],
        ['fp6_e2m3', '0.5625000000000000000000001e0', 0, 5],
        ['fp6_e2m3', '0.15624999999999999999999999e1', 1, 4],
        ['fp6_e2m3', '0.574999999999999999999999e1', 3, 3],
        ['fp4_e2m1', '0.74999999999999999999999e0', 0, 1],
        ['fp4_e2m1', '0.75000000000000000000001e0', 1, 0],
        ['fp4_e2m1', '0.125000000000000000000001e1', 1, 1],
        ['fp4_e2m1', '0.24999999999999999999999e1', 2, 0],
        ['fp4_e2m1', '0.35000000000000000000001e1', 3, 0],
        ['fp32', '0.21019476964872256063855943749348741969203929128147736576355999999999999999999999e-44', 0, 1],
        ['fp32', '0.140340041202130429653011517766485100547718233478933054541469999999999999999999999e-41', 0, 1001],
        ['bf16', '0.137753244236986817340086312955731915369374869934229006426806999999999999999999999e-39', 0, 2],
        ['bf16', '0.901824572271473697519765062150191605951507481836085895407494999999999999999999999e-37', 3, 117],
        ['tf32', '0.172191555296233521675107891194664894211718587417786258033508999999999999999999999e-40', 0, 2],
        ['tf32', '0.339217363933580037699962545653489841597085617213038928326011999999999999999999999e-37', 2, 454],
    ];

    test.each(VECTORS)('%s: %p -> exp %i, mantissa %i',
        (key, input, exponent, mantissa) => {
            const encoded = makeFormat(key).encodeString(input);
            expect(encoded.exponent).toBe(exponent);
            expect(encoded.mantissa).toBe(mantissa);
        });

    test('negating a vector negates only the sign bit', () => {
        const fp4 = makeFormat('fp4_e2m1');
        const positive = fp4.encodeString('0.74999999999999999999999e0');
        const negative = fp4.encodeString('-0.74999999999999999999999e0');
        expect(negative.sign).toBe(1);
        expect(negative.exponent).toBe(positive.exponent);
        expect(negative.mantissa).toBe(positive.mantissa);
    });
});

describe('Exact decimal strings - reachable at 17 significant digits', () => {
    // The shortest decimals that reach the double-rounding hole. These are
    // ordinary-length inputs, not contrived 80-digit strings, so the exact path
    // matters for values a user could plausibly paste in.
    const VECTORS = [
        ['fp4_e2m1', '0.74999999999999999', 0.5, 1],
        ['fp6_e2m3', '0.18749999999999999', 0.125, 2],
        ['fp8_e4m3', '0.0029296874999999999', 0.001953125, 2],
        ['fp8_e5m2', '0.000022888183593749999', 0.0000152587890625, 2],
        ['fp16', '0.00000008940696716308593749', 5.960464477539063e-8, 2],
    ];

    test.each(VECTORS)('%s: %p decodes to %p',
        (key, input, expected, digitsNote) => {
            const format = makeFormat(key);
            const encoded = format.encodeString(input);
            expect(format.decode(encoded.sign, encoded.exponent, encoded.mantissa))
                .toBe(expected);
            expect(digitsNote).toBeGreaterThan(0);
        });

    test('the fp64 detour is what makes these wrong', () => {
        const fp4 = makeFormat('fp4_e2m1');
        // Number() collapses the decimal onto the 0.5/1.0 midpoint...
        expect(Number('0.74999999999999999')).toBe(0.75);
        // ...where ties-to-even picks 1.0, the wrong side.
        const viaDouble = fp4.encode(Number('0.74999999999999999'));
        expect(fp4.decode(viaDouble.sign, viaDouble.exponent, viaDouble.mantissa)).toBe(1);
        // The exact path keeps the decimal below the midpoint.
        const exact = fp4.encodeString('0.74999999999999999');
        expect(fp4.decode(exact.sign, exact.exponent, exact.mantissa)).toBe(0.5);
    });
});

describe('encodeString - agreement with the numeric path', () => {
    const KEYS = ['fp64', 'fp32', 'fp16', 'bf16', 'tf32',
        'fp8_e5m2', 'fp8_e4m3', 'fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1'];

    // Deterministic sweep of short decimals. Below 17 significant digits the
    // double detour is provably harmless, so both paths must agree exactly -
    // this guards the exact path against drifting away from encode().
    //
    // fp64 is the exception: there the detour *is* the rounding, so a directed
    // mode applied afterwards can never move the already-nearest double. Only
    // the nearest mode is comparable; the directed cases are pinned by the
    // "fp64 directed rounding" vectors above.
    test.each(KEYS)('%s agrees with encode(Number(s)) on short decimals', (key) => {
        const format = makeFormat(key);
        const modes = key === 'fp64'
            ? [ROUNDING_MODES.tiesToEven]
            : Object.values(ROUNDING_MODES);
        let seed = 0x2545f491;
        const next = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed;
        };

        for (let i = 0; i < 2000; i++) {
            const digits = 1 + (next() % 15);
            const exponent = (next() % 24) - 12;
            let text = String(1 + (next() % 9));
            for (let d = 1; d < digits; d++) text += String(next() % 10);
            const input = `${text[0]}.${text.slice(1)}e${exponent}`;

            for (const mode of modes) {
                const exact = format.encodeString(input, { roundingMode: mode });
                const viaNumber = format.encode(Number(input), { roundingMode: mode });
                expect({ input, mode, ...exact }).toEqual({ input, mode, ...viaNumber });
            }
        }
    });
});

describe('encodeString - non-decimal inputs fall back to the numeric path', () => {
    const fp32 = makeFormat('fp32');

    test.each([
        ['inf', Infinity],
        ['-inf', -Infinity],
        ['Infinity', Infinity],
        ['nan', NaN],
    ])('%p is not treated as a decimal literal', (input) => {
        expect(FloatingPoint.isDecimalLiteral(input)).toBe(false);
    });

    test.each(['', '   ', '.', 'e5', '-', '+', '0x10', '1.2.3', '1e', 'abc'])(
        'rejects %p as a decimal literal', (input) => {
            expect(FloatingPoint.isDecimalLiteral(input)).toBe(false);
        });

    test.each(['0', '-0', '1', '1.', '.5', '-.5', '+1.5', '1e10', '1E-10', '  2.5  '])(
        'accepts %p as a decimal literal', (input) => {
            expect(FloatingPoint.isDecimalLiteral(input)).toBe(true);
        });

    test('non-string input falls back to Number()', () => {
        expect(FloatingPoint.isDecimalLiteral(2.5)).toBe(false);
        expect(fp32.encodeString(2.5)).toEqual(fp32.encode(2.5));
    });

    test('absurd exponents resolve without building huge BigInts', () => {
        // Still a decimal literal: it is merely too extreme to be worth building
        // exactly, so encodeString settles it from the sign and rounding mode.
        expect(FloatingPoint.isDecimalLiteral('1e100000')).toBe(true);
        expect(fp32.encodeString('1e100000').isInfinite).toBe(true);
        expect(fp32.encodeString('1e-100000').isZero).toBe(true);
    });

    test('an all-zero digit string is zero at any exponent', () => {
        // The exponent must not drive a power-of-ten build for a value that is
        // zero regardless of it.
        expect(FloatingPoint.isDecimalLiteral('0e999999999')).toBe(true);
        expect(fp32.encodeString('0e999999999').isZero).toBe(true);
        expect(fp32.encodeString('-0.000e-999999999').sign).toBe(1);
    });

    test('unparseable strings encode as NaN, matching encode(Number(s))', () => {
        expect(fp32.encodeString('abc')).toEqual(fp32.encode(NaN));
    });

    test('signed zero is preserved', () => {
        expect(fp32.encodeString('-0').sign).toBe(1);
        expect(fp32.encodeString('-0').isZero).toBe(true);
        expect(fp32.encodeString('0').sign).toBe(0);
        expect(fp32.encodeString('0.000e5').isZero).toBe(true);
    });

    test('unsigned formats clamp negative decimals to zero', () => {
        const unsigned = new FloatingPoint(0, 5, 10);
        expect(unsigned.encodeString('-1.5')).toEqual(unsigned.getZero(false));
    });
});

describe('encodeString - long fractions are precision, not magnitude', () => {
    // The guard on how far a decimal may sit from 1 must not be driven by how
    // many digits it was written with: 0.749...9 is an ordinary number however
    // long its fraction, and still has to take the exact path.
    const fp4 = makeFormat('fp4_e2m1');

    // Strictly below the fp4 0.5/1.0 midpoint, so tiesToEven must give 0.5.
    const justBelowMidpoint = (fracDigits) => '0.74' + '9'.repeat(fracDigits - 2);

    test.each([50, 5000, 20000, 20001, 50000])(
        '%i fraction digits still round to the correct neighbour', (fracDigits) => {
            const input = justBelowMidpoint(fracDigits);
            expect(FloatingPoint.isDecimalLiteral(input)).toBe(true);
            const encoded = fp4.encodeString(input);
            expect(fp4.decode(encoded.sign, encoded.exponent, encoded.mantissa)).toBe(0.5);
        });

    test('the fp64 detour is what these would fall back to', () => {
        const input = justBelowMidpoint(20001);
        expect(Number(input)).toBe(0.75);
        const viaDouble = fp4.encode(Number(input));
        expect(fp4.decode(viaDouble.sign, viaDouble.exponent, viaDouble.mantissa)).toBe(1);
    });

    test('pathologically long input still falls back rather than hanging', () => {
        // The remaining cap is a cost guard, deliberately far above any real input.
        expect(FloatingPoint.isDecimalLiteral('0.' + '9'.repeat(100001))).toBe(false);
    });
});

describe('encodeString - magnitudes past the exact-path limit', () => {
    // Past the limit the digits can no longer change the answer, but the sign
    // and the rounding mode still can. Deferring to Number() would lose that:
    // it reports a bare Infinity/0, which then ignores the directed modes.
    // Every case below is pinned against the in-bounds decimal that reaches the
    // same overflow/underflow through the exact path.
    const fp16 = makeFormat('fp16');
    const dec = (format, encoded) =>
        format.decode(encoded.sign, encoded.exponent, encoded.mantissa);

    test('towardZero saturates instead of reaching infinity', () => {
        const mode = { roundingMode: ROUNDING_MODES.towardZero };
        expect(dec(fp16, fp16.encodeString('1e6', mode))).toBe(65504);
        expect(dec(fp16, fp16.encodeString('1e30000', mode))).toBe(65504);
        expect(dec(fp16, fp16.encodeString('-1e30000', mode))).toBe(-65504);
    });

    test('the nearest modes still overflow to infinity', () => {
        expect(fp16.encodeString('1e30000').isInfinite).toBe(true);
        const negative = fp16.encodeString('-1e30000');
        expect(negative.isInfinite).toBe(true);
        expect(negative.sign).toBe(1);
    });

    test('formats without infinity saturate to max normal', () => {
        const e4m3 = makeFormat('fp8_e4m3');
        expect(dec(e4m3, e4m3.encodeString('1e30000'))).toBe(448);
    });

    test('a mode pointing away from zero cannot flush a tiny value to zero', () => {
        const up = { roundingMode: ROUNDING_MODES.towardPositive };
        expect(dec(fp16, fp16.encodeString('1e-30000', up)))
            .toBe(dec(fp16, fp16.encodeString('1e-30', up)));
        expect(fp16.encodeString('1e-30000', up).mantissa).toBe(1);

        const down = fp16.encodeString('-1e-30000', { roundingMode: ROUNDING_MODES.towardNegative });
        expect(down.sign).toBe(1);
        expect(down.mantissa).toBe(1);
    });

    test('the other modes round a tiny value to a correctly signed zero', () => {
        expect(fp16.encodeString('1e-30000').isZero).toBe(true);
        const negative = fp16.encodeString('-1e-30000', { roundingMode: ROUNDING_MODES.towardPositive });
        expect(negative.isZero).toBe(true);
        expect(negative.sign).toBe(1);
    });

    test('fixed-point formats saturate and round the same way', () => {
        const fixed = new FloatingPoint(1, 0, 8);
        expect(fixed.encodeString('1e30000').mantissa).toBe(255);
        expect(fixed.encodeString('1e-30000').mantissa).toBe(0);
        expect(fixed.encodeString('1e-30000', { roundingMode: ROUNDING_MODES.towardPositive }).mantissa)
            .toBe(1);
    });

    test('integers saturate and honour the directed modes too', () => {
        const int32 = new Integer(32, true);
        expect(int32.encodeString('1e30000').intValue).toBe(2147483647);
        expect(int32.encodeString('-1e30000').intValue).toBe(-2147483648);
        expect(int32.encodeString('1e-30000').intValue).toBe(0);
        expect(int32.encodeString('1e-30000',
            { roundingMode: ROUNDING_MODES.towardPositive }).intValue).toBe(1);
        expect(int32.encodeString('-1e-30000',
            { roundingMode: ROUNDING_MODES.towardNegative }).intValue).toBe(-1);
    });

    test('unsigned formats still clamp negatives to zero', () => {
        const unsigned = new FloatingPoint(0, 5, 10);
        expect(unsigned.encodeString('-1e30000')).toEqual(unsigned.getZero(false));
    });
});

describe('encodeString - overflow, underflow and saturation', () => {
    test('overflow honours the rounding mode', () => {
        const fp16 = makeFormat('fp16');
        expect(fp16.encodeString('1e6').isInfinite).toBe(true);
        // towardZero must saturate to max normal instead of reaching infinity.
        const clamped = fp16.encodeString('1e6', { roundingMode: ROUNDING_MODES.towardZero });
        expect(clamped.isInfinite).toBe(false);
        expect(fp16.decode(clamped.sign, clamped.exponent, clamped.mantissa)).toBe(65504);
    });

    test('formats without infinity saturate to max normal', () => {
        const e4m3 = makeFormat('fp8_e4m3');
        const encoded = e4m3.encodeString('1e9');
        expect(encoded.isInfinite).toBe(false);
        expect(e4m3.decode(encoded.sign, encoded.exponent, encoded.mantissa)).toBe(448);
    });

    test('rounding up out of the subnormal range yields the smallest normal', () => {
        const fp16 = makeFormat('fp16');
        // Just under the smallest normal (2^-14), but close enough to round up.
        const encoded = fp16.encodeString('0.000061034999999999999');
        expect(encoded.exponent).toBe(1);
        expect(encoded.mantissa).toBe(0);
    });

    test('values below half the smallest subnormal round to zero', () => {
        const fp16 = makeFormat('fp16');
        expect(fp16.encodeString('1e-30').isZero).toBe(true);
        // towardPositive must not flush a tiny positive to zero.
        const up = fp16.encodeString('1e-30', { roundingMode: ROUNDING_MODES.towardPositive });
        expect(up.isZero).toBe(false);
        expect(up.mantissa).toBe(1);
    });

    test('unknown rounding modes are rejected', () => {
        // Needs a value that actually requires rounding - an exactly
        // representable one short-circuits before the mode is consulted.
        expect(() => makeFormat('fp32').encodeString('0.1', { roundingMode: 'nope' }))
            .toThrow(/Unknown rounding mode/);
    });
});

describe('encodeString - fixed-point formats', () => {
    // exponentBits === 0 is the scaled-integer path, which rounds the decimal
    // directly by 2^mantissaBits.
    const fixed = new FloatingPoint(1, 0, 8);

    test('rounds the exact decimal, not the intermediate double', () => {
        // 0.501953125 is the midpoint between 128/256 and 129/256.
        expect(fixed.encodeString('0.5019531249999999999').mantissa).toBe(128);
        expect(fixed.encodeString('0.5019531250000000001').mantissa).toBe(129);
        expect(fixed.encodeString('0.501953125').mantissa).toBe(128);
    });

    test('saturates above the representable range', () => {
        expect(fixed.encodeString('5').mantissa).toBe(255);
    });

    test('zero-mantissa fixed-point formats encode zero', () => {
        const empty = new FloatingPoint(1, 0, 0);
        expect(empty.encodeString('0.75').mantissa).toBe(0);
    });
});

describe('Integer.encodeString', () => {
    const int32 = new Integer(32, true);
    const uint8 = new Integer(8, false);

    test('rounds the exact decimal at a tie', () => {
        // Number('2.5000000000000001') === 2.5, so the numeric path ties to even
        // and yields 2; the exact decimal is above the tie and must give 3.
        expect(Number('2.5000000000000001')).toBe(2.5);
        expect(int32.encodeString('2.5000000000000001').intValue).toBe(3);
        expect(int32.encodeString('2.5').intValue).toBe(2);
        expect(int32.encodeString('3.5').intValue).toBe(4);
    });

    test('handles negative values symmetrically', () => {
        expect(int32.encodeString('-2.5000000000000001').intValue).toBe(-3);
        expect(int32.encodeString('-2.5').intValue).toBe(-2);
    });

    test.each([
        ['1.9999999999999999', ROUNDING_MODES.towardZero, 1],
        ['1.0000000000000001', ROUNDING_MODES.towardPositive, 2],
        ['-1.0000000000000001', ROUNDING_MODES.towardNegative, -2],
        ['2.5', ROUNDING_MODES.tiesToAway, 3],
        ['-2.5', ROUNDING_MODES.tiesToAway, -3],
    ])('%p under %s -> %i', (input, mode, expected) => {
        expect(int32.encodeString(input, { roundingMode: mode }).intValue).toBe(expected);
    });

    test('saturates to the format range', () => {
        expect(int32.encodeString('1e99').intValue).toBe(2147483647);
        expect(int32.encodeString('-1e99').intValue).toBe(-2147483648);
        expect(uint8.encodeString('999').intValue).toBe(255);
        expect(uint8.encodeString('-5').intValue).toBe(0);
    });

    test('falls back to the numeric path for keywords', () => {
        expect(int32.encodeString('nan').intValue).toBe(0);
        expect(int32.encodeString('Infinity').intValue).toBe(2147483647);
    });
});
