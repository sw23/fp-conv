/**
 * @jest-environment jsdom
 */

// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Raw bit fields wider than a double can name exactly.
//
// A JavaScript number holds every pattern of a field up to 53 bits and no
// wider: 2^54 - 1 rounds up to 2^54, which needs one bit MORE than the field.
// Storing raw fields as doubles therefore corrupted every format past that
// width - int64 could not spell -1, a 112-bit mantissa's all-ones pattern could
// not be decoded or displayed at all, and an OCP-style format's "max normal"
// landed on its NaN encoding. The library now carries a field wider than 53
// bits as a BigInt, and every surface reads it from the library rather than
// recomputing 2^bits - 1 as a double.
//
// jsdom is the environment here because the UI half of the file drives the real
// page; the library and WebMCP halves do not care.
const fs = require('fs');
const path = require('path');

const { FloatingPoint, Integer, showsDecodedSignificand, encodingValueText } = require('../lib/floating-point.js');
const webmcp = require('../src/webmcp.js');
const urlState = require('../src/url-state.js');

const json = (result) => JSON.parse(result.content[0].text);

describe('Integer: raw two\'s-complement bits stay exact above 53 bits', () => {
    test('int64 round-trips -1 through its bits, not through a rounded double', () => {
        const int64 = new Integer(64, true);
        const encoded = int64.encode(-1);

        expect(encoded.mantissa).toBe(2n ** 64n - 1n);
        expect(int64.toBinaryString(encoded.sign, encoded.exponent, encoded.mantissa))
            .toBe('1'.repeat(64));
        expect(int64.toHexString(encoded.sign, encoded.exponent, encoded.mantissa))
            .toBe('0xFFFFFFFFFFFFFFFF');
        expect(int64.decode(encoded.sign, encoded.exponent, encoded.mantissa)).toBe(-1);
        expect(int64.isExactlyRepresentable('-1')).toBe(true);
        expect(int64.toExactDecimalString(int64.encode('-1'))).toBe('-1');
    });

    test('every signed width from 54 to 64 bits round-trips small negatives', () => {
        for (let bits = 54; bits <= 64; bits++) {
            const format = new Integer(bits, true);
            for (const value of [-1, -2, -3, -1000]) {
                const encoded = format.encode(value);
                const bitString = format.toBinaryString(
                    encoded.sign, encoded.exponent, encoded.mantissa);
                expect([bits, value, bitString.length]).toEqual([bits, value, bits]);
                expect([bits, value, format.decode(encoded.sign, encoded.exponent, encoded.mantissa)])
                    .toEqual([bits, value, value]);
                expect([bits, value, format.toExactDecimalString(encoded)])
                    .toEqual([bits, value, String(value)]);
            }
        }
    });

    test('a 55-bit fixed-point integer keeps its smallest negative step', () => {
        const format = new Integer(55, true, { fractionBits: 6 });
        const encoded = format.encode(-0.015625); // -1/64, one raw unit

        expect(encoded.intValue).toBe(-1n);
        expect(encoded.mantissa).toBe(2n ** 55n - 1n);
        expect(format.decode(encoded.sign, encoded.exponent, encoded.mantissa)).toBe(-0.015625);
        expect(format.toExactDecimalString(format.encode('-0.015625'))).toBe('-0.015625');
        expect(format.isExactlyRepresentable('-0.015625')).toBe(true);
    });

    test('the bounds are the true bounds at 64 bits', () => {
        expect(new Integer(64, true).maxValue).toBe(2n ** 63n - 1n);
        expect(new Integer(64, true).minValue).toBe(-(2n ** 63n));
        expect(new Integer(64, false).maxValue).toBe(2n ** 64n - 1n);
        expect(new Integer(64, false).minValue).toBe(0n);

        // At 53 bits and below the fields stay plain numbers, so every existing
        // preset and caller sees exactly the shape it always saw.
        expect(new Integer(32, true).maxValue).toBe(2147483647);
        expect(new Integer(8, true).encode(-1).mantissa).toBe(255);
    });

    test('a symmetric int64 never encodes the pattern symmetry exists to exclude', () => {
        const format = new Integer(64, true, { symmetric: true });
        const excluded = '0x8000000000000000';

        expect(format.maxValue).toBe(2n ** 63n - 1n);
        expect(format.minValue).toBe(-(2n ** 63n - 1n));

        for (const value of [format.minValue, -Infinity]) {
            const encoded = format.encode(value);
            const hex = format.toHexString(encoded.sign, encoded.exponent, encoded.mantissa);
            expect([String(value), hex]).not.toEqual([String(value), excluded]);
            expect([String(value), encoded.intValue]).toEqual([String(value), format.minValue]);
            expect([String(value), hex]).toEqual([String(value), '0x8000000000000001']);
        }

        // Without `symmetric` the most-negative encoding is in range again.
        const plain = new Integer(64, true);
        const most = plain.encode(-Infinity);
        expect(plain.toHexString(most.sign, most.exponent, most.mantissa)).toBe(excluded);
    });

    test('a BigInt value encodes exactly instead of rounding through a double', () => {
        const format = new Integer(64, true);
        const encoded = format.encode(2n ** 63n - 1n);
        expect(encoded.intValue).toBe(2n ** 63n - 1n);
        expect(format.toHexString(encoded.sign, encoded.exponent, encoded.mantissa))
            .toBe('0x7FFFFFFFFFFFFFFF');
        // The same digits as a decimal string reach the same encoding.
        expect(format.encode('9223372036854775807').mantissa).toBe(encoded.mantissa);
    });

    test('a BigInt value past the range saturates like any other', () => {
        const format = new Integer(64, true);
        expect(format.encode(2n ** 63n).intValue).toBe(2n ** 63n - 1n);
        expect(format.encode(-(2n ** 63n) - 1n).intValue).toBe(-(2n ** 63n));
    });

    test('toBinaryString is always exactly the field width', () => {
        const format = new Integer(64, false);
        for (const bits of [0n, 1n, 2n ** 53n, 2n ** 64n - 1n, 2n ** 63n]) {
            expect([bits, format.toBinaryString(0, 0, bits).length]).toEqual([bits, 64]);
        }
    });
});

