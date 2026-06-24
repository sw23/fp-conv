// URL state serialization tests
const { FloatingPoint, Integer } = require('../lib/floating-point.js');
const {
    ROUNDING_MODE_VALUES,
    DEFAULT_ROUNDING_MODE,
    formatToParam,
    parseFormatParam,
    descriptorToFormat,
    decimalToString,
    parseDecimal,
    valueToParam,
    buildSearchParams,
    parseSearchParams,
} = require('../src/url-state.js');

describe('formatToParam', () => {
    test('serializes floating-point presets to their key', () => {
        expect(formatToParam(new FloatingPoint(1, 8, 23))).toBe('fp32');
        expect(formatToParam(new FloatingPoint(1, 5, 10))).toBe('fp16');
        expect(formatToParam(new FloatingPoint(1, 8, 7))).toBe('bf16');
    });

    test('serializes OCP presets (no infinity) to their key', () => {
        expect(formatToParam(new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: true }))).toBe('fp8_e4m3');
        expect(formatToParam(new FloatingPoint(1, 2, 1, { hasInfinity: false, hasNaN: false }))).toBe('fp4_e2m1');
    });

    test('serializes integer presets to their key', () => {
        expect(formatToParam(new Integer(8, true))).toBe('int8');
        expect(formatToParam(new Integer(4, false))).toBe('uint4');
        expect(formatToParam(new Integer(32, true))).toBe('int32');
    });

    test('serializes custom floating-point formats compactly', () => {
        expect(formatToParam(new FloatingPoint(1, 6, 9))).toBe('s1e6m9');
        expect(formatToParam(new FloatingPoint(0, 6, 9))).toBe('s0e6m9');
    });

    test('serializes custom flags for disabled infinity/NaN', () => {
        expect(formatToParam(new FloatingPoint(1, 5, 2, { hasInfinity: false }))).toBe('s1e5m2i0');
        expect(formatToParam(new FloatingPoint(1, 6, 9, { hasNaN: false }))).toBe('s1e6m9n0');
        expect(formatToParam(new FloatingPoint(1, 6, 9, { hasInfinity: false, hasNaN: false }))).toBe('s1e6m9i0n0');
    });

    test('serializes custom integer widths', () => {
        expect(formatToParam(new Integer(6, true))).toBe('i6');
        expect(formatToParam(new Integer(6, false))).toBe('u6');
    });
});

describe('parseFormatParam', () => {
    test('parses preset keys directly and normalized', () => {
        expect(parseFormatParam('fp32')).toEqual({ presetKey: 'fp32' });
        expect(parseFormatParam('FP16')).toEqual({ presetKey: 'fp16' });
        expect(parseFormatParam('FP8-E4M3')).toEqual({ presetKey: 'fp8_e4m3' });
        expect(parseFormatParam('int8')).toEqual({ presetKey: 'int8' });
    });

    test('parses custom floating-point specs', () => {
        expect(parseFormatParam('s1e6m9')).toEqual({
            kind: 'fp', signBits: 1, exponentBits: 6, mantissaBits: 9, hasInfinity: true, hasNaN: true,
        });
        expect(parseFormatParam('s0e5m2i0n0')).toEqual({
            kind: 'fp', signBits: 0, exponentBits: 5, mantissaBits: 2, hasInfinity: false, hasNaN: false,
        });
    });

    test('parses custom integer specs', () => {
        expect(parseFormatParam('i6')).toEqual({ kind: 'int', bits: 6, signed: true });
        expect(parseFormatParam('u6')).toEqual({ kind: 'int', bits: 6, signed: false });
    });

    test('returns null for malformed or out-of-range specs', () => {
        expect(parseFormatParam('')).toBeNull();
        expect(parseFormatParam(null)).toBeNull();
        expect(parseFormatParam('xyz')).toBeNull();
        expect(parseFormatParam('i99')).toBeNull();      // bits > 64
        expect(parseFormatParam('s1e20m5')).toBeNull();  // exponent > 15
        expect(parseFormatParam('s1e5m200')).toBeNull(); // mantissa > 112
    });
});

describe('descriptorToFormat', () => {
    test('builds preset formats', () => {
        const fp = descriptorToFormat({ presetKey: 'fp16' });
        expect(fp.exponentBits).toBe(5);
        expect(fp.mantissaBits).toBe(10);
        const int = descriptorToFormat({ presetKey: 'int8' });
        expect(int.isInteger).toBe(true);
        expect(int.bits).toBe(8);
        expect(int.signed).toBe(true);
    });

    test('builds custom formats', () => {
        const fp = descriptorToFormat({ kind: 'fp', signBits: 1, exponentBits: 6, mantissaBits: 9, hasInfinity: false, hasNaN: true });
        expect(fp.exponentBits).toBe(6);
        expect(fp.hasInfinity).toBe(false);
        const int = descriptorToFormat({ kind: 'int', bits: 6, signed: false });
        expect(int.bits).toBe(6);
        expect(int.signed).toBe(false);
    });

    test('returns null for empty descriptor', () => {
        expect(descriptorToFormat(null)).toBeNull();
    });

    test('round-trips through formatToParam/parseFormatParam', () => {
        const cases = [
            new FloatingPoint(1, 8, 23),
            new FloatingPoint(1, 6, 9),
            new FloatingPoint(1, 5, 2, { hasInfinity: false }),
            new Integer(8, true),
            new Integer(6, false),
        ];
        for (const format of cases) {
            const param = formatToParam(format);
            const desc = parseFormatParam(param);
            const rebuilt = descriptorToFormat(desc);
            expect(formatToParam(rebuilt)).toBe(param);
        }
    });
});

