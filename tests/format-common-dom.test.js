/**
 * @jest-environment jsdom
 */

// DOM-dependent unit tests for formats/format-common.js
require('jest-canvas-mock');

const {
    FORMAT_PAGES,
    GROUP_LABELS,
    renderNav,
    renderBitLayout,
    renderRangeTable,
    renderSpecialValues,
    renderIntegerSpecialValues,
    renderComparisonTable,
    initVisualizer,
    initValueDistribution,
    initPage,
} = require('../formats/format-common.js');

// Helper to create a container element with a given id
function createContainer(id) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
    delete window.FORMAT_CONFIG;
    delete window._vizApi;
    delete window._vdApi;
});

// ── renderNav ────────────────────────────────────────────────

describe('renderNav', () => {
    test('renders nothing if #format-nav is missing', () => {
        renderNav('fp32');
        expect(document.body.innerHTML).toBe('');
    });

    test('renders back link and nav groups', () => {
        createContainer('format-nav');
        renderNav('fp32');
        const nav = document.getElementById('format-nav');

        expect(nav.querySelector('.back-link')).toBeTruthy();
        expect(nav.querySelector('.back-link').getAttribute('href')).toBe('../index.html');
    });

    test('renders all format links', () => {
        createContainer('format-nav');
        renderNav('fp32');
        const links = document.querySelectorAll('.nav-link');

        expect(links.length).toBe(Object.keys(FORMAT_PAGES).length);
    });

    test('marks current format as active', () => {
        createContainer('format-nav');
        renderNav('fp16');
        const activeLinks = document.querySelectorAll('.nav-link.active');

        expect(activeLinks.length).toBe(1);
        expect(activeLinks[0].textContent).toBe('FP16');
    });

    test('renders group labels', () => {
        createContainer('format-nav');
        renderNav('fp32');
        const labels = document.querySelectorAll('.nav-group-label');

        const labelTexts = Array.from(labels).map(l => l.textContent.replace(':', ''));
        expect(labelTexts).toContain('IEEE 754');
        expect(labelTexts).toContain('ML');
        expect(labelTexts).toContain('OCP');
        expect(labelTexts).toContain('Integer');
    });

    test('renders separators between groups', () => {
        createContainer('format-nav');
        renderNav('fp32');
        const separators = document.querySelectorAll('.nav-separator');

        // 4 groups → 3 separators
        expect(separators.length).toBe(Object.keys(GROUP_LABELS).length - 1);
    });
});

// ── renderBitLayout ──────────────────────────────────────────

describe('renderBitLayout', () => {
    test('renders nothing if container is missing', () => {
        renderBitLayout('nonexistent', { signBits: 1, exponentBits: 8, mantissaBits: 23 });
        expect(document.body.innerHTML).toBe('');
    });

    test('renders sign + exponent + mantissa for floating-point format', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { signBits: 1, exponentBits: 5, mantissaBits: 10 });
        const container = document.getElementById('bit-layout');

        expect(container.querySelectorAll('.bit-field.sign').length +
               container.querySelectorAll('.bit-field-collapsed.sign').length).toBe(1);
        expect(container.querySelectorAll('.bit-field.exponent').length +
               container.querySelectorAll('.bit-field-collapsed.exponent').length).toBe(1);
        expect(container.querySelectorAll('.bit-field.mantissa').length +
               container.querySelectorAll('.bit-field-collapsed.mantissa').length).toBe(1);
    });

    test('renders individual bit boxes for small fields', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { signBits: 1, exponentBits: 5, mantissaBits: 10 });
        const container = document.getElementById('bit-layout');

        // Sign: 1 box (S), Exponent: 5 boxes (E), Mantissa: 10 boxes (M)
        const boxes = container.querySelectorAll('.bit-box');
        expect(boxes.length).toBe(1 + 5 + 10);
    });

    test('uses collapsed view for fields > 16 bits', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { signBits: 1, exponentBits: 8, mantissaBits: 23 });
        const container = document.getElementById('bit-layout');

        // mantissa (23 bits) should be collapsed
        const collapsed = container.querySelectorAll('.bit-field-collapsed.mantissa');
        expect(collapsed.length).toBe(1);
        expect(collapsed[0].querySelector('.collapsed-box').textContent).toBe('23 bits');

        // exponent (8 bits) should not be collapsed
        const expField = container.querySelector('.bit-field.exponent');
        expect(expField).toBeTruthy();
    });

    test('renders signed integer layout', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { isInteger: true, totalBits: 8, signed: true });
        const container = document.getElementById('bit-layout');

        // Sign (1 bit) + Value (7 bits)
        const signField = container.querySelector('.bit-field.sign');
        expect(signField).toBeTruthy();
        const intField = container.querySelector('.bit-field.integer');
        expect(intField).toBeTruthy();
        expect(intField.querySelectorAll('.bit-box').length).toBe(7);
    });

    test('renders unsigned integer layout', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { isInteger: true, totalBits: 8, signed: false });
        const container = document.getElementById('bit-layout');

        // No sign field, just Value (8 bits)
        expect(container.querySelector('.sign')).toBeNull();
        const intField = container.querySelector('.bit-field.integer');
        expect(intField).toBeTruthy();
        expect(intField.querySelectorAll('.bit-box').length).toBe(8);
    });

    test('integer with >16 bits uses collapsed view', () => {
        createContainer('bit-layout');
        renderBitLayout('bit-layout', { isInteger: true, totalBits: 32, signed: true });
        const container = document.getElementById('bit-layout');

        // Value field (31 bits) should be collapsed
        const collapsed = container.querySelector('.bit-field-collapsed.integer');
        expect(collapsed).toBeTruthy();
        expect(collapsed.querySelector('.collapsed-box').textContent).toBe('31 bits');
    });
});