describe('FloatingPoint: mantissa fields wider than 53 bits', () => {
    test('a 112-bit all-ones mantissa decodes, classifies and prints', () => {
        const binary128 = new FloatingPoint(1, 15, 112);
        const allOnes = 2n ** 112n - 1n;

        expect(binary128.maxMantissa).toBe(allOnes);
        expect(() => binary128.decode(0, 0, allOnes)).not.toThrow();
        expect(binary128.classify(0, 0, allOnes)).toBe('Subnormal');
        expect(binary128.toBinaryString(0, 0, allOnes))
            .toBe('0' + '0'.repeat(15) + '1'.repeat(112));
        expect(binary128.toBinaryString(1, binary128.maxExponent, allOnes))
            .toBe('1'.repeat(128));
        expect(binary128.toBinaryString(1, binary128.maxExponent, allOnes).length).toBe(128);
        expect(binary128.classify(0, binary128.maxExponent, allOnes)).toBe('NaN');
    });

    test('a number that is not a legal field value is still rejected', () => {
        // Math.pow(2, 112) - 1 IS 2^112 as a double: one bit too wide for the
        // field. Rejecting it is the point - no surface produces it any more.
        const binary128 = new FloatingPoint(1, 15, 112);
        expect(() => binary128.decode(0, 0, Math.pow(2, 112) - 1)).toThrow(RangeError);
        expect(() => binary128.decode(0, 0, 2n ** 112n)).toThrow(RangeError);
        expect(() => binary128.decode(0, 0, -1n)).toThrow(RangeError);
        expect(() => binary128.decode(0, 0, 1.5)).toThrow(RangeError);
    });

    test('a field at or below 53 bits is still a plain number', () => {
        const fp64 = new FloatingPoint(1, 11, 52);
        expect(fp64.maxMantissa).toBe(Math.pow(2, 52) - 1);
        expect(fp64.encode(1.5).mantissa).toBe(Math.pow(2, 51));
        expect(new FloatingPoint(1, 8, 53).maxMantissa).toBe(Math.pow(2, 53) - 1);
        expect(typeof new FloatingPoint(1, 8, 54).maxMantissa).toBe('bigint');
    });

    test('a decimal that needs every one of 112 mantissa bits stays exact', () => {
        const binary128 = new FloatingPoint(1, 15, 112);
        // 1 + 2^-112, the smallest value above 1 the format can hold.
        const literal = binary128.toExactDecimalString(binary128._encoded(0, binary128.bias, 1n));
        const encoded = binary128.encode(literal);

        expect(encoded.mantissa).toBe(1n);
        expect(binary128.isExactlyRepresentable(literal, encoded)).toBe(true);
        expect(binary128.toExactDecimalString(encoded)).toBe(literal);
    });

    test('a BigInt value encodes from its digits, not from a rounded double', () => {
        const binary128 = new FloatingPoint(1, 15, 112);
        // 2^100 + 1 has 101 significant bits: exact in this format, but the
        // nearest double is 2^100, so coercing the input would lose the 1.
        const value = 2n ** 100n + 1n;
        const encoded = binary128.encode(value);

        // The stored fraction is (2^100 + 1)/2^100 - 1 scaled by 2^112, = 2^12.
        expect(encoded.mantissa).toBe(2n ** 12n);
        expect(encoded.exponent).toBe(binary128.bias + 100);
        expect(binary128.toExactDecimalString(encoded)).toBe(value.toString());
        expect(encoded.mantissa).toBe(binary128.encode(value.toString()).mantissa);
        // A double input cannot carry that 1, which is what the BigInt path is for.
        expect(binary128.encode(Number(value)).mantissa).toBe(0n);
    });

    test('a wide fixed-point layout saturates onto its real all-ones field', () => {
        const fixed = new FloatingPoint(1, 0, 60);
        expect(fixed.maxMantissa).toBe(2n ** 60n - 1n);

        const saturated = fixed.encode(5); // far past the 0..1 range
        expect(saturated.mantissa).toBe(fixed.maxMantissa);
        expect(fixed.toBinaryString(saturated.sign, saturated.exponent, saturated.mantissa))
            .toBe('0' + '1'.repeat(60));
        expect(fixed.toExactDecimalString(saturated))
            .toBe('0.' + ((2n ** 60n - 1n) * 5n ** 60n).toString().padStart(60, '0'));
    });
});

