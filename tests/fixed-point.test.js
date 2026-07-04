// Regression tests for the fixed-point path (exponentBits === 0), the unsigned
// clamp, field validation, and canonical quiet-NaN behavior.
const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');

const ROUNDING_MODES = [
    'tiesToEven',
    'tiesToAway',
    'towardZero',
    'towardPositive',
    'towardNegative'
];

describe('Fixed-point encoding', () => {
    const signed = new FloatingPoint(1, 0, 4); // 1 sign + 4 fractional bits
    const unsigned = new FloatingPoint(0, 0, 8); // 8 fractional bits, unsigned
    const maxSigned = Math.pow(2, 4) - 1;

    test('NaN encodes to zero', () => {
        const enc = signed.encode(NaN);
        expect(enc.mantissa).toBe(0);
        expect(enc.isZero).toBe(true);
        expect(enc.isNaN).toBe(false);
    });

    test('positive Infinity saturates to max mantissa', () => {
        const enc = signed.encode(Infinity);
        expect(enc.sign).toBe(0);
        expect(enc.mantissa).toBe(maxSigned);
        expect(enc.isInfinite).toBe(false);
    });

    test('negative Infinity saturates with sign set', () => {
        const enc = signed.encode(-Infinity);
        expect(enc.sign).toBe(1);
        expect(enc.mantissa).toBe(maxSigned);
    });

    test('overflow saturates rather than overflowing the field', () => {
        const enc = signed.encode(1000);
        expect(enc.mantissa).toBe(maxSigned);
    });

    test('negative zero sets the sign bit for signed formats', () => {
        const enc = signed.encode(-0);
        expect(enc.sign).toBe(1);
        expect(enc.mantissa).toBe(0);
    });

    test('unsigned format clamps negatives to zero', () => {
        const enc = unsigned.encode(-1.5);
        expect(enc.sign).toBe(0);
        expect(enc.mantissa).toBe(0);
    });

    test('unsigned negative Infinity saturates positive', () => {
        const enc = unsigned.encode(-Infinity);
        expect(enc.sign).toBe(0);
        expect(enc.mantissa).toBe(0);
    });

    test('bit string width equals totalBits for all specials', () => {
        for (const fp of [signed, unsigned]) {
            for (const value of [NaN, Infinity, -Infinity, -0, 1000, 0.5, -0.5, 1e-9]) {
                const enc = fp.encode(value);
                const bin = fp.toBinaryString(enc.sign, enc.exponent, enc.mantissa);
                expect(bin.length).toBe(fp.totalBits);
            }
        }
    });

    test('round-trips small positive and negative fractions', () => {
        for (const value of [0.25, 0.5, 0.75, -0.25, -0.5, -0.75, 0.125]) {
            const enc = signed.encode(value);
            const dec = signed.decode(enc.sign, enc.exponent, enc.mantissa);
            expect(dec).toBeCloseTo(value, 2);
        }
    });
});

describe('Exhaustive decode -> encode value identity', () => {
    const formats = {
        fp16: new FloatingPoint(1, 5, 10),
        fp4_e2m1: new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false }),
        fp6_e2m3: new FloatingPoint(1, 2, 3, { bias: 1, hasInfinity: false, hasNaN: false }),
        fp6_e3m2: new FloatingPoint(1, 3, 2, { bias: 3, hasInfinity: false, hasNaN: false }),
        fp8_e4m3: new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true }),
        fp8_e5m2: new FloatingPoint(1, 5, 2, { bias: 15, hasInfinity: true, hasNaN: true })
    };

    for (const [name, fp] of Object.entries(formats)) {
        test(`${name} round-trips every bit pattern under every mode`, () => {
            const maxExp = fp.maxExponent;
            const maxMant = Math.pow(2, fp.mantissaBits) - 1;
            for (let sign = 0; sign <= 1; sign++) {
                for (let exp = 0; exp <= maxExp; exp++) {
                    for (let mant = 0; mant <= maxMant; mant++) {
                        const value = fp.decode(sign, exp, mant);
                        for (const mode of ROUNDING_MODES) {
                            const enc = fp.encode(value, { roundingMode: mode });
                            const dec = fp.decode(enc.sign, enc.exponent, enc.mantissa);
                            if (Number.isNaN(value)) {
                                expect(Number.isNaN(dec)).toBe(true);
                            } else {
                                expect(Object.is(dec, value)).toBe(true);
                            }
                        }
                    }
                }
            }
        });
    }
});

describe('Constructor and field validation', () => {
    test('rejects a non-integer bias', () => {
        expect(() => new FloatingPoint(1, 4, 3, { bias: '7' })).toThrow(RangeError);
        expect(() => new FloatingPoint(1, 4, 3, { bias: 1.5 })).toThrow(RangeError);
    });

    test('accepts an explicit integer bias', () => {
        expect(() => new FloatingPoint(1, 4, 3, { bias: 7 })).not.toThrow();
    });

    test('decode rejects out-of-range fields', () => {
        const fp32 = new FloatingPoint(1, 8, 23);
        expect(() => fp32.decode(0, 300, 5)).toThrow(RangeError);
        expect(() => fp32.decode(0, 1, -1)).toThrow(RangeError);
        expect(() => fp32.decode(0, 256, 0)).toThrow(RangeError);
        expect(() => fp32.decode(2, 0, 0)).toThrow(RangeError);
        expect(() => fp32.decode(0, 1.5, 0)).toThrow(RangeError);
    });

    test('toBinaryString and toHexString reject out-of-range fields', () => {
        const fp32 = new FloatingPoint(1, 8, 23);
        expect(() => fp32.toBinaryString(0, 999, 0)).toThrow(RangeError);
        expect(() => fp32.toHexString(0, 0, Math.pow(2, 23))).toThrow(RangeError);
    });

    test('unsigned format rejects a set sign field', () => {
        const fp = new FloatingPoint(0, 4, 3);
        expect(() => fp.decode(1, 0, 0)).toThrow(RangeError);
    });

    test('unsigned normal format clamps a negative value to zero', () => {
        const fp = new FloatingPoint(0, 4, 3);
        const enc = fp.encode(-1.5);
        expect(enc.sign).toBe(0);
        expect(enc.isZero).toBe(true);
        expect(fp.decode(enc.sign, enc.exponent, enc.mantissa)).toBe(0);
    });
});

describe('FloatingPoint.fromFormat', () => {
    test('builds a format from a preset key', () => {
        const e4m3 = FloatingPoint.fromFormat('fp8_e4m3');
        const preset = FORMATS.fp8_e4m3;
        expect(e4m3.exponentBits).toBe(preset.exponent);
        expect(e4m3.mantissaBits).toBe(preset.mantissa);
        expect(e4m3.bias).toBe(preset.bias);
        expect(e4m3.hasInfinity).toBe(false);
    });

    test('rejects unknown and integer preset keys', () => {
        expect(() => FloatingPoint.fromFormat('nope')).toThrow(RangeError);
        expect(() => FloatingPoint.fromFormat('int8')).toThrow(RangeError);
    });
});

describe('Canonical quiet NaN', () => {
    test('IEEE-style NaN sets the mantissa MSB', () => {
        const fp32 = new FloatingPoint(1, 8, 23);
        expect(fp32.getNaN().mantissa).toBe(Math.pow(2, 22));
        expect(fp32.toHexString(0, 255, Math.pow(2, 22))).toBe('0x7FC00000');
    });

    test('OCP-style NaN remains all-ones mantissa', () => {
        const e4m3 = new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true });
        expect(e4m3.getNaN().mantissa).toBe(Math.pow(2, 3) - 1);
    });
});
