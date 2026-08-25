// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/**
 * Property tests over the FORMAT-PARAMETER space.
 *
 * The rest of the suite (and every external oracle) sweeps *values* through the
 * 18 layouts in FORMATS. But the library accepts a far larger space than that:
 * signBits 0-1, exponentBits 0-15, mantissaBits 0-112, and an unbounded custom
 * bias, all reachable from the UI, the URL parser and the WebMCP custom-format
 * spec. Three real rounding bugs lived in that gap while the file sat at 100%
 * line coverage, because the layouts were constructed but only ever probed with
 * values that were already correct (powers of two, or zero).
 *
 * The oracle here is differential and costs nothing to run:
 *
 *     for an exactly-representable double v, any layout, any rounding mode,
 *     encode(v) must equal encodeString(exactDecimalOf(v))
 *
 * The decimal is exact, so there is nothing extra to round and the two paths
 * must agree. They reach the answer by completely different routes - binary
 * doubles with Math.log2, versus BigInt rationals - so a bug would have to be
 * duplicated in both to hide.
 */

const { FloatingPoint, ROUNDING_MODES } = require('../lib/floating-point.js');

const MODES = Object.values(ROUNDING_MODES);

// Exact decimal string for a finite double. No precision is lost, so the result
// is a decimal the format must round identically to the double itself.
function exactDecimal(value) {
    if (value === 0) return Object.is(value, -0) ? '-0' : '0';
    const negative = value < 0;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, Math.abs(value));
    const bits = (BigInt(view.getUint32(0)) << 32n) | BigInt(view.getUint32(4));
    const biased = Number((bits >> 52n) & 0x7ffn);
    const frac = bits & 0xfffffffffffffn;
    const num = biased === 0 ? frac : frac | (1n << 52n);
    const exp = biased === 0 ? -1074 : biased - 1075;

    let digits;
    if (exp >= 0) {
        digits = (num << BigInt(exp)).toString();
    } else {
        const places = -exp;
        const scaled = (num * 5n ** BigInt(places)).toString().padStart(places + 1, '0');
        digits = scaled.slice(0, scaled.length - places) + '.' + scaled.slice(scaled.length - places);
    }
    return (negative ? '-' : '') + digits;
}

// Dyadic probes: m * 2^e, so exactDecimal() stays short and the sweep stays fast.
// Odd multipliers are the point - they are the values that sit strictly between
// two representable numbers in a narrow format, which is where rounding shows.
function probeValues() {
    const values = [0, -0];
    for (const exp of [-30, -14, -8, -4, -2, -1, 0, 1, 2, 4, 8, 14, 30]) {
        for (const mult of [1, 3, 5, 7, 11, 13, 21, 127]) {
            const v = mult * Math.pow(2, exp);
            values.push(v, -v);
        }
    }
    // Fractions that are not dyadic at all, plus the extremes of the double range.
    values.push(0.1, -0.1, 1 / 3, 2 / 3, 3.14159265358979, 1e-300, 1e300, -1e300,
        Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE);
    return values;
}

const VALUES = probeValues();

// A deliberate spread of layouts, including the degenerate ones the presets
// never reach: no mantissa at all, no sign bit, and a bias of zero (which makes
// the subnormal scaling divide rather than multiply).
function layouts() {
    const out = [];
    for (const signBits of [0, 1]) {
        for (const exponentBits of [1, 2, 3, 4, 5, 8, 11]) {
            for (const mantissaBits of [0, 1, 2, 3, 7, 10, 23]) {
                for (const special of [
                    { hasInfinity: true, hasNaN: true },
                    { hasInfinity: false, hasNaN: true },
                    { hasInfinity: false, hasNaN: false },
                ]) {
                    for (const bias of [undefined, 0]) {
                        const options = { ...special };
                        if (bias !== undefined) options.bias = bias;
                        out.push({
                            name: `s${signBits}e${exponentBits}m${mantissaBits}` +
                                `${special.hasInfinity ? '' : ' noInf'}` +
                                `${special.hasNaN ? '' : ' noNaN'}` +
                                `${bias === undefined ? '' : ' bias0'}`,
                            format: new FloatingPoint(signBits, exponentBits, mantissaBits, options),
                        });
                    }
                }
            }
        }
    }
    return out;
}

const LAYOUTS = layouts();