describe('the significand of a wide field', () => {
    // significand() is a double, so a mantissa wider than 52 bits can hold a
    // significand it cannot name: the all-ones 60-bit normal read exactly 2,
    // a value no normal significand has (they are all below 2). The rule for
    // when a surface may show the double is showsDecodedValue()'s, applied to
    // the significand, and the exact spelling stands in otherwise.
    test('showsDecodedSignificand() says when the double is the significand', () => {
        const wide = new FloatingPoint(1, 11, 60);
        const allOnes = (1n << 60n) - 1n;
        expect(wide.significand(1023, allOnes)).toBe(2);
        expect(showsDecodedSignificand(wide, 1023, allOnes)).toBe(false);
        expect(wide.exactSignificandString(1023, allOnes))
            .toBe('1.999999999999999999132638262011596452794037759304046630859375');
        // The 0.x regime too: a subnormal's all-ones field is just under 1.
        expect(showsDecodedSignificand(wide, 0, allOnes)).toBe(false);
        expect(wide.exactSignificandString(0, allOnes))
            .toBe('0.999999999999999999132638262011596452794037759304046630859375');
        // A wide field whose bits fit in a double is shown as one.
        expect(showsDecodedSignificand(wide, 1023, 1n << 59n)).toBe(true);
        expect(wide.exactSignificandString(1023, 1n << 59n)).toBe('1.5');
        // Narrow formats always fit; an integer's significand is its value.
        const fp16 = new FloatingPoint(1, 5, 10);
        expect(showsDecodedSignificand(fp16, 15, 1023)).toBe(true);
        expect(fp16.exactSignificandString(15, 1023)).toBe('1.9990234375');
        expect(fp16.exactSignificandString(0, 1)).toBe('0.0009765625');
        expect(new FloatingPoint(1, 0, 8).exactSignificandString(0, 128)).toBe('0.5');
        const u64 = new Integer(64, false);
        expect(showsDecodedSignificand(u64, 0, u64.maxMantissa)).toBe(false);
        expect(u64.exactSignificandString(0, u64.maxMantissa)).toBe('18446744073709551615');
        expect(showsDecodedSignificand(new Integer(32, false), 0, 7)).toBe(true);
    });
});

describe('OCP-style formats: max normal is a normal, not the NaN slot', () => {
    // With no infinity, the all-ones mantissa at maxExponent is NaN and max
    // normal is one field step below it. Computed in doubles, that step
    // vanished above 53 bits (and became 2 at 54), so "max normal" WAS the NaN
    // pattern and saturation produced a NaN.
    for (const mantissaBits of [54, 56, 60]) {
        test(`1/5/${mantissaBits} saturates to a finite value one step below NaN`, () => {
            const format = new FloatingPoint(1, 5, mantissaBits,
                { hasInfinity: false, hasNaN: true });
            const nan = format.getNaN();
            const maxNormal = format.getMaxNormal(false);
            const saturated = format.encode(1e30, { overflowMode: 'saturate' });

            expect(nan.mantissa).toBe(2n ** BigInt(mantissaBits) - 1n);
            expect(maxNormal.isNaN).toBe(false);
            expect(maxNormal.isNormal).toBe(true);
            expect(maxNormal.exponent).toBe(format.maxExponent);
            // Exactly one field step below the NaN encoding.
            expect(maxNormal.mantissa).toBe(nan.mantissa - 1n);

            expect(saturated.isNaN).toBe(false);
            expect(saturated.isNormal).toBe(true);
            expect(saturated.mantissa).toBe(maxNormal.mantissa);
            expect(Number.isFinite(
                format.decode(saturated.sign, saturated.exponent, saturated.mantissa))).toBe(true);
        });
    }

    test('the narrow case is unchanged', () => {
        const e4m3 = FloatingPoint.fromFormat('fp8_e4m3');
        expect(e4m3.getMaxNormal(false).mantissa).toBe(6);
        expect(e4m3.getNaN().mantissa).toBe(7);
    });
});

