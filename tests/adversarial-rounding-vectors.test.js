// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/**
 * Adversarial rounding regression vectors.
 *
 * These inputs were found by differential validation of
 * lib/floating-point.js against external implementations:
 *
 *   - David Gay's gdtoa, via its format-generic strtodg() entry point
 *   - the host libc's strtof/strtod under fesetround()
 *   - glibc, built and run in a Linux container: strtod/strtof for fp64/fp32,
 *     and _Float16/__bf16 narrowing casts for fp16/bf16, also under
 *     fesetround()
 *
 * Every vector below is a case where one of the first two produced a DIFFERENT
 * answer than fp-conv. In each case fp-conv was confirmed correct and the
 * external implementation wrong:
 *
 *   - gdtoa's generic path mis-rounds subnormal ties that carry to a power of
 *     two, inverts directed rounding for tiny negatives, and loses
 *     normalization bits when nbits is small (bf16/tf32).
 *   - the host libc mis-handles FE_DOWNWARD for values that are already
 *     exactly representable (so no rounding is called for at all).
 *
 * glibc is what adjudicated those two: it is the only external implementation
 * that agreed with fp-conv everywhere, over 564,424 comparisons across the
 * four formats it can serve (fp64 96,036 / fp32 96,036 / fp16 241,696 /
 * bf16 130,656) with zero disagreements. That is what establishes the other
 * two as the buggy ones rather than fp-conv.
 *
 * They are therefore precisely the inputs that trip up real implementations,
 * which makes them worth pinning permanently.
 *
 * Each vector stores the probe as an exact dyadic rational (num * 2^exp) so
 * the decimal string can be reconstructed exactly, with no parsing loss.
 *
 * These vectors are FROZEN. The differential harness that produced them is not
 * part of this repo and is not needed to run or maintain this test;
 * regenerating requires a C toolchain, Gay's gdtoa and docker. Mutation
 * testing confirmed the jest suite catches every semantically meaningful
 * rounding regression on its own.
 */

const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');
const VECTORS = require('./adversarial-rounding-vectors.json');

// Exact decimal string for num * 2^exp (num a non-negative BigInt).
function dyadicToDecimal(num, exp) {
    if (num === 0n) return '0';
    if (exp >= 0) return (num << BigInt(exp)).toString();
    const digits = -exp;
    const scaled = (num * 5n ** BigInt(digits)).toString().padStart(digits + 1, '0');
    return scaled.slice(0, scaled.length - digits) + '.' + scaled.slice(scaled.length - digits);
}

function formatFor(key) {
    const f = FORMATS[key];
    return new FloatingPoint(1, f.exponent, f.mantissa, {
        bias: f.bias, hasInfinity: f.hasInfinity, hasNaN: f.hasNaN
    });
}

// Is `value` exactly the dyadic num * 2^exp when represented as a double?
function doubleIsExact(value, num, exp) {
    if (!isFinite(value) || value === 0) return false;
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, Math.abs(value));
    const bits = (BigInt(buf.getUint32(0)) << 32n) | BigInt(buf.getUint32(4));
    const biased = Number((bits >> 52n) & 0x7ffn);
    const frac = bits & 0xfffffffffffffn;
    const dNum = biased === 0 ? frac : frac | (1n << 52n);
    const dExp = biased === 0 ? -1074 : biased - 1075;
    const shift = dExp - exp;
    return shift >= 0 ? (dNum << BigInt(shift)) === num : dNum === (num << BigInt(-shift));
}

describe('adversarial rounding vectors (gdtoa / libc differential)', () => {
    test('vector file is populated and covers every float format', () => {
        expect(VECTORS.length).toBeGreaterThan(200);
        const covered = new Set(VECTORS.map(v => v.format));
        for (const key of Object.keys(FORMATS)) {
            if (FORMATS[key].isInteger) continue;
            expect(covered).toContain(key);
        }
    });

    // Group by format so failures report a useful name.
    const byFormat = {};
    for (const v of VECTORS) (byFormat[v.format] ||= []).push(v);

    for (const [key, vectors] of Object.entries(byFormat)) {
        describe(key, () => {
            const fp = formatFor(key);

            test(`encodeString matches the verified reference (${vectors.length} vectors)`, () => {
                const failures = [];
                for (const v of vectors) {
                    const dec = (v.sign ? '-' : '') + dyadicToDecimal(BigInt(v.num), v.exp);
                    const got = fp.encodeString(dec, { roundingMode: v.mode });
                    if (got.sign !== v.expected.sign ||
                        got.exponent !== v.expected.exponent ||
                        got.mantissa !== v.expected.mantissa) {
                        failures.push(`${v.mode} ${dec}: expected ` +
                            `s=${v.expected.sign} e=${v.expected.exponent} m=${v.expected.mantissa}, ` +
                            `got s=${got.sign} e=${got.exponent} m=${got.mantissa}`);
                    }
                }
                expect(failures).toEqual([]);
            });

            test(`encode matches the verified reference (${vectors.length} vectors)`, () => {
                const failures = [];
                for (const v of vectors) {
                    const num = BigInt(v.num);
                    const dec = (v.sign ? '-' : '') + dyadicToDecimal(num, v.exp);
                    const value = Number(dec);
                    // Only meaningful where the double holds the probe exactly;
                    // otherwise the double conversion itself rounds first.
                    if (!doubleIsExact(value, num, v.exp)) continue;
                    const got = fp.encode(value, { roundingMode: v.mode });
                    if (got.sign !== v.expected.sign ||
                        got.exponent !== v.expected.exponent ||
                        got.mantissa !== v.expected.mantissa) {
                        failures.push(`${v.mode} ${dec}: expected ` +
                            `s=${v.expected.sign} e=${v.expected.exponent} m=${v.expected.mantissa}, ` +
                            `got s=${got.sign} e=${got.exponent} m=${got.mantissa}`);
                    }
                }
                expect(failures).toEqual([]);
            });
        });
    }
});

/**
 * Exhaustive round-trip invariance.
 *
 * A value that is already exactly representable must round to itself under
 * EVERY rounding mode — there is nothing to round. This is the exact property
 * the host libc violates under FE_DOWNWARD (it returned a neighbouring value
 * for inputs that were already exact fp32 normals), so it is worth pinning
 * exhaustively rather than by sampling.
 */
describe('exhaustive decode -> encode round-trip, all rounding modes', () => {
    const SMALL = Object.keys(FORMATS).filter(k => {
        const f = FORMATS[k];
        return !f.isInteger && 1 + f.exponent + f.mantissa <= 16;
    });

    test.each(SMALL)('%s: every finite bit pattern is a fixed point', (key) => {
        const f = FORMATS[key];
        const fp = formatFor(key);
        const maxExponent = Math.pow(2, f.exponent) - 1;
        const maxMantissa = Math.pow(2, f.mantissa) - 1;
        const modes = Object.values(require('../lib/floating-point.js').ROUNDING_MODES);
        const failures = [];

        for (let s = 0; s <= 1; s++) {
            for (let e = 0; e <= maxExponent; e++) {
                for (let m = 0; m <= maxMantissa; m++) {
                    const value = fp.decode(s, e, m);
                    if (!isFinite(value)) continue;   // inf/NaN slots
                    for (const mode of modes) {
                        const back = fp.encode(value, { roundingMode: mode });
                        if (back.sign !== s || back.exponent !== e || back.mantissa !== m) {
                            failures.push(`${mode} s=${s} e=${e} m=${m} (${value}) -> ` +
                                `s=${back.sign} e=${back.exponent} m=${back.mantissa}`);
                        }
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });
});
