// Pure-logic unit tests for formats/format-common.js
// These tests don't require a DOM environment.
const { FloatingPoint } = require('../lib/floating-point.js');
const {
    FORMAT_PAGES,
    GROUP_LABELS,
    formatValue,
    formatAxisLabel,
    computeNiceTicks,
    generatePositiveValues,
} = require('../formats/format-common.js');

// ── FORMAT_PAGES and GROUP_LABELS ────────────────────────────

describe('FORMAT_PAGES', () => {
    test('contains all expected format keys', () => {
        const expected = [
            'fp64', 'fp32', 'fp16', 'bf16', 'tf32',
            'fp8_e5m2', 'fp8_e4m3', 'fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1',
            'int32', 'int16', 'int8', 'int4',
        ];
        for (const key of expected) {
            expect(FORMAT_PAGES[key]).toBeDefined();
            expect(FORMAT_PAGES[key].file).toMatch(/\.html$/);
            expect(FORMAT_PAGES[key].label).toBeTruthy();
            expect(FORMAT_PAGES[key].group).toBeTruthy();
        }
    });

    test('every group key has a label', () => {
        const groups = new Set(Object.values(FORMAT_PAGES).map(p => p.group));
        for (const g of groups) {
            expect(GROUP_LABELS[g]).toBeTruthy();
        }
    });
});

// ── formatValue ──────────────────────────────────────────────

describe('formatValue', () => {
    test('Infinity', () => {
        expect(formatValue(Infinity)).toBe('+Infinity');
    });

    test('-Infinity', () => {
        expect(formatValue(-Infinity)).toBe('-Infinity');
    });

    test('NaN', () => {
        expect(formatValue(NaN)).toBe('NaN');
    });

    test('-0', () => {
        expect(formatValue(-0)).toBe('-0');
    });

    test('positive zero', () => {
        expect(formatValue(0)).toBe('0');
    });

    test('normal range integer', () => {
        expect(formatValue(42)).toBe('42');
    });

    test('normal range decimal', () => {
        const result = formatValue(3.14);
        expect(result).toBe('3.14');
    });

    test('one', () => {
        expect(formatValue(1)).toBe('1');
    });

    test('negative number', () => {
        const result = formatValue(-2.5);
        expect(result).toBe('-2.5');
    });

    test('very large number uses scientific notation', () => {
        const result = formatValue(1e15);
        expect(result).toMatch(/e\+/i);
    });

    test('very small number', () => {
        const result = formatValue(1e-6);
        expect(result).toBe('0.000001');
    });

    test('boundary: 1e10 uses scientific notation', () => {
        const result = formatValue(1e10);
        expect(result).toMatch(/e\+/i);
    });

    test('boundary: just under 1e10 uses normal notation', () => {
        const result = formatValue(9999999999);
        expect(result).not.toMatch(/e/i);
    });

    test('small positive below 1e-4', () => {
        const result = formatValue(0.00005);
        expect(result).toBe('0.00005');
    });

    test('extremely small number uses scientific notation', () => {
        const result = formatValue(1e-20);
        expect(result).toMatch(/e-/i);
    });
});

// ── formatAxisLabel ──────────────────────────────────────────

describe('formatAxisLabel', () => {
    test('zero', () => {
        expect(formatAxisLabel(0)).toBe('0');
    });

    test('trillions', () => {
        const result = formatAxisLabel(2e12);
        expect(result).toBe('2T');
    });

    test('trillions with fraction', () => {
        const result = formatAxisLabel(1.5e12);
        expect(result).toBe('1.5T');
    });

    test('billions', () => {
        expect(formatAxisLabel(3e9)).toBe('3B');
    });

    test('billions with fraction', () => {
        expect(formatAxisLabel(1.5e9)).toBe('1.5B');
    });

    test('millions', () => {
        expect(formatAxisLabel(5e6)).toBe('5M');
    });

    test('millions with fraction', () => {
        expect(formatAxisLabel(2.5e6)).toBe('2.5M');
    });

    test('ten-thousands', () => {
        const result = formatAxisLabel(10000);
        expect(result).toBe('10K');
    });

    test('50000 → 50K', () => {
        expect(formatAxisLabel(50000)).toBe('50K');
    });

    test('thousands', () => {
        const result = formatAxisLabel(1500);
        expect(result).toBe('1.5K');
    });

    test('exact thousand', () => {
        expect(formatAxisLabel(1000)).toBe('1K');
    });

    test('values >= 1 use toPrecision(3)', () => {
        const result = formatAxisLabel(42.7);
        expect(result).toBe('42.7');
    });

    test('integer value >= 1', () => {
        expect(formatAxisLabel(100)).toBe('100');
    });

    test('small value >= 0.001', () => {
        const result = formatAxisLabel(0.005);
        expect(result).toBe('0.005');
    });

    test('very small value uses exponential', () => {
        const result = formatAxisLabel(0.0001);
        expect(result).toMatch(/e-/i);
    });

    test('very large value >= 1e15 uses exponential', () => {
        const result = formatAxisLabel(1e15);
        expect(result).toMatch(/e\+/i);
    });

    test('negative values handled', () => {
        const result = formatAxisLabel(-5e6);
        expect(result).toBe('-5M');
    });
});

// ── computeNiceTicks ─────────────────────────────────────────

