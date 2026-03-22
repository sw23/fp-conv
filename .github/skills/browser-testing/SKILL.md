---
name: browser-testing
description: "Test fp-conv web UI in the browser. Use for: visual verification, interaction testing, conversion validation, UI regression, browser testing, screenshot verification. Validates floating-point calculator renders correctly, preset buttons work, format conversions produce correct results, and binary/hex displays update properly."
---

# Browser UI Testing

Test the floating-point conversion calculator in an actual browser using VS Code's browser agent tools. Supports three testing modes: visual verification, interaction testing, and conversion validation.

## Prerequisites

1. **Enable browser tools**: Set `workbench.browser.enableChatTools` to `true` in VS Code settings
2. **Enable browser tools in chat**: Open the Tools picker in the chat input and enable all tools under Built-in > Browser
3. Use `#tool:openBrowserPage` to open `index.html` from the workspace root as a `file://` URL (no local server needed — the built-in browser loads local files and scripts correctly). Construct the URL from the workspace path, e.g. `file://${workspaceFolder}/index.html`

## Reference Files

- [UI element map](./references/ui-elements.md) — All DOM selectors, element IDs, button data attributes
- [Test vectors](./references/test-vectors.md) — Known-good encode/decode/conversion values for validation

## Procedure A — Visual Verification

Verify the page renders correctly and all sections are present.

### Steps

1. Open the page with `#tool:openBrowserPage`
2. Take an initial screenshot with `#tool:screenshotPage` — verify:
   - Header displays "Floating Point Conversion Calculator"
   - Subtitle "Convert between floating point, integer, and custom formats" is visible
   - All four main sections are visible: Input Format, Input Value, Output Format, Output Value
   - Format preset buttons are rendered in groups (IEEE 754, ML, OCP, Integer)
   - Binary bit display shows clickable checkboxes
   - About section is present at the bottom
3. Use `#tool:readPage` to confirm page text content includes:
   - All format button labels: FP64, FP32, FP16, BF16, TF32, FP8 E5M2, FP8 E4M3, FP6 E3M2, FP6 E2M3, FP4 E2M1
   - All integer format labels: INT32, UINT32, INT16, UINT16, INT8, UINT8, INT4, UINT4
   - Value preset labels: 0, 1, Max Norm, Min Norm, Max Sub, Min Sub, +Inf, -Inf, NaN, 1s
   - Rounding mode options: Nearest Ties to Even, Ties Away, Toward Zero, Toward +Infinity, Toward -Infinity
4. Verify the default initial state matches:
   - Input format: FP16 (total bits = 16)
   - Output format: BF16 (total bits = 16)
   - Decimal value: 3.140625

### Optional: Responsive Check

Take screenshots at different viewport widths to verify mobile layout:
- Desktop (1200px)
- Tablet (768px)
- Mobile (375px)

## Procedure B — Interaction Testing

Autonomously test all interactive elements by clicking, typing, and verifying results.

### B1: Format Preset Cycling

For each input format preset, click the button and verify the format controls update. Refer to the "Format Total Bits" table in [test-vectors.md](./references/test-vectors.md).

1. For each floating-point format (FP64, FP32, FP16, BF16, TF32, FP8 E5M2, FP8 E4M3, FP6 E3M2, FP6 E2M3, FP4 E2M1):
   - `#tool:clickElement` on the format preset button (see selectors in [ui-elements.md](./references/ui-elements.md))
   - `#tool:readPage` to verify:
     - Total bits display (`#input-total-bits`) matches expected value
     - Exponent and mantissa fields show correct values
     - Binary display updates to show the correct number of checkboxes
2. For each integer format (INT32, UINT32, INT16, UINT16, INT8, UINT8, INT4, UINT4):
   - `#tool:clickElement` on the preset button
   - `#tool:readPage` to verify:
     - Total bits display matches expected value
     - Exponent and sign controls are hidden
     - Mantissa label shows "Bits" instead of "Mantissa"
3. Repeat with output format presets

### B2: Value Entry

1. Click FP32 input preset to set a known format
2. `#tool:typeInPage` "3.14159265359" into the decimal input (`#input-decimal-input`)
3. `#tool:readPage` to verify:
   - Hex display shows `0x40490FDB`
   - Sign component shows `0`
   - Exponent (biased) shows `128`
   - Type shows `Normal`