const bits = (encoded) => `${encoded.sign}/${encoded.exponent}/${encoded.mantissa}`;

describe('format-space property: encode() agrees with encodeString()', () => {
    test(`${LAYOUTS.length} layouts x ${MODES.length} modes x ${VALUES.length} values`, () => {
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            for (const mode of MODES) {
                for (const value of VALUES) {
                    const decimal = exactDecimal(value);
                    const viaNumber = bits(format.encode(value, { roundingMode: mode }));
                    const viaString = bits(format.encodeString(decimal, { roundingMode: mode }));
                    if (viaNumber !== viaString && failures.length < 20) {
                        failures.push(`${name} ${mode} ${value}: ` +
                            `encode=${viaNumber} encodeString=${viaString}`);
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('format-space property: special encodings are distinct', () => {
    // getNaN(), getInfinity() and getMaxNormal() must never hand back the same
    // bit pattern. A collision means one of the three silently decodes as
    // another - e.g. encode(NaN) returning a pattern that decodes to Infinity.
    test('NaN, Infinity and max normal never share a bit pattern', () => {
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            const patterns = new Map();
            const record = (label, get) => {
                let encoded;
                try {
                    encoded = get();
                } catch {
                    return; // format legitimately cannot represent it
                }
                const key = bits(encoded);
                if (patterns.has(key)) {
                    failures.push(`${name}: ${label} collides with ${patterns.get(key)} at ${key}`);
                } else {
                    patterns.set(key, label);
                }
            };
            record('NaN', () => format.getNaN());
            record('Infinity', () => format.getInfinity());
            record('maxNormal', () => format.getMaxNormal());
        }
        expect(failures).toEqual([]);
    });

    // Whatever encode() produces for a special value must classify and decode
    // back as that same kind of thing.
    test('encode(NaN) and encode(Infinity) round-trip to the right kind', () => {
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            const nan = format.encode(NaN);
            const kind = format.classify(nan.sign, nan.exponent, nan.mantissa);
            const decoded = format.decode(nan.sign, nan.exponent, nan.mantissa);
            // A format with no NaN encoding returns zero by policy; otherwise
            // the pattern must genuinely be NaN, never Infinity or a number.
            if (nan.isNaN) {
                if (kind !== 'NaN' || !Number.isNaN(decoded)) {
                    failures.push(`${name}: encode(NaN) -> ${bits(nan)} classifies ${kind}, decodes ${decoded}`);
                }
            } else if (kind !== 'Zero') {
                failures.push(`${name}: encode(NaN) fell back to ${bits(nan)} (${kind}), expected Zero`);
            }

            const inf = format.encode(Infinity);
            const infKind = format.classify(inf.sign, inf.exponent, inf.mantissa);
            // A format with no infinity saturates to the max normal instead. In
            // the fully degenerate case there is no normal value to saturate to
            // (see the e1m0 test below), and zero is all that is left.
            const expectedKinds = inf.isInfinite ? ['Infinity'] : ['Normal', 'Zero'];
            if (!expectedKinds.includes(infKind)) {
                failures.push(`${name}: encode(Infinity) -> ${bits(inf)} classifies ${infKind}`);
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('format-space property: IEEE 754 directed rounding', () => {
    // A directed mode pointing away from zero may never flush a nonzero value
    // to zero, however far below the smallest subnormal it is. This is the rule
    // the encode() path broke for formats whose bias made the subnormal scaling
    // underflow the double.
    test('a nonzero magnitude never rounds to zero when pushed away from zero', () => {
        const tiny = [Number.MIN_VALUE, 1e-320, 1e-300, 1e-45];
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            // Skip layouts with no nonzero finite value to round to at all (see
            // the e1m0 test below) - there, zero really is the only answer.
            const max = format.getMaxNormal();
            if (format.classify(max.sign, max.exponent, max.mantissa) === 'Zero') continue;

            for (const magnitude of tiny) {
                for (const [mode, sign] of [['towardPositive', 1], ['towardNegative', -1]]) {
                    const value = sign * magnitude;
                    if (sign < 0 && format.signBits === 0) continue; // clamped to zero by design
                    const encoded = format.encode(value, { roundingMode: mode });
                    if (encoded.isZero) {
                        failures.push(`${name} ${mode} ${value} -> zero`);
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('format-space property: unsigned formats never emit a sign bit', () => {
    // A format with no sign bit has no sign field to set. encode() used to check
    // that only on the finite path, so a negative SPECIAL value went straight to
    // getInfinity()/getMaxNormal() and came back with sign=1 - a field value the
    // format cannot hold, which decode() and toBinaryString() then rejected.
    test('every encoding of a negative value is representable and sign-free', () => {
        const negatives = [-Infinity, -1e300, -1, -0.5, -0, -Number.MIN_VALUE, NaN];
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            if (format.signBits !== 0) continue;
            for (const value of negatives) {
                for (const source of [value, String(value)]) {
                    const encoded = format.encode(source);
                    if (encoded.sign !== 0) {
                        failures.push(`${name} encode(${String(source)}) -> sign=${encoded.sign}`);
                        continue;
                    }
                    // Must survive the round trip rather than throwing on decode.
                    expect(() => format.decode(encoded.sign, encoded.exponent, encoded.mantissa))
                        .not.toThrow();
                    expect(() => format.toBinaryString(encoded.sign, encoded.exponent, encoded.mantissa))
                        .not.toThrow();
                }
            }
        }
        expect(failures).toEqual([]);
    });

    test('the get* helpers ignore a negative request on an unsigned format', () => {
        const fp = new FloatingPoint(0, 5, 10);
        for (const encoded of [fp.getZero(true), fp.getMaxNormal(true), fp.getInfinity(true)]) {
            expect(encoded.sign).toBe(0);
            expect(() => fp.decode(encoded.sign, encoded.exponent, encoded.mantissa)).not.toThrow();
        }
    });
});

describe('format-space property: result flags agree with classify()', () => {
    // The flags on an encoded result are derived from classify() rather than
    // written out by hand at each construction site, so the two cannot drift.
    test('every encoded result classifies as the kind its flags claim', () => {
        const probes = [0, -0, 1, -1, 0.5, 6, 1e300, -1e300, Number.MIN_VALUE,
            Infinity, -Infinity, NaN];
        const failures = [];
        for (const { name, format } of LAYOUTS) {
            for (const value of probes) {
                const e = format.encode(value);
                const kind = format.classify(e.sign, e.exponent, e.mantissa);
                const claimed = {
                    Normal: e.isNormal, Subnormal: e.isSubnormal, Zero: e.isZero,
                    Infinity: e.isInfinite, NaN: e.isNaN,
                };
                const flagged = Object.keys(claimed).filter((k) => claimed[k]);
                if (flagged.length !== 1 || flagged[0] !== kind) {
                    failures.push(`${name} encode(${value}) -> ${bits(e)} ` +
                        `classify=${kind} flags=[${flagged.join(',')}]`);
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('rounding-mode validation is not value-dependent', () => {
    // Validation used to happen inside the rounding helpers, which an exact
    // value, a zero or a special value never reaches - so a bogus mode was
    // rejected for some inputs and silently accepted for others.
    const fp32 = FloatingPoint.fromFormat('fp32');
    const { Integer } = require('../lib/floating-point.js');
    const int32 = new Integer(32, true);
    const bogus = { roundingMode: 'nearestIshPlease' };

    test.each([
        ['encode(0)', () => fp32.encode(0, bogus)],
        ['encode(-0)', () => fp32.encode(-0, bogus)],
        ['encode(inexact)', () => fp32.encode(0.1, bogus)],
        ['encode(Infinity)', () => fp32.encode(Infinity, bogus)],
        ['encode(NaN)', () => fp32.encode(NaN, bogus)],
        ['encodeString(exact)', () => fp32.encodeString('2.5', bogus)],
        ['encodeString(inexact)', () => fp32.encodeString('0.1', bogus)],
        ['encodeString(out of range)', () => fp32.encodeString('1e40000', bogus)],
        ['Integer.encode', () => int32.encode(2, bogus)],
        ['Integer.encodeString(exact)', () => int32.encodeString('2', bogus)],
        ['Integer.encodeString(inexact)', () => int32.encodeString('2.5', bogus)],
    ])('%s rejects an unknown rounding mode', (_label, call) => {
        expect(call).toThrow(/Unknown rounding mode/);
    });

    test('a valid mode is still accepted everywhere', () => {
        for (const mode of MODES) {
            expect(() => fp32.encode(0.1, { roundingMode: mode })).not.toThrow();
            expect(() => fp32.encodeString('0.1', { roundingMode: mode })).not.toThrow();
            expect(() => int32.encodeString('2.5', { roundingMode: mode })).not.toThrow();
        }
    });
});

describe('zero-mantissa formats round the exponent', () => {
    // With mantissaBits === 0 the implicit leading 1 is the only significant
    // bit, so all of the information lives in the exponent and rounding has to
    // act on it. Skipping that turned every conversion into a truncation, with
    // errors of up to 2x.
    const e5m0 = new FloatingPoint(1, 5, 0); // bias 15, values are powers of two
    const decoded = (value, roundingMode) => {
        const e = e5m0.encode(value, roundingMode ? { roundingMode } : {});
        return e5m0.decode(e.sign, e.exponent, e.mantissa);
    };

    test.each([
        [0.1, 0.125],   // closer to 2^-3 than 2^-4
        [5, 4],         // closer to 4 than 8
        [127.5, 128],
        [448, 512],
        // Exact ties. With no mantissa field the encoding's least significant
        // bit is the biased exponent's, so the tie goes to the even CODE.
        [1.5, 2],       // between codes 15 and 16; 15 is odd -> up
        [0.75, 0.5],    // between codes 14 and 15; 14 is even -> down
        [3, 2],         // between codes 16 and 17; 16 is even -> down
        [6, 8],         // between codes 17 and 18; 17 is odd  -> up
    ])('encode(%p) -> %p', (input, expected) => {
        expect(decoded(input)).toBe(expected);
    });

    test('powers of two are exact under every rounding mode', () => {
        for (const mode of MODES) {
            for (const exp of [-14, -3, 0, 1, 10, 15]) {
                const value = Math.pow(2, exp);
                expect(decoded(value, mode)).toBe(value);
            }
        }
    });

    test('directed modes bracket the value', () => {
        expect(decoded(6, 'towardZero')).toBe(4);
        expect(decoded(6, 'towardPositive')).toBe(8);
        expect(decoded(6, 'towardNegative')).toBe(4);
        expect(decoded(-6, 'towardPositive')).toBe(-4);
        expect(decoded(-6, 'towardNegative')).toBe(-8);
    });

    test('there is no NaN encoding when infinity already owns the slot', () => {
        expect(e5m0._hasNaNEncoding()).toBe(false);
        expect(() => e5m0.getNaN()).toThrow(/does not support NaN/);
        // encode(NaN) falls back to zero rather than emitting Infinity's pattern.
        expect(e5m0.encode(NaN).isZero).toBe(true);
    });

    test('an OCP-style zero-mantissa format keeps NaN and max normal apart', () => {
        const fp = new FloatingPoint(1, 4, 0, { hasInfinity: false, hasNaN: true });
        expect(fp._hasNaNEncoding()).toBe(true);
        const nan = fp.getNaN();
        const max = fp.getMaxNormal();
        expect(bits(nan)).not.toBe(bits(max));
        expect(fp.classify(max.sign, max.exponent, max.mantissa)).toBe('Normal');
        expect(fp.classify(nan.sign, nan.exponent, nan.mantissa)).toBe('NaN');
    });

    // Documents a genuinely degenerate layout rather than asserting a fix for
    // it. With one exponent bit, no mantissa and OCP-style NaN, the all-ones
    // exponent is NaN and the only other exponent is the zero/subnormal slot -
    // which has no mantissa to make subnormal. The format can therefore express
    // nothing but +/-0 and NaN, and encode(Infinity) has nowhere to saturate to.
    test('e1m0 with OCP-style NaN can only express zero and NaN', () => {
        const fp = new FloatingPoint(1, 1, 0, { hasInfinity: false, hasNaN: true });
        expect(fp.classify(0, 0, 0)).toBe('Zero');
        expect(fp.classify(0, 1, 0)).toBe('NaN');

        // Nothing finite and nonzero exists, so everything saturates to zero -
        // and says so, because the flags come from classify().
        for (const value of [Infinity, 1, 1e30]) {
            const encoded = fp.encode(value);
            expect(encoded.isZero).toBe(true);
            expect(fp.decode(encoded.sign, encoded.exponent, encoded.mantissa)).toBe(0);
        }
    });
});
