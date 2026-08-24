/**
 * @jest-environment jsdom
 */

// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// DOM-driven tests for src/ui.js (the converter UI controller).
//
// src/ui.js runs as a plain browser script and expects FloatingPoint, Integer,
// FORMATS and the url-state helpers to already exist as globals. We install
// them, load the real index.html body as the DOM fixture, then require the
// module fresh for each test so its module-level state starts clean.
const fs = require('fs');
const path = require('path');

const floatingPoint = require('../lib/floating-point.js');
const urlState = require('../src/url-state.js');

// Extract the <body> markup from the shipped page so tests exercise the real
// element IDs and preset buttons rather than a hand-built fixture.
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BODY_HTML = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1];

beforeAll(() => {
    global.FloatingPoint = floatingPoint.FloatingPoint;
    global.Integer = floatingPoint.Integer;
    global.FORMATS = floatingPoint.FORMATS;
    global.buildSearchParams = urlState.buildSearchParams;
    global.parseSearchParams = urlState.parseSearchParams;
    global.decimalToString = urlState.decimalToString;
    global.parseDecimal = urlState.parseDecimal;
});

/**
 * Reset the DOM + URL and require a fresh copy of the UI module. Optionally
 * pass a query string (without leading "?") to exercise URL restoration.
 *
 * The module runs its own initialization (input=FP16, output=BF16) at require
 * time. We then wire event listeners and, when a query string is supplied,
 * restore the URL state — mirroring what the module's DOMContentLoaded handler
 * does, without dispatching that event (which would also fire stale listeners
 * left on the shared jsdom document by earlier requires).
 *
 * Pass `syncUrl: true` to also enter the address-bar-syncing phase, which the
 * real page enters at the end of that handler. Off by default so the existing
 * tests keep their original, quieter behavior.
 */
function freshUi({ search = '', syncUrl = false } = {}) {
    jest.resetModules();
    document.body.innerHTML = BODY_HTML;
    window.history.replaceState(null, '', '/' + (search ? `?${search}` : ''));
    const ui = require('../src/ui.js');
    ui.setupEventListeners();
    if (search) {
        ui.applyStateFromUrl();
    }
    if (syncUrl) {
        ui.enableUrlSync();
        ui.updateOutput();
    }
    return ui;
}

const $ = (id) => document.getElementById(id);
const text = (id) => $(id).textContent;

describe('ui.js — initialization', () => {
    test('loads with FP16 input and BF16 output presets active', () => {
        freshUi();
        expect(text('input-total-bits')).toBe('16');
        expect(text('output-total-bits')).toBe('16');
        expect(document.querySelector('.input-preset[data-format="fp16"]').classList.contains('active')).toBe(true);
        expect(document.querySelector('.output-preset[data-format="bf16"]').classList.contains('active')).toBe(true);
    });

    test('populates the hex field from the initial value', () => {
        freshUi();
        expect($('input-hex-input').value).toMatch(/^0x[0-9A-Fa-f]+$/);
    });
});

describe('ui.js — clampFieldInt', () => {
    test('clamps and falls back for out-of-range or unparseable input', () => {
        const ui = freshUi();
        expect(ui.clampFieldInt('5', 0, 15, 8)).toBe(5);
        expect(ui.clampFieldInt('99', 0, 15, 8)).toBe(15);
        expect(ui.clampFieldInt('-3', 0, 15, 8)).toBe(0);
        expect(ui.clampFieldInt('abc', 0, 15, 8)).toBe(8);
        expect(ui.clampFieldInt('', 0, 15, 8)).toBe(8);
    });
});

describe('ui.js — preset wiring', () => {
    test('loadInputPreset(fp32) updates the format fields and totals', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        expect($('input-exponent-bits').value).toBe('8');
        expect($('input-mantissa-bits').value).toBe('23');
        expect(text('input-total-bits')).toBe('32');
        expect(document.querySelector('.input-preset[data-format="fp32"]').classList.contains('active')).toBe(true);
        expect(document.querySelector('.input-preset[data-format="fp16"]').classList.contains('active')).toBe(false);
    });

    test('integer preset hides sign/exponent controls', () => {
        const ui = freshUi();
        ui.loadInputPreset('int8');
        expect(text('input-total-bits')).toBe('8');
        const signGroup = $('input-sign-bits').closest('.input-group');
        const expGroup = $('input-exponent-bits').closest('.input-group');
        expect(signGroup.style.display).toBe('none');
        expect(expGroup.style.display).toBe('none');
    });

    test('clicking a preset button switches the format', () => {
        freshUi();
        document.querySelector('.input-preset[data-format="fp8_e4m3"]')
            .dispatchEvent(new Event('click', { bubbles: true }));
        expect(text('input-total-bits')).toBe('8');
        expect(document.querySelector('.input-preset[data-format="fp8_e4m3"]').classList.contains('active')).toBe(true);
    });

    test('loadOutputPreset(int16) drives the output format', () => {
        const ui = freshUi();
        ui.loadOutputPreset('int16');
        expect(text('output-total-bits')).toBe('16');
    });
});

