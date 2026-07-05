// Tests for FloatingPoint.classify() — the shared bit-pattern classifier.
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint classify()', () => {
    describe('IEEE-style (hasInfinity + hasNaN)', () => {
        let fp32;
        beforeEach(() => { fp32 = new FloatingPoint(1, 8, 23); });

        test('zero', () => {
            expect(fp32.classify(0, 0, 0)).toBe('Zero');
            expect(fp32.classify(1, 0, 0)).toBe('Zero');
        });
        test('subnormal', () => {
            expect(fp32.classify(0, 0, 1)).toBe('Subnormal');
        });
        test('normal', () => {
            expect(fp32.classify(0, 127, 0)).toBe('Normal');
        });
        test('infinity at maxExponent with zero mantissa', () => {
            expect(fp32.classify(0, 255, 0)).toBe('Infinity');
        });
        test('NaN at maxExponent with any non-zero mantissa', () => {
            expect(fp32.classify(0, 255, 1)).toBe('NaN');
            expect(fp32.classify(0, 255, Math.pow(2, 23) - 1)).toBe('NaN');
        });
    });

    describe('OCP E4M3-style (hasNaN only, no infinity)', () => {
        let e4m3;
        beforeEach(() => {
            e4m3 = new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true });
        });

        test('only the all-ones mantissa at maxExponent is NaN', () => {
            // maxExponent = 15, maxMantissa = 7
            expect(e4m3.classify(0, 15, 7)).toBe('NaN');
        });
        test('the largest normal (exp 15, mantissa 6 = 448) is Normal, not NaN', () => {
            expect(e4m3.classify(0, 15, 6)).toBe('Normal');
            expect(e4m3.decode(0, 15, 6)).toBe(448);
        });
        test('other max-exponent mantissas are Normal', () => {
            expect(e4m3.classify(0, 15, 0)).toBe('Normal');
            expect(e4m3.classify(0, 15, 5)).toBe('Normal');
        });
    });

    describe('OCP no-special (FP4 E2M1)', () => {
        let e2m1;
        beforeEach(() => {
            e2m1 = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
        });
        test('max-exponent all-ones is a Normal value', () => {
            expect(e2m1.classify(0, 3, 1)).toBe('Normal');
        });
    });

    describe('fixed-point (0 exponent bits)', () => {
        let fixed;
        beforeEach(() => { fixed = new FloatingPoint(1, 0, 7); });
        test('zero mantissa is Zero, non-zero is Normal', () => {
            expect(fixed.classify(0, 0, 0)).toBe('Zero');
            expect(fixed.classify(0, 0, 5)).toBe('Normal');
        });
    });

    test('rejects out-of-range fields', () => {
        const fp32 = new FloatingPoint(1, 8, 23);
        expect(() => fp32.classify(0, 256, 0)).toThrow(RangeError);
    });
});
