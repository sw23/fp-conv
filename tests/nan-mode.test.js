// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * NaN input modes.
 *
 * Two modes, `canonical` and `preserve`, for what a NaN ENCODING becomes when
 * convertEncoded() carries it into another format:
 *
 *   - `canonical` is the format's canonical quiet NaN, getNaN(), whatever went
 *     in. This is Arm's Default NaN (FPCR.DN=1), and it is what every
 *     conversion produced before the modes existed, so it is the default.
 *   - `preserve` is IEEE 754-2019 §6.2.3 propagation, as x86 CVTSS2SD /
 *     CVTSD2SS (Intel SDM Vol. 1 §4.8.3.5, Table 4-7) and AArch64 FCVT with
 *     FPCR.DN=0 do it: keep the sign, keep the high-order payload bits that
 *     fit, and always quiet the result.
 *
 * The compatibility commitment is pinned here: canonical is getNaN() for every
 * preset pair, and omitting the option is canonical.
 */

const {
    FloatingPoint, Integer, FORMATS, NAN_MODES, DEFAULT_NAN_MODE,
    convertEncoded, conversionLoss, sameEncoding,
} = require('../lib/floating-point.js');

// A preset key, or a custom layout spelled sXeYmZ (IEEE-style, the defaults).
function format(key) {
    const layout = /^s([01])e(\d+)m(\d+)$/.exec(key);
    if (layout) return new FloatingPoint(Number(layout[1]), Number(layout[2]), Number(layout[3]));
    const preset = FORMATS[key];
    return preset.isInteger
        ? new Integer(preset.bits, preset.signed, preset)
        : FloatingPoint.fromFormat(key);
}

const hexOf = (fmt, e) => fmt.toHexString(e.sign, e.exponent, e.mantissa);

// Convert a hex pattern through one or more formats, the same mode each step.
function convertHex(path, hex, nanMode) {
    let from = format(path[0]);
    let encoded = from.fromHexString(hex);
    for (const key of path.slice(1)) {
        const to = format(key);
        encoded = convertEncoded(from, encoded, to, nanMode === undefined ? {} : { nanMode });
        from = to;
    }
    return hexOf(from, encoded);
}

const FLOAT_PRESETS = Object.keys(FORMATS).filter(key => !FORMATS[key].isInteger);
const NAN_PRESETS = FLOAT_PRESETS.filter(key => format(key).hasNaN);

// A few NaN encodings of a format: the canonical one, its negation where there
// is a sign bit, and for an IEEE-style layout the extremes of the payload - a
// signalling NaN with only the lowest bit set, and all ones.
function nanEncodingsOf(fmt) {
    const canonical = fmt.getNaN();
    const encodings = [canonical];
    if (fmt.signBits) encodings.push({ ...canonical, sign: 1 });
    if (fmt.hasInfinity) {
        encodings.push({ sign: 0, exponent: fmt.maxExponent, mantissa: fmt.normalizeMantissa(1) });
        encodings.push({ sign: fmt.signBits, exponent: fmt.maxExponent, mantissa: fmt.maxMantissa });
    }
    for (const encoded of encodings) {
        expect(fmt.classify(encoded.sign, encoded.exponent, encoded.mantissa)).toBe('NaN');
    }
    return encodings;
}

describe('NAN_MODES', () => {
    test('exposes exactly the two modes and is frozen', () => {
        expect(Object.keys(NAN_MODES).sort()).toEqual(['canonical', 'preserve']);
        expect(Object.values(NAN_MODES).sort()).toEqual(['canonical', 'preserve']);
        expect(Object.isFrozen(NAN_MODES)).toBe(true);
    });

    test('the default is canonical, the behavior before the modes existed', () => {
        expect(DEFAULT_NAN_MODE).toBe('canonical');
        expect(DEFAULT_NAN_MODE).toBe(NAN_MODES.canonical);
    });
});