describe('ui.js — value input paths', () => {
    test('decimal input updates the encoded representation', () => {
        freshUi();
        const dec = $('input-decimal-input');
        dec.value = '1';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('input-comp-value')).toBe('1');
    });

    test('unparseable decimal input is ignored (keeps last value)', () => {
        freshUi();
        const dec = $('input-decimal-input');
        dec.value = '2';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        const before = text('input-comp-value');
        dec.value = '3.14abc';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('input-comp-value')).toBe(before);
    });

    test('value preset "one" sets the value to 1', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadValuePreset('one');
        expect($('input-decimal-input').value).toBe('1');
    });

    test('value preset "infinity" produces +Infinity for formats that support it', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadValuePreset('infinity');
        expect($('input-decimal-input').value).toBe('Infinity');
        expect(text('input-comp-type')).toBe('+Infinity');
    });

    test('value preset "all-ones" fills every bit', () => {
        const ui = freshUi();
        ui.loadInputPreset('int8');
        ui.loadValuePreset('all-ones');
        // int8 all-ones = -1 (two's complement).
        expect($('input-decimal-input').value).toBe('-1');
    });
});

describe('ui.js — hex input', () => {
    test('valid hex decodes to the expected value', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.handleHexInput({ target: { value: '0x3c00' } });
        expect($('input-decimal-input').value).toBe('1');
    });

    test('overlong hex is rejected without changing the value', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.handleHexInput({ target: { value: '0x3c00' } });
        const before = $('input-decimal-input').value;
        // fp16 is 16 bits (4 nibbles); 5 nibbles must be rejected.
        ui.handleHexInput({ target: { value: '0x12345' } });
        expect($('input-decimal-input').value).toBe(before);
    });

    test('invalid hex characters are rejected', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.handleHexInput({ target: { value: '0x3c00' } });
        const before = $('input-decimal-input').value;
        ui.handleHexInput({ target: { value: '0xZZZZ' } });
        expect($('input-decimal-input').value).toBe(before);
    });
});

describe('ui.js — custom formats and rounding', () => {
    test('editing exponent bits to a non-preset clears the active preset', () => {
        freshUi();
        const exp = $('input-exponent-bits');
        exp.value = '4';
        exp.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.querySelectorAll('.input-preset.active').length).toBe(0);
    });

    test('rounding mode selection changes the output for inexact values', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        ui.loadOutputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '1.7';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        const tiesToEven = text('output-decimal');

        const rm = $('rounding-mode');
        rm.value = 'towardZero';
        rm.dispatchEvent(new Event('change', { bubbles: true }));
        const towardZero = text('output-decimal');

        expect(towardZero).not.toBe(tiesToEven);
    });
});

