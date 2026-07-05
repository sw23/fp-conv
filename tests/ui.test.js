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
 */
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
