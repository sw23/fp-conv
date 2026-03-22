# UI Element Reference

Complete DOM element map for browser-based testing of the fp-conv calculator.

## Page Sections

| Section | Selector | Description |
|---------|----------|-------------|
| Header | `header h1` | "Floating Point Conversion Calculator" |
| Subtitle | `p.subtitle` | "Convert between floating point, integer, and custom formats" |
| Input Format | `section[aria-labelledby="input-format-heading"]` | Format preset buttons + custom format controls |
| Input Value | `section[aria-labelledby="input-value-heading"]` | Value entry, binary display, components |
| Output Format | `section[aria-labelledby="output-format-heading"]` | Output format selection |
| Output Value | `section[aria-labelledby="output-value-heading"]` | Converted output display |
| About | `section#about` | Documentation and usage guide |
| Footer | `footer` | Copyright and GitHub link |

## Input Format Preset Buttons

All have class `.input-preset` with `data-format` attribute. Click to switch input format.

| Button Text | Selector |
|-------------|----------|
| FP64 | `button.input-preset[data-format="fp64"]` |
| FP32 | `button.input-preset[data-format="fp32"]` |
| FP16 | `button.input-preset[data-format="fp16"]` |
| BF16 | `button.input-preset[data-format="bf16"]` |
| TF32 | `button.input-preset[data-format="tf32"]` |
| FP8 E5M2 | `button.input-preset[data-format="fp8_e5m2_ocp"]` |
| FP8 E4M3 | `button.input-preset[data-format="fp8_e4m3_ocp"]` |
| FP6 E3M2 | `button.input-preset[data-format="fp6_e3m2"]` |
| FP6 E2M3 | `button.input-preset[data-format="fp6_e2m3"]` |
| FP4 E2M1 | `button.input-preset[data-format="fp4_e2m1"]` |
| INT32 | `button.input-preset[data-format="int32"]` |
| UINT32 | `button.input-preset[data-format="uint32"]` |
| INT16 | `button.input-preset[data-format="int16"]` |
| UINT16 | `button.input-preset[data-format="uint16"]` |
| INT8 | `button.input-preset[data-format="int8"]` |
| UINT8 | `button.input-preset[data-format="uint8"]` |
| INT4 | `button.input-preset[data-format="int4"]` |
| UINT4 | `button.input-preset[data-format="uint4"]` |

## Output Format Preset Buttons

Same format keys as input, with class `.output-preset`.

| Button Text | Selector |
|-------------|----------|
| FP64 | `button.output-preset[data-format="fp64"]` |
| FP32 | `button.output-preset[data-format="fp32"]` |
| FP16 | `button.output-preset[data-format="fp16"]` |
| BF16 | `button.output-preset[data-format="bf16"]` |
| TF32 | `button.output-preset[data-format="tf32"]` |
| FP8 E5M2 | `button.output-preset[data-format="fp8_e5m2_ocp"]` |
| FP8 E4M3 | `button.output-preset[data-format="fp8_e4m3_ocp"]` |
| FP6 E3M2 | `button.output-preset[data-format="fp6_e3m2"]` |
| FP6 E2M3 | `button.output-preset[data-format="fp6_e2m3"]` |
| FP4 E2M1 | `button.output-preset[data-format="fp4_e2m1"]` |
| INT32 | `button.output-preset[data-format="int32"]` |
| UINT32 | `button.output-preset[data-format="uint32"]` |
| INT16 | `button.output-preset[data-format="int16"]` |
| UINT16 | `button.output-preset[data-format="uint16"]` |
| INT8 | `button.output-preset[data-format="int8"]` |
| UINT8 | `button.output-preset[data-format="uint8"]` |
| INT4 | `button.output-preset[data-format="int4"]` |
| UINT4 | `button.output-preset[data-format="uint4"]` |

## Value Preset Buttons

Input value presets (class `.preset-btn[data-value]`):

| Button Text | Selector | Description |
|-------------|----------|-------------|
| 0 | `button.preset-btn[data-value="zero"]` | Zero |
| 1 | `button.preset-btn[data-value="one"]` | One |
| Max Norm | `button.preset-btn[data-value="max-norm"]` | Largest normal value |
| Min Norm | `button.preset-btn[data-value="min-norm"]` | Smallest normal value |
| Max Sub | `button.preset-btn[data-value="max-subnorm"]` | Largest subnormal |
| Min Sub | `button.preset-btn[data-value="min-subnorm"]` | Smallest subnormal |
| +Inf | `button.preset-btn[data-value="infinity"]` | Positive infinity |
| -Inf | `button.preset-btn[data-value="neg-infinity"]` | Negative infinity |
| NaN | `button.preset-btn[data-value="nan"]` | Not a Number |
| 1s | `button.preset-btn[data-value="all-ones"]` | All bits set to 1 |

Output value presets have class `.output-value-preset` with matching `data-value` attributes.

## Input Value Fields