4. Clear the input and type "0" — verify hex shows `0x00000000`, type shows `Zero`
5. Clear and type "-1" — verify hex shows `0xBF800000`, sign shows `1`

### B3: Value Presets

With FP32 input format, click each value preset and verify results match the "Value Preset Expected Results" table in [test-vectors.md](./references/test-vectors.md):

1. `#tool:clickElement` on the "0" preset → verify decimal=0, hex=`0x00000000`, type=Zero
2. Click "1" → verify decimal=1, hex=`0x3F800000`, type=Normal
3. Click "Max Norm" → verify hex=`0x7F7FFFFF`, type=Normal
4. Click "+Inf" → verify hex=`0x7F800000`, type=Infinity
5. Click "NaN" → verify hex=`0x7FC00000`, type=NaN
6. Click "1s" → verify hex=`0xFFFFFFFF` (all bits set)

### B4: Binary Bit Toggling

1. Click the "0" value preset to start with all bits cleared
2. `#tool:clickElement` on individual binary checkboxes to set specific bit patterns
3. `#tool:readPage` to verify the decimal value and hex representation update correctly
4. Verify toggling bits in the exponent field changes the exponent component display
5. Verify toggling the sign bit changes the sign component between 0 and 1

### B5: Hex Input

1. `#tool:typeInPage` "0x3F800000" into the hex input (`#input-hex-input`)
2. `#tool:readPage` to verify decimal shows `1`, binary checkboxes match FP32 encoding of 1.0

### B6: Output Format Switching

1. Set input format to FP32, enter value 3.14159265359
2. `#tool:clickElement` on FP16 output preset
3. `#tool:readPage` to verify:
   - Output decimal shows approximately 3.140625 (precision loss from FP32→FP16)
   - Output hex shows `0x4248`
   - Precision loss component shows a non-zero value
4. Switch output to BF16, FP8 formats — verify outputs change and precision loss updates

### B7: Rounding Mode

1. Set up a conversion where rounding matters (e.g., FP32 input → FP16 output)
2. Enter a value from the rounding mode table in [test-vectors.md](./references/test-vectors.md)
3. For each rounding mode, select it in the `#rounding-mode` dropdown and verify the output changes as expected

## Procedure C — Conversion Validation

Systematically validate conversions against known-good test vectors.

### Steps

1. Load [test-vectors.md](./references/test-vectors.md) for reference values
2. For each test vector in the encode tables:
   a. `#tool:clickElement` to set the input format preset
   b. `#tool:typeInPage` to enter the decimal value into `#input-decimal-input`
   c. `#tool:readPage` to extract: hex display, component values (sign, exponent biased, mantissa, type)
   d. Compare against expected values from the test vector table
   e. Record pass/fail
3. For each conversion vector (FP32→FP16, FP32→BF16, etc.):
   a. Set input format, enter value, set output format
   b. `#tool:readPage` to extract output decimal, hex, and precision loss
   c. Compare against expected values
   d. Record pass/fail
4. Test special values (infinity, NaN, negative zero) across format pairs per the special value vectors
5. Report summary: total vectors tested, passed, failed, with details for any failures

### Advanced: Batch Validation with Playwright

For faster validation of many vectors, use `#tool:runPlaywrightCode` to execute JavaScript directly:

```javascript
// Example: Read all component values at once
const decimal = await page.locator('#output-decimal').textContent();
const hex = await page.locator('#output-hex').textContent();
const sign = await page.locator('#output-comp-sign').textContent();
const expBiased = await page.locator('#output-comp-exp-biased').textContent();
const type = await page.locator('#output-comp-type').textContent();
const precisionLoss = await page.locator('#output-precision-loss').textContent();
```

```javascript
// Example: Click preset and type value in one shot
await page.click('button.input-preset[data-format="fp32"]');
await page.fill('#input-decimal-input', '3.14159265359');
await page.click('button.output-preset[data-format="fp16"]');
```

## Reporting

After completing any procedure, summarize results as:

```
## Browser Test Results

**Procedure**: [A/B/C]
**Date**: [date]
**Status**: [PASS/FAIL]

### Summary
- Tests run: X
- Passed: X
- Failed: X

### Failures (if any)
| Test | Expected | Actual | Notes |
|------|----------|--------|-------|
| ... | ... | ... | ... |
```