// Hand-computed, and the same vectors docs/nan-behavior.md shows.
// [path, input hex, canonical, preserve, why]
const VECTORS = [
    [['fp32', 'fp16'], '0xFFC00000', '0x7E00', '0xFE00', 'the sign survives'],
    [['fp32', 'fp16'], '0x7FC12345', '0x7E00', '0x7E09', 'the top 10 field bits survive'],
    [['fp32', 'fp16'], '0x7F800001', '0x7E00', '0x7E00', 'sNaN, payload below fp16: quiet NaN, not 0x7C00 (Infinity)'],
    [['fp32', 'fp64'], '0x7F800001', '0x7FF8000000000000', '0x7FF8000020000000', 'sNaN widened: payload kept, quieted'],
    [['fp16', 'fp32'], '0x7E01', '0x7FC00000', '0x7FC02000', 'left-aligned into the wider field'],
    [['fp16', 'fp32', 'fp16'], '0xFE01', '0x7E00', '0xFE01', 'widen then narrow is the identity on a quiet NaN'],
    [['fp32', 'fp8_e4m3'], '0xFFC00000', '0x7F', '0xFF', 'E4M3 has two NaNs: the sign is all it can keep'],
    [['fp32', 'e8m0'], '0xFFC00000', '0xFF', '0xFF', 'E8M0 has one NaN and no sign bit'],
    [['fp8_e4m3', 'fp32'], '0xFF', '0x7FC00000', '0xFFF00000', 'E4M3 all-ones mantissa, left-aligned'],
    [['e8m0', 'fp32'], '0xFF', '0x7FC00000', '0x7FC00000', 'an empty source field contributes nothing'],
    [['fp32', 'fp4_e2m1'], '0xFFC00001', '0x7', '0x7', 'no NaN in FP4: +max (6) under both'],
    [['fp32', 'int8'], '0xFFC00001', '0x00', '0x00', 'no NaN in INT8: 0 under both'],
    [['fp32', 's0e8m23'], '0xFFC00001', '0x7FC00000', '0x7FC00001', 'an unsigned target drops the sign'],
    [['bf16', 's1e15m112', 'bf16'], '0xFFC1', '0x7FC0', '0xFFC1', 'through a 112-bit BigInt field and back'],
    // Not in the doc: the narrowest IEEE-style payload, and OCP's other preset.
    [['fp32', 'fp8_e5m2'], '0x7F800001', '0x7E', '0x7E', 'sNaN into E5M2: quiet NaN, not 0x7C (Infinity)'],
    [['fp32', 'fp8_e5m2'], '0xFFE00000', '0x7E', '0xFF', 'E5M2 keeps the sign and one payload bit'],
    [['fp32', 'fp8_e5m2'], '0x7FDFFFFF', '0x7E', '0x7E', 'the payload bit E5M2 keeps is the second-highest'],
];

describe('the vectors', () => {
    for (const [path, input, canonical, preserve, why] of VECTORS) {
        const label = `${path.join(' -> ')} ${input}`;

        test(`${label}: canonical ${canonical}`, () => {
            expect(convertHex(path, input, 'canonical')).toBe(canonical);
        });

        test(`${label}: preserve ${preserve} (${why})`, () => {
            expect(convertHex(path, input, 'preserve')).toBe(preserve);
        });

        test(`${label}: omitting the option is canonical`, () => {
            expect(convertHex(path, input)).toBe(canonical);
        });
    }
});

describe('canonical is getNaN() (compatibility pin)', () => {
    // Every float preset with a NaN, into every float preset with a NaN, from
    // several NaN encodings each: the payload never reaches the output.
    for (const sourceKey of NAN_PRESETS) {
        for (const targetKey of NAN_PRESETS) {
            test(`${sourceKey} -> ${targetKey}`, () => {
                const source = format(sourceKey);
                const target = format(targetKey);
                const expected = target.getNaN();
                for (const encoded of nanEncodingsOf(source)) {
                    for (const options of [{}, { nanMode: 'canonical' }]) {
                        const out = convertEncoded(source, encoded, target, options);
                        expect(sameEncoding(target, out, expected)).toBe(true);
                        expect(out.isNaN).toBe(true);
                    }
                }
            });
        }
    }
});