describe('WebMCP: wide fields survive the JSON round trip', () => {
    test('decode_bits accepts a pattern no double could hold', () => {
        const format = { signBits: 1, exponentBits: 15, mantissaBits: 64 };
        const stats = json(webmcp.decodeBits({ bits: '0x7FFEFFFFFFFFFFFFFFFF', format }));

        expect(stats.hex).toBe('0x7FFEFFFFFFFFFFFFFFFF');
        expect(stats.binary.length).toBe(80);
        expect(stats.binary.slice(16)).toBe('1'.repeat(64));
        expect(stats.type).toBe('Normal');
    });

    test('mantissaDecimal is exact like actualValue, so it never reads 2 for a normal', () => {
        const format = { signBits: 1, exponentBits: 11, mantissaBits: 60 };
        const allOnes = json(webmcp.decodeBits({ bits: '0x7FE' + 'F'.repeat(15), format }));
        expect(allOnes.type).toBe('Normal');
        expect(allOnes.mantissaDecimal)
            .toBe('1.999999999999999999132638262011596452794037759304046630859375');
        // The double where it is the significand, as on every narrow format.
        const half = json(webmcp.decodeBits({ bits: '0x3FF' + '8' + '0'.repeat(14), format }));
        expect(half.mantissaDecimal).toBe(1.5);
        expect(json(webmcp.decodeBits({ bits: '0x3C00', format: 'fp16' })).mantissaDecimal).toBe(1);
    });

    test('decode_bits reads an all-ones 112-bit mantissa', () => {
        const format = { signBits: 1, exponentBits: 15, mantissaBits: 112 };
        const stats = json(webmcp.decodeBits({ bits: '0'.repeat(16) + '1'.repeat(112), format }));
        expect(stats.type).toBe('Subnormal');
        expect(stats.binary).toBe('0'.repeat(16) + '1'.repeat(112));
    });

    test('decode_bits reads a 64-bit integer pattern exactly', () => {
        const stats = json(webmcp.decodeBits({
            bits: '0xFFFFFFFFFFFFFFFF',
            format: { bits: 64, signed: true, isInteger: true },
        }));
        // A wide integer's value is always its exact digits, like its bounds.
        expect(stats.actualValue).toBe('-1');
        expect(stats.binary).toBe('1'.repeat(64));
    });

    test('encode_number spells int64 -1 as 64 ones', () => {
        const stats = json(webmcp.encodeNumber({
            value: '-1',
            format: { bits: 64, signed: true, isInteger: true },
        }));
        expect(stats.binary).toBe('1'.repeat(64));
        expect(stats.hex).toBe('0xFFFFFFFFFFFFFFFF');
        // A wide integer's value is always its exact digits, like its bounds.
        expect(stats.actualValue).toBe('-1');
        expect(stats.type).toBe('Negative Integer');
    });

    test('get_format_info reports exact raw integer bounds as digit strings', () => {
        const info = json(webmcp.getFormatInfo({
            format: { bits: 64, signed: true, isInteger: true },
        }));
        expect(info.rawMinValue).toBe('-9223372036854775808');
        expect(info.rawMaxValue).toBe('9223372036854775807');

        const unsigned = json(webmcp.getFormatInfo({
            format: { bits: 64, signed: false, isInteger: true },
        }));
        expect(unsigned.rawMinValue).toBe('0');
        expect(unsigned.rawMaxValue).toBe('18446744073709551615');
    });

    test('a narrow integer format still reports plain JSON numbers', () => {
        const info = json(webmcp.getFormatInfo({ format: 'int32' }));
        expect(info.rawMinValue).toBe(-2147483648);
        expect(info.rawMaxValue).toBe(2147483647);
    });

    test('get_format_info builds its subnormal bounds from the exact field', () => {
        // Recomputing 2^mantissaBits - 1 as a double here used to throw before
        // it could return anything. A 60-bit mantissa is wider than a double
        // names exactly, so each bound that a double would round is reported as
        // its exact decimal digits in a string instead of as a JSON number.
        const format = new FloatingPoint(1, 11, 60);
        const info = json(webmcp.getFormatInfo({
            format: { signBits: 1, exponentBits: 11, mantissaBits: 60 },
        }));
        expect(info.mantissaBits).toBe(60);
        expect(info.maxSubnormal).toBe(format.toExactDecimalString(
            { sign: 0, exponent: 0, mantissa: 2n ** 60n - 1n }));
        expect(Number(info.maxSubnormal)).toBeGreaterThan(0);
        // The smallest subnormal is below fp64's range entirely: a JSON number
        // would be 0, which is not a bound.
        expect(info.minSubnormal).toBe(format.toExactDecimalString(
            { sign: 0, exponent: 0, mantissa: 1n }));
        expect(Number(info.minSubnormal)).toBe(0);
        // ... while a bound a double DOES name exactly stays a plain number.
        expect(info.minNormal).toBe(Math.pow(2, -1022));

        // Max normal is finite, and used to be JSON `null`: the double the
        // decode produced was Infinity.
        expect(info.maxNormal).toBe(format.toExactDecimalString(format.getMaxNormal(false)));
        expect(info.maxNormal.startsWith('17976931348623159')).toBe(true);

        const fixed = json(webmcp.getFormatInfo({
            format: { signBits: 1, exponentBits: 0, mantissaBits: 60 },
        }));
        // 1 - 2^-60 rounds to exactly 1 as a double, which is not a value the
        // format holds, so this bound is exact digits too.
        expect(Number(fixed.maxValue)).toBeCloseTo(1, 10);
        expect(Number(fixed.minValue)).toBeCloseTo(-1, 10);
        expect(fixed.maxValue).toBe(new FloatingPoint(1, 0, 60)
            .toExactDecimalString({ sign: 0, exponent: 0, mantissa: 2n ** 60n - 1n }));
        expect(fixed.minValue).toBe('-' + fixed.maxValue);
    });

    test('get_format_info reports a wide integer range exactly, not as a rounded double', () => {
        // 18446744073709552000 (2^64) next to a rawMaxValue of 2^64 - 1 was a
        // range wider than the format's own raw bound.
        const unsigned = json(webmcp.getFormatInfo({ format: { bits: 64, signed: false } }));
        expect(unsigned.maxValue).toBe('18446744073709551615');
        expect(unsigned.maxValue).toBe(unsigned.rawMaxValue);
        expect(unsigned.minValue).toBe('0');

        const signed = json(webmcp.getFormatInfo({ format: { bits: 64, signed: true } }));
        expect(signed.minValue).toBe('-9223372036854775808');
        expect(signed.maxValue).toBe('9223372036854775807');

        // A fixed-point width past 53 bits reports the scaled value exactly.
        const scaled = json(webmcp.getFormatInfo({
            format: { bits: 64, signed: true, fractionBits: 6 },
        }));
        expect(scaled.maxValue).toBe('144115188075855871.984375');

        // Narrow formats are unchanged: plain JSON numbers.
        const int32 = json(webmcp.getFormatInfo({ format: 'int32' }));
        expect(int32.minValue).toBe(-2147483648);
        expect(int32.maxValue).toBe(2147483647);
        expect(json(webmcp.getFormatInfo({ format: 'mxint8' })).maxValue).toBe(1.984375);
    });
});

