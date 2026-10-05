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
    global.sameValue = floatingPoint.sameValue;
    global.sameEncoding = floatingPoint.sameEncoding;
    global.normalizedEncoding = floatingPoint.normalizedEncoding;
    global.CONVERSION_LOSS_LABELS = floatingPoint.CONVERSION_LOSS_LABELS;
    global.conversionLoss = floatingPoint.conversionLoss;
    global.convertEncoded = floatingPoint.convertEncoded;
    global.showsDecodedValue = floatingPoint.showsDecodedValue;
    global.encodingValueText = floatingPoint.encodingValueText;
    global.showsDecodedSignificand = floatingPoint.showsDecodedSignificand;
    global.buildSearchParams = urlState.buildSearchParams;
    global.parseSearchParams = urlState.parseSearchParams;
    global.decimalToString = urlState.decimalToString;
    global.parseDecimal = urlState.parseDecimal;
    global.findFloatPresetKey = urlState.findFloatPresetKey;
    global.findIntPresetKey = urlState.findIntPresetKey;
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

// Type a decimal into the input field the way a person would, and hand back the
// field so a caller can assert on it.
const typeDecimal = (value) => {
    const dec = $('input-decimal-input');
    dec.value = value;
    dec.dispatchEvent(new Event('input', { bubbles: true }));
    return dec;
};

const setOverflowMode = (mode) => {
    const overflow = $('overflow-mode');
    overflow.value = mode;
    overflow.dispatchEvent(new Event('change', { bubbles: true }));
};

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

    test('inexact decimal input shows the represented source value inline', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '0.1';
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        const represented = $('input-represented-value');
        expect(dec.classList.contains('input-inexact')).toBe(true);
        expect(represented.hidden).toBe(false);
        expect(represented.textContent).toBe('0.0999755859375');
        expect(represented.title).toBe('0.0999755859375');
        expect(represented.hasAttribute('aria-live')).toBe(false);
        expect(dec.hasAttribute('aria-describedby')).toBe(false);
        expect($('input-representation-message').hidden).toBe(false);
        expect($('input-representation-message').textContent)
            .toBe('Input not representable; using value:');
    });

    test('exact decimal input has no representation error', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '0.5';
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        expect(dec.classList.contains('input-inexact')).toBe(false);
        expect($('input-representation-message').hidden).toBe(true);
        expect($('input-represented-value').hidden).toBe(true);
        expect($('input-represented-value').textContent).toBe('');
    });

    test('out-of-range decimal reports the source format fallback', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '1e40';
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        expect(dec.classList.contains('input-inexact')).toBe(true);
        expect($('input-represented-value').textContent).toBe('Infinity');
    });

    test('preset and hex input clear a previous representation error', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '0.1';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        expect($('input-represented-value').hidden).toBe(false);

        ui.loadValuePreset('one');
        expect($('input-represented-value').hidden).toBe(true);

        dec.value = '0.1';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        ui.handleHexInput({ target: { value: '0x3c00' } });
        expect($('input-represented-value').hidden).toBe(true);
    });

    test('clicking the represented value accepts it, restores full width, and updates the URL', () => {
        const ui = freshUi({ syncUrl: true });
        ui.loadInputPreset('fp16');
        const dec = $('input-decimal-input');
        dec.value = '0.1';
        dec.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dec.closest('.decimal-input-row').classList.contains('has-represented-value')).toBe(true);

        $('input-represented-value').click();

        expect(dec.value).toBe('0.0999755859375');
        expect(dec.classList.contains('input-inexact')).toBe(false);
        expect($('input-representation-message').hidden).toBe(true);
        expect($('input-represented-value').hidden).toBe(true);
        expect(dec.closest('.decimal-input-row').classList.contains('has-represented-value')).toBe(false);
        expect($('input-hex-input').value).toBe('0x2E66');
        expect(new URLSearchParams(window.location.search).get('val')).toBe('0.0999755859375');

        const acceptedSearch = window.location.search.replace(/^\?/, '');
        freshUi({ search: acceptedSearch });
        expect($('input-decimal-input').value).toBe('0.0999755859375');
        expect($('input-represented-value').hidden).toBe(true);
    });

    test('scientific notation input shows a distinguishable represented value', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp64');
        const dec = $('input-decimal-input');
        dec.value = '5.5566406259e-44';
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        const fp64 = floatingPoint.FloatingPoint.fromFormat('fp64');
        const encoded = fp64.encode('5.5566406259e-44');
        const exact = fp64.toExactDecimalString(encoded);
        expect(dec.value).toBe('5.5566406259e-44');
        expect(text('input-comp-value')).toBe('5.5566406259e-44');
        expect($('input-represented-value').textContent).toBe(exact);
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

    test('leading zero digits are fine: the format reads the pattern by its bits', () => {
        // The one rule the decode tool and the format pages share
        // (fromHexString): what fits is read, what does not is refused.
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.handleHexInput({ target: { value: '0x03c00' } });
        expect($('input-decimal-input').value).toBe('1');
        ui.handleHexInput({ target: { value: ' 4000 ' } });
        expect($('input-decimal-input').value).toBe('2');
    });
});