// The typed decimal must keep being rounded exactly for as long as it is the
// value on screen. Re-encoding it through the parsed double instead double-
// rounds, which lands on the wrong neighbour for the cases below.
describe('ui.js — the typed decimal survives later re-encodes', () => {
    const typeDecimal = (value) => {
        const dec = $('input-decimal-input');
        dec.value = value;
        dec.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const setRoundingMode = (mode) => {
        const rm = $('rounding-mode');
        rm.value = mode;
        rm.dispatchEvent(new Event('change', { bubbles: true }));
    };

    test('changing the rounding mode still rounds the original decimal', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp64');
        typeDecimal('0.1');

        // Number('0.1') is already the nearest double, so a directed mode can
        // only reach the neighbour by rounding the decimal itself.
        setRoundingMode('towardZero');
        expect(text('input-comp-value')).toBe('0.09999999999999999');

        setRoundingMode('towardPositive');
        expect(text('input-comp-value')).toBe('0.1');
    });

    test('changing the input format still rounds the original decimal', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        // Number() collapses this onto the fp4 0.5/1.0 midpoint, where
        // ties-to-even would pick 1; the decimal is below it, so 0.5 is correct.
        typeDecimal('0.74999999999999999');

        ui.loadInputPreset('fp4_e2m1');
        expect(text('input-comp-value')).toBe('0.5');
    });

    test('editing bits drops the literal instead of re-applying it', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp64');
        typeDecimal('0.1');

        // Toggling a bit makes the value come from the bit pattern, so a later
        // rounding-mode change must re-encode those bits, not the stale text.
        const cb = document.querySelector('#input-binary-mantissa-checks input[type="checkbox"]');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        const afterEdit = $('input-decimal-input').value;

        setRoundingMode('towardZero');
        expect(text('input-comp-value')).toBe(afterEdit);
    });

    test('a value preset drops the literal', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp4_e2m1');
        typeDecimal('0.74999999999999999');
        expect(text('input-comp-value')).toBe('0.5');

        ui.loadValuePreset('one');
        setRoundingMode('towardZero');
        expect(text('input-comp-value')).toBe('1');
    });

    test('typing a hex bit pattern drops the literal', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp64');
        typeDecimal('0.1');

        // Hex names a bit pattern outright, so the typed decimal no longer
        // describes the value and must not be re-applied on the next re-encode.
        const hex = $('input-hex-input');
        hex.value = '0x4000000000000000'; // 2.0
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('input-comp-value')).toBe('2');

        setRoundingMode('towardZero');
        expect(text('input-comp-value')).toBe('2');
    });

    test('an integer format hex pattern also drops the literal', () => {
        const ui = freshUi();
        ui.loadInputPreset('int8');
        typeDecimal('100');

        const hex = $('input-hex-input');
        hex.value = '0x7F';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('input-comp-value')).toBe('127');

        setRoundingMode('towardZero');
        expect(text('input-comp-value')).toBe('127');
    });
});

describe('ui.js — binary checkbox toggling', () => {
    test('toggling a mantissa bit updates the decoded value', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadValuePreset('one'); // 0x3C00
        const before = $('input-decimal-input').value;
        const cb = document.querySelector('#input-binary-mantissa-checks input[type="checkbox"]');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        expect($('input-decimal-input').value).not.toBe(before);
    });
});

describe('ui.js — URL state restoration', () => {
    test('restores preset formats, decimal value, and rounding mode', () => {
        freshUi({ search: 'in=fp32&out=fp16&val=2&rm=towardZero' });
        expect(text('input-total-bits')).toBe('32');
        expect(text('output-total-bits')).toBe('16');
        expect($('input-decimal-input').value).toBe('2');
        expect($('rounding-mode').value).toBe('towardZero');
    });

    test('restores a custom floating-point format', () => {
        freshUi({ search: 'in=s1e6m5&out=fp16&val=1' });
        expect(text('input-total-bits')).toBe('12');
    });

    test('restores an integer format', () => {
        freshUi({ search: 'in=i8&out=u8&val=5' });
        expect(text('input-total-bits')).toBe('8');
        expect($('input-decimal-input').value).toBe('5');
    });

    test('restores an exact bit pattern from a hex parameter', () => {
        freshUi({ search: 'in=fp16&out=fp16&hex=0x3c00' });
        expect($('input-decimal-input').value).toBe('1');
    });
});

// ── Regressions from the 2026-08-23 local-changes review ─────

describe('ui.js — component metadata follows the subnormal regime', () => {
    const { FloatingPoint } = floatingPoint;

    test('an ordinary IEEE format still uses the subnormal formulas at field 0', () => {
        const ui = freshUi();
        const fp16 = FloatingPoint.fromFormat('fp16');
        expect(ui.formatExponentActual(fp16, 0, 0)).toBe('1 - 15 = -14');
        expect(ui.calculateMantissaDecimal(fp16, 0, 0)).toBe(0);
        expect(ui.calculateMantissaDecimal(fp16, 0, 512)).toBe(0.5);
        // ... and the normal formulas elsewhere.
        expect(ui.formatExponentActual(fp16, 15, 0)).toBe('15 - 15 = 0');
        expect(ui.calculateMantissaDecimal(fp16, 15, 512)).toBe(1.5);
    });

    test('E8M0 field 0 is a NORMAL binade, not a subnormal', () => {
        const ui = freshUi();
        const e8m0 = FloatingPoint.fromFormat('e8m0');
        expect(e8m0.classify(0, 0, 0)).toBe('Normal');
        expect(ui.formatExponentActual(e8m0, 0, 0)).toBe('0 - 127 = -127');
        expect(ui.calculateMantissaDecimal(e8m0, 0, 0)).toBe(1.0);
        // The rest of the range is unaffected.
        expect(ui.formatExponentActual(e8m0, 129, 0)).toBe('129 - 127 = 2');
        expect(ui.calculateMantissaDecimal(e8m0, 129, 0)).toBe(1.0);
    });

    test('a zero-mantissa format WITH subnormals keeps the 0 significand', () => {
        const ui = freshUi();
        const custom = new FloatingPoint(1, 5, 0, { hasInfinity: false, hasNaN: false });
        expect(custom.classify(0, 0, 0)).toBe('Zero');
        expect(ui.calculateMantissaDecimal(custom, 0, 0)).toBe(0);
        expect(ui.formatExponentActual(custom, 0, 0)).toBe('1 - 15 = -14');
    });

    test('the E8M0 min-normal preset renders consistent components in the DOM', () => {
        const ui = freshUi();
        ui.loadInputPreset('e8m0');
        ui.loadValuePreset('min-norm');

        expect($('input-hex-input').value).toBe('0x00');
        expect(text('input-comp-type')).toBe('Normal');
        expect(text('input-comp-exp-actual')).toBe('0 - 127 = -127');
        expect(text('input-comp-mantissa-dec')).toBe('1.0000000000');
        expect(text('input-comp-value')).toBe(String(Math.pow(2, -127)));
    });
});