// ── UI ────────────────────────────────────────────────────────────
//
// Same jsdom harness as tests/ui.test.js: install the globals the browser
// script expects, use the shipped <body> as the fixture, and require the module
// fresh per test.
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BODY_HTML = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];

beforeAll(() => {
    global.FloatingPoint = FloatingPoint;
    global.Integer = Integer;
    global.FORMATS = require('../lib/floating-point.js').FORMATS;
    global.sameValue = require('../lib/floating-point.js').sameValue;
    global.sameEncoding = require('../lib/floating-point.js').sameEncoding;
    global.normalizedEncoding = require('../lib/floating-point.js').normalizedEncoding;
    global.CONVERSION_LOSS_LABELS = require('../lib/floating-point.js').CONVERSION_LOSS_LABELS;
    global.conversionLoss = require('../lib/floating-point.js').conversionLoss;
    global.convertEncoded = require('../lib/floating-point.js').convertEncoded;
    global.showsDecodedValue = require('../lib/floating-point.js').showsDecodedValue;
    global.encodingValueText = require('../lib/floating-point.js').encodingValueText;
    global.showsDecodedSignificand = require('../lib/floating-point.js').showsDecodedSignificand;
    global.buildSearchParams = urlState.buildSearchParams;
    global.parseSearchParams = urlState.parseSearchParams;
    global.decimalToString = urlState.decimalToString;
    global.parseDecimal = urlState.parseDecimal;
    global.findFloatPresetKey = urlState.findFloatPresetKey;
    global.findIntPresetKey = urlState.findIntPresetKey;
});