// ── renderRangeTable ─────────────────────────────────────────

describe('renderRangeTable', () => {
    test('renders nothing if container is missing', () => {
        renderRangeTable('nonexistent', { signBits: 1, exponentBits: 5, mantissaBits: 10 });
        expect(document.body.innerHTML).toBe('');
    });

    test('renders floating-point range table with expected rows', () => {
        createContainer('range-table');
        renderRangeTable('range-table', {
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });
        const table = document.querySelector('.info-table');
        expect(table).toBeTruthy();

        const cells = table.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);
        expect(labels).toContain('Max Positive (Normal)');
        expect(labels).toContain('Min Positive (Normal)');
        expect(labels).toContain('Machine Epsilon (at 1.0)');
        expect(labels).toContain('Supports Infinity');
        expect(labels).toContain('Supports NaN');
    });

    test('renders integer range table with signed columns', () => {
        createContainer('range-table');
        renderRangeTable('range-table', {
            isInteger: true, totalBits: 8, signed: true,
        });
        const table = document.querySelector('.info-table');
        expect(table).toBeTruthy();

        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map(h => h.textContent);
        expect(headerTexts).toContain('Signed (INT8)');
        expect(headerTexts).toContain('Unsigned (UINT8)');
    });

    test('renders unsigned integer range table without signed column', () => {
        createContainer('range-table');
        renderRangeTable('range-table', {
            isInteger: true, totalBits: 4, signed: false,
        });
        const table = document.querySelector('.info-table');
        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map(h => h.textContent);

        expect(headerTexts).toContain('Value');
        expect(headerTexts).not.toContain('Signed (INT4)');
    });
});

// ── renderSpecialValues ──────────────────────────────────────

describe('renderSpecialValues', () => {
    test('renders nothing if container is missing', () => {
        renderSpecialValues('nonexistent', { signBits: 1, exponentBits: 5, mantissaBits: 10 });
        expect(document.body.innerHTML).toBe('');
    });

    test('renders IEEE float special values including Inf and NaN', () => {
        createContainer('special-table');
        renderSpecialValues('special-table', {
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });
        const table = document.querySelector('.special-table');
        expect(table).toBeTruthy();

        const cells = table.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);
        expect(labels).toContain('+0');
        expect(labels).toContain('-0');
        expect(labels).toContain('Min Subnormal');
        expect(labels).toContain('Max Subnormal');
        expect(labels).toContain('Min Normal');
        expect(labels).toContain('Max Normal');
        expect(labels).toContain('+Infinity');
        expect(labels).toContain('-Infinity');
        expect(labels).toContain('NaN');
    });

    test('OCP format without Inf or NaN omits those entries', () => {
        createContainer('special-table');
        renderSpecialValues('special-table', {
            signBits: 1, exponentBits: 4, mantissaBits: 3,
            bias: 7, hasInfinity: false, hasNaN: false,
        });
        const cells = document.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);

        expect(labels).not.toContain('+Infinity');
        expect(labels).not.toContain('-Infinity');
        expect(labels).not.toContain('NaN');
        expect(labels).toContain('+0');
        expect(labels).toContain('Max Normal');
    });

    test('delegates to integer renderer for integer config', () => {
        createContainer('special-table');
        renderSpecialValues('special-table', {
            isInteger: true, totalBits: 4,
        });
        const table = document.querySelector('.special-table');
        expect(table).toBeTruthy();

        // Integer table has Signed and Unsigned columns
        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map(h => h.textContent);
        expect(headerTexts).toContain('Signed');
        expect(headerTexts).toContain('Unsigned');
    });

    test('bit patterns are rendered with colored spans', () => {
        createContainer('special-table');
        renderSpecialValues('special-table', {
            signBits: 1, exponentBits: 5, mantissaBits: 2,
            hasInfinity: true, hasNaN: true,
        });
        const bitCells = document.querySelectorAll('.bit-pattern');
        expect(bitCells.length).toBeGreaterThan(0);

        // Each bit pattern cell should contain colored spans
        const firstCell = bitCells[0];
        expect(firstCell.querySelector('.sign-bits')).toBeTruthy();
        expect(firstCell.querySelector('.exp-bits')).toBeTruthy();
        expect(firstCell.querySelector('.mant-bits')).toBeTruthy();
    });
});

