// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// WebMCP integration tests
const { FloatingPoint, Integer, FORMATS, CONVERSION_LOSS_KINDS } = require('../lib/floating-point.js');
const {
    resolveFormat,
    exponentActual,
    parseValueInput,
    jsonSafeNumber,
    buildStats,
    extractComponents,
    listFormats,
    encodeNumber,
    decodeBits,
    convertFormat,
    getFormatInfo,
    buildToolDescriptors,
    toolError,
    withToolErrors,
    registerWebMCP,
} = require('../src/webmcp.js');

// ── resolveFormat ─────────────────────────────────────────────────

describe('resolveFormat', () => {
    test('resolves a floating-point preset key', () => {
        const fmt = resolveFormat('fp32');
        expect(fmt).toBeInstanceOf(FloatingPoint);
        expect(fmt.signBits).toBe(1);
        expect(fmt.exponentBits).toBe(8);
        expect(fmt.mantissaBits).toBe(23);
    });

    test('resolves an integer preset key', () => {
        const fmt = resolveFormat('int8');
        expect(fmt).toBeInstanceOf(Integer);
        expect(fmt.bits).toBe(8);
        expect(fmt.signed).toBe(true);
    });

    test('resolves unsigned integer preset', () => {
        const fmt = resolveFormat('uint16');
        expect(fmt).toBeInstanceOf(Integer);
        expect(fmt.bits).toBe(16);
        expect(fmt.signed).toBe(false);
    });

    test('resolves OCP format with custom bias', () => {
        const fmt = resolveFormat('fp4_e2m1');
        expect(fmt).toBeInstanceOf(FloatingPoint);
        expect(fmt.bias).toBe(1);
        expect(fmt.hasInfinity).toBe(false);
        expect(fmt.hasNaN).toBe(false);
    });

    test('normalizes hyphenated and mixed-case preset keys', () => {
        const fmt = resolveFormat('FP8-E4M3');
        expect(fmt).toBeInstanceOf(FloatingPoint);
        expect(fmt.exponentBits).toBe(4);
        expect(fmt.mantissaBits).toBe(3);
        // Hyphen-only and case-only variants resolve to the same canonical key.
        expect(resolveFormat('fp8-e4m3').exponentBits).toBe(4);
        expect(resolveFormat('FP32').mantissaBits).toBe(23);
    });

    test('resolves a custom floating-point object', () => {
        const fmt = resolveFormat({ signBits: 1, exponentBits: 6, mantissaBits: 9 });
        expect(fmt).toBeInstanceOf(FloatingPoint);
        expect(fmt.totalBits).toBe(16);
    });

    test('resolves a custom integer object', () => {
        const fmt = resolveFormat({ bits: 12, signed: false });
        expect(fmt).toBeInstanceOf(Integer);
        expect(fmt.bits).toBe(12);
        expect(fmt.signed).toBe(false);
    });

    test('resolves integer object with isInteger flag', () => {
        const fmt = resolveFormat({ bits: 8, signed: true, isInteger: true });
        expect(fmt).toBeInstanceOf(Integer);
    });

    test('defaults signed to true for custom integer', () => {
        const fmt = resolveFormat({ bits: 6 });
        expect(fmt).toBeInstanceOf(Integer);
        expect(fmt.signed).toBe(true);
    });

    test('throws on unknown preset key', () => {
        expect(() => resolveFormat('fp99')).toThrow(/Unknown format preset/);
    });

    test('throws on missing required fields in custom float', () => {
        expect(() => resolveFormat({ signBits: 1 })).toThrow(/exponentBits/);
    });

    test('throws on invalid integer bits', () => {
        expect(() => resolveFormat({ bits: 0 })).toThrow(/between 1 and 64/);
        expect(() => resolveFormat({ bits: 100 })).toThrow(/between 1 and 64/);
        expect(() => resolveFormat({ bits: 65 })).toThrow(/between 1 and 64/);
    });

    test('a flag that is given must be a boolean: the string "false" is truthy', () => {
        expect(() => resolveFormat({ bits: 8, signed: 'false' })).toThrow(/"signed" must be true or false/);
        expect(() => resolveFormat({ bits: 8, symmetric: 'yes' })).toThrow(/"symmetric"/);
        for (const flag of ['hasInfinity', 'hasNaN', 'hasSubnormals']) {
            expect(() => resolveFormat({ signBits: 1, exponentBits: 5, mantissaBits: 2, [flag]: 'false' }))
                .toThrow(new RegExp(`"${flag}" must be true or false`));
        }
        expect(resolveFormat({ bits: 8, signed: false }).signed).toBe(false);
        expect(resolveFormat({ bits: 8 }).signed).toBe(true);
    });

    test('supports custom integer widths up to 64 bits', () => {
        const fmt = resolveFormat({ bits: 64, signed: false });
        expect(fmt).toBeInstanceOf(Integer);
        expect(fmt.bits).toBe(64);
    });

    test('throws on non-string non-object input', () => {
        expect(() => resolveFormat(42)).toThrow(/preset key string/);
        expect(() => resolveFormat(null)).toThrow(/preset key string/);
    });
});

// ── parseValueInput ───────────────────────────────────────────────

describe('parseValueInput', () => {
    test('passes through numbers directly', () => {
        expect(parseValueInput(3.14)).toBe(3.14);
        expect(parseValueInput(0)).toBe(0);
        expect(parseValueInput(-42)).toBe(-42);
    });

    test('parses special keywords', () => {
        expect(parseValueInput('infinity')).toBe(Infinity);
        expect(parseValueInput('+Infinity')).toBe(Infinity);
        expect(parseValueInput('+inf')).toBe(Infinity);
        expect(parseValueInput('inf')).toBe(Infinity);
        expect(parseValueInput('-infinity')).toBe(-Infinity);
        expect(parseValueInput('-inf')).toBe(-Infinity);
        expect(parseValueInput('NaN')).toBe(NaN);
    });

    test('parses hex strings', () => {
        expect(parseValueInput('0xFF')).toBe(255);
        expect(parseValueInput('0x10')).toBe(16);
    });

    test('parses decimal strings', () => {
        expect(parseValueInput('3.14')).toBe(3.14);
        expect(parseValueInput('-100')).toBe(-100);
    });

    test('throws on invalid strings', () => {
        expect(() => parseValueInput('hello')).toThrow(/Cannot parse value/);
    });

    test('throws on invalid hex', () => {
        expect(() => parseValueInput('0xZZZZ')).toThrow(/Invalid hex/);
    });

    test('throws on hex with trailing garbage', () => {
        expect(() => parseValueInput('0x12zz')).toThrow(/Invalid hex/);
    });

    test('throws on empty or whitespace input', () => {
        expect(() => parseValueInput('')).toThrow(/empty/);
        expect(() => parseValueInput('   ')).toThrow(/empty/);
    });

    test('throws on hex beyond the safe integer range', () => {
        expect(() => parseValueInput('0xFFFFFFFFFFFFFFFF')).toThrow(/safe integer/);
    });

    test('throws on non-number non-string', () => {
        expect(() => parseValueInput([])).toThrow(/number or string/);
    });
});

// ── typeLabel() ─────────────────────────────────────────────────

describe('typeLabel()', () => {
    test('classifies integer values', () => {
        const fmt = new Integer(8, true);
        expect(fmt.typeLabel(0, 0, 0)).toBe('Zero');
        expect(fmt.typeLabel(0, 0, 42)).toBe('Positive Integer');
        expect(fmt.typeLabel(0, 0, 200)).toBe('Negative Integer'); // two's complement
    });

    test('classifies floating-point normal', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(fmt.typeLabel(0, 127, 0)).toBe('Normal');
    });

    test('classifies floating-point zero', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(fmt.typeLabel(0, 0, 0)).toBe('+Zero');
        expect(fmt.typeLabel(1, 0, 0)).toBe('-Zero');
    });

    test('classifies subnormal', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(fmt.typeLabel(0, 0, 1)).toBe('Subnormal');
    });

    test('classifies infinity', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(fmt.typeLabel(0, 255, 0)).toBe('+Infinity');
        expect(fmt.typeLabel(1, 255, 0)).toBe('-Infinity');
    });

    test('classifies NaN', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(fmt.typeLabel(0, 255, 1)).toBe('NaN');
    });

    test('classifies fixed-point', () => {
        const fmt = new FloatingPoint(1, 0, 7);
        expect(fmt.typeLabel(0, 0, 0)).toBe('+Zero');
        expect(fmt.typeLabel(0, 0, 10)).toBe('Fixed-point');
    });

    test('classifies maxExponent as Normal when no special values', () => {
        const fmt = new FloatingPoint(1, 3, 2, { hasInfinity: false, hasNaN: false, bias: 3 });
        // maxExponent=7, mantissa=3 — no special values, so it's Normal
        expect(fmt.typeLabel(0, 7, 3)).toBe('Normal');
    });

    test('classifies negative fixed-point zero', () => {
        const fmt = new FloatingPoint(1, 0, 7);
        expect(fmt.typeLabel(1, 0, 0)).toBe('-Zero');
    });
});

// ── significand() ───────────────────────────────────────────────

