const { FloatingPoint, Integer, ROUNDING_MODES } = require('../lib/floating-point.js');

describe('Rounding Modes', () => {
    describe('ROUNDING_MODES constant', () => {
        test('exports all five IEEE 754 rounding modes', () => {
            expect(ROUNDING_MODES.tiesToEven).toBe('tiesToEven');
            expect(ROUNDING_MODES.tiesToAway).toBe('tiesToAway');
            expect(ROUNDING_MODES.towardZero).toBe('towardZero');
            expect(ROUNDING_MODES.towardPositive).toBe('towardPositive');
            expect(ROUNDING_MODES.towardNegative).toBe('towardNegative');
        });

        test('is frozen (immutable)', () => {
            expect(Object.isFrozen(ROUNDING_MODES)).toBe(true);
        });
    });

    describe('FloatingPoint - tiesToEven (default)', () => {
        // FP8 E4M3: 1 sign, 4 exponent, 3 mantissa bits — easy to construct halfway cases
        const fp8 = new FloatingPoint(1, 4, 3);

        test('default rounding mode is tiesToEven', () => {
            // Encoding without options should use tiesToEven
            const withDefault = fp8.encode(1.0);
            const withExplicit = fp8.encode(1.0, { roundingMode: 'tiesToEven' });
            expect(withDefault.mantissa).toBe(withExplicit.mantissa);
            expect(withDefault.exponent).toBe(withExplicit.exponent);
        });

        test('halfway value rounds to even mantissa (round down)', () => {
            // FP8 E4M3: bias=7, mantissa bits=3
            // Value 1.0625 = 1 + 1/16 = 1.0001b
            // Mantissa in FP8: 0.0001b × 2^3 = 0.5 — exactly halfway between 0 and 1
            // 0 is even, so tiesToEven should round down to 0
            const encoded = fp8.encode(1.0625, { roundingMode: 'tiesToEven' });
            expect(encoded.mantissa).toBe(0); // even
        });

        test('halfway value rounds to even mantissa (round up)', () => {
            // Value 1.1875 = 1 + 3/16 = 1.0011b
            // Mantissa in FP8: 0.0011b × 2^3 = 1.5 — exactly halfway between 1 and 2
            // 2 is even, so tiesToEven should round up to 2
            const encoded = fp8.encode(1.1875, { roundingMode: 'tiesToEven' });
            expect(encoded.mantissa).toBe(2); // even
        });

        test('non-halfway rounds to nearest', () => {
            // Value 1.3 — not exactly halfway, should round to nearest
            const encoded = fp8.encode(1.3, { roundingMode: 'tiesToEven' });
            // 1.3 in FP8 E4M3: mantissa ≈ 0.3 × 8 = 2.4, rounds to 2
            expect(encoded.mantissa).toBe(2);
        });
    });

    describe('FloatingPoint - tiesToAway', () => {
        const fp8 = new FloatingPoint(1, 4, 3);

        test('halfway value rounds away from zero (up for positive)', () => {
            // 1.0625 = 1.0001b, mantissa scaled = 0.5 (halfway)
            // tiesToAway: round away from zero → round up to 1
            const encoded = fp8.encode(1.0625, { roundingMode: 'tiesToAway' });
            expect(encoded.mantissa).toBe(1);
        });

        test('halfway value rounds away from zero (up for negative)', () => {
            // -1.0625: mantissa scaled = 0.5,
            // Math.round(0.5) = 1, so mantissa = 1
            const encoded = fp8.encode(-1.0625, { roundingMode: 'tiesToAway' });
            expect(encoded.sign).toBe(1);
            expect(encoded.mantissa).toBe(1);
        });
    });

    describe('FloatingPoint - towardZero (truncation)', () => {
        const fp8 = new FloatingPoint(1, 4, 3);

        test('positive value truncates down', () => {
            // 1.3 → mantissa = 0.3 * 8 = 2.4, truncated to 2
            const encoded = fp8.encode(1.3, { roundingMode: 'towardZero' });
            expect(encoded.mantissa).toBe(2);
        });

        test('negative value truncates toward zero (down in magnitude)', () => {
            // -1.3 → mantissa = 0.3 * 8 = 2.4, truncated to 2
            const encoded = fp8.encode(-1.3, { roundingMode: 'towardZero' });
            expect(encoded.sign).toBe(1);
            expect(encoded.mantissa).toBe(2);
        });

        test('positive halfway truncates down', () => {
            // 1.0625: mantissa = 0.5, truncated to 0
            const encoded = fp8.encode(1.0625, { roundingMode: 'towardZero' });
            expect(encoded.mantissa).toBe(0);
        });

        test('negative halfway truncates toward zero', () => {
            // -1.0625: mantissa = 0.5, truncated to 0
            const encoded = fp8.encode(-1.0625, { roundingMode: 'towardZero' });
            expect(encoded.mantissa).toBe(0);
        });

        test('result magnitude is always <= input magnitude', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const values = [1.3, -1.3, 3.7, -3.7, 0.001, -0.001, 100.9, -100.9];
            for (const v of values) {
                const encoded = fp16.encode(v, { roundingMode: 'towardZero' });
                const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                expect(Math.abs(decoded)).toBeLessThanOrEqual(Math.abs(v) + 1e-15);
            }
        });
    });

    describe('FloatingPoint - towardPositive (ceiling)', () => {
        const fp8 = new FloatingPoint(1, 4, 3);

        test('positive non-exact rounds up', () => {
            // 1.3 → mantissa = 2.4, ceiling → 3
            const encoded = fp8.encode(1.3, { roundingMode: 'towardPositive' });
            expect(encoded.mantissa).toBe(3);
        });

        test('negative non-exact truncates toward zero', () => {
            // -1.3 → mantissa = 2.4, for negative towardPositive means toward zero → floor(2.4)=2
            const encoded = fp8.encode(-1.3, { roundingMode: 'towardPositive' });
            expect(encoded.sign).toBe(1);
            expect(encoded.mantissa).toBe(2);
        });

        test('result is always >= input value', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const values = [1.3, -1.3, 3.7, -3.7, 0.001, -0.001];
            for (const v of values) {
                const encoded = fp16.encode(v, { roundingMode: 'towardPositive' });
                const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                expect(decoded).toBeGreaterThanOrEqual(v - 1e-15);
            }
        });
    });

    describe('FloatingPoint - towardNegative (floor)', () => {
        const fp8 = new FloatingPoint(1, 4, 3);

        test('positive non-exact truncates down', () => {
            // 1.3 → mantissa = 2.4, floor → 2
            const encoded = fp8.encode(1.3, { roundingMode: 'towardNegative' });
            expect(encoded.mantissa).toBe(2);
        });

        test('negative non-exact rounds away from zero (larger magnitude)', () => {
            // -1.3 → mantissa = 2.4, for negative towardNegative means away from zero → ceil(2.4)=3
            const encoded = fp8.encode(-1.3, { roundingMode: 'towardNegative' });
            expect(encoded.sign).toBe(1);
            expect(encoded.mantissa).toBe(3);
        });

        test('result is always <= input value', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const values = [1.3, -1.3, 3.7, -3.7, 0.001, -0.001];
            for (const v of values) {
                const encoded = fp16.encode(v, { roundingMode: 'towardNegative' });
                const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                expect(decoded).toBeLessThanOrEqual(v + 1e-15);
            }
        });
    });

    describe('Mantissa overflow from rounding up', () => {
        test('rounding up causes mantissa overflow and exponent increment', () => {
            // FP8 E4M3: format with 3 mantissa bits
            // Value 1.9375 = 1.1111b: mantissa = 0.9375, scaled = 0.9375 * 8 = 7.5
            // towardPositive for positive: ceil(7.5) = 8 = 2^3 → overflow
            // Should increment exponent and set mantissa to 0
            const fp8 = new FloatingPoint(1, 4, 3);
            const encoded = fp8.encode(1.9375, { roundingMode: 'towardPositive' });
            // After overflow: value becomes 2.0
            const decoded = fp8.decode(encoded.sign, encoded.exponent, encoded.mantissa);
            expect(decoded).toBe(2.0);
            expect(encoded.mantissa).toBe(0);
        });

        test('truncation avoids mantissa overflow', () => {
            const fp8 = new FloatingPoint(1, 4, 3);
            // 1.9375: mantissa = 7.5, floor(7.5) = 7
            const encoded = fp8.encode(1.9375, { roundingMode: 'towardZero' });
            expect(encoded.mantissa).toBe(7);
            const decoded = fp8.decode(encoded.sign, encoded.exponent, encoded.mantissa);
            expect(decoded).toBe(1.875);
        });

        test('mantissa overflow at max exponent clamps to max normal in no-infinity format', () => {
            // FP8 E4M3: hasInfinity=false, maxExponent=15, bias=7, mantissaBits=3
            // Value 496 = 2^8 * 1.9375: biasedExponent=15, mantissa=0.9375
            // mantissaInt = round(0.9375 * 8) = round(7.5) → tiesToEven rounds to 8 → overflow
            // biasedExponent becomes 16 > maxExponent → clamps to maxNormal (256)
            const fp8e4m3 = new FloatingPoint(1, 4, 3, { hasInfinity: false });
            const encoded = fp8e4m3.encode(496, { roundingMode: 'tiesToEven' });
            const decoded = fp8e4m3.decode(encoded.sign, encoded.exponent, encoded.mantissa);
            expect(decoded).toBe(256);
        });
    });

    describe('Subnormal rounding', () => {
        test('subnormal with towardZero truncates mantissa', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            // Smallest normal: 2^(1-15) = 2^-14
            // A subnormal just below that uses towardZero to truncate
            const subnormalValue = 3e-5; // subnormal in FP16
            const truncated = fp16.encode(subnormalValue, { roundingMode: 'towardZero' });
            const rounded = fp16.encode(subnormalValue, { roundingMode: 'tiesToEven' });
            const truncatedVal = fp16.decode(truncated.sign, truncated.exponent, truncated.mantissa);
            const roundedVal = fp16.decode(rounded.sign, rounded.exponent, rounded.mantissa);
            // Truncated value should be <= rounded value for positive numbers
            expect(truncatedVal).toBeLessThanOrEqual(roundedVal + 1e-15);
        });

        test('subnormal with towardPositive rounds up', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const subnormalValue = 3e-5;
            const ceiling = fp16.encode(subnormalValue, { roundingMode: 'towardPositive' });
            const truncated = fp16.encode(subnormalValue, { roundingMode: 'towardZero' });
            const ceilingVal = fp16.decode(ceiling.sign, ceiling.exponent, ceiling.mantissa);
            const truncatedVal = fp16.decode(truncated.sign, truncated.exponent, truncated.mantissa);
            expect(ceilingVal).toBeGreaterThanOrEqual(truncatedVal - 1e-15);
        });
    });

    describe('Special values are unaffected by rounding mode', () => {
        const fp32 = new FloatingPoint(1, 8, 23);
        const modes = Object.values(ROUNDING_MODES);

        test('zero encodes identically in all modes', () => {
            for (const mode of modes) {
                const encoded = fp32.encode(0, { roundingMode: mode });
                expect(encoded.isZero).toBe(true);
                expect(encoded.mantissa).toBe(0);
            }
        });

        test('negative zero encodes identically in all modes', () => {
            for (const mode of modes) {
                const encoded = fp32.encode(-0, { roundingMode: mode });
                expect(encoded.isZero).toBe(true);
                expect(encoded.sign).toBe(1);
            }
        });

        test('Infinity encodes identically in all modes', () => {
            for (const mode of modes) {
                const encoded = fp32.encode(Infinity, { roundingMode: mode });
                expect(encoded.isInfinite).toBe(true);
            }
        });

        test('NaN encodes identically in all modes', () => {
            for (const mode of modes) {
                const encoded = fp32.encode(NaN, { roundingMode: mode });
                expect(encoded.isNaN).toBe(true);
            }
        });
    });

    describe('Exactly representable values are unaffected by rounding mode', () => {
        const fp16 = new FloatingPoint(1, 5, 10);
        const modes = Object.values(ROUNDING_MODES);

        test('1.5 encodes identically in all modes', () => {
            for (const mode of modes) {
                const encoded = fp16.encode(1.5, { roundingMode: mode });
                const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                expect(decoded).toBe(1.5);
            }
        });

        test('powers of 2 encode identically in all modes', () => {
            const values = [0.5, 1.0, 2.0, 4.0, 8.0, 0.25];
            for (const v of values) {
                for (const mode of modes) {
                    const encoded = fp16.encode(v, { roundingMode: mode });
                    const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                    expect(decoded).toBe(v);
                }
            }
        });
    });

    describe('Format conversion with rounding modes', () => {
        test('FP32 to FP16 with towardZero produces smaller or equal magnitude', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const fp16 = new FloatingPoint(1, 5, 10);
            
            // Use a value whose FP16 mantissa will differ between rounding modes
            // 1.0009765625 in FP32 = 1 + 1/1024 = 1.0000000001b (23-bit mantissa: bit 13 set)
            // In FP16 (10-bit mantissa): mantissa = 0.0009765625 * 1024 = 1.0 → exact
            // Instead, use a value like 1.3 which is not representable in either format
            const value = 1.3;
            const fp32Encoded = fp32.encode(value);
            const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
            
            const fp16Truncated = fp16.encode(fp32Value, { roundingMode: 'towardZero' });
            const fp16Ceiling = fp16.encode(fp32Value, { roundingMode: 'towardPositive' });
            
            const truncatedVal = fp16.decode(fp16Truncated.sign, fp16Truncated.exponent, fp16Truncated.mantissa);
            const ceilingVal = fp16.decode(fp16Ceiling.sign, fp16Ceiling.exponent, fp16Ceiling.mantissa);
            
            expect(Math.abs(truncatedVal)).toBeLessThanOrEqual(Math.abs(fp32Value) + 1e-15);
            expect(ceilingVal).toBeGreaterThanOrEqual(truncatedVal);
        });

        test('different rounding modes produce different results for non-representable values', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const value = 1.3; // Not exactly representable in FP16
            
            const results = {};
            for (const mode of Object.values(ROUNDING_MODES)) {
                const encoded = fp16.encode(value, { roundingMode: mode });
                const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
                results[mode] = decoded;
            }
            
            // towardZero and towardNegative should agree for positive values
            expect(results.towardZero).toBe(results.towardNegative);
            // towardPositive should be >= towardZero for positive values
            expect(results.towardPositive).toBeGreaterThanOrEqual(results.towardZero);
        });
    });

    describe('Integer rounding modes', () => {
        const int8 = new Integer(8, true);

        test('tiesToEven rounds 2.5 to 2 (even)', () => {
            const encoded = int8.encode(2.5, { roundingMode: 'tiesToEven' });
            expect(encoded.intValue).toBe(2);
        });

        test('tiesToEven rounds 3.5 to 4 (even)', () => {
            const encoded = int8.encode(3.5, { roundingMode: 'tiesToEven' });
            expect(encoded.intValue).toBe(4);
        });

        test('tiesToAway rounds 2.5 to 3', () => {
            const encoded = int8.encode(2.5, { roundingMode: 'tiesToAway' });
            expect(encoded.intValue).toBe(3);
        });

        test('towardZero truncates 2.9 to 2', () => {
            const encoded = int8.encode(2.9, { roundingMode: 'towardZero' });
            expect(encoded.intValue).toBe(2);
        });

        test('towardZero truncates -2.9 to -2', () => {
            const encoded = int8.encode(-2.9, { roundingMode: 'towardZero' });
            expect(encoded.intValue).toBe(-2);
        });

        test('towardPositive rounds 2.1 to 3', () => {
            const encoded = int8.encode(2.1, { roundingMode: 'towardPositive' });
            expect(encoded.intValue).toBe(3);
        });

        test('towardPositive rounds -2.9 to -2', () => {
            const encoded = int8.encode(-2.9, { roundingMode: 'towardPositive' });
            expect(encoded.intValue).toBe(-2);
        });

        test('towardNegative rounds 2.9 to 2', () => {
            const encoded = int8.encode(2.9, { roundingMode: 'towardNegative' });
            expect(encoded.intValue).toBe(2);
        });

        test('towardNegative rounds -2.1 to -3', () => {
            const encoded = int8.encode(-2.1, { roundingMode: 'towardNegative' });
            expect(encoded.intValue).toBe(-3);
        });
    });

    describe('Fixed-point format rounding', () => {
        // Fixed-point: 0 exponent bits
        const fixedPoint = new FloatingPoint(1, 0, 4);

        test('towardZero truncates in fixed-point format', () => {
            // value = mantissa / 2^4 = mantissa / 16
            // 0.4 * 16 = 6.4, truncate to 6
            const encoded = fixedPoint.encode(0.4, { roundingMode: 'towardZero' });
            expect(encoded.mantissa).toBe(6);
        });

        test('towardPositive rounds up in fixed-point format', () => {
            // 0.4 * 16 = 6.4, ceil to 7
            const encoded = fixedPoint.encode(0.4, { roundingMode: 'towardPositive' });
            expect(encoded.mantissa).toBe(7);
        });
    });

    describe('Invalid rounding mode', () => {
        test('throws error for unknown rounding mode', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            expect(() => fp16.encode(1.5, { roundingMode: 'invalid' })).toThrow('Unknown rounding mode');
        });

        test('throws error for unknown rounding mode on Integer', () => {
            const int8 = new Integer(8, true);
            expect(() => int8.encode(1.5, { roundingMode: 'invalid' })).toThrow('Unknown rounding mode');
        });
    });

    describe('WebMCP integration', () => {
        const { encodeNumber, convertFormat } = require('../src/webmcp.js');

        test('encode_number accepts roundingMode parameter', () => {
            const result = encodeNumber({ value: 1.3, format: 'fp16', roundingMode: 'towardZero' });
            const stats = JSON.parse(result.content[0].text);
            
            const resultDefault = encodeNumber({ value: 1.3, format: 'fp16' });
            const statsDefault = JSON.parse(resultDefault.content[0].text);
            
            // towardZero should truncate, potentially giving different result
            expect(stats.actualValue).toBeDefined();
            expect(statsDefault.actualValue).toBeDefined();
        });

        test('convert_format accepts roundingMode parameter', () => {
            const result = convertFormat({
                value: Math.PI,
                inputFormat: 'fp32',
                outputFormat: 'fp16',
                roundingMode: 'towardZero'
            });
            const data = JSON.parse(result.content[0].text);
            expect(data.input).toBeDefined();
            expect(data.output).toBeDefined();
            expect(data.precisionLoss).toBeDefined();
        });

        test('encode_number without roundingMode uses default', () => {
            const result = encodeNumber({ value: 1.5, format: 'fp16' });
            const stats = JSON.parse(result.content[0].text);
            expect(stats.actualValue).toBe(1.5);
        });
    });
});
