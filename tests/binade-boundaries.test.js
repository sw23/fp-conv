// Regression tests for exponent extraction at binade boundaries.
//
// Math.log2 rounds up for values just below a power of two (e.g. nextDown(2^k)
// with |k| >= 4), which previously produced an exponent one too high and a
// negative mantissa under directed rounding modes.
const { FloatingPoint } = require('../lib/floating-point.js');

const ROUNDING_MODES = [
    'tiesToEven',
    'tiesToAway',
    'towardZero',
    'towardPositive',
    'towardNegative'
];

// nextDown/nextUp for a positive double.
function nextUp(x) {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, x);
    let hi = buf.getUint32(0);
    let lo = buf.getUint32(4);
    if (lo === 0xffffffff) { hi += 1; lo = 0; } else { lo += 1; }
    buf.setUint32(0, hi);
    buf.setUint32(4, lo);
    return buf.getFloat64(0);
}

function nextDown(x) {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, x);
    let hi = buf.getUint32(0);
    let lo = buf.getUint32(4);
    if (lo === 0) { hi -= 1; lo = 0xffffffff; } else { lo -= 1; }
    buf.setUint32(0, hi);
    buf.setUint32(4, lo);
    return buf.getFloat64(0);
}

function fieldChecks(fp, enc) {
    const maxMantissa = Math.pow(2, fp.mantissaBits) - 1;
    expect(Number.isInteger(enc.mantissa)).toBe(true);
    expect(enc.mantissa).toBeGreaterThanOrEqual(0);
    expect(enc.mantissa).toBeLessThanOrEqual(maxMantissa);
    expect(Number.isInteger(enc.exponent)).toBe(true);
    expect(enc.exponent).toBeGreaterThanOrEqual(0);
    expect(enc.exponent).toBeLessThanOrEqual(fp.maxExponent);
    // A well-formed encoding always yields a full-width bit string.
    const bin = fp.toBinaryString(enc.sign, enc.exponent, enc.mantissa);
    expect(bin.length).toBe(fp.totalBits);
}

describe('Binade boundary encoding', () => {
    const fp32 = new FloatingPoint(1, 8, 23);
    const fp64 = new FloatingPoint(1, 11, 52);

    describe('FP32 sweep', () => {
        const ks = [-14, -4, 4, 16, 52, 100, 120];
        for (const k of ks) {
            const pow = Math.pow(2, k);
            for (const base of [nextDown(pow), pow, nextUp(pow)]) {
                for (const sign of [1, -1]) {
                    const x = sign * base;
                    for (const mode of ROUNDING_MODES) {
                        test(`fp32 encode(${x}) [${mode}] has valid fields`, () => {
                            const enc = fp32.encode(x, { roundingMode: mode });
                            fieldChecks(fp32, enc);
                            const dec = fp32.decode(enc.sign, enc.exponent, enc.mantissa);
                            // Decoded result must be a real FP32 value within one
                            // ulp of the input's binade.
                            expect(Math.fround(dec)).toBe(dec);
                            const ulp = Math.pow(2, k - 23);
                            expect(Math.abs(dec - x)).toBeLessThanOrEqual(ulp);
                        });
                    }
                    test(`fp32 encode(${x}) [tiesToEven] == Math.fround`, () => {
                        const enc = fp32.encode(x, { roundingMode: 'tiesToEven' });
                        const dec = fp32.decode(enc.sign, enc.exponent, enc.mantissa);
                        expect(dec).toBe(Math.fround(x));
                    });
                }
            }
        }
    });

    describe('FP64 is identity on representable doubles', () => {
        const ks = [-1022, -126, -14, -4, 4, 16, 52, 100, 1000];
        for (const k of ks) {
            const pow = Math.pow(2, k);
            for (const base of [nextDown(pow), pow, nextUp(pow)]) {
                for (const sign of [1, -1]) {
                    const x = sign * base;
                    for (const mode of ROUNDING_MODES) {
                        test(`fp64 encode(${x}) [${mode}] round-trips exactly`, () => {
                            const enc = fp64.encode(x, { roundingMode: mode });
                            fieldChecks(fp64, enc);
                            const dec = fp64.decode(enc.sign, enc.exponent, enc.mantissa);
                            expect(dec).toBe(x);
                        });
                    }
                }
            }
        }
    });

    test('known repro: fp32 nextDown(2^16) towardZero truncates correctly', () => {
        const x = 65536 * (1 - Number.EPSILON / 2);
        const enc = fp32.encode(x, { roundingMode: 'towardZero' });
        expect(enc.exponent).toBe(142);
        expect(enc.mantissa).toBe(8388607);
        expect(fp32.decode(enc.sign, enc.exponent, enc.mantissa)).toBe(65535.99609375);
    });

    test('known repro: nearest modes round nextDown(2^16) up to 65536', () => {
        const x = 65536 * (1 - Number.EPSILON / 2);
        for (const mode of ['tiesToEven', 'tiesToAway']) {
            const enc = fp32.encode(x, { roundingMode: mode });
            expect(fp32.decode(enc.sign, enc.exponent, enc.mantissa)).toBe(65536);
        }
    });
});