describe('significand()', () => {
    test('returns integer value for integer format', () => {
        const fmt = new Integer(8, true);
        expect(fmt.significand(0, 42)).toBe(42);
    });

    test('returns 1.x for normal float', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        const result = fmt.significand(127, 0);
        expect(result).toBe(1.0);
    });

    test('returns 0.x for subnormal float', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        const result = fmt.significand(0, 1);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(1);
    });

    test('returns 0 or 1 for zero mantissa bits', () => {
        const fmt = new FloatingPoint(0, 8, 0);
        expect(fmt.significand(0, 0)).toBe(0);
        expect(fmt.significand(1, 0)).toBe(1.0);
    });
});

// ── exponentActual ────────────────────────────────────────────────

describe('exponentActual', () => {
    test('returns N/A for integer format', () => {
        const fmt = new Integer(8, true);
        expect(exponentActual(fmt, 0)).toBe('N/A');
    });

    test('returns N/A for zero exponent bits', () => {
        const fmt = new FloatingPoint(1, 0, 7);
        expect(exponentActual(fmt, 0)).toBe('N/A');
    });

    test('returns subnormal formula for exponent 0', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(exponentActual(fmt, 0)).toBe('1 - 127 = -126');
    });

    test('returns Special for max exponent', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(exponentActual(fmt, 255)).toBe('Special');
    });

    test('returns actual exponent for normal values', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        expect(exponentActual(fmt, 127)).toBe('127 - 127 = 0');
        expect(exponentActual(fmt, 128)).toBe('128 - 127 = 1');
    });

    test('returns actual exponent for OCP format at max exponent (no special values)', () => {
        const fmt = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
        // maxExponent = 3, but no special values reserved
        expect(exponentActual(fmt, 3)).toBe('3 - 1 = 2');
    });
});

// ── jsonSafeNumber ────────────────────────────────────────────────

describe('jsonSafeNumber', () => {
    test('passes through normal numbers', () => {
        expect(jsonSafeNumber(42)).toBe(42);
        expect(jsonSafeNumber(-3.14)).toBe(-3.14);
        expect(jsonSafeNumber(0)).toBe(0);
    });

    test('converts Infinity to string', () => {
        expect(jsonSafeNumber(Infinity)).toBe('Infinity');
    });

    test('converts -Infinity to string', () => {
        expect(jsonSafeNumber(-Infinity)).toBe('-Infinity');
    });

    test('converts NaN to string', () => {
        expect(jsonSafeNumber(NaN)).toBe('NaN');
    });
});

// ── extractComponents ─────────────────────────────────────────────

describe('extractComponents', () => {
    test('extracts from FP16 binary string', () => {
        const fmt = new FloatingPoint(1, 5, 10);
        // Sign=0, Exp=01111 (15), Mant=0000000000
        const result = extractComponents('0011110000000000', fmt);
        expect(result.sign).toBe(0);
        expect(result.exponent).toBe(15);
        expect(result.mantissa).toBe(0);
    });

    test('extracts from integer binary string', () => {
        const fmt = new Integer(8, true);
        const result = extractComponents('11111010', fmt);
        expect(result.sign).toBe(0);
        expect(result.exponent).toBe(0);
        expect(result.mantissa).toBe(0b11111010);
    });

    test('handles format with no sign bit', () => {
        const fmt = new FloatingPoint(0, 8, 0);
        const result = extractComponents('10000001', fmt);
        expect(result.sign).toBe(0);
        expect(result.exponent).toBe(129);
    });
});

// ── buildStats ────────────────────────────────────────────────────

describe('buildStats', () => {
    test('builds stats for a normal FP32 value', () => {
        const fmt = new FloatingPoint(1, 8, 23);
        const encoded = fmt.encode(1.5);
        const stats = buildStats(fmt, encoded);

        expect(stats.binary).toBeDefined();
        expect(stats.hex).toBeDefined();
        expect(stats.sign).toBe(0);
        expect(stats.type).toBe('Normal');
        expect(stats.actualValue).toBe(1.5);
        expect(stats.exponentBiased).toBeDefined();
        expect(stats.exponentActual).toBeDefined();
        expect(stats.mantissaDecimal).toBeDefined();
        expect(stats.totalBits).toBe(32);
        expect(stats.signBits).toBe(1);
        expect(stats.exponentBits).toBe(8);
        expect(stats.mantissaBits).toBe(23);
        expect(stats.bias).toBe(127);
    });

    test('builds stats for an integer value', () => {
        const fmt = new Integer(8, true);
        const encoded = fmt.encode(42);
        const stats = buildStats(fmt, encoded);

        expect(stats.actualValue).toBe(42);
        expect(stats.totalBits).toBe(8);
        expect(stats.signed).toBe(true);
        expect(stats.type).toBe('Positive Integer');
        // Integer stats should NOT have floating-point fields
        expect(stats.exponentBiased).toBeUndefined();
    });
});

// ── listFormats tool ──────────────────────────────────────────────

describe('listFormats', () => {
    test('returns MCP content with all format presets', () => {
        const result = listFormats();
        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const formats = JSON.parse(result.content[0].text);
        expect(Array.isArray(formats)).toBe(true);

        // Check a few known formats exist
        const keys = formats.map(f => f.key);
        expect(keys).toContain('fp32');
        expect(keys).toContain('fp16');
        expect(keys).toContain('bf16');
        expect(keys).toContain('int8');
        expect(keys).toContain('uint4');
        expect(keys).toContain('fp4_e2m1');
    });

    test('each format has required fields', () => {
        const formats = JSON.parse(listFormats().content[0].text);

        for (const f of formats) {
            expect(f).toHaveProperty('key');
            expect(f).toHaveProperty('name');
            expect(f).toHaveProperty('category');

            if (f.isInteger) {
                expect(f).toHaveProperty('bits');
                expect(typeof f.signed).toBe('boolean');
            } else {
                expect(f).toHaveProperty('exponentBits');
                expect(f).toHaveProperty('mantissaBits');
                expect(f).toHaveProperty('totalBits');
            }
        }
    });

    test('includes all four categories', () => {
        const formats = JSON.parse(listFormats().content[0].text);
        const categories = [...new Set(formats.map(f => f.category))];
        expect(categories).toContain('IEEE 754');
        expect(categories).toContain('ML');
        expect(categories).toContain('OCP');
        expect(categories).toContain('Integer');
    });

    test('exposes exactly the keys in the FORMATS catalog', () => {
        const formats = JSON.parse(listFormats().content[0].text);
        const listed = formats.map(f => f.key).sort();
        const catalog = Object.keys(FORMATS).sort();
        expect(listed).toEqual(catalog);
    });
});

// ── encodeNumber tool ─────────────────────────────────────────────