// The lit preset button is the one the URL names (url-state's matchers decide
// both), so it goes dark when a flag, width or scale leaves the preset and
// lights again when the controls get back to it.
describe('ui.js — the lit format preset names the live format', () => {
    const active = (side) => Array.from(document.querySelectorAll(`.${side}-preset.active`))
        .map(btn => btn.dataset.format);
    const set = (id, value) => {
        const el = $(id);
        if (el.type === 'checkbox') {
            el.checked = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    test('a flag that leaves the preset turns its button off, and back on', () => {
        freshUi({ syncUrl: true });
        const ui = require('../src/ui.js');
        ui.loadInputPreset('fp32');
        set('input-has-infinity', false);
        expect(active('input')).toEqual([]);
        expect(new URLSearchParams(window.location.search).get('in')).toBe('s1e8m23i0');
        set('input-has-infinity', true);
        expect(active('input')).toEqual(['fp32']);
        expect(new URLSearchParams(window.location.search).get('in')).toBe('fp32');
    });

    test('E8M0 with subnormals is no longer E8M0', () => {
        const ui = freshUi();
        ui.loadOutputPreset('e8m0');
        expect(active('output')).toEqual(['e8m0']);
        set('output-has-subnormals', true);
        expect(active('output')).toEqual([]);
    });

    test('a hand-made layout that matches a preset lights it', () => {
        freshUi();
        // FP16 -> exponent 8 and mantissa 10 is TF32's layout.
        set('input-exponent-bits', '8');
        expect(active('input')).toEqual(['tf32']);
    });

    test('an integer width edited away and back re-lights the preset', () => {
        const ui = freshUi();
        ui.loadInputPreset('int8');
        set('input-mantissa-bits', '9');
        expect(active('input')).toEqual([]);
        set('input-mantissa-bits', '8');
        expect(active('input')).toEqual(['int8']);
    });

    test('a custom integer link that is a preset lights it', () => {
        freshUi({ search: 'in=i8&out=u16&val=5' });
        expect(active('input')).toEqual(['int8']);
        expect(active('output')).toEqual(['uint16']);
        // i8q6 is MXINT8's shape without its symmetric range, so not MXINT8.
        freshUi({ search: 'in=i8q6&out=fp16&val=1' });
        expect(active('input')).toEqual([]);
    });

    // The page has no bias control, so a preset with another bias could not
    // be built from its controls, and the matchers do not compare bias.
    test('every float preset uses the default bias', () => {
        for (const [key, f] of Object.entries(floatingPoint.FORMATS)) {
            if (f.isInteger || f.bias === undefined) continue;
            expect([key, f.bias]).toEqual([key, Math.pow(2, f.exponent - 1) - 1]);
        }
    });
});

// Clearing a width to retype it used to read the blank as FP32's or FP16's
// width, swapping the live format for one keystroke.
describe('ui.js — a blank width keeps the last one', () => {
    test('a blank exponent or mantissa field changes nothing', () => {
        const ui = freshUi();
        ui.loadInputPreset('bf16');
        ui.loadOutputPreset('fp8_e5m2');
        for (const id of ['input-exponent-bits', 'input-mantissa-bits']) {
            $(id).value = '';
            $(id).dispatchEvent(new Event('input', { bubbles: true }));
            expect(text('input-total-bits')).toBe('16');
            expect(document.querySelector('.input-preset[data-format="bf16"]').classList.contains('active')).toBe(true);
        }
        $('output-mantissa-bits').value = '';
        $('output-mantissa-bits').dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('output-total-bits')).toBe('8');
    });

    test('a blank integer width or scale keeps the last one too', () => {
        const ui = freshUi();
        ui.loadInputPreset('mxint8');
        $('input-mantissa-bits').value = '';
        $('input-mantissa-bits').dispatchEvent(new Event('input', { bubbles: true }));
        $('input-fraction-bits').value = '';
        $('input-fraction-bits').dispatchEvent(new Event('input', { bubbles: true }));
        expect(text('input-total-bits')).toBe('8');
        expect(document.querySelector('.input-preset[data-format="mxint8"]').classList.contains('active')).toBe(true);
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
        const inputHex = $('input-hex-input').value;
        const tiesToEven = text('output-decimal');

        const rm = $('rounding-mode');
        rm.value = 'towardZero';
        rm.dispatchEvent(new Event('change', { bubbles: true }));
        const towardZero = text('output-decimal');

        expect(towardZero).not.toBe(tiesToEven);
        expect($('input-hex-input').value).toBe(inputHex);
    });

    test('overflow mode applies only to the output conversion', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadOutputPreset('e8m0');

        typeDecimal('Infinity');
        setOverflowMode('saturate');

        expect($('input-hex-input').value).toBe('0x7C00');
        expect(text('input-comp-type')).toBe('+Infinity');
        expect(text('output-hex')).toBe('0xFE');
        expect(text('output-comp-type')).toBe('Normal');
    });

    test('max normal and Infinity never highlight together under saturation', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadOutputPreset('e8m0');

        typeDecimal('65504');
        setOverflowMode('saturate');

        const maxNormal = document.querySelector('.preset-btn[data-value="max-norm"]:not(.output-value-preset)');
        const infinity = document.querySelector('.preset-btn[data-value="infinity"]:not(.output-value-preset)');
        expect(maxNormal.classList.contains('active')).toBe(true);
        expect(infinity.classList.contains('active')).toBe(false);

        typeDecimal('Infinity');
        expect(maxNormal.classList.contains('active')).toBe(false);
        expect(infinity.classList.contains('active')).toBe(true);
    });
});