// ── renderIntegerSpecialValues ───────────────────────────────

describe('renderIntegerSpecialValues', () => {
    test('renders 4-bit integer special values', () => {
        const container = createContainer('int-special');
        renderIntegerSpecialValues(container, { totalBits: 4 });

        const table = container.querySelector('.special-table');
        expect(table).toBeTruthy();

        const cells = table.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);
        expect(labels).toContain('Zero');
        expect(labels).toContain('One');
        expect(labels).toContain('Max Unsigned');
        expect(labels).toContain('Max Signed');
    });

    test('shows correct signed/unsigned values for INT4', () => {
        const container = createContainer('int-special');
        renderIntegerSpecialValues(container, { totalBits: 4 });

        const rows = container.querySelectorAll('tr');
        // Header + data rows
        expect(rows.length).toBeGreaterThan(1);

        // Find the "Max Unsigned" row - raw value is 15 (1111)
        // Signed: -1, Unsigned: 15
        const allCells = container.querySelectorAll('td');
        const cellTexts = Array.from(allCells).map(c => c.textContent);
        expect(cellTexts).toContain('15');
        expect(cellTexts).toContain('-1');
    });

    test('bit patterns have correct length', () => {
        const container = createContainer('int-special');
        renderIntegerSpecialValues(container, { totalBits: 8 });

        const bitCells = container.querySelectorAll('.bit-pattern .exp-bits');
        for (const cell of bitCells) {
            expect(cell.textContent.length).toBe(8);
        }
    });
});

// ── renderComparisonTable ────────────────────────────────────

describe('renderComparisonTable', () => {
    test('renders nothing if container is missing', () => {
        renderComparisonTable('nonexistent', 'fp32', ['fp16']);
        expect(document.body.innerHTML).toBe('');
    });

    test('renders comparison table with correct column headers', () => {
        createContainer('comparison-table');
        renderComparisonTable('comparison-table', 'fp32', ['fp16', 'bf16']);
        const table = document.querySelector('.info-table');
        expect(table).toBeTruthy();

        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map(h => h.textContent);
        expect(headerTexts).toContain('Property');
        expect(headerTexts).toContain('FP32');
        expect(headerTexts).toContain('FP16');
        expect(headerTexts).toContain('BF16');
    });

    test('highlights current format column', () => {
        createContainer('comparison-table');
        renderComparisonTable('comparison-table', 'fp32', ['fp16', 'bf16']);
        const currentHeaders = document.querySelectorAll('th.current-format');

        expect(currentHeaders.length).toBe(1);
        expect(currentHeaders[0].textContent).toBe('FP32');
    });

    test('renders float comparison rows', () => {
        createContainer('comparison-table');
        renderComparisonTable('comparison-table', 'fp16', ['fp32']);
        const cells = document.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);

        expect(labels).toContain('Total Bits');
        expect(labels).toContain('Exponent Bits');
        expect(labels).toContain('Mantissa Bits');
        expect(labels).toContain('Bias');
        expect(labels).toContain('Has Infinity');
    });

    test('renders integer comparison rows', () => {
        createContainer('comparison-table');
        renderComparisonTable('comparison-table', 'int8', ['int4', 'int16']);
        const cells = document.querySelectorAll('td.text-cell');
        const labels = Array.from(cells).map(c => c.textContent);

        expect(labels).toContain('Total Bits');
        expect(labels).toContain('Signed Min');
        expect(labels).toContain('Signed Max');
        expect(labels).toContain('Unsigned Max');
    });
});

// ── initVisualizer ───────────────────────────────────────────

