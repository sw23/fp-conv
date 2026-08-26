# WebMCP API

This tool implements the [WebMCP API proposal](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md) (accessed 2026-04-04) so that AI agents (browser assistants, copilots, etc.) can perform floating-point and integer conversions without manual UI interaction.

When the page is loaded in a browser that supports WebMCP, five tools are automatically registered via `navigator.modelContext.registerTool()`:

## Tools

### `list_formats`

List every available preset format with its parameters.

**Parameters:** none

**Returns:** Array of format descriptors with keys, names, categories, and bit-layout details.

### `encode_number`

Encode a decimal number (or special value) into a format.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | number \| string | Decimal number, hex string (`"0xFF"`), or keyword (`"infinity"`, `"-infinity"`, `"nan"`) |
| `format` | string \| object | Preset key (e.g. `"fp16"`, `"int8"`) or custom format object |
| `roundingMode` | string | Optional. One of `tiesToEven` (default), `tiesToAway`, `towardZero`, `towardPositive`, `towardNegative` |
| `overflowMode` | string | Optional. `overflow` (produce Infinity, or NaN when the format has NaN but no Infinity) or `saturate` (clamp to the largest finite value). Omit to use the per-format default. IEEE 754 §7.4 directed rounding still clamps finite overflow regardless. |

**Returns:** Binary string, hex string, sign, exponent (biased & actual), mantissa, type classification, and actual value.

### `decode_bits`

Decode a binary or hex bit-pattern in a given format.

| Parameter | Type | Description |
|-----------|------|-------------|
| `bits` | string | Binary string (`"0100000001001000"`) or hex string (`"0x4048"`) |
| `format` | string \| object | Preset key or custom format object |

**Returns:** Same component breakdown as `encode_number`.

### `convert_format`

Convert a value from one format to another, with precision loss analysis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | number \| string | The value to convert |
| `inputFormat` | string \| object | Source format |
| `outputFormat` | string \| object | Target format |
| `roundingMode` | string | Optional. Rounding mode for the conversion into `outputFormat`: `tiesToEven` (default), `tiesToAway`, `towardZero`, `towardPositive`, or `towardNegative`. Source construction uses the input format's defaults. |
| `overflowMode` | string | Optional. Overflow behavior for the conversion into `outputFormat`: `overflow` or `saturate`; see `encode_number` above. Source construction uses the input format's default. |

**Returns:** Full encoding stats for both input and output, plus `precisionLoss` with `absolute`, `relativePercent`, and `lossless` flag.

### `get_format_info`

Get detailed information about a format, including value range and special value support.

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string \| object | Preset key or custom format object |

**Returns:** Total bits, bias, range (max/min normal, max/min subnormal for floats; min/max value for integers), feature flags, and the format's `defaultOverflowMode` with the resolved `overflowTarget` for each mode.

## Custom Format Objects

Instead of a preset key, you can pass a custom format descriptor:

**Floating-point:**
```json
{
  "signBits": 1,
  "exponentBits": 5,
  "mantissaBits": 10,
  "bias": 15,
  "hasInfinity": true,
  "hasNaN": true,
  "hasSubnormals": true
}
```

Set `hasSubnormals` to `false` for a scale type such as E8M0: exponent field 0 then
denotes the normal value `2^(0 - bias)` and the format has no zero encoding.

**Integer:**
```json
{
  "bits": 12,
  "signed": true,
  "fractionBits": 0,
  "symmetric": false
}
```

`fractionBits` gives the format an implicit `2^-fractionBits` scale (MXINT8 uses 6);
`symmetric` leaves the most-negative encoding unused so the range stays symmetric.

## Example

An AI agent connected to the page could convert π from FP32 to FP16:

```js
// Agent calls the convert_format tool with:
{
  "value": 3.14159265358979,
  "inputFormat": "fp32",
  "outputFormat": "fp16"
}

// Response includes:
// input:  { actualValue: 3.1415927410125732, hex: "0x40490FDB", type: "Normal", ... }
// output: { actualValue: 3.140625, hex: "0x4248", type: "Normal", ... }
// precisionLoss: { absolute: 0.000968, relativePercent: 0.030804, lossless: false }
```

Or convert 1.5 from FP16 to a custom 8-bit floating-point format:

```js
// Agent calls the convert_format tool with:
{
  "value": 1.5,
  "inputFormat": "fp16",
  "outputFormat": {
    "signBits": 1,
    "exponentBits": 4,
    "mantissaBits": 3,
    "bias": 7,
    "hasInfinity": true,
    "hasNaN": true
  }
}

// Response includes:
// input:  { actualValue: 1.5, binary: "0011110000000000", hex: "0x3C00", type: "Normal", ... }
// output: { actualValue: 1.5, binary: "01111000", hex: "0x78", type: "Normal", ... }
// precisionLoss: { absolute: 0, relativePercent: 0, lossless: true }
```