describe('encodeNumber', () => {
    test('encodes a simple value into FP32', () => {
        const result = encodeNumber({ value: 1.5, format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);

        expect(stats.actualValue).toBe(1.5);
        expect(stats.type).toBe('Normal');
        expect(stats.sign).toBe(0);
        expect(stats.hex).toBe('0x3FC00000');
    });

    test('encodes infinity', () => {
        const result = encodeNumber({ value: 'infinity', format: 'fp16' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('+Infinity');
        expect(stats.actualValue).toBe('Infinity');
    });

    test('encodes NaN', () => {
        const result = encodeNumber({ value: 'nan', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('NaN');
        expect(stats.actualValue).toBe('NaN');
    });

    test('encodes -Infinity', () => {
        const result = encodeNumber({ value: '-inf', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('-Infinity');
        expect(stats.actualValue).toBe('-Infinity');
    });

    test('encodes negative value', () => {
        const result = encodeNumber({ value: -42, format: 'fp16' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.sign).toBe(1);
        expect(stats.actualValue).toBe(-42);
    });

    test('encodes integer format', () => {
        const result = encodeNumber({ value: 127, format: 'int8' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(127);
        expect(stats.type).toBe('Positive Integer');
    });

    test('encodes with custom format', () => {
        const result = encodeNumber({
            value: 1.0,
            format: { signBits: 1, exponentBits: 4, mantissaBits: 3 },
        });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.0);
    });

    test('encodes FP64 value and returns 64-bit hex', () => {
        const result = encodeNumber({ value: 1.0, format: 'fp64' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.hex).toBe('0x3FF0000000000000');
        expect(stats.actualValue).toBe(1.0);
        expect(stats.type).toBe('Normal');
    });

    test('encodes with explicit rounding mode', () => {
        const result = encodeNumber({ value: 1.5, format: 'fp16', roundingMode: 'towardZero' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.5); // 1.5 is exact in FP16
    });

    test('a negative zero is "-0", not the 0 JSON would write', () => {
        const stats = JSON.parse(decodeBits({ bits: '0x8000', format: 'fp16' }).content[0].text);
        expect(stats.type).toBe('-Zero');
        expect(stats.actualValue).toBe('-0');
    });

    test('encodes value=0 (falsy but valid)', () => {
        const result = encodeNumber({ value: 0, format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(0);
        expect(stats.type).toBe('+Zero');
    });

    test('encodes hex string value', () => {
        const result = encodeNumber({ value: '0xFF', format: 'uint8' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(255);
    });

    test('throws when value is missing', () => {
        expect(() => encodeNumber({ format: 'fp32' })).toThrow(/value/);
    });

    test('throws when format is missing', () => {
        expect(() => encodeNumber({ value: 1 })).toThrow(/format/);
    });
});

// ── decodeBits tool ───────────────────────────────────────────────

describe('decodeBits', () => {
    test('decodes FP16 binary string', () => {
        // FP16 encoding of 1.0: sign=0, exp=01111, mant=0000000000
        const result = decodeBits({ bits: '0011110000000000', format: 'fp16' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.0);
        expect(stats.type).toBe('Normal');
    });

    test('decodes hex string', () => {
        // FP32 encoding of 1.0: 0x3F800000
        const result = decodeBits({ bits: '0x3F800000', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.0);
    });

    test('decodes integer binary', () => {
        const result = decodeBits({ bits: '11111010', format: 'int8' });
        const stats = JSON.parse(result.content[0].text);
        // 11111010 in two's complement = -6
        expect(stats.actualValue).toBe(-6);
    });

    test('decodes unsigned integer', () => {
        const result = decodeBits({ bits: '11111010', format: 'uint8' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(250);
    });

    test('decodes FP32 infinity from hex', () => {
        const result = decodeBits({ bits: '0x7F800000', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('+Infinity');
        expect(stats.actualValue).toBe('Infinity');
    });

    test('decodes FP32 NaN from hex', () => {
        const result = decodeBits({ bits: '0x7FC00000', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('NaN');
        expect(stats.actualValue).toBe('NaN');
    });

    test('decodes FP64 hex string (BigInt-safe)', () => {
        // FP64 encoding of 1.0: 0x3FF0000000000000
        const result = decodeBits({ bits: '0x3FF0000000000000', format: 'fp64' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.0);
        expect(stats.type).toBe('Normal');
    });

    test('pads short binary strings', () => {
        const result = decodeBits({ bits: '1', format: 'uint8' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1);
    });

    test('throws on invalid bits', () => {
        expect(() => decodeBits({ bits: 'xyz', format: 'fp32' })).toThrow(/binary string/);
    });

    test('throws on invalid hex in bits', () => {
        expect(() => decodeBits({ bits: '0xZZZZ', format: 'fp32' })).toThrow(/Invalid hex/);
    });

    test('reads hex by the rule every surface shares: leading zeros fit, extra bits do not', () => {
        const stats = JSON.parse(decodeBits({ bits: '0x03C00', format: 'fp16' }).content[0].text);
        expect(stats.hex).toBe('0x3C00');
        expect(stats.actualValue).toBe(1);
        // A 6-bit format's "0xFF" is what its page used to slice to 0x3F.
        expect(() => decodeBits({
            bits: '0xFF', format: { signBits: 1, exponentBits: 3, mantissaBits: 2 },
        })).toThrow(/8 significant bits.*does not fit the 6-bit/);
    });

    test('throws when bits is missing', () => {
        expect(() => decodeBits({ format: 'fp32' })).toThrow(/bits/);
    });

    test('throws when format is missing', () => {
        expect(() => decodeBits({ bits: '0x3F800000' })).toThrow(/format/);
    });
});

// ── E4M3 classification (OCP hasNaN-only) regression ──────────────

describe('OCP E4M3 classification', () => {
    test('encode_number(448, fp8_e4m3) is a Normal value, not NaN', () => {
        const result = encodeNumber({ value: 448, format: 'fp8_e4m3' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('Normal');
        expect(stats.actualValue).toBe(448);
        // The exponent is real, not "Special".
        expect(stats.exponentActual).not.toBe('Special');
    });

    test('decode_bits(01111110, fp8_e4m3) is Normal 448', () => {
        const result = decodeBits({ bits: '01111110', format: 'fp8_e4m3' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('Normal');
        expect(stats.actualValue).toBe(448);
    });

    test('decode_bits(01111111, fp8_e4m3) is NaN (all-ones mantissa)', () => {
        const result = decodeBits({ bits: '01111111', format: 'fp8_e4m3' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.type).toBe('NaN');
    });

    test('get_format_info(fp8_e4m3) reports max normal 448', () => {
        const result = getFormatInfo({ format: 'fp8_e4m3' });
        const info = JSON.parse(result.content[0].text);
        expect(info.maxNormal).toBe(448);
    });
});

// ── decode_bits overlong pattern rejection ────────────────────────

describe('decodeBits rejects overlong patterns', () => {
    test('rejects 32-bit hex decoded as fp16', () => {
        expect(() => decodeBits({ bits: '0xFFFFFFFF', format: 'fp16' }))
            .toThrow(/does not fit the 16-bit/);
    });

    test('rejects overlong binary string', () => {
        expect(() => decodeBits({ bits: '1'.repeat(17), format: 'fp16' }))
            .toThrow(/does not fit the 16-bit/);
    });

    test('rejects a full-width binary pattern for a narrower format', () => {
        // A 32-bit FP32 subnormal pattern must NOT silently decode as fp16.
        const fp32Bits = '0'.repeat(16) + '0011110000000000';
        expect(fp32Bits.length).toBe(32);
        expect(() => decodeBits({ bits: fp32Bits, format: 'fp16' }))
            .toThrow(/does not fit the 16-bit/);
    });

    test('allows leading-zero-padded hex', () => {
        const result = decodeBits({ bits: '0x00000040', format: 'fp16' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats).toBeDefined();
    });
});

// ── convertFormat tool ────────────────────────────────────────────

describe('convertFormat', () => {
    test('converts FP32 → FP16 with precision loss', () => {
        const result = convertFormat({
            value: Math.PI,
            inputFormat: 'fp32',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.input.type).toBe('Normal');
        expect(data.output.type).toBe('Normal');
        expect(data.precisionLoss.lossless).toBe(false);
        expect(data.precisionLoss.absolute).toBeGreaterThan(0);
        expect(data.precisionLoss.relativePercent).toBeGreaterThan(0);
    });

    test('lossless conversion FP16 → FP32', () => {
        const result = convertFormat({
            value: 1.5,
            inputFormat: 'fp16',
            outputFormat: 'fp32',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.input.actualValue).toBe(1.5);
        expect(data.output.actualValue).toBe(1.5);
        expect(data.precisionLoss.lossless).toBe(true);
        expect(data.precisionLoss.absolute).toBe(0);
    });

    test('converts between float and integer', () => {
        const result = convertFormat({
            value: 3.7,
            inputFormat: 'fp32',
            outputFormat: 'int8',
        });
        const data = JSON.parse(result.content[0].text);

        // 3.7 rounds to 4 in int8
        expect(data.output.actualValue).toBe(4);
        expect(data.precisionLoss.lossless).toBe(false);
    });

    test('converts integer to float', () => {
        const result = convertFormat({
            value: 42,
            inputFormat: 'int16',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.output.actualValue).toBe(42);
    });

    test('handles infinity conversion', () => {
        const result = convertFormat({
            value: 'infinity',
            inputFormat: 'fp32',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.input.type).toBe('+Infinity');
        expect(data.input.actualValue).toBe('Infinity');
        expect(data.output.type).toBe('+Infinity');
        expect(data.output.actualValue).toBe('Infinity');
        expect(data.precisionLoss.lossless).toBe(true);
        // Infinity - Infinity is NaN, but an unchanged value lost nothing.
        expect(data.precisionLoss.absolute).toBe(0);
        expect(data.precisionLoss.relativePercent).toBe(0);
    });

    test('handles NaN conversion', () => {
        const result = convertFormat({
            value: 'nan',
            inputFormat: 'fp32',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.input.type).toBe('NaN');
        expect(data.input.actualValue).toBe('NaN');
        expect(data.output.type).toBe('NaN');
        expect(data.output.actualValue).toBe('NaN');
        expect(data.precisionLoss.lossless).toBe(true);
    });

    // Exactly one side NaN is never lossless: NaN into a format that has no
    // NaN substitutes a number, and E4M3's overflow mode turns Infinity into NaN.
    test.each([
        ['nan', 'fp32', 'fp4_e2m1', undefined, 6],
        ['nan', 'fp32', 'mxint8', undefined, 1.984375],
        ['nan', 'fp32', 'int8', undefined, 0],
        ['infinity', 'fp32', 'fp8_e4m3', 'overflow', 'NaN'],
        ['infinity', 'fp32', 'fp8_e4m3', 'saturate', 448],
        ['-infinity', 'fp32', 'e8m0', 'saturate', Math.pow(2, 127)],
    ])('%s %s -> %s (%s) is not lossless', (value, inputFormat, outputFormat, overflowMode, expected) => {
        const data = JSON.parse(convertFormat({
            value, inputFormat, outputFormat, overflowMode,
        }).content[0].text);
        expect(data.output.actualValue).toBe(expected);
        expect(data.precisionLoss.lossless).toBe(false);
        // At least one side is non-finite in every one of these, so there is no
        // difference to report: null, never the strings "Infinity"/"NaN".
        expect(data.precisionLoss.absolute).toBeNull();
        expect(data.precisionLoss.relativePercent).toBeNull();
    });

    test('converts with custom formats', () => {
        const result = convertFormat({
            value: 1.5,
            inputFormat: { signBits: 1, exponentBits: 5, mantissaBits: 10 },
            outputFormat: { signBits: 1, exponentBits: 8, mantissaBits: 7 },
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.input.actualValue).toBe(1.5);
        expect(data.output.actualValue).toBe(1.5);
    });

    test('converts with explicit rounding mode', () => {
        const result = convertFormat({
            value: 1.3,
            inputFormat: 'fp32',
            outputFormat: 'fp16',
            roundingMode: 'towardZero',
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.output).toBeDefined();
        expect(data.precisionLoss).toBeDefined();
    });

    test('converts integer to integer with overflow', () => {
        const result = convertFormat({
            value: 200,
            inputFormat: 'uint8',
            outputFormat: 'int8',
        });
        const data = JSON.parse(result.content[0].text);
        // 200 saturates to 127 in int8
        expect(data.output.actualValue).toBe(127);
        expect(data.precisionLoss.lossless).toBe(false);
    });

    test('converts negative subnormal across formats', () => {
        const result = convertFormat({
            value: -0.00001,
            inputFormat: 'fp32',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.output.sign).toBe(1);
    });

    test('throws when value is missing', () => {
        expect(() => convertFormat({ inputFormat: 'fp32', outputFormat: 'fp16' })).toThrow(/value/);
    });

    test('throws when inputFormat is missing', () => {
        expect(() => convertFormat({ value: 1, outputFormat: 'fp16' })).toThrow(/inputFormat/);
    });

    test('throws when outputFormat is missing', () => {
        expect(() => convertFormat({ value: 1, inputFormat: 'fp32' })).toThrow(/outputFormat/);
    });
});

// ── getFormatInfo tool ────────────────────────────────────────────

describe('getFormatInfo', () => {
    test('returns info for FP32', () => {
        const result = getFormatInfo({ format: 'fp32' });
        const info = JSON.parse(result.content[0].text);

        expect(info.type).toBe('floating-point');
        expect(info.totalBits).toBe(32);
        expect(info.signBits).toBe(1);
        expect(info.exponentBits).toBe(8);
        expect(info.mantissaBits).toBe(23);
        expect(info.bias).toBe(127);
        expect(info.hasInfinity).toBe(true);
        expect(info.hasNaN).toBe(true);
        expect(info.maxNormal).toBeDefined();
        expect(info.minNormal).toBeDefined();
        expect(info.maxSubnormal).toBeDefined();
        expect(info.minSubnormal).toBeDefined();
    });

    test('hasNaN reports the NaN the layout has, beside nanTarget', () => {
        // s1e5m0 with an Infinity asked for NaN and has no pattern for it;
        // it used to report hasNaN: true next to nanTarget: "maxNormal".
        const noRoom = JSON.parse(getFormatInfo({
            format: { signBits: 1, exponentBits: 5, mantissaBits: 0, hasInfinity: true, hasNaN: true },
        }).content[0].text);
        expect(noRoom.hasNaN).toBe(false);
        expect(noRoom.nanTarget).toBe('maxNormal');
        // s1e6m9 declining NaN beside its Infinity is refused, like a flag of
        // the wrong type: the top binade's other patterns are NaN, and a flag
        // the format silently ignored would leave the caller reading those
        // bits as finite.
        expect(() => getFormatInfo({
            format: { signBits: 1, exponentBits: 6, mantissaBits: 9, hasNaN: false },
        })).toThrow(/hasNaN cannot be false with hasInfinity/);
        const ieee = JSON.parse(getFormatInfo({
            format: { signBits: 1, exponentBits: 6, mantissaBits: 9 },
        }).content[0].text);
        expect(ieee.hasNaN).toBe(true);
        expect(ieee.nanTarget).toBe('nan');
    });

    test('leaves out a min normal the layout does not have', () => {
        // s1e1m0 with an Infinity: exponent field 1 is the Infinity, which
        // used to be reported as the min normal.
        const info = JSON.parse(getFormatInfo({
            format: { signBits: 1, exponentBits: 1, mantissaBits: 0, hasInfinity: true },
        }).content[0].text);
        expect(info.minNormal).toBeUndefined();
        expect(info.maxSubnormal).toBeUndefined();
    });

    test('returns info for INT8', () => {
        const result = getFormatInfo({ format: 'int8' });
        const info = JSON.parse(result.content[0].text);

        expect(info.type).toBe('integer');
        expect(info.bits).toBe(8);
        expect(info.signed).toBe(true);
        expect(info.minValue).toBe(-128);
        expect(info.maxValue).toBe(127);
    });

    test('returns info for UINT8', () => {
        const result = getFormatInfo({ format: 'uint8' });
        const info = JSON.parse(result.content[0].text);

        expect(info.type).toBe('integer');
        expect(info.signed).toBe(false);
        expect(info.minValue).toBe(0);
        expect(info.maxValue).toBe(255);
    });

    test('returns info for OCP format', () => {
        const result = getFormatInfo({ format: 'fp4_e2m1' });
        const info = JSON.parse(result.content[0].text);

        expect(info.type).toBe('floating-point');
        expect(info.bias).toBe(1);
        expect(info.hasInfinity).toBe(false);
        expect(info.hasNaN).toBe(false);
    });

    test('returns info for fixed-point format', () => {
        const result = getFormatInfo({
            format: { signBits: 1, exponentBits: 0, mantissaBits: 7 },
        });
        const info = JSON.parse(result.content[0].text);

        expect(info.type).toBe('floating-point');
        expect(info.exponentBits).toBe(0);
        expect(info.maxValue).toBeDefined();
        expect(info.minValue).toBeDefined();
    });

    test('returns info for format without infinity or NaN', () => {
        const result = getFormatInfo({ format: 'fp4_e2m1' });
        const info = JSON.parse(result.content[0].text);

        expect(info.hasInfinity).toBe(false);
        expect(info.hasNaN).toBe(false);
        expect(info.maxNormal).toBeDefined();
    });

    test('throws when format is missing', () => {
        expect(() => getFormatInfo({})).toThrow(/format/);
    });
});

// ── buildToolDescriptors ──────────────────────────────────────────

describe('buildToolDescriptors', () => {
    test('returns five tool descriptors', () => {
        const tools = buildToolDescriptors();
        expect(tools).toHaveLength(5);
    });

    test('each tool has required WebMCP properties', () => {
        const tools = buildToolDescriptors();
        for (const tool of tools) {
            expect(tool).toHaveProperty('name');
            expect(tool).toHaveProperty('description');
            expect(tool).toHaveProperty('inputSchema');
            expect(tool).toHaveProperty('execute');
            expect(typeof tool.execute).toBe('function');
            expect(tool.inputSchema).toHaveProperty('type', 'object');
            expect(tool.inputSchema).toHaveProperty('properties');
            expect(tool.inputSchema).toHaveProperty('required');
        }
    });

    test('tool names match expected values', () => {
        const tools = buildToolDescriptors();
        const names = tools.map(t => t.name);
        expect(names).toEqual([
            'list_formats',
            'encode_number',
            'decode_bits',
            'convert_format',
            'get_format_info',
        ]);
    });

    test('list_formats execute works', () => {
        const tools = buildToolDescriptors();
        const listTool = tools.find(t => t.name === 'list_formats');
        const result = listTool.execute();
        expect(result.content[0].type).toBe('text');
        const formats = JSON.parse(result.content[0].text);
        expect(formats.length).toBeGreaterThan(0);
    });

    test('encode_number execute works', () => {
        const tools = buildToolDescriptors();
        const encodeTool = tools.find(t => t.name === 'encode_number');
        const result = encodeTool.execute({ value: 1.5, format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.5);
    });

    test('decode_bits execute works', () => {
        const tools = buildToolDescriptors();
        const decodeTool = tools.find(t => t.name === 'decode_bits');
        const result = decodeTool.execute({ bits: '0x3F800000', format: 'fp32' });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.0);
    });

    test('convert_format execute works', () => {
        const tools = buildToolDescriptors();
        const convertTool = tools.find(t => t.name === 'convert_format');
        const result = convertTool.execute({
            value: 1.5,
            inputFormat: 'fp32',
            outputFormat: 'fp16',
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.input.actualValue).toBe(1.5);
        expect(data.output.actualValue).toBe(1.5);
    });

    test('get_format_info execute works', () => {
        const tools = buildToolDescriptors();
        const infoTool = tools.find(t => t.name === 'get_format_info');
        const result = infoTool.execute({ format: 'fp16' });
        const info = JSON.parse(result.content[0].text);
        expect(info.totalBits).toBe(16);
    });
});

// ── registerWebMCP ────────────────────────────────────────────────

describe('registerWebMCP', () => {
    // A ModelContext stand-in whose registerTool() returns a promise, as the
    // spec's does; `result` picks what that promise does.
    function mockModelContext(result = () => Promise.resolve()) {
        const registered = [];
        return {
            registered,
            registerTool: (tool, options) => {
                registered.push({ tool, options });
                return result(tool, options);
            },
        };
    }

    afterEach(() => {
        delete global.window;
        jest.restoreAllMocks();
    });

    test('returns false in Node.js (no window)', () => {
        expect(registerWebMCP()).toBe(false);
    });

    test('registers tools via document.modelContext', () => {
        const mc = mockModelContext();
        global.window = { document: { modelContext: mc } };

        const controller = registerWebMCP();
        expect(controller).toBeInstanceOf(AbortController);
        expect(mc.registered).toHaveLength(5);

        // Each call should pass a tool object and an options object with a signal
        for (const { tool, options } of mc.registered) {
            expect(tool).toHaveProperty('name');
            expect(tool).toHaveProperty('title');
            expect(tool).toHaveProperty('execute');
            expect(tool).toHaveProperty('inputSchema');
            expect(tool.annotations).toEqual({ readOnlyHint: true });
            expect(options).toHaveProperty('signal');
            expect(options.signal).toBeInstanceOf(AbortSignal);
        }

        // Verify the expected tool names
        const names = mc.registered.map(r => r.tool.name);
        expect(names).toEqual(['list_formats', 'encode_number', 'decode_bits', 'convert_format', 'get_format_info']);

        // All signals should be from the same controller
        const signal = mc.registered[0].options.signal;
        expect(signal.aborted).toBe(false);
        controller.abort();
        expect(signal.aborted).toBe(true);
    });

    test('falls back to navigator.modelContext, and prefers document', () => {
        const legacy = mockModelContext(() => undefined);
        global.window = { document: {}, navigator: { modelContext: legacy } };
        expect(registerWebMCP()).toBeInstanceOf(AbortController);
        expect(legacy.registered).toHaveLength(5);

        const current = mockModelContext();
        const stale = mockModelContext();
        global.window = { document: { modelContext: current }, navigator: { modelContext: stale } };
        registerWebMCP();
        expect(current.registered).toHaveLength(5);
        expect(stale.registered).toHaveLength(0);
    });

    test('returns false when modelContext is absent', () => {
        global.window = { document: {}, navigator: {} };
        expect(registerWebMCP()).toBe(false);
    });

    test('returns false when registerTool is not a function', () => {
        global.window = { document: { modelContext: {} } };
        expect(registerWebMCP()).toBe(false);
    });

    test('warns when registration is refused', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const refusal = new Error('NotAllowedError');
        global.window = { document: { modelContext: mockModelContext(() => Promise.reject(refusal)) } };

        registerWebMCP();
        await new Promise(resolve => setImmediate(resolve));
        // One cause refuses every tool alike, so one warning names them all.
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            'WebMCP: could not register "list_formats", "encode_number", "decode_bits", ' +
            '"convert_format", "get_format_info":', refusal);
    });

    test('a single refused tool is named on its own', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const duplicate = new Error('InvalidStateError');
        global.window = { document: { modelContext: mockModelContext((tool) =>
            tool.name === 'decode_bits' ? Promise.reject(duplicate) : Promise.resolve()) } };

        registerWebMCP();
        await new Promise(resolve => setImmediate(resolve));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('WebMCP: could not register "decode_bits":', duplicate);
    });

    test('unregistering by abort is not reported', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        // Like the spec, reject each registration promise when its signal aborts.
        const mc = mockModelContext((_tool, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
        }));
        global.window = { document: { modelContext: mc } };

        registerWebMCP().abort();
        await new Promise(resolve => setImmediate(resolve));
        expect(warn).not.toHaveBeenCalled();
    });

    test('registered tools return invalid input as an error result', async () => {
        const mc = mockModelContext();
        global.window = { document: { modelContext: mc } };
        registerWebMCP();

        const encode = mc.registered.find(r => r.tool.name === 'encode_number').tool;
        const result = await encode.execute({ value: 1, format: 'nope' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe(
            'Error: Unknown format preset: "nope". Use the list_formats tool to see available presets.');

        // A valid call passes through unchanged.
        const ok = await encode.execute({ value: 1, format: 'fp16' });
        expect(ok.isError).toBeUndefined();
        expect(JSON.parse(ok.content[0].text).hex).toBe('0x3C00');

        // The shared descriptors still throw; fp-conv-mcp's callTool relies on it.
        const shared = buildToolDescriptors().find(t => t.name === 'encode_number');
        expect(() => shared.execute({ value: 1, format: 'nope' })).toThrow('Unknown format preset');
    });

    test('withToolErrors passes the execute options through and catches a rejection', async () => {
        const seen = [];
        const wrapped = withToolErrors({
            name: 'async_tool',
            execute: async (params, options) => {
                seen.push({ params, options });
                if (params.fail) throw new Error('later');
                return { content: [{ type: 'text', text: 'ok' }] };
            },
        });
        const signal = new AbortController().signal;

        const ok = await wrapped.execute({ fail: false }, { signal });
        expect(ok.content[0].text).toBe('ok');
        expect(seen[0]).toEqual({ params: { fail: false }, options: { signal } });

        expect(await wrapped.execute({ fail: true }, { signal })).toEqual(toolError(new Error('later')));
        expect(toolError('plain string')).toEqual(
            { isError: true, content: [{ type: 'text', text: 'Error: plain string' }] });
    });
});

// ── End-to-end round-trip scenarios ───────────────────────────────

describe('End-to-end round-trip scenarios', () => {
    test('encode then decode produces same value', () => {
        const value = 42.5;
        const encResult = encodeNumber({ value, format: 'fp32' });
        const encStats = JSON.parse(encResult.content[0].text);

        const decResult = decodeBits({ bits: encStats.hex, format: 'fp32' });
        const decStats = JSON.parse(decResult.content[0].text);

        expect(decStats.actualValue).toBe(value);
    });

    test('encode then decode works for integers', () => {
        const value = -100;
        const encResult = encodeNumber({ value, format: 'int16' });
        const encStats = JSON.parse(encResult.content[0].text);

        const decResult = decodeBits({ bits: encStats.binary, format: 'int16' });
        const decStats = JSON.parse(decResult.content[0].text);

        expect(decStats.actualValue).toBe(value);
    });

    test('convert FP32 → BF16 → FP32 shows precision characteristics', () => {
        const step1 = convertFormat({
            value: 1.234567,
            inputFormat: 'fp32',
            outputFormat: 'bf16',
        });
        const data1 = JSON.parse(step1.content[0].text);

        // BF16 output re-encoded to FP32
        const step2 = convertFormat({
            value: data1.output.actualValue,
            inputFormat: 'bf16',
            outputFormat: 'fp32',
        });
        const data2 = JSON.parse(step2.content[0].text);

        // BF16→FP32 should be lossless since BF16 fits in FP32
        expect(data2.precisionLoss.lossless).toBe(true);
    });

    test('full pipeline with all preset formats', () => {
        const presetKeys = Object.keys(FORMATS);
        for (const key of presetKeys) {
            // Each format should be able to encode 0 without error
            const result = encodeNumber({ value: 0, format: key });
            const stats = JSON.parse(result.content[0].text);
            // E8M0 (OCP MX Table 7) has no zero encoding, so zero saturates to
            // its smallest representable magnitude instead.
            const expected = FORMATS[key].hasSubnormals === false
                ? Math.pow(2, -FORMATS[key].bias)
                : 0;
            expect(stats.actualValue).toBe(expected);
        }
    });

    test('full pipeline: getFormatInfo for every preset', () => {
        const presetKeys = Object.keys(FORMATS);
        for (const key of presetKeys) {
            const result = getFormatInfo({ format: key });
            const info = JSON.parse(result.content[0].text);
            expect(info.totalBits).toBeGreaterThan(0);
        }
    });
});

describe('WebMCP rounding-mode integration', () => {
    test('encode_number accepts roundingMode parameter', () => {
        const result = encodeNumber({ value: 1.7, format: 'fp16', roundingMode: 'towardZero' });
        const stats = JSON.parse(result.content[0].text);

        const resultDefault = encodeNumber({ value: 1.7, format: 'fp16' });
        const statsDefault = JSON.parse(resultDefault.content[0].text);

        // 1.7 is not exactly representable in fp16; tiesToEven (the default)
        // rounds up while towardZero truncates, so the two must differ.
        expect(statsDefault.actualValue).toBe(1.7001953125);
        expect(stats.actualValue).toBe(1.69921875);
        expect(stats.actualValue).not.toBe(statsDefault.actualValue);
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

// ── exact decimal-string encoding ─────────────────────────────────

describe('encodeInput - exact decimal path', () => {
    const actualValue = (args) => JSON.parse(encodeNumber(args).content[0].text).actualValue;

    test('string decimals are rounded straight to the target format', () => {
        // Number('0.74999999999999999') is exactly the fp4 0.5/1.0 midpoint, so
        // the fp64 detour would tie-to-even up to 1. The decimal is below it.
        expect(actualValue({ value: '0.74999999999999999', format: 'fp4_e2m1' })).toBe(0.5);
        expect(actualValue({ value: '0.18749999999999999', format: 'fp6_e2m3' })).toBe(0.125);
    });

    test('numeric input keeps the numeric path', () => {
        // A caller passing an already-rounded number cannot recover the decimal.
        const alreadyRounded = Number('0.74999999999999999');
        expect(alreadyRounded).toBe(0.75);
        expect(actualValue({ value: alreadyRounded, format: 'fp4_e2m1' })).toBe(1);
    });

    test('directed rounding applies to the string, not the parsed double', () => {
        expect(actualValue({ value: '0.1', format: 'fp64', roundingMode: 'towardZero' }))
            .toBe(0.09999999999999999);
        expect(actualValue({ value: '0.1', format: 'fp64', roundingMode: 'towardPositive' }))
            .toBe(0.1);
    });

    test('keyword and hex inputs still take the numeric path', () => {
        expect(actualValue({ value: 'inf', format: 'fp32' })).toBe('Infinity');
        expect(actualValue({ value: '-inf', format: 'fp32' })).toBe('-Infinity');
        expect(actualValue({ value: 'nan', format: 'fp32' })).toBe('NaN');
        expect(actualValue({ value: '0x10', format: 'fp32' })).toBe(16);
    });

    test('convert_format encodes the input side exactly', () => {
        const result = convertFormat({
            value: '0.74999999999999999',
            inputFormat: 'fp4_e2m1',
            outputFormat: 'fp32',
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.input.actualValue).toBe(0.5);
    });

    test('integer formats round the string exactly', () => {
        expect(actualValue({ value: '2.5000000000000001', format: 'int32' })).toBe(3);
        expect(actualValue({ value: '2.5', format: 'int32' })).toBe(2);
    });
});

// ── Overflow mode and the OCP MX scalar types ────────────────────

describe('overflowMode through the tool kernel', () => {
    const actual = (params) => JSON.parse(encodeNumber(params).content[0].text).actualValue;

    test('encode_number honors overflowMode', () => {
        expect(actual({ value: 1e40, format: 'fp32' })).toBe('Infinity');
        expect(actual({ value: 1e40, format: 'fp32', overflowMode: 'saturate' }))
            .toBe(3.4028234663852886e38);
        expect(actual({ value: 1000, format: 'fp8_e4m3' })).toBe(448);
        expect(actual({ value: 1000, format: 'fp8_e4m3', overflowMode: 'overflow' }))
            .toBe('NaN');
    });

    test('encode_number rejects an unknown overflowMode', () => {
        expect(() => encodeNumber({ value: 1, format: 'fp32', overflowMode: 'bogus' }))
            .toThrow('Unknown overflow mode');
    });

    test('convert_format applies overflowMode only to the output', () => {
        const result = convertFormat({
            value: 'Infinity',
            inputFormat: 'fp16',
            outputFormat: 'e8m0',
            overflowMode: 'saturate',
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.input.hex).toBe('0x7C00');
        expect(payload.input.actualValue).toBe('Infinity');
        expect(payload.output.hex).toBe('0xFE');
        expect(payload.output.actualValue).toBe(Math.pow(2, 127));
    });

    test('an out-of-range decimal uses the input format default before conversion', () => {
        const result = convertFormat({
            value: '1e40',
            inputFormat: 'fp32',
            outputFormat: 'fp16',
            overflowMode: 'saturate',
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.input.actualValue).toBe('Infinity');
        expect(payload.output.actualValue).toBe(65504);
    });

    test('convert_format applies roundingMode only to the output', () => {
        const result = convertFormat({
            value: '0.1',
            inputFormat: 'fp64',
            outputFormat: 'fp32',
            roundingMode: 'towardZero',
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.input.hex).toBe('0x3FB999999999999A');
        expect(payload.output.hex).toBe('0x3DCCCCCC');
    });

    test('convert_format without the option keeps the historical behavior', () => {
        const result = convertFormat({
            value: 1e40, inputFormat: 'fp32', outputFormat: 'fp16',
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.input.actualValue).toBe('Infinity');
        expect(payload.output.actualValue).toBe('Infinity');
    });

    test('the tool schemas advertise overflowMode', () => {
        const tools = buildToolDescriptors();
        for (const name of ['encode_number', 'convert_format']) {
            const tool = tools.find(t => t.name === name);
            expect(tool.inputSchema.properties.overflowMode.enum)
                .toEqual(['saturate', 'overflow']);
        }
    });

    test('list_formats reports the overflow resolution for every preset', () => {
        const formats = JSON.parse(listFormats().content[0].text);
        for (const entry of formats) {
            expect(['saturate', 'overflow']).toContain(entry.defaultOverflowMode);
            expect(['infinity', 'nan', 'maxNormal'])
                .toContain(entry.overflowTarget.overflow);
            expect(entry.overflowTarget.saturate).toBe('maxNormal');
        }
        const e4m3 = formats.find(f => f.key === 'fp8_e4m3');
        expect(e4m3.defaultOverflowMode).toBe('saturate');
        expect(e4m3.overflowTarget.overflow).toBe('nan');
        const fp32 = formats.find(f => f.key === 'fp32');
        expect(fp32.defaultOverflowMode).toBe('overflow');
        expect(fp32.overflowTarget.overflow).toBe('infinity');
    });

    test('get_format_info reports the overflow resolution', () => {
        const info = JSON.parse(getFormatInfo({ format: 'fp8_e5m2' }).content[0].text);
        expect(info.defaultOverflowMode).toBe('overflow');
        expect(info.overflowTarget).toEqual({ saturate: 'maxNormal', overflow: 'infinity' });
    });

    // Where a NaN INPUT lands. overflowTarget cannot say: it answers for an
    // out-of-range magnitude, and a NaN is not one.
    test.each([
        ['fp32', 'nan'],
        ['fp8_e4m3', 'nan'],
        ['e8m0', 'nan'],
        ['fp4_e2m1', 'maxNormal'],
        ['fp6_e3m2', 'maxNormal'],
        ['mxint8', 'maxNormal'],
        ['int8', 'zero'],
        ['uint8', 'zero'],
    ])('get_format_info reports nanTarget %s -> %s', (format, nanTarget) => {
        expect(JSON.parse(getFormatInfo({ format }).content[0].text).nanTarget)
            .toBe(nanTarget);
    });

    test('get_format_info reports nanTarget for a custom layout with no NaN', () => {
        const info = JSON.parse(getFormatInfo({
            format: { signBits: 1, exponentBits: 3, mantissaBits: 2, bias: 3, hasInfinity: false, hasNaN: false },
        }).content[0].text);
        expect(info.nanTarget).toBe('maxNormal');
    });

    test('list_formats reports nanTarget for every preset, matching the encoder', () => {
        const formats = JSON.parse(listFormats().content[0].text);
        for (const entry of formats) {
            expect(['nan', 'maxNormal', 'zero']).toContain(entry.nanTarget);
            expect(entry.nanTarget).toBe(resolveFormat(entry.key).nanTarget());
        }
        expect(formats.find(f => f.key === 'fp4_e2m1').nanTarget).toBe('maxNormal');
        expect(formats.find(f => f.key === 'int8').nanTarget).toBe('zero');
        expect(formats.find(f => f.key === 'e8m0').nanTarget).toBe('nan');
    });
});

describe('E8M0 and MXINT8 through the tool kernel', () => {
    test('resolveFormat builds E8M0 with hasSubnormals off', () => {
        const format = resolveFormat('e8m0');
        expect(format.hasSubnormals).toBe(false);
        expect(format.bias).toBe(127);
    });

    test('resolveFormat builds MXINT8 with its implicit scale', () => {
        const format = resolveFormat('mxint8');
        expect(format.fractionBits).toBe(6);
        expect(format.symmetric).toBe(true);
        expect(format.maxRealValue).toBe(1.984375);
    });

    test('resolveFormat still builds a plain INT8 for "int8"', () => {
        const format = resolveFormat('int8');
        expect(format.fractionBits).toBe(0);
        expect(format.symmetric).toBe(false);
        expect(format.maxValue).toBe(127);
    });

    test('a custom format object carries hasSubnormals and fractionBits', () => {
        const scale = resolveFormat({
            signBits: 0, exponentBits: 8, mantissaBits: 0,
            bias: 127, hasInfinity: false, hasNaN: true, hasSubnormals: false,
        });
        expect(scale.hasSubnormals).toBe(false);

        const fixed = resolveFormat({ bits: 8, signed: true, fractionBits: 6 });
        expect(fixed.fractionBits).toBe(6);
        expect(fixed.scale).toBe(64);

        const symmetric = resolveFormat({
            bits: 8, signed: true, fractionBits: 6, symmetric: true,
        });
        expect(symmetric.minValue).toBe(-127);
    });

    test('an out-of-range fractionBits is rejected', () => {
        expect(() => resolveFormat({ bits: 8, signed: true, fractionBits: 8 }))
            .toThrow('"fractionBits" must be an integer between 0 and 7');
        expect(() => resolveFormat({ bits: 8, signed: true, fractionBits: -1 }))
            .toThrow('"fractionBits" must be an integer between 0 and 7');
        expect(() => resolveFormat({ bits: 8, signed: true, fractionBits: 1.5 }))
            .toThrow('"fractionBits" must be an integer between 0 and 7');
    });

    test('encode_number and decode_bits agree on E8M0', () => {
        const encoded = JSON.parse(encodeNumber({ value: 4, format: 'e8m0' }).content[0].text);
        expect(encoded.hex).toBe('0x81');
        expect(encoded.type).toBe('Normal');
        expect(encoded.exponentActual).toBe('129 - 127 = 2');
        expect(encoded.mantissaDecimal).toBe(1);
        const decoded = JSON.parse(decodeBits({ bits: '0x81', format: 'e8m0' }).content[0].text);
        expect(decoded.actualValue).toBe(4);
    });

    test('E8M0 field 0 reports NORMAL metadata, not subnormal metadata', () => {
        // 0x00 is the smallest E8M0 magnitude and a genuine normal: the
        // component fields must not describe it with the IEEE subnormal
        // formulas, which would contradict its own type and actual value.
        const stats = JSON.parse(encodeNumber({
            value: Math.pow(2, -127),
            format: 'e8m0',
        }).content[0].text);

        expect(stats.hex).toBe('0x00');
        expect(stats.type).toBe('Normal');
        expect(stats.actualValue).toBe(Math.pow(2, -127));
        expect(stats.exponentActual).toBe('0 - 127 = -127');
        expect(stats.mantissaDecimal).toBe(1);
    });

    test('the metadata helpers follow the format subnormal regime', () => {
        const e8m0 = resolveFormat('e8m0');
        expect(e8m0.significand(0, 0)).toBe(1.0);
        expect(exponentActual(e8m0, 0, 0)).toBe('0 - 127 = -127');

        // An ordinary IEEE format keeps the subnormal formulas at field 0.
        const fp16 = resolveFormat('fp16');
        expect(fp16.significand(0, 0)).toBe(0);
        expect(fp16.significand(0, 512)).toBe(0.5);
        expect(exponentActual(fp16, 0, 0)).toBe('1 - 15 = -14');

        // ... and so does a zero-mantissa format that still HAS subnormals.
        const zeroMantissa = resolveFormat({
            signBits: 1, exponentBits: 5, mantissaBits: 0,
            hasInfinity: false, hasNaN: false,
        });
        expect(zeroMantissa.significand(0, 0)).toBe(0);
        expect(exponentActual(zeroMantissa, 0, 0)).toBe('1 - 15 = -14');
    });

    test('encode_number and decode_bits agree on MXINT8', () => {
        const encoded = JSON.parse(encodeNumber({ value: 1.5, format: 'mxint8' }).content[0].text);
        expect(encoded.hex).toBe('0x60');
        expect(encoded.type).toBe('Positive Fixed-point');
        const decoded = JSON.parse(decodeBits({ bits: '0x60', format: 'mxint8' }).content[0].text);
        expect(decoded.actualValue).toBe(1.5);
        const negative = JSON.parse(decodeBits({ bits: '0xFF', format: 'mxint8' }).content[0].text);
        expect(negative.actualValue).toBe(-0.015625);
        expect(negative.type).toBe('Negative Fixed-point');
    });

    test('get_format_info describes the new formats', () => {
        const e8m0 = JSON.parse(getFormatInfo({ format: 'e8m0' }).content[0].text);
        expect(e8m0.hasSubnormals).toBe(false);
        expect(e8m0.minNormal).toBe(Math.pow(2, -127));
        expect(e8m0.maxNormal).toBe(Math.pow(2, 127));
        expect(e8m0.maxSubnormal).toBeUndefined();

        const mxint8 = JSON.parse(getFormatInfo({ format: 'mxint8' }).content[0].text);
        expect(mxint8.fractionBits).toBe(6);
        expect(mxint8.implicitScale).toBe('2^-6');
        expect(mxint8.symmetric).toBe(true);
        expect(mxint8.minValue).toBe(-1.984375);
        expect(mxint8.maxValue).toBe(1.984375);
        expect(mxint8.rawMinValue).toBe(-127);
        expect(mxint8.rawMaxValue).toBe(127);

        const int8 = JSON.parse(getFormatInfo({ format: 'int8' }).content[0].text);
        expect(int8.fractionBits).toBeUndefined();
        expect(int8.minValue).toBe(-128);
    });

    test('list_formats surfaces the new format details', () => {
        const formats = JSON.parse(listFormats().content[0].text);
        const e8m0 = formats.find(f => f.key === 'e8m0');
        expect(e8m0.category).toBe('OCP');
        expect(e8m0.hasSubnormals).toBe(false);

        const mxint8 = formats.find(f => f.key === 'mxint8');
        expect(mxint8.category).toBe('OCP');
        expect(mxint8.implicitScale).toBe('2^-6');
        expect(mxint8.minValue).toBe(-1.984375);

        const int8 = formats.find(f => f.key === 'int8');
        expect(int8.implicitScale).toBeUndefined();
        expect(int8.maxValue).toBe(127);
    });

    test('typeLabel() labels a scaled integer as fixed-point', () => {
        const mxint8 = resolveFormat('mxint8');
        expect(mxint8.typeLabel(0, 0, 0)).toBe('Zero');
        expect(mxint8.typeLabel(0, 0, 64)).toBe('Positive Fixed-point');
        expect(mxint8.typeLabel(0, 0, 192)).toBe('Negative Fixed-point');
        const int8 = resolveFormat('int8');
        expect(int8.typeLabel(0, 0, 1)).toBe('Positive Integer');
        expect(int8.typeLabel(0, 0, 255)).toBe('Negative Integer');
    });
});

// ── precisionLoss.kind ────────────────────────────────────────────
//
// convert_format used to emit absolute: "Infinity", relativePercent: "NaN" for
// anything involving a non-finite side - figures that read like measurements
// and are not. The kind names what happened instead, and it is computed by the
// same library helper the web UI's loss row uses, so the two cannot disagree.
describe('convert_format precisionLoss.kind', () => {
    const CUSTOM_UNSIGNED_WITH_INF = {
        signBits: 0, exponentBits: 5, mantissaBits: 2, bias: 15,
        hasInfinity: true, hasNaN: true,
    };

    test.each([
        // [label, args, kind, output value]
        ['unchanged value', { value: 1.5, inputFormat: 'fp16', outputFormat: 'fp32' }, 'exact', 1.5],
        ['NaN that stays NaN', { value: 'nan', inputFormat: 'fp32', outputFormat: 'fp16' }, 'exact', 'NaN'],
        ['Infinity that stays Infinity', { value: 'infinity', inputFormat: 'fp32', outputFormat: 'fp16' }, 'exact', 'Infinity'],
        ['ordinary precision loss', { value: Math.PI, inputFormat: 'fp32', outputFormat: 'fp16' }, 'rounded', 3.140625],
        ['finite value off the top of the range',
            { value: 1e40, inputFormat: 'fp64', outputFormat: 'fp32', overflowMode: 'overflow' }, 'overflow', 'Infinity'],
        ['Infinity into a format whose overflow is NaN',
            { value: 'infinity', inputFormat: 'fp32', outputFormat: 'fp8_e4m3', overflowMode: 'overflow' }, 'overflow', 'NaN'],
        ['-Infinity into E8M0 under overflow',
            { value: '-infinity', inputFormat: 'fp32', outputFormat: 'e8m0', overflowMode: 'overflow' }, 'overflow', 'NaN'],
        ['Infinity clamped to the largest finite value',
            { value: 'infinity', inputFormat: 'fp32', outputFormat: 'fp8_e4m3', overflowMode: 'saturate' }, 'saturated', 448],
        ['-Infinity clamped in E8M0',
            { value: '-infinity', inputFormat: 'fp32', outputFormat: 'e8m0', overflowMode: 'saturate' }, 'saturated', Math.pow(2, 127)],
        ['-Infinity reflected by an unsigned format that HAS an infinity',
            { value: '-infinity', inputFormat: 'fp32', outputFormat: CUSTOM_UNSIGNED_WITH_INF, overflowMode: 'overflow' }, 'reflected', 'Infinity'],
        ['NaN a format cannot hold',
            { value: 'nan', inputFormat: 'fp32', outputFormat: 'fp4_e2m1' }, 'nanSubstituted', 6],
        ['NaN into an integer',
            { value: 'nan', inputFormat: 'fp32', outputFormat: 'int8' }, 'nanSubstituted', 0],
    ])('%s is %s', (_label, args, kind, outputValue) => {
        const data = JSON.parse(convertFormat(args).content[0].text);
        expect(data.output.actualValue).toBe(outputValue);
        expect(data.precisionLoss.kind).toBe(kind);
        expect(data.precisionLoss.lossless).toBe(kind === 'exact');

        if (kind === 'exact' || kind === 'rounded') {
            expect(typeof data.precisionLoss.absolute).toBe('number');
            expect(typeof data.precisionLoss.relativePercent).toBe('number');
        } else {
            expect(data.precisionLoss.absolute).toBeNull();
            expect(data.precisionLoss.relativePercent).toBeNull();
        }
    });

    test('a zero input with a rounded output still reports 0%, not a division by zero', () => {
        const data = JSON.parse(convertFormat({
            value: 1e-40, inputFormat: 'fp16', outputFormat: 'fp32',
        }).content[0].text);
        // 1e-40 underflows to 0 in FP16, so the source operand IS zero.
        expect(data.input.actualValue).toBe(0);
        expect(data.precisionLoss.kind).toBe('exact');
        expect(data.precisionLoss.relativePercent).toBe(0);
    });

    test('a tiny relative loss is reported as measured, not rounded to 0', () => {
        // int64 max into FP32 loses 1 in 2^63: six decimals of percent read
        // that as 0 next to absolute: 1.
        const data = JSON.parse(convertFormat({
            value: '9223372036854775807', inputFormat: { bits: 64 }, outputFormat: 'fp32',
        }).content[0].text);
        expect(data.precisionLoss.kind).toBe('rounded');
        expect(data.precisionLoss.absolute).toBe(1);
        expect(data.precisionLoss.relativePercent).toBeCloseTo(1.0842021724855044e-17, 30);
    });
});

// ── An overflowing negative literal on an unsigned format ─────────
//
// The rule (docs/overflow-behavior.md, "Only an actual infinity is reflected"):
// -Infinity is reflected to the TOP of an unsigned format, but a decimal
// literal that merely overflows is a finite negative and clamps to the BOTTOM.
// encode_number sees the literal; convert_format sees what the SOURCE format
// made of it. Both are right, and this pins the difference so it cannot be
// "fixed" into an inconsistency later.
describe('encode_number and convert_format on "-1e400" into E8M0', () => {
    test.each(['overflow', 'saturate'])(
        'encode_number clamps the literal to the bottom under %s', (overflowMode) => {
            const stats = JSON.parse(encodeNumber({
                value: '-1e400', format: 'e8m0', overflowMode,
            }).content[0].text);
            // 0x00 is 2^-127, the smallest magnitude E8M0 holds.
            expect(stats.hex).toBe('0x00');
        });

    test.each([
        ['overflow', '0xFF'],   // E8M0 has no Infinity, so its overflow is NaN
        ['saturate', '0xFE'],   // 2^127
    ])('convert_format from FP64 reflects, because the operand is already -Infinity (%s)',
        (overflowMode, hex) => {
            const data = JSON.parse(convertFormat({
                value: '-1e400', inputFormat: 'fp64', outputFormat: 'e8m0', overflowMode,
            }).content[0].text);
            // The literal overflows FP64 under FP64's own default, so the value
            // being converted really is -Infinity - the same thing that happens
            // to any literal the source format rounds.
            expect(data.input.actualValue).toBe('-Infinity');
            expect(data.output.hex).toBe(hex);
        });

    test('every spelling of -Infinity agrees, and none of them is the literal', () => {
        const hexFor = (value) => JSON.parse(encodeNumber({
            value, format: 'e8m0', overflowMode: 'saturate',
        }).content[0].text).hex;

        expect(hexFor('-inf')).toBe('0xFE');
        expect(hexFor('-Infinity')).toBe('0xFE');
        expect(hexFor(-Infinity)).toBe('0xFE');
        // ...and +Infinity gets the same answer, which is the point of the rule.
        expect(hexFor('inf')).toBe('0xFE');
        // The literal is a different input and gets the other end.
        expect(hexFor('-1e400')).toBe('0x00');
    });
});

// ── convert_format converts the VALUE, not a rounded double ───────
//
// The conversion used to decode the source encoding to a double and re-encode
// that, and to compare the two doubles to decide what was lost. Both steps
// round a field wider than 53 bits, so an int64 -> int64 identity conversion
// dropped its low bit and reported "exact".
describe('convert_format on values a double cannot carry', () => {
    const json = (result) => JSON.parse(result.content[0].text);

    test('an int64 identity conversion keeps every bit', () => {
        const data = json(convertFormat({
            value: '9007199254740993', // 2^53 + 1
            inputFormat: { bits: 64, signed: true },
            outputFormat: { bits: 64, signed: true },
        }));
        expect(data.input.hex).toBe('0x0020000000000001');
        expect(data.output.hex).toBe(data.input.hex);
        expect(data.precisionLoss.kind).toBe('exact');
        expect(data.precisionLoss.lossless).toBe(true);
    });

    test('an int64 maximum into FP32 is not "exact" just because the doubles match', () => {
        const data = json(convertFormat({
            value: '9223372036854775807', // 2^63 - 1; FP32 holds only 2^63
            inputFormat: { bits: 64, signed: true },
            outputFormat: 'fp32',
        }));
        expect(data.precisionLoss.kind).toBe('rounded');
        expect(data.precisionLoss.lossless).toBe(false);
    });

    test('a 64-bit pattern converted to itself round-trips through the hex', () => {
        const format = { bits: 64, signed: false };
        const data = json(convertFormat({
            value: '18446744073709551615',
            inputFormat: format,
            outputFormat: format,
        }));
        expect(data.output.hex).toBe('0xFFFFFFFFFFFFFFFF');
        expect(data.precisionLoss.kind).toBe('exact');
    });
});

// ── the rest of the precisionLoss vocabulary ──────────────────────
describe('convert_format precisionLoss.kind: clamps and dropped signs', () => {
    const json = (result) => JSON.parse(result.content[0].text);

    test.each([
        // [label, args, kind, output value, measurable]
        ['a finite value clamped by the saturate mode',
            { value: '1e10', inputFormat: 'fp32', outputFormat: 'fp16', overflowMode: 'saturate' },
            'saturated', 65504, true],
        ['the same value under overflow',
            { value: '1e10', inputFormat: 'fp32', outputFormat: 'fp16', overflowMode: 'overflow' },
            'overflow', 'Infinity', false],
        ['an ordinary rounding',
            { value: '3.14159265', inputFormat: 'fp32', outputFormat: 'fp16' },
            'rounded', 3.140625, true],
        ['-Infinity clamped to the BOTTOM of an unsigned integer',
            { value: '-inf', inputFormat: 'fp32', outputFormat: 'uint8' },
            'saturated', 0, false],
        ['-Infinity clamped to the bottom of an unsigned fixed-point layout',
            { value: '-inf', inputFormat: 'fp32',
                outputFormat: { signBits: 0, exponentBits: 0, mantissaBits: 8 } },
            'saturated', 0, false],
        ['a finite negative an unsigned format cannot hold',
            { value: '-5', inputFormat: 'fp32', outputFormat: 'uint8' },
            'saturated', 0, true],
        ['-0 into an unsigned format',
            { value: '-0', inputFormat: 'fp32', outputFormat: 'uint8' },
            'reflected', 0, true],
        ['-0 into a signed float, which keeps the sign',
            { value: '-0', inputFormat: 'fp32', outputFormat: 'fp16' },
            'exact', '-0', true],
        ['-0 into a signed integer, which has a single zero',
            { value: '-0', inputFormat: 'fp32', outputFormat: 'int8' },
            'exact', 0, true],
    ])('%s is %s', (_label, args, kind, outputValue, measurable) => {
        const data = json(convertFormat(args));
        expect(data.output.actualValue).toBe(outputValue);
        expect(data.precisionLoss.kind).toBe(kind);
        expect(data.precisionLoss.lossless).toBe(kind === 'exact');
        if (measurable) {
            expect(typeof data.precisionLoss.absolute).toBe('number');
            expect(typeof data.precisionLoss.relativePercent).toBe('number');
        } else {
            expect(data.precisionLoss.absolute).toBeNull();
            expect(data.precisionLoss.relativePercent).toBeNull();
        }
    });

    test('the difference is exact, not taken between rounded doubles', () => {
        // 2^64 - 1 -> 2^64; both decode to the double 2^64.
        const data = json(convertFormat({
            value: '18446744073709551615',
            inputFormat: { bits: 64, signed: false },
            outputFormat: 'fp32',
        }));
        expect(data.precisionLoss.kind).toBe('rounded');
        expect(data.precisionLoss.absolute).toBe(1);
    });

    test('a clamped finite value reports the difference as well as the clamp', () => {
        const data = json(convertFormat({
            value: '1e10', inputFormat: 'fp32', outputFormat: 'fp16', overflowMode: 'saturate',
        }));
        expect(data.precisionLoss.absolute).toBeCloseTo(1e10 - 65504, 0);
        expect(data.precisionLoss.relativePercent).toBeGreaterThan(99);
    });

    test('-0 into an unsigned format keeps the sign of a signed output', () => {
        const signed = json(convertFormat({
            value: '-0', inputFormat: 'fp32', outputFormat: 'fp16',
        }));
        expect(signed.output.sign).toBe(1);
        expect(signed.output.hex).toBe('0x8000');
    });
});

// ── keyword spellings are the library's ───────────────────────────
describe('parseValueInput and the library agree on the keywords', () => {
    const { valueKeyword } = require('../lib/floating-point.js');

    test.each([
        'inf', '+inf', 'INF', 'infinity', '+infinity', 'Infinity',
        '-inf', '-INF', '-infinity', '-Infinity',
        'nan', 'NaN', '+nan', '-nan',
    ])('"%s" parses to the library keyword value', (text) => {
        const expected = valueKeyword(text);
        expect(expected).not.toBeNull();
        expect(Object.is(parseValueInput(text), expected)).toBe(true);
    });

    test('a keyword encodes exactly as the value does, through the tool', () => {
        const hexFor = (value) => JSON.parse(encodeNumber({
            value, format: 'int8',
        }).content[0].text).hex;
        expect(hexFor('-inf')).toBe(hexFor(-Infinity));
        expect(hexFor('-inf')).toBe('0x80');
        expect(hexFor('inf')).toBe('0x7F');
    });
});

// ── the conversion loss kinds ─────────────────────────────────────

// CONVERSION_LOSS_KINDS is what CONVERSION_LOSS_LABELS, the word every surface
// shows, is checked against, so a stale list
// would let a real kind reach a user unlabelled. These pin it from both sides:
// every listed kind is one a conversion really produces, and no conversion
// produces a kind that is not listed.
describe('CONVERSION_LOSS_KINDS', () => {
    // One conversion per kind, chosen so each takes a different branch of the
    // ladder in conversionKind().
    const CASES = {
        exact: { value: '1.5', inputFormat: 'fp32', outputFormat: 'fp64' },
        rounded: { value: '3.14', inputFormat: 'fp32', outputFormat: 'fp16' },
        overflow: {
            value: '1e10', inputFormat: 'fp32', outputFormat: 'fp16',
            overflowMode: 'overflow',
        },
        saturated: {
            value: '1e10', inputFormat: 'fp32', outputFormat: 'fp16',
            overflowMode: 'saturate',
        },
        reflected: { value: '-0', inputFormat: 'fp32', outputFormat: 'uint8' },
        nanSubstituted: { value: 'nan', inputFormat: 'fp32', outputFormat: 'int8' },
    };

    test('every listed kind is reachable', () => {
        for (const [kind, params] of Object.entries(CASES)) {
            const result = JSON.parse(convertFormat(params).content[0].text);
            expect(result.precisionLoss.kind).toBe(kind);
        }
    });

    test('the list names every kind those conversions produce', () => {
        expect(Object.keys(CASES).sort()).toEqual([...CONVERSION_LOSS_KINDS].sort());
    });

    test('a sweep of preset pairs reports nothing outside the list', () => {
        const keys = Object.keys(FORMATS);
        for (const value of ['1.5', '1e10', '-1e10', 'nan', 'inf', '-inf', '0', '-0']) {
            for (const inputFormat of keys) {
                for (const outputFormat of keys) {
                    const result = JSON.parse(
                        convertFormat({ value, inputFormat, outputFormat }).content[0].text);
                    expect(CONVERSION_LOSS_KINDS).toContain(result.precisionLoss.kind);
                }
            }
        }
    });
});