describe('initVisualizer', () => {
    function setupVisualizer(config) {
        // Create the minimal DOM structure that initVisualizer expects
        const viz = document.createElement('div');
        viz.id = 'visualizer';
        viz.className = 'visualizer';
        viz.innerHTML = `
            <div class="viz-input-row">
                <div class="viz-input-group">
                    <input type="text" id="viz-decimal" class="viz-decimal-input">
                </div>
                <div class="viz-input-group">
                    <input type="text" id="viz-hex">
                </div>
            </div>
            <div class="viz-presets">
                <button class="viz-preset-btn" data-preset="zero">0</button>
                <button class="viz-preset-btn" data-preset="one">1</button>
                <button class="viz-preset-btn" data-preset="neg-one">-1</button>
                <button class="viz-preset-btn" data-preset="max">Max Norm</button>
                <button class="viz-preset-btn" data-preset="min-normal">Min Norm</button>
                <button class="viz-preset-btn" data-preset="min-sub">Min Sub</button>
                ${config.hasInfinity ? '<button class="viz-preset-btn" data-preset="inf">+Inf</button>' : ''}
                ${config.hasNaN ? '<button class="viz-preset-btn" data-preset="nan">NaN</button>' : ''}
                <button class="viz-preset-btn" data-preset="all-ones">1s</button>
            </div>
            <div class="viz-binary"></div>
            <div class="viz-components"></div>
        `;
        document.body.appendChild(viz);
        initVisualizer(config);
        return viz;
    }

    test('does nothing if #visualizer is missing', () => {
        initVisualizer({ signBits: 1, exponentBits: 5, mantissaBits: 10, hasInfinity: true, hasNaN: true });
        expect(document.body.innerHTML).toBe('');
    });

    test('creates bit sections for floating-point format', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });

        expect(document.querySelector('.sign-section')).toBeTruthy();
        expect(document.querySelector('.exponent-section')).toBeTruthy();
        expect(document.querySelector('.mantissa-section')).toBeTruthy();
    });

    test('creates correct number of bits', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });

        const signBits = document.querySelectorAll('.sign-section .viz-bit');
        const expBits = document.querySelectorAll('.exponent-section .viz-bit');
        const mantBits = document.querySelectorAll('.mantissa-section .viz-bit');

        expect(signBits.length).toBe(1);
        expect(expBits.length).toBe(5);
        expect(mantBits.length).toBe(10);
    });

    test('creates integer bit section', () => {
        const viz = document.createElement('div');
        viz.id = 'visualizer';
        viz.className = 'visualizer';
        viz.innerHTML = `
            <div class="viz-input-row">
                <div class="viz-input-group"><input type="text" id="viz-decimal" class="viz-decimal-input"></div>
                <div class="viz-input-group"><input type="text" id="viz-hex"></div>
            </div>
            <div class="viz-presets">
                <button class="viz-preset-btn" data-preset="zero">0</button>
                <button class="viz-preset-btn" data-preset="one">1</button>
            </div>
            <div class="viz-binary"></div>
            <div class="viz-components"></div>
        `;
        document.body.appendChild(viz);
        initVisualizer({ isInteger: true, totalBits: 8, signed: true });

        const intBits = document.querySelectorAll('.integer-section .viz-bit');
        expect(intBits.length).toBe(8);
    });

    test('sets initial value from config', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            initialValue: 1.5,
        });

        const decimalInput = document.getElementById('viz-decimal');
        expect(decimalInput.value).toBe('1.5');
    });

    test('exposes _vizApi on window', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });

        expect(window._vizApi).toBeDefined();
        expect(typeof window._vizApi.setState).toBe('function');
        expect(typeof window._vizApi.getState).toBe('function');
    });

    test('_vizApi.setState updates display', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });

        // Set to encoding of 1.0: sign=0, exp=15, mant=0
        window._vizApi.setState(0, 15, 0);
        const state = window._vizApi.getState();

        expect(state.sign).toBe(0);
        expect(state.exponent).toBe(15);
        expect(state.mantissa).toBe(0);

        const decimalInput = document.getElementById('viz-decimal');
        expect(decimalInput.value).toBe('1');
    });

    test('clicking a bit toggles it', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            initialValue: 0,
        });

        // Initially all bits should be 0
        const signBit = document.querySelector('.sign-section .viz-bit');
        expect(signBit.textContent).toBe('0');

        // Click the sign bit
        signBit.click();

        // Sign bit should now be 1
        expect(signBit.textContent).toBe('1');
        expect(signBit.classList.contains('checked')).toBe(true);
    });

    test('preset button sets correct value', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            initialValue: 0,
        });

        const oneBtn = document.querySelector('[data-preset="one"]');
        oneBtn.click();

        const decimalInput = document.getElementById('viz-decimal');
        expect(decimalInput.value).toBe('1');
    });

    test('all-ones preset sets all bits', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            initialValue: 0,
        });

        const allOnesBtn = document.querySelector('[data-preset="all-ones"]');
        allOnesBtn.click();

        // All bits should be 1
        const bits = document.querySelectorAll('.viz-bit');
        for (const bit of bits) {
            expect(bit.textContent).toBe('1');
        }
    });

    test('components display shows type information', () => {
        setupVisualizer({
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            initialValue: 0,
        });

        const components = document.querySelector('.viz-components');
        expect(components.innerHTML).toContain('Zero');
    });
});