describe('decimalToString / parseDecimal', () => {
    test('handles non-finite keywords', () => {
        expect(decimalToString(Infinity)).toBe('inf');
        expect(decimalToString(-Infinity)).toBe('-inf');
        expect(decimalToString(NaN)).toBe('nan');
        expect(decimalToString(3.14)).toBe('3.14');
    });

    test('parses keywords and numbers', () => {
        expect(parseDecimal('inf')).toBe(Infinity);
        expect(parseDecimal('+inf')).toBe(Infinity);
        expect(parseDecimal('-inf')).toBe(-Infinity);
        expect(parseDecimal('infinity')).toBe(Infinity);
        expect(parseDecimal('nan')).toBeNaN();
        expect(parseDecimal('3.14')).toBe(3.14);
        expect(parseDecimal('-0.5')).toBe(-0.5);
    });

    test('returns null for unparseable input', () => {
        expect(parseDecimal('')).toBeNull();
        expect(parseDecimal('abc')).toBeNull();
        expect(parseDecimal(42)).toBeNull();
    });
});

describe('valueToParam', () => {
    test('uses decimal when re-encoding reproduces the bits', () => {
        const format = new FloatingPoint(1, 5, 10);
        const encoded = format.encode(1.0, { roundingMode: DEFAULT_ROUNDING_MODE });
        const result = valueToParam(format, 1.0, encoded, DEFAULT_ROUNDING_MODE);
        expect(result.key).toBe('val');
        expect(result.value).toBe('1');
    });

    test('falls back to hex when bits diverge from the decimal', () => {
        const format = new FloatingPoint(1, 5, 10);
        // A NaN with a payload that the canonical encode would not produce.
        const reEncoded = format.encode(NaN, { roundingMode: DEFAULT_ROUNDING_MODE });
        const payload = reEncoded.mantissa + 1; // still NaN (exp=31, mantissa != 0)
        const encoded = { sign: 0, exponent: 31, mantissa: payload };
        const result = valueToParam(format, NaN, encoded, DEFAULT_ROUNDING_MODE);
        expect(result.key).toBe('hex');
        expect(result.value).toBe(format.toHexString(0, 31, payload));
    });
});

describe('buildSearchParams', () => {
    function fp16State(value) {
        const inputFormat = new FloatingPoint(1, 8, 23); // fp32
        const outputFormat = new FloatingPoint(1, 5, 10); // fp16
        const currentEncoded = inputFormat.encode(value, { roundingMode: DEFAULT_ROUNDING_MODE });
        return { inputFormat, outputFormat, currentValue: value, currentEncoded, roundingMode: DEFAULT_ROUNDING_MODE };
    }

    test('builds in/out/val and omits the default rounding mode', () => {
        const qs = buildSearchParams(fp16State(1));
        expect(qs).toBe('in=fp32&out=fp16&val=1');
    });

    test('includes a non-default rounding mode', () => {
        const state = fp16State(1);
        state.roundingMode = 'towardZero';
        const params = new URLSearchParams(buildSearchParams(state));
        expect(params.get('rm')).toBe('towardZero');
    });
});

describe('parseSearchParams', () => {
    test('round-trips a built query string', () => {
        const inputFormat = new FloatingPoint(1, 8, 23);
        const outputFormat = new FloatingPoint(1, 5, 10);
        const currentEncoded = inputFormat.encode(2.5, { roundingMode: DEFAULT_ROUNDING_MODE });
        const qs = buildSearchParams({
            inputFormat, outputFormat, currentValue: 2.5, currentEncoded, roundingMode: 'towardNegative',
        });
        const parsed = parseSearchParams('?' + qs);
        expect(parsed.input).toEqual({ presetKey: 'fp32' });
        expect(parsed.output).toEqual({ presetKey: 'fp16' });
        expect(parsed.value).toEqual({ decimal: 2.5 });
        expect(parsed.roundingMode).toBe('towardNegative');
    });

    test('returns null when no recognized params are present', () => {
        expect(parseSearchParams('')).toBeNull();
        expect(parseSearchParams('?foo=bar')).toBeNull();
    });

    test('ignores malformed format and rounding values', () => {
        const parsed = parseSearchParams('?in=fp32&out=nonsense&rm=bogus');
        expect(parsed.input).toEqual({ presetKey: 'fp32' });
        expect(parsed.output).toBeNull();
        expect(parsed.roundingMode).toBeNull();
    });

    test('accepts a hex value and ignores val when hex is present', () => {
        const parsed = parseSearchParams('?hex=0x4248&val=99');
        expect(parsed.value).toEqual({ hex: '0x4248' });
    });

    test('ignores an invalid hex value', () => {
        const parsed = parseSearchParams('?in=fp16&hex=zzzz');
        expect(parsed.value).toBeNull();
        expect(parsed.input).toEqual({ presetKey: 'fp16' });
    });

    test('supports partial state (value only)', () => {
        const parsed = parseSearchParams('?val=-inf');
        expect(parsed.value).toEqual({ decimal: -Infinity });
        expect(parsed.input).toBeNull();
        expect(parsed.output).toBeNull();
    });

    test('exposes the canonical rounding mode list', () => {
        expect(ROUNDING_MODE_VALUES).toContain('tiesToEven');
        expect(ROUNDING_MODE_VALUES).toContain('towardPositive');
        expect(ROUNDING_MODE_VALUES).toHaveLength(5);
    });
});