describe('preserve', () => {
    test('always produces a quiet NaN, never an Infinity, for every preset pair', () => {
        for (const sourceKey of NAN_PRESETS) {
            for (const targetKey of NAN_PRESETS) {
                const source = format(sourceKey);
                const target = format(targetKey);
                for (const encoded of nanEncodingsOf(source)) {
                    const out = convertEncoded(source, encoded, target, { nanMode: 'preserve' });
                    expect([sourceKey, targetKey, out.isNaN]).toEqual([sourceKey, targetKey, true]);
                    if (target.hasInfinity) {
                        // The quiet bit, the mantissa MSB, is set.
                        expect(out.mantissa >= target.getNaN().mantissa).toBe(true);
                    } else {
                        // OCP-style: the only NaN is the all-ones mantissa.
                        expect(out.mantissa).toBe(target.maxMantissa);
                    }
                }
            }
        }
    });

    test('keeps the sign wherever the target has a sign bit', () => {
        for (const sourceKey of NAN_PRESETS) {
            for (const targetKey of NAN_PRESETS) {
                const source = format(sourceKey);
                const target = format(targetKey);
                if (!source.signBits) continue;
                const negative = { ...source.getNaN(), sign: 1 };
                const out = convertEncoded(source, negative, target, { nanMode: 'preserve' });
                expect([sourceKey, targetKey, out.sign])
                    .toEqual([sourceKey, targetKey, target.signBits ? 1 : 0]);
            }
        }
    });

    test('a source with no sign bit contributes a positive NaN', () => {
        const unsigned = format('s0e8m23');
        const nan = unsigned.fromHexString('0x7FC00001');
        expect(hexOf(format('fp32'),
            convertEncoded(unsigned, nan, format('fp32'), { nanMode: 'preserve' })))
            .toBe('0x7FC00001');
        expect(convertHex(['e8m0', 'fp8_e4m3'], '0xFF', 'preserve')).toBe('0x7F');
    });

    test('a quiet NaN survives widening then narrowing between IEEE-style presets', () => {
        // IEEE 754-2019 §6.2.3: the narrow format's payload fits the wide one,
        // so the round trip is the identity on a quiet NaN of the narrow format.
        const ieee = NAN_PRESETS.filter(key => format(key).hasInfinity);
        for (const narrowKey of ieee) {
            for (const wideKey of ieee) {
                const narrow = format(narrowKey);
                const wide = format(wideKey);
                if (wide.mantissaBits < narrow.mantissaBits) continue;
                for (const encoded of nanEncodingsOf(narrow)) {
                    // Quiet it first: a signalling NaN comes back quieted, which
                    // is the next test's business.
                    const quiet = { ...encoded,
                        mantissa: narrow.normalizeMantissa(
                            BigInt(encoded.mantissa) | BigInt(narrow.getNaN().mantissa)) };
                    const there = convertEncoded(narrow, quiet, wide, { nanMode: 'preserve' });
                    const back = convertEncoded(wide, there, narrow, { nanMode: 'preserve' });
                    expect([narrowKey, wideKey, hexOf(narrow, back)])
                        .toEqual([narrowKey, wideKey, hexOf(narrow, quiet)]);
                }
            }
        }
    });

    test('a signalling NaN comes back from a round trip quieted, payload intact', () => {
        // fp16 0x7C01: sNaN with payload 1. The quiet bit is forced on the way
        // out, so it returns as 0x7E01, not as itself.
        expect(convertHex(['fp16', 'fp32', 'fp16'], '0x7C01', 'preserve')).toBe('0x7E01');
        expect(convertHex(['fp16', 'fp16'], '0x7C01', 'preserve')).toBe('0x7E01');
    });

    test('an identity conversion of a quiet NaN is the identity', () => {
        for (const key of NAN_PRESETS) {
            const fmt = format(key);
            for (const encoded of nanEncodingsOf(fmt)) {
                const quiet = fmt.hasInfinity
                    ? { ...encoded, mantissa: fmt.normalizeMantissa(
                        BigInt(encoded.mantissa) | BigInt(fmt.getNaN().mantissa)) }
                    : encoded;
                const out = convertEncoded(fmt, quiet, fmt, { nanMode: 'preserve' });
                expect(sameEncoding(fmt, out, quiet)).toBe(true);
            }
        }
    });

    test('narrowing keeps the HIGH-order payload bits', () => {
        // fp64 payload 0x7_FFFF_FFFF_FFFF below the quiet bit, then only its
        // top bit: fp32 keeps 22 high bits either way.
        expect(convertHex(['fp64', 'fp32'], '0x7FFFFFFFFFFFFFFF', 'preserve')).toBe('0x7FFFFFFF');
        expect(convertHex(['fp64', 'fp32'], '0x7FF4000000000000', 'preserve')).toBe('0x7FE00000');
        // ...and a payload entirely below fp32's precision is dropped.
        expect(convertHex(['fp64', 'fp32'], '0x7FF800001FFFFFFF', 'preserve')).toBe('0x7FC00000');
    });

    describe('wide fields stay exact', () => {
        test('fp64 into a 112-bit field is a BigInt, shifted exactly', () => {
            const fp64 = format('fp64');
            const wide = format('s1e15m112');
            const nan = fp64.fromHexString('0xFFF0000000000001');
            const out = convertEncoded(fp64, nan, wide, { nanMode: 'preserve' });
            expect(typeof out.mantissa).toBe('bigint');
            expect(out.mantissa).toBe((1n << 111n) | (1n << 60n));
            expect(out.sign).toBe(1);
        });

        test('a 112-bit field narrowed into fp64 comes back as a number', () => {
            const wide = format('s1e15m112');
            const fp64 = format('fp64');
            const nan = { sign: 0, exponent: wide.maxExponent, mantissa: (1n << 112n) - 1n };
            const out = convertEncoded(wide, nan, fp64, { nanMode: 'preserve' });
            expect(typeof out.mantissa).toBe('number');
            expect(hexOf(fp64, out)).toBe('0x7FFFFFFFFFFFFFFF');
        });

        test('a number mantissa on a wide source is read exactly too', () => {
            const wide = format('s1e15m112');
            const fp32 = format('fp32');
            const nan = { sign: 0, exponent: wide.maxExponent, mantissa: 1 };
            expect(hexOf(fp32, convertEncoded(wide, nan, fp32, { nanMode: 'preserve' })))
                .toBe('0x7FC00000');
        });
    });

    test('a one-bit IEEE-style mantissa keeps the sign and nothing else', () => {
        const tiny = format('s1e5m1');
        const out = convertEncoded(format('fp32'), format('fp32').fromHexString('0xFFBFFFFF'),
            tiny, { nanMode: 'preserve' });
        expect(hexOf(tiny, out)).toBe('0x7F');
        expect(out.isNaN).toBe(true);
    });
});