// ── initValueDistribution ────────────────────────────────────

describe('initValueDistribution', () => {
    test('does nothing if container is missing', () => {
        initValueDistribution({
            valueDistributionId: 'nonexistent',
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
        });
        expect(document.body.innerHTML).toBe('');
    });

    test('does nothing for integer config', () => {
        createContainer('value-distribution');
        initValueDistribution({
            valueDistributionId: 'value-distribution',
            isInteger: true, totalBits: 8,
        });
        const container = document.getElementById('value-distribution');
        expect(container.innerHTML).toBe('');
    });

    test('creates chart structure for floating-point format', () => {
        createContainer('value-distribution');
        // Also need visualizer for sync
        const viz = document.createElement('div');
        viz.id = 'visualizer';
        viz.innerHTML = '<div class="viz-binary"></div><div class="viz-components"></div>';
        document.body.appendChild(viz);

        initValueDistribution({
            valueDistributionId: 'value-distribution',
            signBits: 1, exponentBits: 4, mantissaBits: 3,
            bias: 7, hasInfinity: false, hasNaN: true,
        });

        const container = document.getElementById('value-distribution');
        expect(container.querySelector('.vd-charts-row')).toBeTruthy();
        expect(container.querySelector('.vd-slider')).toBeTruthy();
        expect(container.querySelector('.vd-readout')).toBeTruthy();
        expect(container.querySelector('.vd-legend')).toBeTruthy();
    });

    test('exposes _vdApi on window', () => {
        createContainer('value-distribution');
        initValueDistribution({
            valueDistributionId: 'value-distribution',
            signBits: 1, exponentBits: 4, mantissaBits: 3,
            bias: 7, hasInfinity: false, hasNaN: true,
        });

        expect(window._vdApi).toBeDefined();
        expect(typeof window._vdApi.setEncoding).toBe('function');
    });
});

// ── initPage ─────────────────────────────────────────────────

describe('initPage', () => {
    test('does nothing if FORMAT_CONFIG is not set', () => {
        initPage();
        expect(document.body.innerHTML).toBe('');
    });

    test('calls renderNav when navKey is set', () => {
        createContainer('format-nav');
        window.FORMAT_CONFIG = { navKey: 'fp16' };
        initPage();

        const nav = document.getElementById('format-nav');
        expect(nav.querySelector('.nav-link.active')).toBeTruthy();
    });

    test('calls renderBitLayout when bitLayoutId is set', () => {
        createContainer('bit-layout');
        window.FORMAT_CONFIG = {
            bitLayoutId: 'bit-layout',
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasVisualizer: false,
        };
        initPage();

        const container = document.getElementById('bit-layout');
        expect(container.querySelector('.bit-field')).toBeTruthy();
    });

    test('calls renderRangeTable when rangeTableId is set', () => {
        createContainer('range-table');
        window.FORMAT_CONFIG = {
            rangeTableId: 'range-table',
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            hasVisualizer: false,
        };
        initPage();

        const container = document.getElementById('range-table');
        expect(container.querySelector('.info-table')).toBeTruthy();
    });

    test('calls renderSpecialValues when specialTableId is set', () => {
        createContainer('special-table');
        window.FORMAT_CONFIG = {
            specialTableId: 'special-table',
            signBits: 1, exponentBits: 5, mantissaBits: 10,
            hasInfinity: true, hasNaN: true,
            hasVisualizer: false,
        };
        initPage();

        const container = document.getElementById('special-table');
        expect(container.querySelector('.special-table')).toBeTruthy();
    });

    test('calls renderComparisonTable when comparisonTableId and compareWith are set', () => {
        createContainer('comparison-table');
        window.FORMAT_CONFIG = {
            navKey: 'fp16',
            comparisonTableId: 'comparison-table',
            compareWith: ['fp32', 'bf16'],
            hasVisualizer: false,
        };
        initPage();

        const container = document.getElementById('comparison-table');
        expect(container.querySelector('.info-table')).toBeTruthy();
    });
});