// The "input not representable; using value" alert. A decimal that rounds was
// already covered; these are the inputs with no decimal literal to check, where
// the question is whether the value survived the encoding at all.
describe('inexact-input alert for NaN and Infinity', () => {
    const type = (ui, preset, decimal) => {
        ui.loadInputPreset(preset);
        return typeDecimal(decimal);
    };
    const usingValue = () => $('input-represented-value').textContent;

    // [input format, typed text, the value the format substitutes]
    const SUBSTITUTED = [
        ['fp4_e2m1', 'nan', '6'],
        ['fp4_e2m1', 'inf', '6'],
        ['fp4_e2m1', '-inf', '-6'],
        ['fp6_e3m2', 'nan', '28'],
        ['fp8_e4m3', 'inf', '448'],
        ['mxint8', 'nan', '1.984375'],
        ['e8m0', '-inf', '170141183460469231731687303715884105728'],
        ['int8', 'nan', '0'],
    ];

    for (const [preset, text, substituted] of SUBSTITUTED) {
        test(`${preset} flags "${text}" and offers ${substituted}`, () => {
            const ui = freshUi();
            const dec = type(ui, preset, text);
            expect(dec.classList.contains('input-inexact')).toBe(true);
            expect($('input-representation-message').hidden).toBe(false);
            expect(usingValue()).toBe(substituted);
        });
    }

    // A format that HAS the encoding lost nothing, so there is nothing to say.
    for (const [preset, text] of [['fp16', 'nan'], ['fp16', 'inf'], ['fp16', '-inf'],
        ['fp8_e5m2', 'inf'], ['fp8_e4m3', 'nan'], ['e8m0', 'nan']]) {
        test(`${preset} does not flag "${text}", which it can represent`, () => {
            const ui = freshUi();
            const dec = type(ui, preset, text);
            expect(dec.classList.contains('input-inexact')).toBe(false);
            expect($('input-representation-message').hidden).toBe(true);
        });
    }

    test('the offered value is the one the converter shows, and accepting it clears the alert', () => {
        const ui = freshUi();
        const dec = type(ui, 'fp4_e2m1', 'nan');
        const offered = usingValue();
        expect(text('input-comp-value')).toBe(offered);

        $('input-represented-value').click();
        expect(dec.value).toBe(offered);
        expect(dec.classList.contains('input-inexact')).toBe(false);
        expect(text('input-comp-value')).toBe(offered);
    });
});

// NaN and Infinity into a format that cannot hold them. The loss row must not
// read as lossless just because |in - out| is NaN.
describe('precision loss for special values', () => {
    const convert = (ui, inputPreset, outputPreset, decimal, overflowMode) => {
        ui.loadInputPreset(inputPreset);
        ui.loadOutputPreset(outputPreset);
        if (overflowMode) setOverflowMode(overflowMode);
        typeDecimal(decimal);
    };
    const lossRow = () => document.querySelector('.precision-loss');
    const lossShown = () => lossRow().style.display !== 'none';

    test('NaN into FP4 becomes +6 and is reported as a loss', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp4_e2m1', 'NaN');
        expect(text('output-hex')).toBe('0x7');
        expect(lossShown()).toBe(true);
        expect(text('output-precision-loss')).toBe('NaN not representable');
    });

    test('NaN into a format with NaN is lossless', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp16', 'NaN');
        expect(lossShown()).toBe(false);
    });

    test('Infinity into Infinity is lossless', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp16', 'Infinity');
        expect(lossShown()).toBe(false);
    });

    test('Infinity saturated into E4M3 is labelled saturated', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp8_e4m3', 'Infinity', 'saturate');
        expect(text('output-hex')).toBe('0x7E');
        expect(text('output-precision-loss')).toBe('saturated');
        expect(lossShown()).toBe(true);
    });

    test('Infinity into E4M3 under overflow is NaN and labelled overflow', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp8_e4m3', 'Infinity', 'overflow');
        expect(text('output-comp-type')).toBe('NaN');
        expect(text('output-precision-loss')).toBe('overflow');
        expect(lossShown()).toBe(true);
    });

    test('-Infinity into E8M0 saturates to 2^127', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'e8m0', '-Infinity', 'saturate');
        expect(text('output-hex')).toBe('0xFE');
        expect(text('output-precision-loss')).toBe('saturated');
    });

    test('an ordinary rounding still shows the numbers', () => {
        const ui = freshUi();
        convert(ui, 'fp32', 'fp16', '3.14159265');
        expect(lossShown()).toBe(true);
        expect(text('output-precision-loss')).toMatch(/^[\d.]+e[+-]\d+ \([\d.]+%\)$/);
    });

    // An unsigned format that HAS an infinity reflects -Infinity to +Infinity.
    // Nothing ran out of range and nothing was clamped, so the row used to lie
    // by calling it an overflow.
    test('-Infinity reflected by an unsigned output format is not called an overflow', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');

        // Build a 0/5/2 unsigned output layout through the real controls.
        const signBox = $('output-sign-bits');
        signBox.checked = false;
        signBox.dispatchEvent(new Event('change', { bubbles: true }));
        for (const [id, value] of [['output-exponent-bits', '5'], ['output-mantissa-bits', '2']]) {
            const field = $(id);
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const dec = $('input-decimal-input');
        dec.value = '-Infinity';
        dec.dispatchEvent(new Event('input', { bubbles: true }));

        expect(text('output-comp-type')).toBe('+Infinity');
        expect(lossShown()).toBe(true);
        expect(text('output-precision-loss')).toBe('sign not representable');
    });
});

