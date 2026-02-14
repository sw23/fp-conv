# WebMCP API

This tool implements the [WebMCP API proposal](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md) (accessed 2026-02-14) so that AI agents (browser assistants, copilots, etc.) can perform floating-point and integer conversions without manual UI interaction.

When the page is loaded in a browser that supports WebMCP, five tools are automatically registered via `navigator.modelContext.provideContext()`:

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

**Returns:** Full encoding stats for both input and output, plus `precisionLoss` with `absolute`, `relativePercent`, and `lossless` flag.

### `get_format_info`

Get detailed information about a format including value range and special value support.

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string \| object | Preset key or custom format object |

**Returns:** Total bits, bias, range (max/min normal, max/min subnormal for floats; min/max value for integers), and feature flags.

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
  "hasNaN": true
}
```

**Integer:**
```json
{
  "bits": 12,
  "signed": true
}
```

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