describe('ui.js — a customized MXINT8 drops its hidden symmetric range', () => {
    const editBits = (id, value) => {
        $(id).value = String(value);
        $(id).dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const query = () => window.location.search.replace(/^\?/, '');

    // The observable that actually distinguishes the two formats. A 9-bit,
    // 6-fraction-bit integer saturates -4 to itself when non-symmetric, but to
    // -255/64 = -3.984375 when the most-negative encoding is left unused. This
    // is asserted on the DECODED VALUE rather than on any hint text, so it
    // survives changes to how the UI explains itself.
    const saturateNegative = () => {
        editBits('input-decimal-input', -4);
        return text('input-comp-value');
    };
    const NON_SYMMETRIC = '-4';
    const SYMMETRIC = '-3.984375';

    test('the untouched preset stays symmetric and serializes as mxint8', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('mxint8');
        expect(document.querySelector('.input-preset[data-format="mxint8"]')
            .classList.contains('active')).toBe(true);
        expect(query()).toContain('in=mxint8');
        // 8-bit symmetric: -2 saturates to -127/64.
        editBits('input-decimal-input', -2);
        expect(text('input-comp-value')).toBe('-1.984375');
    });

    test('editing the width clears the preset AND the symmetry', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('mxint8');
        editBits('input-mantissa-bits', 9);

        expect(document.querySelector('.input-preset[data-format="mxint8"]')
            .classList.contains('active')).toBe(false);
        expect(query()).toContain('in=i9q6');
        // The live format must be the one the link can reproduce.
        expect(saturateNegative()).toBe(NON_SYMMETRIC);
        expect(saturateNegative()).not.toBe(SYMMETRIC);
    });

    test('the generated link restores the same range it was generated from', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('mxint8');
        editBits('input-mantissa-bits', 9);
        const before = saturateNegative();
        const search = query();

        freshUi({ search });
        expect($('input-mantissa-bits').value).toBe('9');
        expect($('input-fraction-bits').value).toBe('6');
        expect(saturateNegative()).toBe(before);
    });

    test('editing the scale also drops the symmetry', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('mxint8');
        editBits('input-fraction-bits', 5);

        expect(document.querySelector('.input-preset[data-format="mxint8"]')
            .classList.contains('active')).toBe(false);
        expect(query()).toContain('in=i8q5');
        // 8-bit, 5 fraction bits, non-symmetric: -128/32 = -4.
        expect(saturateNegative()).toBe(NON_SYMMETRIC);
    });

    test('the output path follows the identical rule', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('fp16');
        ui.loadOutputPreset('mxint8');
        expect(query()).toContain('out=mxint8');
        editBits('input-decimal-input', -4);
        expect(text('output-comp-value')).toBe('-1.984375');

        editBits('output-mantissa-bits', 9);
        expect(document.querySelector('.output-preset[data-format="mxint8"]')
            .classList.contains('active')).toBe(false);
        expect(query()).toContain('out=i9q6');
        expect(text('output-comp-value')).toBe(NON_SYMMETRIC);
    });

    test('a plain INT8 width edit is unaffected', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('int8');
        editBits('input-mantissa-bits', 9);
        expect(query()).toContain('in=i9');
        expect(query()).not.toContain('q');
    });
});