// The typed decimal must keep being rounded exactly for as long as it is the
// value on screen. Re-encoding it through the parsed double instead double-
// rounds, which lands on the wrong neighbour for the cases below.
describe('ui.js — the typed decimal survives later re-encodes', () => {
    const setRoundingMode = (mode) => {
        const rm = $('rounding-mode');
        rm.value = mode;
        rm.dispatchEvent(new Event('change', { bubbles: true }));
    };

    test('changing the output rounding mode leaves the input representation unchanged', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp64');
        ui.loadOutputPreset('fp32');
        typeDecimal('0.1');
        const inputHex = $('input-hex-input').value;

        setRoundingMode('towardZero');
        expect($('input-hex-input').value).toBe(inputHex);
        expect(text('output-hex')).toBe('0x3DCCCCCC');

        setRoundingMode('towardPositive');
        expect($('input-hex-input').value).toBe(inputHex);
        expect(text('output-hex')).toBe('0x3DCCCCCD');
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
    // The fragment is navigation (the About anchor), not state.
    test('keeping the URL in sync leaves the fragment alone', () => {
        const ui = freshUi({ syncUrl: true });
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#about');
        ui.loadInputPreset('fp32');
        expect(window.location.hash).toBe('#about');
        expect(new URLSearchParams(window.location.search).get('in')).toBe('fp32');
    });

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

    // handleHexInput() never writes the hex field back, because the reader is
    // normally typing in it. A link is the one caller that has to, and it did
    // not: every other panel showed the linked bits while the box went on
    // showing the startup value's hex.
    test('a hex link fills the hex field itself, not just the rest of the page', () => {
        freshUi({ search: 'in=fp16&out=fp16&hex=0x3c00' });
        expect($('input-hex-input').value).toBe('0x3C00');
    });

    test('a hex link fills the field at a width past 53 bits', () => {
        freshUi({ search: 'in=u64&out=u64&hex=0xFFFFFFFFFFFFFFFF' });
        expect($('input-hex-input').value).toBe('0xFFFFFFFFFFFFFFFF');
        expect($('input-decimal-input').value).toBe('18446744073709551615');
    });

    // A guard on HOW the box is filled rather than on the bug above: spelling
    // it from the committed encoding rather than from the link text is what
    // keeps a refused pattern (here, 64 bits of link aimed at a 16-bit format)
    // from being displayed over bits the page never adopted.
    test('a hex link too wide for the format leaves the field on the live value', () => {
        freshUi({ search: 'in=fp16&out=fp16&hex=0xFFFFFFFFFFFFFFFF' });
        const shown = $('input-hex-input').value;
        expect(shown).not.toBe('0xFFFFFFFFFFFFFFFF');

        // It is the hex of the bits the checkbox row is showing - the page's
        // other rendering of the same encoding - so the two still agree.
        const bits = Array.from(document.querySelectorAll(
            '#input-binary-sign-checks input, #input-binary-exponent-checks input, ' +
            '#input-binary-mantissa-checks input'))
            .map((box) => (box.checked ? '1' : '0')).join('');
        expect(bits).toHaveLength(16);
        expect(shown).toBe(
            '0x' + BigInt('0b' + bits).toString(16).toUpperCase().padStart(4, '0'));
    });

    test('output policies in a shared link do not alter the input or its preset highlight', () => {
        freshUi({
            search: 'in=fp16&out=e8m0&val=65504&rm=tiesToAway&om=saturate',
        });

        const maxNormal = document.querySelector('.preset-btn[data-value="max-norm"]:not(.output-value-preset)');
        const infinity = document.querySelector('.preset-btn[data-value="infinity"]:not(.output-value-preset)');
        expect($('input-hex-input').value).toBe('0x7BFF');
        expect(text('input-comp-type')).toBe('Normal');
        expect(maxNormal.classList.contains('active')).toBe(true);
        expect(infinity.classList.contains('active')).toBe(false);
        expect(text('output-hex')).toBe('0x8F');
    });

    test('shared decimal links report source quantization', () => {
        freshUi({ search: 'in=fp16&out=fp32&val=0.1' });
        expect($('input-decimal-input').classList.contains('input-inexact')).toBe(true);
        expect($('input-represented-value').hidden).toBe(false);
        expect($('input-represented-value').textContent).toBe('0.0999755859375');
    });

    test('shared scientific notation links are accepted', () => {
        freshUi({ search: 'in=fp64&out=fp32&val=5.5566406259e-44' });
        const fp64 = floatingPoint.FloatingPoint.fromFormat('fp64');
        const exact = fp64.toExactDecimalString(fp64.encode('5.5566406259e-44'));
        expect($('input-decimal-input').value).toBe('5.5566406259e-44');
        expect($('input-represented-value').textContent).toBe(exact);
    });

    test('accepting a scientific suggestion survives URL reload verbatim', () => {
        freshUi({
            search: 'in=fp64&out=fp32&val=5.5566406259e-44',
            syncUrl: true,
        });
        $('input-represented-value').click();
        const accepted = $('input-decimal-input').value;
        const search = window.location.search.replace(/^\?/, '');

        expect(new URLSearchParams(window.location.search).get('val')).toBe(accepted);
        freshUi({ search });
        expect($('input-decimal-input').value).toBe(accepted);
        expect($('input-represented-value').hidden).toBe(true);
        expect($('input-decimal-input').closest('.decimal-input-row')
            .classList.contains('has-represented-value')).toBe(false);
    });
});

// ── Regressions from the 2026-08-23 local-changes review ─────

describe('ui.js — component metadata follows the subnormal regime', () => {
    const { FloatingPoint } = floatingPoint;

    test('an ordinary IEEE format still uses the subnormal formulas at field 0', () => {
        freshUi();
        const fp16 = FloatingPoint.fromFormat('fp16');
        expect(fp16.exponentText(0, 0)).toBe('1 - 15 = -14');
        expect(fp16.significand(0, 0)).toBe(0);
        expect(fp16.significand(0, 512)).toBe(0.5);
        // ... and the normal formulas elsewhere.
        expect(fp16.exponentText(15, 0)).toBe('15 - 15 = 0');
        expect(fp16.significand(15, 512)).toBe(1.5);
    });

    test('E8M0 field 0 is a NORMAL binade, not a subnormal', () => {
        freshUi();
        const e8m0 = FloatingPoint.fromFormat('e8m0');
        expect(e8m0.classify(0, 0, 0)).toBe('Normal');
        expect(e8m0.exponentText(0, 0)).toBe('0 - 127 = -127');
        expect(e8m0.significand(0, 0)).toBe(1.0);
        // The rest of the range is unaffected.
        expect(e8m0.exponentText(129, 0)).toBe('129 - 127 = 2');
        expect(e8m0.significand(129, 0)).toBe(1.0);
    });

    test('a zero-mantissa format WITH subnormals keeps the 0 significand', () => {
        freshUi();
        const custom = new FloatingPoint(1, 5, 0, { hasInfinity: false, hasNaN: false });
        expect(custom.classify(0, 0, 0)).toBe('Zero');
        expect(custom.significand(0, 0)).toBe(0);
        expect(custom.exponentText(0, 0)).toBe('1 - 15 = -14');
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

// ── What the decimal box says, and when it is flagged ─────────────
//
// A value that came from BITS used to be written into the box as the decoded
// double, which is not the value for any field wider than 53 bits, and the
// inexact flag only ever considered a non-finite value - so a preset the format
// cannot hold passed unremarked.
describe('ui.js — bit-derived values and the inexact flag', () => {
    const inexact = () => $('input-decimal-input').classList.contains('input-inexact');

    test('a 64-bit integer preset shows the exact decimal, not a rounded double', () => {
        const ui = freshUi({ search: 'in=i64&out=fp32' });

        ui.loadValuePreset('max-norm');
        expect($('input-decimal-input').value).toBe('9223372036854775807');
        expect($('input-hex-input').value).toBe('0x7FFFFFFFFFFFFFFF');
        expect(inexact()).toBe(false);

        ui.loadValuePreset('min-norm');
        expect($('input-decimal-input').value).toBe('-9223372036854775808');
        expect($('input-hex-input').value).toBe('0x8000000000000000');
    });

    test('an unsigned 64-bit all-ones pattern reads 18446744073709551615', () => {
        const ui = freshUi({ search: 'in=u64&out=fp32' });
        ui.loadValuePreset('all-ones');
        expect($('input-hex-input').value).toBe('0xFFFFFFFFFFFFFFFF');
        expect($('input-decimal-input').value).toBe('18446744073709551615');
        expect(inexact()).toBe(false);
    });

    test('a value the format cannot hold is flagged even when it is finite', () => {
        // s1e0m8 is a fixed-point layout: its largest magnitude is 255/256, so
        // there is no 1 in it. The One preset used to show a bare "1".
        const ui = freshUi({ search: 'in=s1e0m8&out=fp32' });
        ui.loadValuePreset('one');

        expect($('input-decimal-input').value).toBe('1');
        expect(inexact()).toBe(true);
        expect($('input-represented-value').hidden).toBe(false);
        expect($('input-represented-value').textContent).toBe('0.99609375');
    });

    test('a layout with no exponent field reports no Infinity and no NaN', () => {
        freshUi({ search: 'in=s1e0m8&out=fp32' });
        expect($('input-has-infinity').disabled).toBe(true);
        expect($('input-has-nan').disabled).toBe(true);
        for (const key of ['infinity', 'neg-infinity', 'nan']) {
            expect(document.querySelector(
                `.preset-btn[data-value="${key}"]:not(.output-value-preset)`).disabled).toBe(true);
        }
    });

    test('a layout that claims NaN but has no pattern for it offers no NaN preset', () => {
        // s1e5m0's only maxExponent pattern is Infinity's, so the format has
        // no NaN (the locked box says so) and the library encodes NaN as the
        // max normal (nanTarget()). The NaN button is not offered, and typing
        // "nan" lights the Max preset alone: two presets never light up for
        // one encoding.
        freshUi({ search: 'in=s1e5m0&out=fp32' });
        expect($('input-has-nan').disabled).toBe(true);
        expect($('input-has-nan').checked).toBe(false);
        expect(document.querySelector(
            '.preset-btn[data-value="nan"]:not(.output-value-preset)').disabled).toBe(true);
        typeDecimal('nan');
        const active = [...document.querySelectorAll(
            '.preset-btn[data-value].active:not(.output-value-preset)')].map(b => b.dataset.value);
        expect(active).toEqual(['max-norm']);
    });

    test('an unsigned format offers +Infinity but not -Infinity', () => {
        // getInfinity(true) on s0e8m23 is +Infinity: the preset loaded it with
        // the sign silently dropped and both buttons lit.
        freshUi({ search: 'in=s0e8m23&out=fp32' });
        const btn = (key) => document.querySelector(
            `.preset-btn[data-value="${key}"]:not(.output-value-preset)`);
        expect(btn('neg-infinity').disabled).toBe(true);
        btn('infinity').click();
        const active = [...document.querySelectorAll(
            '.preset-btn[data-value].active:not(.output-value-preset)')].map(b => b.dataset.value);
        expect(active).toEqual(['infinity']);
    });

    test('a fixed-point layout lights one preset per encoding and keeps its zero', () => {
        // d0 in the link used to disable Zero on a layout that has one.
        const ui = freshUi({ search: 'in=s1e0m8d0&out=fp32' });
        expect($('input-has-subnormals').disabled).toBe(true);
        const btn = (key) => document.querySelector(
            `.preset-btn[data-value="${key}"]:not(.output-value-preset)`);
        expect(btn('zero').disabled).toBe(false);
        expect(btn('min-subnorm').disabled).toBe(true);
        expect(btn('max-subnorm').disabled).toBe(true);
        // One is left out: it is a value preset, and 1 rounds to the max
        // normal here, so it matches that encoding by design.
        for (const key of ['min-norm', 'max-norm', 'zero']) {
            ui.loadValuePreset(key);
            const active = [...document.querySelectorAll(
                '.preset-btn[data-value].active:not(.output-value-preset)')]
                .map(b => b.dataset.value).filter(k => k !== 'one');
            expect(active).toEqual([key]);
        }
        ui.loadValuePreset('max-norm');
        expect($('input-comp-mantissa-dec').textContent).toBe('0.9960937500');
    });

    test('an infinity locks the NaN checkbox: the layout decides NaN', () => {
        // s1e6m9 with NaN unchecked used to build a format whose top binade
        // decoded as normals but encoded as Infinity. The box is locked while
        // Infinity is on, and shows what the format has: it used to keep a
        // stale "off" there, so the page said "no NaN" beside a working NaN
        // preset, and the generated link (which omits the flag) reloaded with
        // the box on.
        // Input side: the NaN preset is offered exactly when the format has
        // a NaN.
        const ui = freshUi({ search: 'in=s1e6m9&out=fp32' });
        const nanPreset = document.querySelector(
            '.preset-btn[data-value="nan"]:not(.output-value-preset)');
        const toggle = (id) => {
            $(id).checked = !$(id).checked;
            $(id).dispatchEvent(new Event('change', { bubbles: true }));
        };
        expect($('input-has-infinity').checked).toBe(true);
        expect($('input-has-nan').disabled).toBe(true);
        expect($('input-has-nan').checked).toBe(true);
        expect(nanPreset.disabled).toBe(false);
        // Unchecking Infinity hands the choice back, on.
        toggle('input-has-infinity');
        expect($('input-has-nan').disabled).toBe(false);
        expect($('input-has-nan').checked).toBe(true);
        toggle('input-has-nan');
        expect(nanPreset.disabled).toBe(true);
        // Infinity back on: the layout has NaN again, and the box says so.
        toggle('input-has-infinity');
        expect($('input-has-nan').disabled).toBe(true);
        expect($('input-has-nan').checked).toBe(true);
        expect(nanPreset.disabled).toBe(false);
        ui.handleHexInput({ target: { value: '0x7E01' } });
        expect(text('input-comp-type')).toBe('NaN');

        // Output side: a NaN converts to the NaN the format has, else to its
        // substitute.
        freshUi({ search: 'in=fp32&out=s1e6m9' });
        expect($('output-has-nan').disabled).toBe(true);
        expect($('output-has-nan').checked).toBe(true);
        const activeOutput = () => [...document.querySelectorAll('.output-value-preset.active')]
            .map(b => b.dataset.value);
        typeDecimal('nan');
        expect(activeOutput()).toEqual(['nan']);
        toggle('output-has-infinity');
        expect($('output-has-nan').disabled).toBe(false);
        expect(activeOutput()).toEqual(['nan']);
        toggle('output-has-nan');
        expect(activeOutput()).toEqual(['max-norm']);
        toggle('output-has-infinity');
        expect($('output-has-nan').disabled).toBe(true);
        expect($('output-has-nan').checked).toBe(true);
        expect(activeOutput()).toEqual(['nan']);
    });

    test('a layout whose only finite pattern is zero offers no Max Norm', () => {
        // s1e1m0 with an Infinity: getMaxNormal() is the zero pattern, which
        // Zero names; Max Norm used to load it and light three buttons.
        freshUi({ search: 'in=s1e1m0&out=fp32' });
        const btn = (key) => document.querySelector(
            `.preset-btn[data-value="${key}"]:not(.output-value-preset)`);
        expect(btn('max-norm').disabled).toBe(true);
        expect(btn('zero').disabled).toBe(false);
        btn('zero').click();
        // One is a value preset, and 1 rounds to the zero pattern here (the
        // only finite one), so it matches that encoding by design.
        const active = [...document.querySelectorAll(
            '.preset-btn[data-value].active:not(.output-value-preset)')]
            .map(b => b.dataset.value).filter(k => k !== 'one');
        expect(active).toEqual(['zero']);
    });

    test('-0 typed into an unsigned format is flagged: the sign is dropped', () => {
        // isExactlyRepresentable('-0') said yes for a format with no sign bit,
        // while conversionLoss() called the same conversion reflected.
        freshUi({ search: 'in=uint8&out=fp32' });
        const dec = typeDecimal('-0');
        expect(dec.classList.contains('input-inexact')).toBe(true);
        expect($('input-represented-value').textContent).toBe('0');
        // A signed integer has one zero, so -0 lands on it exactly.
        freshUi({ search: 'in=int8&out=fp32' });
        expect(typeDecimal('-0').classList.contains('input-inexact')).toBe(false);
    });

    test('passing through 0 exponent bits keeps the Infinity and NaN choices', () => {
        const ui = freshUi({ search: 'in=s1e5m10&out=fp32' });
        for (const bits of ['0', '5']) {
            $('input-exponent-bits').value = bits;
            ui.updateFormat();
        }
        expect($('input-has-infinity').disabled).toBe(false);
        expect($('input-has-infinity').checked).toBe(true);
        expect($('input-has-nan').checked).toBe(true);
        ui.loadValuePreset('infinity');
        expect($('input-comp-type').textContent).toBe('+Infinity');
    });

    test('Min Normal on a fixed-point layout is its smallest nonzero magnitude', () => {
        const ui = freshUi({ search: 'in=s1e0m8&out=fp32' });
        ui.loadValuePreset('min-norm');
        expect($('input-decimal-input').value).toBe('0.00390625');
        // The page still converts afterwards.
        ui.loadValuePreset('max-norm');
        expect($('input-decimal-input').value).toBe('0.99609375');
    });

    test('bits set to a double\'s value re-encode to the same bits in a wider format', () => {
        // 1/11/60 holds the double 0.1 exactly, but "0.1" is not that value:
        // re-encoding the display text would change the mantissa.
        const ui = freshUi({ search: 'in=s1e11m60&out=fp32' });
        const format = new floatingPoint.FloatingPoint(1, 11, 60);
        const encoded = format.encode(0.1);
        $('input-hex-input').value = format
            .toHexString(encoded.sign, encoded.exponent, encoded.mantissa);
        $('input-hex-input').dispatchEvent(new Event('input', { bubbles: true }));
        const before = $('input-hex-input').value;
        ui.updateFormat();
        expect($('input-hex-input').value).toBe(before);
    });

    test('an exact bit pattern keeps the double\'s own spelling', () => {
        // Nothing about a narrow format needs the long form, and the exact
        // decimal of fp16's smallest subnormal is 24 places long.
        const ui = freshUi();
        ui.loadInputPreset('fp16');
        ui.loadValuePreset('min-subnorm');
        expect($('input-decimal-input').value).toBe('5.960464477539063e-8');
        expect($('input-hex-input').value).toBe('0x0001');
        expect(inexact()).toBe(false);
    });
});

// ── Presets that name an encoding ─────────────────────────────────
describe('ui.js — value presets load bits, not decoded doubles', () => {
    const activeValuePreset = (key) => document.querySelector(
        `.preset-btn[data-value="${key}"]:not(.output-value-preset)`).classList.contains('active');

    test('Max on a format whose max normal overflows a double loads the right bits', () => {
        // 1/11/60 max normal is (1 + (2^60-1)/2^60) * 2^1023, which rounds to
        // 2 * 2^1023 as a double: Infinity. Decoding and re-encoding it used to
        // load the Infinity ENCODING and light up Max and +Infinity together.
        const ui = freshUi({ search: 'in=s1e11m60&out=fp32' });
        const format = new floatingPoint.FloatingPoint(1, 11, 60);
        const max = format.getMaxNormal(false);

        ui.loadValuePreset('max-norm');

        expect($('input-hex-input').value)
            .toBe(format.toHexString(max.sign, max.exponent, max.mantissa));
        expect(text('input-comp-type')).toBe('Normal');
        expect($('input-decimal-input').value).toBe(format.toExactDecimalString(max));
        expect(activeValuePreset('max-norm')).toBe(true);
        expect(activeValuePreset('infinity')).toBe(false);
        expect(activeValuePreset('all-ones')).toBe(false);
    });

    test('Infinity still loads the Infinity encoding and only that button', () => {
        const ui = freshUi({ search: 'in=s1e11m60&out=fp32' });
        ui.loadValuePreset('infinity');
        expect(text('input-comp-type')).toBe('+Infinity');
        expect(activeValuePreset('infinity')).toBe(true);
        expect(activeValuePreset('max-norm')).toBe(false);
    });
});

// ── The loss row on a clamped finite value ────────────────────────
describe('ui.js — a clamped finite value is reported as a clamp', () => {
    test('1e10 into FP16 under saturate names the clamp AND the difference', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        ui.loadOutputPreset('fp16');
        setOverflowMode('saturate');
        typeDecimal('1e10');

        expect(text('output-decimal')).toBe('65504');
        expect(text('output-precision-loss')).toMatch(/^saturated — [\d.]+e[+-]\d+ \([\d.]+%\)$/);
    });

    test('the same value under overflow is an overflow', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        ui.loadOutputPreset('fp16');
        setOverflowMode('overflow');
        typeDecimal('1e10');
        expect(text('output-precision-loss')).toBe('overflow');
    });

    test('-0 into an unsigned output reports the dropped sign, with no fake difference', () => {
        const ui = freshUi();
        ui.loadInputPreset('fp32');
        ui.loadOutputPreset('uint8');
        typeDecimal('-0');
        expect(text('output-precision-loss')).toBe('sign not representable');
    });

    test('-0 into a signed integer is lossless: it has one zero', () => {
        freshUi({ search: 'in=fp32&out=int8&val=-0' });
        expect(document.querySelector('.precision-loss').style.display).toBe('none');
    });
});

// The library names every kind (CONVERSION_LOSS_LABELS), so the row can never
// be blank: a rounding with no numbers to show is named rather than left empty.
describe('ui.js — the precision-loss row is never empty', () => {
    test('a rounding past fp64\'s range, with no numbers, is named', () => {
        // The difference (~1e397) is itself too large for a double.
        freshUi({ search: 'in=s1e15m10&out=s1e15m5&val=1.001e400' });
        expect(document.querySelector('.precision-loss').style.display).toBe('flex');
        expect(text('output-precision-loss')).toBe('rounded');
    });

    test('the numbers are the exact difference, not one between rounded doubles', () => {
        // u64 all-ones -> fp32 is 2^64 - 1 -> 2^64. Both decode to the double
        // 2^64, which used to print a loss of 0 beside 'rounded'.
        const ui = freshUi({ search: 'in=u64&out=fp32' });
        ui.loadValuePreset('all-ones');
        expect(text('output-precision-loss')).toBe('1.000000e+0 (0.000000%)');
    });
});

// docs/overflow-behavior.md describes what each word means. These drive the
// real page for the conversions it names, so the prose cannot drift from the
// row - it had: the doc glossed 'sign not representable' as "the reflection
// above", pointing at -Infinity -> E8M0, which is the one reflection that
// CANNOT report it (E8M0 has no infinity to reflect towards, so the conversion
// lands on overflow or saturated instead).
describe('ui.js — the precision-loss row says what the docs say it says', () => {
    const lossFor = (search) => {
        freshUi({ search });
        return text('output-precision-loss');
    };

    test('a flipped sign, and nothing else, reads "sign not representable"', () => {
        // An unsigned format that HAS an infinity: -Infinity reflects to +Infinity,
        // with nothing clamped and nothing overflowed.
        expect(lossFor('in=fp32&out=s0e8m23&val=-inf&om=overflow'))
            .toBe('sign not representable');
        // -0 into any unsigned format, infinity or not.
        expect(lossFor('in=fp32&out=u32&val=-0')).toBe('sign not representable');
        expect(lossFor('in=fp32&out=s0e8m23&val=-0')).toBe('sign not representable');
    });

    test('-Infinity into E8M0 is NOT reported as a sign problem', () => {
        // The reflection decided which END it saturates to; what the row reports
        // is what actually happened to the value.
        expect(lossFor('in=fp32&out=e8m0&val=-inf&om=overflow')).toBe('overflow');
        expect(lossFor('in=fp32&out=e8m0&val=-inf&om=saturate')).toBe('saturated');
    });

    test('a NaN the format cannot hold reads "NaN not representable"', () => {
        expect(lossFor('in=fp32&out=fp4_e2m1&val=nan')).toBe('NaN not representable');
        expect(lossFor('in=fp32&out=mxint8&val=nan')).toBe('NaN not representable');
        expect(lossFor('in=fp32&out=int8&val=nan')).toBe('NaN not representable');
    });

    // "since both sides of that one are finite the row shows the difference
    // next to the word" - the clamped-finite case is the one that carries both.
    test('a clamped finite value shows the word AND the difference', () => {
        const loss = lossFor('in=fp32&out=fp16&val=70000&om=saturate');
        expect(loss).toMatch(/^saturated — [\d.]+e\+\d+ \([\d.]+%\)$/);
    });

    test('a plain rounding shows the numbers with no word at all', () => {
        const loss = lossFor('in=fp32&out=fp8_e4m3&val=0.1');
        expect(loss).toMatch(/^[\d.]+e-\d+ \([\d.]+%\)$/);
        expect(loss).not.toContain('rounded');
    });
});