describe('computeNiceTicks', () => {
    test('maxVal=0 returns [0]', () => {
        expect(computeNiceTicks(0, 5)).toEqual([0]);
    });

    test('Infinity returns [0]', () => {
        expect(computeNiceTicks(Infinity, 5)).toEqual([0]);
    });

    test('NaN returns [0]', () => {
        expect(computeNiceTicks(NaN, 5)).toEqual([0]);
    });

    test('returns array starting with 0', () => {
        const ticks = computeNiceTicks(100, 5);
        expect(ticks[0]).toBe(0);
    });

    test('all ticks are <= maxVal * 1.05', () => {
        const maxVal = 100;
        const ticks = computeNiceTicks(maxVal, 5);
        for (const t of ticks) {
            expect(t).toBeLessThanOrEqual(maxVal * 1.05);
        }
    });

    test('produces multiple ticks for reasonable input', () => {
        const ticks = computeNiceTicks(1000, 4);
        expect(ticks.length).toBeGreaterThan(1);
    });

    test('ticks are monotonically increasing', () => {
        const ticks = computeNiceTicks(500, 5);
        for (let i = 1; i < ticks.length; i++) {
            expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
        }
    });

    test('tick steps are "nice" numbers (1, 2, 5 × 10^n)', () => {
        const ticks = computeNiceTicks(100, 5);
        if (ticks.length >= 2) {
            const step = ticks[1] - ticks[0];
            // Step should be one of: 1, 2, 5, 10, 20, 50, 100, ...
            const log = Math.log10(step);
            const magnitude = Math.pow(10, Math.floor(log));
            const normalized = step / magnitude;
            expect([1, 2, 5, 10]).toContain(Math.round(normalized));
        }
    });

    test('small maxVal', () => {
        const ticks = computeNiceTicks(0.5, 3);
        expect(ticks[0]).toBe(0);
        expect(ticks.length).toBeGreaterThan(1);
        for (const t of ticks) {
            expect(t).toBeLessThanOrEqual(0.5 * 1.05);
        }
    });
});

// ── generatePositiveValues ───────────────────────────────────

describe('generatePositiveValues', () => {
    test('FP4 E2M1: produces all 8 positive values (exhaustive)', () => {
        // FP4 E2M1: sign=1, exp=2, mant=1, bias=1, no inf, no nan
        const fp = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
        const data = generatePositiveValues(fp);

        // maxExp=3, mantCount=2 → 8 total positive patterns
        expect(data.length).toBe(8);

        // All should have required fields
        for (const d of data) {
            expect(d).toHaveProperty('globalIndex');
            expect(d).toHaveProperty('exponent');
            expect(d).toHaveProperty('mantissa');
            expect(d).toHaveProperty('value');
            expect(d).toHaveProperty('isSubnormal');
            expect(d).toHaveProperty('step');
        }

        // First should be zero (exp=0, mant=0)
        expect(data[0].value).toBe(0);
        expect(data[0].isSubnormal).toBe(true);

        // Values should be non-decreasing
        for (let i = 1; i < data.length; i++) {
            expect(data[i].value).toBeGreaterThanOrEqual(data[i - 1].value);
        }
    });

    test('FP8 E4M3 (OCP): produces correct count', () => {
        // FP8 E4M3: sign=1, exp=4, mant=3, bias=7, no inf, has nan
        const fp = new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true });
        const data = generatePositiveValues(fp);

        // maxExp=15, mantCount=8 → 128 total, minus 1 NaN = 127
        // NaN is exp=15, mant=7 (all-ones), so it's skipped
        expect(data.length).toBe(127);

        // No Infinity or NaN values in the data
        for (const d of data) {
            expect(isFinite(d.value)).toBe(true);
            expect(isNaN(d.value)).toBe(false);
        }
    });

    test('FP8 E5M2 (IEEE-like): excludes Inf and NaN', () => {
        // FP8 E5M2: sign=1, exp=5, mant=2, bias=15, has inf, has nan
        const fp = new FloatingPoint(1, 5, 2, { bias: 15, hasInfinity: true, hasNaN: true });
        const data = generatePositiveValues(fp);

        // All values should be finite
        for (const d of data) {
            expect(isFinite(d.value)).toBe(true);
        }
    });

    test('FP16: samples when too many points (> 2000)', () => {
        const fp = new FloatingPoint(1, 5, 10, {});
        const data = generatePositiveValues(fp);

        // maxExp=31, mantCount=1024 → 32768 total, way over 2000
        expect(data.length).toBeLessThanOrEqual(2000);
        expect(data.length).toBeGreaterThan(100);

        // Should include subnormals
        const subnormals = data.filter(d => d.isSubnormal);
        expect(subnormals.length).toBeGreaterThan(0);

        // Should include normals
        const normals = data.filter(d => !d.isSubnormal);
        expect(normals.length).toBeGreaterThan(0);
    });

    test('step sizes are positive for all non-zero values', () => {
        const fp = new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true });
        const data = generatePositiveValues(fp);

        for (const d of data) {
            expect(d.step).toBeGreaterThan(0);
        }
    });

    test('subnormal entries have consistent step size', () => {
        const fp = new FloatingPoint(1, 5, 2, { bias: 15, hasInfinity: true, hasNaN: true });
        const data = generatePositiveValues(fp);
        const subs = data.filter(d => d.isSubnormal && d.mantissa > 0);

        if (subs.length > 1) {
            // All subnormals should have the same step
            const firstStep = subs[0].step;
            for (const s of subs) {
                expect(s.step).toBe(firstStep);
            }
        }
    });

    test('globalIndex is consistent', () => {
        const fp = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
        const data = generatePositiveValues(fp);
        const mantCount = 2;

        for (const d of data) {
            expect(d.globalIndex).toBe(d.exponent * mantCount + d.mantissa);
        }
    });
});