describe('inert cases: both modes agree', () => {
    const INERT = [
        ['fp6_e3m2', format('fp6_e3m2')],
        ['fp6_e2m3', format('fp6_e2m3')],
        ['fp4_e2m1', format('fp4_e2m1')],
        ['mxint8', format('mxint8')],
        ['int8', format('int8')],
        ['uint32', format('uint32')],
        ['int64', new Integer(64, true)],
        ['fixed-point s1e0m7', new FloatingPoint(1, 0, 7)],
        // An Infinity and no mantissa field: no pattern is left for NaN.
        ['s1e5m0 with Infinity', new FloatingPoint(1, 5, 0)],
        // Its maximum is the zero pattern, so NaN lands on zero.
        ['s1e1m0 with Infinity', new FloatingPoint(1, 1, 0)],
    ];

    for (const [label, target] of INERT) {
        test(`${label}`, () => {
            expect(target.nanTarget()).not.toBe('nan');
            for (const sourceKey of NAN_PRESETS) {
                const source = format(sourceKey);
                for (const encoded of nanEncodingsOf(source)) {
                    const canonical = convertEncoded(source, encoded, target, { nanMode: 'canonical' });
                    const preserve = convertEncoded(source, encoded, target, { nanMode: 'preserve' });
                    expect(sameEncoding(target, preserve, canonical)).toBe(true);
                    expect(sameEncoding(target, preserve, target.encode(NaN))).toBe(true);
                    // The precision-loss row still says the NaN did not survive.
                    expect(conversionLoss(source, encoded, target, preserve).kind)
                        .toBe('nanSubstituted');
                }
            }
        });
    }

    test('a non-NaN input converts the same under both modes', () => {
        const inputs = ['1', '-1.5', '0', '-0', 'inf', '-inf', '1e40', '1e-50', '65519'];
        for (const sourceKey of ['fp64', 'fp32']) {
            for (const targetKey of FLOAT_PRESETS.concat(['int8', 'uint8'])) {
                const source = format(sourceKey);
                const target = format(targetKey);
                for (const input of inputs) {
                    const encoded = source.encode(input);
                    const canonical = convertEncoded(source, encoded, target, { nanMode: 'canonical' });
                    const preserve = convertEncoded(source, encoded, target, { nanMode: 'preserve' });
                    expect([targetKey, input, hexOf(target, preserve)])
                        .toEqual([targetKey, input, hexOf(target, canonical)]);
                }
            }
        }
    });

    test('an integer source has no NaN, so the mode never applies', () => {
        const int8 = format('int8');
        for (const value of [127, -128, 0]) {
            const encoded = int8.encode(value);
            expect(hexOf(format('fp16'),
                convertEncoded(int8, encoded, format('fp16'), { nanMode: 'preserve' })))
                .toBe(hexOf(format('fp16'), convertEncoded(int8, encoded, format('fp16'))));
        }
    });
});

