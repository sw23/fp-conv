// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// URL state serialization tests
const { FloatingPoint, Integer } = require('../lib/floating-point.js');
const {
    ROUNDING_MODE_VALUES,
    DEFAULT_ROUNDING_MODE,
    OVERFLOW_MODE_VALUES,
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

    test('supports custom integer widths up to 64 bits', () => {
        expect(parseFormatParam('i64')).toEqual({ kind: 'int', bits: 64, signed: true });
        expect(parseFormatParam('u64')).toEqual({ kind: 'int', bits: 64, signed: false });
        expect(parseFormatParam('i65')).toBeNull();
    });

    test('supports custom mantissa widths up to 112 bits', () => {
        expect(parseFormatParam('s1e5m112')).toEqual({
            kind: 'fp', signBits: 1, exponentBits: 5, mantissaBits: 112, hasInfinity: true, hasNaN: true,
        });
        expect(parseFormatParam('s1e5m113')).toBeNull();
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

    test('preserves negative zero through a share link', () => {
        expect(decimalToString(-0)).toBe('-0');
        expect(decimalToString(0)).toBe('0');
        expect(Object.is(parseDecimal('-0'), -0)).toBe(true);
    });

    test('parses keywords and numbers', () => {
        expect(parseDecimal('inf')).toBe(Infinity);
        expect(parseDecimal('+inf')).toBe(Infinity);
        expect(parseDecimal('-inf')).toBe(-Infinity);
        expect(parseDecimal('infinity')).toBe(Infinity);
        expect(parseDecimal('nan')).toBeNaN();
        expect(parseDecimal('-nan')).toBeNaN();
        expect(parseDecimal('+nan')).toBeNaN();
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
        expect(parsed.value).toEqual({ decimal: 2.5, text: '2.5' });
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
        expect(parsed.value).toEqual({ decimal: -Infinity, text: '-inf' });
        expect(parsed.input).toBeNull();
        expect(parsed.output).toBeNull();
    });

    test('exposes the canonical rounding mode list', () => {
        expect(ROUNDING_MODE_VALUES).toContain('tiesToEven');
        expect(ROUNDING_MODE_VALUES).toContain('towardPositive');
        expect(ROUNDING_MODE_VALUES).toHaveLength(5);
    });
});

// ── Overflow mode and the new format options ─────────────────

describe('overflow mode in the URL', () => {
    const baseState = () => {
        const inputFormat = FloatingPoint.fromFormat('fp32');
        const currentValue = 1.5;
        return {
            inputFormat,
            outputFormat: FloatingPoint.fromFormat('fp16'),
            currentValue,
            currentEncoded: inputFormat.encode(currentValue),
            roundingMode: 'tiesToEven',
        };
    };

    test('exposes the canonical overflow mode list', () => {
        expect(OVERFLOW_MODE_VALUES).toEqual(['saturate', 'overflow']);
    });

    test('om is omitted when the state is null (format default)', () => {
        const query = buildSearchParams({ ...baseState(), overflowMode: null });
        expect(query).not.toContain('om=');
    });

    test('om is emitted on an explicit choice', () => {
        for (const mode of OVERFLOW_MODE_VALUES) {
            const query = buildSearchParams({ ...baseState(), overflowMode: mode });
            expect(query).toContain(`om=${mode}`);
        }
    });

    test('om round-trips through parseSearchParams', () => {
        for (const mode of OVERFLOW_MODE_VALUES) {
            expect(parseSearchParams(`?om=${mode}`).overflowMode).toBe(mode);
        }
    });

    test('an invalid om is discarded silently', () => {
        expect(parseSearchParams('?in=fp16&om=bogus').overflowMode).toBeNull();
    });

    test('om alone is enough to count as state', () => {
        const parsed = parseSearchParams('?om=saturate');
        expect(parsed).not.toBeNull();
        expect(parsed.overflowMode).toBe('saturate');
        expect(parsed.input).toBeNull();
    });

    test('an empty search still parses to null', () => {
        expect(parseSearchParams('')).toBeNull();
    });

    test('the overflow mode reaches the faithfulness re-encode', () => {
        const format = FloatingPoint.fromFormat('fp32');
        const saturated = format.encode(1e40, { overflowMode: 'saturate' });
        // Under saturate the decimal re-encodes to the same bits, so the link
        // can carry the decimal; under the default it would not.
        expect(valueToParam(format, 1e40, saturated, 'tiesToEven', 'saturate').key).toBe('val');
        expect(valueToParam(format, 1e40, saturated, 'tiesToEven', 'overflow').key).toBe('hex');
    });
});

describe('E8M0 and MXINT8 in the URL', () => {
    test('the e8m0 preset round-trips', () => {
        const format = descriptorToFormat(parseFormatParam('e8m0'));
        expect(format.hasSubnormals).toBe(false);
        expect(format.bias).toBe(127);
        expect(formatToParam(format)).toBe('e8m0');
    });

    test('the mxint8 preset round-trips and does not collapse into int8', () => {
        const format = descriptorToFormat(parseFormatParam('mxint8'));
        expect(format.fractionBits).toBe(6);
        expect(format.symmetric).toBe(true);
        expect(formatToParam(format)).toBe('mxint8');
        // ... and the reverse: a plain INT8 must not become MXINT8.
        expect(formatToParam(new Integer(8, true))).toBe('int8');
        expect(formatToParam(descriptorToFormat(parseFormatParam('int8')))).toBe('int8');
    });

    test('a custom s0e8m0i0 WITH subnormals stays custom', () => {
        const desc = parseFormatParam('s0e8m0i0');
        expect(desc.hasSubnormals).toBeUndefined();
        const format = descriptorToFormat(desc);
        expect(format.hasSubnormals).toBe(true);
        expect(formatToParam(format)).toBe('s0e8m0i0');
    });

    test('the d0 token disables subnormals and round-trips', () => {
        const desc = parseFormatParam('s0e8m0i0d0');
        expect(desc.hasSubnormals).toBe(false);
        const format = descriptorToFormat(desc);
        expect(format.hasSubnormals).toBe(false);
        // The bit signature now matches the e8m0 preset, so it serializes to it.
        expect(formatToParam(format)).toBe('e8m0');
    });

    test('d1 is accepted as the explicit positive form', () => {
        expect(parseFormatParam('s1e5m10d1').hasSubnormals).toBeUndefined();
        expect(descriptorToFormat(parseFormatParam('s1e5m10d1')).hasSubnormals).toBe(true);
    });

    test('the q token carries an implicit integer scale', () => {
        const desc = parseFormatParam('i8q6');
        expect(desc).toEqual({ kind: 'int', bits: 8, signed: true, fractionBits: 6 });
        const format = descriptorToFormat(desc);
        expect(format.fractionBits).toBe(6);
        expect(format.symmetric).toBe(false);
        // Not the mxint8 preset: that one is symmetric.
        expect(formatToParam(format)).toBe('i8q6');
    });

    test('a custom scaled integer is NOT symmetric, before or after a round trip', () => {
        // The grammar has no slot for symmetry, so a custom integer must be
        // non-symmetric on both sides of the link. A live format that claimed
        // otherwise would serialize to a token describing a different range.
        const custom = descriptorToFormat(parseFormatParam('i9q6'));
        expect(custom.symmetric).toBe(false);
        expect(custom.minRealValue).toBe(-4);
        expect(custom.maxRealValue).toBe(3.984375);
        expect(formatToParam(custom)).toBe('i9q6');

        // Symmetry survives only under the named preset.
        const mxint8 = descriptorToFormat(parseFormatParam('mxint8'));
        expect(mxint8.symmetric).toBe(true);
        expect(mxint8.minRealValue).toBe(-1.984375);
        expect(formatToParam(mxint8)).toBe('mxint8');
    });

    test('a q token wider than the format is rejected', () => {
        expect(parseFormatParam('i8q8')).toBeNull();
        expect(parseFormatParam('i8q9')).toBeNull();
    });

    test('an unsigned scaled integer round-trips', () => {
        const format = descriptorToFormat(parseFormatParam('u8q4'));
        expect(format.signed).toBe(false);
        expect(formatToParam(format)).toBe('u8q4');
    });
});