function freshUi({ search = '' } = {}) {
    jest.resetModules();
    document.body.innerHTML = BODY_HTML;
    window.history.replaceState(null, '', '/' + (search ? `?${search}` : ''));
    const ui = require('../src/ui.js');
    ui.setupEventListeners();
    if (search) {
        ui.applyStateFromUrl();
    }
    return ui;
}

const $ = (id) => document.getElementById(id);
const mantissaBoxes = () =>
    Array.from(document.querySelectorAll('#input-binary-mantissa-checks input[type="checkbox"]'));
const toggleLastMantissaBit = () => {
    const boxes = mantissaBoxes();
    const last = boxes[boxes.length - 1];
    last.checked = !last.checked;
    last.dispatchEvent(new Event('change', { bubbles: true }));
    return last;
};

describe('ui.js: wide formats', () => {
    test('the all-ones preset fills a 1/15/64 format instead of wedging the page', () => {
        const ui = freshUi({ search: 'in=s1e15m64&out=fp32' });
        expect($('input-mantissa-bits').value).toBe('64');

        ui.loadValuePreset('all-ones');
        expect($('input-hex-input').value).toBe('0x' + 'F'.repeat(20));
        expect($('input-comp-type').textContent).toBe('NaN');
        expect(document.querySelector(
            '.preset-btn[data-value="all-ones"]:not(.output-value-preset)')
            .classList.contains('active')).toBe(true);
    });

    test('the all-ones preset on int64 reads -1', () => {
        const ui = freshUi({ search: 'in=i64&out=fp32' });
        ui.loadValuePreset('all-ones');
        expect($('input-decimal-input').value).toBe('-1');
        expect($('input-hex-input').value).toBe('0xFFFFFFFFFFFFFFFF');
        expect($('input-comp-value').textContent).toBe('-1');
    });

    test('the max-subnormal preset resolves on a 112-bit mantissa', () => {
        const ui = freshUi({ search: 'in=s1e15m112&out=fp32' });
        const format = new FloatingPoint(1, 15, 112);
        expect(ui.getPresetEncoding('max-subnorm', format))
            .toMatchObject({ sign: 0, exponent: 0, mantissa: 2n ** 112n - 1n });

        const narrow = new FloatingPoint(1, 11, 60);
        expect(ui.getPresetEncoding('max-subnorm', narrow))
            .toMatchObject({ sign: 0, exponent: 0, mantissa: 2n ** 60n - 1n });
    });

    test('the One preset matches on bits, not on the rounded double', () => {
        // 1 + 2^-60 decodes to the double 1, so matching by value lit "1" on
        // both sides for a pattern that is not 1.
        freshUi({ search: 'in=s1e11m60&out=s1e11m60&hex=0x3FF000000000000001' });
        const active = (selector) => [...document.querySelectorAll(selector)]
            .filter(b => b.classList.contains('active')).map(b => b.dataset.value);
        expect($('input-decimal-input').value).toMatch(/^1\.0000000000000000008/);
        expect(active('.preset-btn[data-value]:not(.output-value-preset)')).toEqual([]);
        expect(active('.output-value-preset')).toEqual([]);

        freshUi({ search: 'in=s1e11m60&out=s1e11m60&hex=0x3FF000000000000000' });
        expect(active('.preset-btn[data-value]:not(.output-value-preset)')).toEqual(['one']);
        expect(active('.output-value-preset')).toEqual(['one']);
    });

    test('a wide-exponent pattern links as hex, not as thousands of digits', () => {
        // s1e15m10's max normal has a 4,933-digit exact decimal, which the
        // link used to carry as val=.
        const ui = freshUi({ search: 'in=s1e15m10&out=fp32' });
        ui.enableUrlSync();
        ui.loadValuePreset('max-norm');
        const params = new URLSearchParams(window.location.search);
        expect(params.get('val')).toBeNull();
        expect(params.get('hex')).toBe($('input-hex-input').value);
        expect(window.location.search.length).toBeLessThan(80);
        // A short exact spelling stays readable.
        const u64 = freshUi({ search: 'in=u64&out=fp32' });
        u64.enableUrlSync();
        u64.loadValuePreset('max-norm');
        expect(new URLSearchParams(window.location.search).get('val')).toBe('18446744073709551615');
    });

    test('hex entry of a 20-nibble pattern updates the page rather than throwing', () => {
        const ui = freshUi({ search: 'in=s1e15m64&out=fp32' });
        const before = $('input-decimal-input').value;

        const hex = $('input-hex-input');
        hex.value = '0x7FFEFFFFFFFFFFFFFFFF';
        expect(() => hex.dispatchEvent(new Event('input', { bubbles: true }))).not.toThrow();

        // The page moved to the new pattern, and the checkbox row shows it.
        expect($('input-decimal-input').value).not.toBe(before);
        expect($('input-comp-type').textContent).toBe('Normal');
        expect(mantissaBoxes().every(box => box.checked)).toBe(true);
        expect($('input-hex-input').value).toBe('0x7FFEFFFFFFFFFFFFFFFF');

        // An over-wide pattern is still refused, and refusing it leaves the
        // page exactly as it was rather than half-updated.
        const snapshot = $('input-comp-value').textContent;
        ui.handleHexInput({ target: { value: '0x' + 'F'.repeat(21) } });
        expect($('input-comp-value').textContent).toBe(snapshot);
    });

    test('toggling the last mantissa checkbox of a 1/11/60 format keeps every bit', () => {
        const ui = freshUi({ search: 'in=s1e11m60&out=fp32' });
        const format = new FloatingPoint(1, 11, 60);
        expect(mantissaBoxes().length).toBe(60);

        ui.loadValuePreset('all-ones');
        expect(mantissaBoxes().every(box => box.checked)).toBe(true);

        // Clearing the low bit leaves 2^60 - 2, which as a double rounds up to
        // 2^60 - one bit too wide for the field, so decode() used to reject the
        // value the handler had already committed.
        toggleLastMantissaBit();
        expect($('input-hex-input').value)
            .toBe(format.toHexString(1, format.maxExponent, 2n ** 60n - 2n));

        // Setting it again returns to the all-ones pattern.
        toggleLastMantissaBit();
        expect($('input-hex-input').value)
            .toBe(format.toHexString(1, format.maxExponent, 2n ** 60n - 1n));
        expect(mantissaBoxes().every(box => box.checked)).toBe(true);
    });

    test('a 64-bit conversion keeps every bit, and says so', () => {
        freshUi({ search: 'in=i64&out=i64' });
        const dec = $('input-decimal-input');
        dec.value = '9007199254740993'; // 2^53 + 1
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        expect($('input-hex-input').value).toBe('0x0020000000000001');
        expect($('output-hex').textContent).toBe('0x0020000000000001');
        // Nothing was lost, so the loss row is hidden - it used to be hidden
        // while the output had quietly dropped the low bit.
        expect(document.querySelector('.precision-loss').style.display).toBe('none');
    });

    test('a 64-bit integer format survives a bit toggle', () => {
        const ui = freshUi({ search: 'in=i64&out=fp32' });
        const int64 = new Integer(64, true);

        ui.loadValuePreset('all-ones'); // -1
        toggleLastMantissaBit();        // -2
        expect($('input-hex-input').value).toBe('0xFFFFFFFFFFFFFFFE');
        expect($('input-comp-value').textContent).toBe('-2');
        expect(int64.decode(0, 0, 2n ** 64n - 2n)).toBe(-2);
    });
});