describe('encode() has no payload to preserve', () => {
    // A JavaScript NaN, and a typed "nan" or "-nan", carry no bits, so encode()
    // does not take nanMode and the canonical NaN is the only answer.
    test('NaN and the NaN keywords encode canonically whatever nanMode says', () => {
        for (const key of NAN_PRESETS) {
            const fmt = format(key);
            for (const input of [NaN, 'nan', '-nan', '+nan', 'NaN']) {
                const out = fmt.encode(input, { nanMode: 'preserve' });
                expect(sameEncoding(fmt, out, fmt.getNaN())).toBe(true);
            }
        }
    });
});

describe('the reported loss', () => {
    test('NaN -> NaN is exact under preserve, payload truncation included', () => {
        // IEEE 754 does not signal the loss of payload bits, and a NaN has no
        // value for a difference to be measured on.
        const fp32 = format('fp32');
        const fp16 = format('fp16');
        const nan = fp32.fromHexString('0x7FC12345');
        const options = { nanMode: 'preserve' };
        const out = convertEncoded(fp32, nan, fp16, options);
        expect(hexOf(fp16, out)).toBe('0x7E09');
        expect(conversionLoss(fp32, nan, fp16, out, options))
            .toEqual({ kind: 'exact', absolute: 0, relativePercent: 0 });
    });

    test('so is a sign dropped by an unsigned target, and an sNaN quieted', () => {
        const fp32 = format('fp32');
        for (const [hex, targetKey] of [['0xFFC00001', 's0e8m23'], ['0x7F800001', 'fp16'],
            ['0xFFC00000', 'e8m0'], ['0xFFC00000', 'fp8_e4m3']]) {
            const target = format(targetKey);
            const nan = fp32.fromHexString(hex);
            const out = convertEncoded(fp32, nan, target, { nanMode: 'preserve' });
            expect(conversionLoss(fp32, nan, target, out).kind).toBe('exact');
        }
    });
});

describe('validation', () => {
    const MESSAGE = 'Unknown NaN mode: "bogus". Valid modes: canonical, preserve.';
    const fp32 = format('fp32');
    const fp16 = format('fp16');

    test('convertEncoded rejects an unknown mode for a NaN input', () => {
        expect(() => convertEncoded(fp32, fp32.getNaN(), fp16, { nanMode: 'bogus' }))
            .toThrow(MESSAGE);
    });

    test('convertEncoded rejects an unknown mode for a non-NaN input', () => {
        // Validation must not depend on the input reaching the NaN path.
        for (const input of ['1', '0', 'inf', '1e40']) {
            expect(() => convertEncoded(fp32, fp32.encode(input), fp16, { nanMode: 'bogus' }))
                .toThrow(MESSAGE);
        }
    });

    test('and whatever the formats on either side', () => {
        const int8 = format('int8');
        expect(() => convertEncoded(int8, int8.encode(1), fp16, { nanMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => convertEncoded(fp32, fp32.getNaN(), int8, { nanMode: 'bogus' })).toThrow(MESSAGE);
        expect(() => convertEncoded(fp32, fp32.getNaN(), format('fp4_e2m1'), { nanMode: 'bogus' }))
            .toThrow(MESSAGE);
    });

    test('the case matters, as for the other modes', () => {
        expect(() => convertEncoded(fp32, fp32.getNaN(), fp16, { nanMode: 'Preserve' }))
            .toThrow('Unknown NaN mode: "Preserve"');
    });

    test('preserve still validates the rounding and overflow modes', () => {
        // The preserved NaN never rounds or overflows, but a bogus mode must be
        // refused for a NaN input exactly as it is under canonical.
        for (const nanMode of ['canonical', 'preserve']) {
            for (const target of [fp16, format('fp4_e2m1'), format('int8')]) {
                expect(() => convertEncoded(fp32, fp32.getNaN(), target,
                    { nanMode, roundingMode: 'bogus' })).toThrow('Unknown rounding mode');
                expect(() => convertEncoded(fp32, fp32.getNaN(), target,
                    { nanMode, overflowMode: 'bogus' })).toThrow('Unknown overflow mode');
            }
        }
    });
});