| Element | Selector | Type | Description |
|---------|----------|------|-------------|
| Decimal input | `#input-decimal-input` | text input | Enter decimal number |
| Hex input | `#input-hex-input` | text input | Enter hex (e.g. `0x3F800000`) |

## Input Binary Bit Display

Bits are rendered as checkboxes inside section containers. Each bit has an individual checkbox.

| Container | Selector | Description |
|-----------|----------|-------------|
| Sign labels | `#input-binary-sign-labels` | Bit label row for sign |
| Sign checkboxes | `#input-binary-sign-checks` | Clickable sign bit(s) |
| Sign positions | `#input-binary-sign-positions` | Bit position numbers |
| Exponent labels | `#input-binary-exponent-labels` | Bit label row for exponent |
| Exponent checkboxes | `#input-binary-exponent-checks` | Clickable exponent bits |
| Exponent positions | `#input-binary-exponent-positions` | Bit position numbers |
| Mantissa labels | `#input-binary-mantissa-labels` | Bit label row for mantissa |
| Mantissa checkboxes | `#input-binary-mantissa-checks` | Clickable mantissa bits |
| Mantissa positions | `#input-binary-mantissa-positions` | Bit position numbers |

Individual bit checkboxes: `input[type="checkbox"]` inside the checks containers, indexed from MSB to LSB.

## Input Components Display

| Element | Selector | Example value |
|---------|----------|---------------|
| Sign | `#input-comp-sign` | `0` or `1` |
| Exponent (biased) | `#input-comp-exp-biased` | `127` |
| Exponent (actual) | `#input-comp-exp-actual` | `0` |
| Type | `#input-comp-type` | `Normal`, `Subnormal`, `Zero`, `Infinity`, `NaN` |
| Mantissa (decimal) | `#input-comp-mantissa-dec` | `1.0` |
| Actual Value | `#input-comp-value` | `0` |

## Input Format Custom Controls

| Element | Selector | Type | Description |
|---------|----------|------|-------------|
| Sign checkbox | `#input-sign-bits` | checkbox | Has sign bit |
| Exponent bits | `#input-exponent-bits` | number (0-15) | Exponent field width |
| Mantissa bits | `#input-mantissa-bits` | number (0-112) | Mantissa field width |
| Has Infinity | `#input-has-infinity` | checkbox | Format supports Infinity |
| Has NaN | `#input-has-nan` | checkbox | Format supports NaN |
| Total bits | `#input-total-bits` | display | Read-only total |

## Output Value Display

| Element | Selector | Description |
|---------|----------|-------------|
| Decimal value | `#output-decimal` | Converted decimal output |
| Hex value | `#output-hex` | Converted hex output |

## Output Binary Display

Same structure as input, with `output-` prefix and `-values` instead of `-checks`:

| Container | Selector |
|-----------|----------|
| Sign labels | `#output-binary-sign-labels` |
| Sign values | `#output-binary-sign-values` |
| Sign positions | `#output-binary-sign-positions` |
| Exponent labels | `#output-binary-exponent-labels` |
| Exponent values | `#output-binary-exponent-values` |
| Exponent positions | `#output-binary-exponent-positions` |
| Mantissa labels | `#output-binary-mantissa-labels` |
| Mantissa values | `#output-binary-mantissa-values` |
| Mantissa positions | `#output-binary-mantissa-positions` |

## Output Components Display

| Element | Selector | Example value |
|---------|----------|---------------|
| Sign | `#output-comp-sign` | `0` |
| Exponent (biased) | `#output-comp-exp-biased` | `0` |
| Exponent (actual) | `#output-comp-exp-actual` | `0` |
| Type | `#output-comp-type` | `Normal` |
| Mantissa (decimal) | `#output-comp-mantissa-dec` | `1.0` |
| Actual Value | `#output-comp-value` | `0` |
| Precision Loss | `#output-precision-loss` | `0` or absolute error |

## Output Format Custom Controls

Same as input controls with `output-` prefix:
- `#output-sign-bits`, `#output-exponent-bits`, `#output-mantissa-bits`
- `#output-has-infinity`, `#output-has-nan`, `#output-total-bits`

## Rounding Mode

| Element | Selector | Options |
|---------|----------|---------|
| Rounding mode | `#rounding-mode` | `tiesToEven`, `tiesToAway`, `towardZero`, `towardPositive`, `towardNegative` |

## Default Initial State

On page load:
- Input format: **FP16** (1 sign, 5 exponent, 10 mantissa = 16 bits)
- Output format: **BF16** (1 sign, 8 exponent, 7 mantissa = 16 bits)
- Decimal value: **3.140625**
- Rounding mode: **tiesToEven**

## Format Category Behavior

For **integer formats** (INT32, UINT32, INT16, UINT16, INT8, UINT8, INT4, UINT4):
- Exponent bits control is hidden
- Sign checkbox control is hidden (signed/unsigned determined by format)
- Has Infinity / Has NaN checkboxes are hidden
- Mantissa label changes to "Bits"
- Binary display shows all bits as a single mantissa section (no sign/exponent sections)