// Fixing the input box alone left the two panels spelling one encoding two
// different ways: a u64 -> u64 identity conversion read 18446744073709551615 on
// the left and 18446744073709552000 on the right, under identical all-ones
// binary, with the precision-loss row hidden because nothing HAD been lost.
// Every value readout now goes through the same rule.
describe('ui.js: both panels spell one encoding the same way', () => {
    // Every readout that names the value, on both sides of the page.
    const valueReadouts = () => ({
        inputDecimal: $('input-decimal-input').value,
        inputActual: $('input-comp-value').textContent,
        inputMantissa: $('input-comp-mantissa-dec').textContent,
        outputDecimal: $('output-decimal').textContent,
        outputActual: $('output-comp-value').textContent,
        outputMantissa: $('output-comp-mantissa-dec').textContent,
    });

    const lossHidden = () =>
        document.querySelector('.precision-loss').style.display === 'none';

    test('a u64 identity conversion reads the exact value on both sides', () => {
        freshUi({ search: 'in=u64&out=u64&hex=0xFFFFFFFFFFFFFFFF' });
        const exact = '18446744073709551615';

        expect(valueReadouts()).toEqual({
            inputDecimal: exact,
            inputActual: exact,
            // An integer format's field IS its value, so its "mantissa
            // (decimal)" line follows the same rule; toFixed(10) on the rounded
            // double said 18446744073709551616.0000000000, one past the value.
            inputMantissa: exact,
            outputDecimal: exact,
            outputActual: exact,
            outputMantissa: exact,
        });
        expect(lossHidden()).toBe(true);
    });

    test('an i64 identity conversion reads the exact value on both sides', () => {
        freshUi({ search: 'in=i64&out=i64&hex=0x7FFFFFFFFFFFFFFF' });
        const exact = '9223372036854775807'; // 2^63 - 1; the double says ...776000

        const shown = valueReadouts();
        expect(new Set(Object.values(shown))).toEqual(new Set([exact]));
        expect(lossHidden()).toBe(true);
    });

    test('a wide float identity conversion agrees with itself', () => {
        // s1e11m60's max normal is past fp64's range, so decode() calls it
        // Infinity - which is how the output box came to read "Infinity" beside
        // an input box holding 309 exact digits, under identical bits.
        freshUi({ search: 'in=s1e11m60&out=s1e11m60&hex=0x7FEFFFFFFFFFFFFFFF' });
        const format = new FloatingPoint(1, 11, 60);
        const exact = format.toExactDecimalString(format.getMaxNormal(false));

        expect(exact).not.toBe('Infinity');
        expect($('input-decimal-input').value).toBe(exact);
        expect($('input-comp-value').textContent).toBe(exact);
        expect($('output-decimal').textContent).toBe(exact);
        expect($('output-comp-value').textContent).toBe(exact);
        // ...while the encoding is still a Normal, not the Infinity slot.
        expect($('input-comp-type').textContent).toBe('Normal');
        expect(lossHidden()).toBe(true);
    });

    test('a sign the bits carry survives into the output box', () => {
        freshUi({ search: 'in=fp32&out=fp32&hex=0x80000000' });
        // String(-0) is "0", which would drop a sign the binary row shows.
        expect($('input-decimal-input').value).toBe('-0');
        expect($('output-decimal').textContent).toBe('-0');
        expect($('output-comp-value').textContent).toBe('-0');
    });

    // The rule itself, without the page around it.
    test('the spelling rule splits on the field width, not on the format kind', () => {
        const ui = freshUi();
        const u64 = new Integer(64, false);
        const u32 = new Integer(32, false);
        const allOnes = (format) => ({ sign: 0, exponent: 0, mantissa: format.maxMantissa });

        // Past 53 bits an integer's own digits need the exact decimal...
        expect(encodingValueText(u64, allOnes(u64))).toBe('18446744073709551615');
        expect(ui.mantissaDecimalText(u64, allOnes(u64))).toBe('18446744073709551615');
        // ...and below it nothing changes, mantissa line included.
        expect(encodingValueText(u32, allOnes(u32))).toBe('4294967295');
        expect(ui.mantissaDecimalText(u32, allOnes(u32))).toBe('4294967295.0000000000');

        // A float's significand follows the same rule: the double at ten
        // places where the double is the significand, and the exact decimal
        // where a wide field would round it. An all-ones 60-bit normal read
        // 2.0000000000 from the double, a value no normal significand has.
        const wide = new FloatingPoint(1, 11, 60);
        expect(ui.mantissaDecimalText(wide, wide.getMaxNormal(false)))
            .toBe('1.999999999999999999132638262011596452794037759304046630859375');
        expect(ui.mantissaDecimalText(wide, { sign: 0, exponent: 1023, mantissa: 1n << 59n }))
            .toBe('1.5000000000');
    });

    // The exact spelling is for fields a double cannot name. Narrow formats
    // must keep reading the way they always have, or the fix trades one
    // surprising number for a page full of them.
    test.each([
        ['fp16', 'in=fp16&out=fp16&hex=0x3C00', '1', '1.0000000000'],
        ['int8', 'in=int8&out=int8&hex=0x80', '-128', '-128.0000000000'],
        ['mxint8', 'in=mxint8&out=mxint8&hex=0x7F', '1.984375', '1.9843750000'],
        ['fp8_e4m3', 'in=fp8_e4m3&out=fp8_e4m3&hex=0x38', '1', '1.0000000000'],
    ])('%s still reads as a plain double', (_name, search, value, mantissa) => {
        freshUi({ search });
        expect(valueReadouts()).toEqual({
            inputDecimal: value,
            inputActual: value,
            inputMantissa: mantissa,
            outputDecimal: value,
            outputActual: value,
            outputMantissa: mantissa,
        });
    });
});
