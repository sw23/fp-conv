# WebMCP API

This tool implements the [WebMCP API](https://github.com/webmachinelearning/webmcp) ([draft spec](https://webmachinelearning.github.io/webmcp/), checked 2026-09-26) so that AI agents (browser assistants, copilots, etc.) can perform floating-point and integer conversions without manual UI interaction.

When the page is loaded in a browser that supports WebMCP, five tools are automatically registered via `document.modelContext.registerTool()`. Early Chrome previews exposed the API as `navigator.modelContext`, which is used as a fallback. See the WebMCP [implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md) for browser support, including the Chrome flag for local testing.

Every tool is a pure computation, so each is registered with a `title` and `annotations: { readOnlyHint: true }`. Invalid arguments come back as a result with `isError: true` and an `Error: …` message rather than as a rejected call, because WebMCP does not pass a rejection's reason on to the agent.

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

**Returns:** Binary string, hex string, sign, exponent (biased & actual), mantissa, type classification, and actual value. `actualValue` and `mantissaDecimal` follow the same number-or-digit-string convention as the range bounds in [`get_format_info`](#get_format_info), so neither is a rounded stand-in: a mantissa wider than 52 bits can hold a significand no double can. A negative zero is the string `"-0"`, since JSON would write the number as `0`.

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

**Returns:** Full encoding stats for both input and output, plus `precisionLoss` with `kind`, `absolute`, `relativePercent`, and a `lossless` flag.

The conversion itself is exact end to end: the source encoding's **exact value** is
rounded into the output format in one step, rather than being decoded to a double and
re-encoded. A field wider than 53 bits survives that — an `int64` → `int64` identity
conversion keeps every bit — and so does a magnitude outside fp64's range.

`kind` names what happened to the value, and is decided on those exact values rather
than on the doubles they decode to. It is the same classification the web UI's
precision-loss row and the CLI's `Reason:` line show, under the same names, so the
surfaces always describe a conversion the same way:

| `kind` | Meaning |
|---|---|
| `exact` | The output value **is** the input value, NaN carried through to NaN included. So is −0 into a signed integer format: two's complement has a single zero, so there is no sign on it to lose. Nothing was lost; `lossless` is true only here. |
| `rounded` | Finite in, a different finite value out, and not a clamp: ordinary precision loss. |
| `overflow` | The value became an Infinity or a NaN it was not — a finite input that ran off the top of the range, or an infinite one that a NaN-but-no-Infinity format (E4M3, E8M0) turned into NaN. |
| `saturated` | An input the format cannot hold was clamped to an **edge of its range**. Which edge is visible from the output: a magnitude past the maximum lands on the maximum, while a negative value an unsigned format cannot hold lands on its minimum, which is zero rather than a large magnitude (or 2^−127 for E8M0, which has no zero). Infinite inputs clamp this way under `saturate`, and so does a finite input that rounds past the format's largest finite magnitude under the conversion's rounding mode. One that merely rounds down onto the maximum (FP32 65510 → FP16 65504) is `rounded`, and so is a negative that rounds to zero on its own (FP32 −0.3 → UINT8, or −0.001 → an unsigned fixed-point layout): it is the sign, not the rounding, that a clamp to zero discards. |
| `reflected` | The **sign** was not representable and came back flipped: −Infinity as +Infinity on an unsigned format that has an Infinity encoding, or −0 as +0 on any unsigned format that has a zero (into E8M0, which has none, −0 is `saturated` like any magnitude below its range). Nothing overflowed and nothing was clamped. |
| `nanSubstituted` | A NaN input came back as something that is not NaN, because the format has no NaN encoding. See [overflow behavior](overflow-behavior.md#nan-and-infinity-inputs) for which value it substitutes. |

`absolute` and `relativePercent` are JSON **numbers** for `exact` (both `0`, including
NaN → NaN and Infinity → Infinity, where nothing was lost) and whenever both sides are
finite — an ordinary rounding, a clamped finite value, a dropped zero sign. They are
**`null`** otherwise: there at least one side is non-finite, so `|input − output|` is
Infinity or NaN and the ratio means nothing, and `null` says that plainly rather than
emitting the strings `"Infinity"` and `"NaN"`, which read like measurements and are not.
They are also `null` in the rare case where a difference between two finite values is too
large for a double, or so small that a double would flush it to `0`, which only a custom
format with an exponent range beyond fp64's can produce: a nonzero loss is never reported
as `0`.

Like `kind`, both are measured on the **exact** values; only the final results are
rounded to doubles. Converting a 64-bit integer maximum to FP32 is `rounded` with an
`absolute` of exactly `1`, where subtracting the two decoded doubles would give `0`.

### `get_format_info`

Get detailed information about a format, including value range and special value support.

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string \| object | Preset key or custom format object |

**Returns:** Total bits, bias, range (max/min normal, max/min subnormal for floats; min/max value for integers), feature flags, the format's `defaultOverflowMode` with the resolved `overflowTarget` for each mode, and `nanTarget`. A bound the layout does not have is left out: E8M0 and a fixed-point layout report no subnormals, and `s1e1m0` with an infinity has no normal at all (its `maxNormal`, the largest finite value, is its zero).

`nanTarget` is where a **NaN input** lands: `"nan"` when the format has a NaN encoding,
`"maxNormal"` when it has none and substitutes the positive maximum (FP6, FP4, MXINT8 and
any custom layout without a NaN pattern), or `"zero"` for the plain integer formats and
for a degenerate layout whose largest finite value *is* the zero pattern (`s1e1m0` with an
infinity, where field 1 is the infinity and field 0 is all that is left).
Unlike `overflowTarget` it does not depend on the overflow mode — a NaN is not an
out-of-range magnitude, so there is nothing to saturate. `list_formats` reports the same
field for each preset.

For an integer format, `rawMinValue` / `rawMaxValue` give the bounds in raw
integer units (before any `fractionBits` scale). These are JSON numbers while the
format is 53 bits or narrower; above that a JSON number could not name them
exactly, so they are emitted as decimal digit **strings** (e.g. a signed 64-bit
format reports `"rawMaxValue": "9223372036854775807"`).

Every other range bound — `minValue` / `maxValue`, `maxNormal` / `minNormal`,
`maxSubnormal` / `minSubnormal`, here and in `list_formats` — follows the same
convention, so no bound is ever a rounded stand-in for itself:

- An **integer** format reports JSON numbers up to 53 bits and decimal digit strings
  above that, matching `rawMinValue` / `rawMaxValue`. (A double names −2^63 exactly and
  still spells it `-9223372036854776000`, three digits away from the value; an unsigned
  64-bit maximum used to read `18446744073709552000`, larger than the `rawMaxValue`
  printed beside it.)
- A **floating-point** format reports a JSON number whenever a double names the bound
  exactly, which is every preset. Where it does not — a mantissa wider than 53 bits, or a
  magnitude outside fp64's range, where the double would be `Infinity` (JSON `null`) or
  `0` — the bound is a decimal digit string. A 1/11/60 layout's `maxNormal` is a finite
  309-digit string rather than `null`, and its `minSubnormal` is real digits rather
  than `0`.

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
denotes the normal value `2^(0 - bias)` and the format has no zero encoding. With
`exponentBits: 0` (fixed point) `hasSubnormals`, `hasInfinity` and `hasNaN` are ignored:
the layout always has a zero and never an infinity or NaN. With `hasInfinity` the layout
decides `hasNaN` too: the infinity is the all-ones exponent with a zero mantissa, so with a
mantissa field the rest of that binade is NaN (IEEE-style) and without one nothing is left
for it (`s1e5m0` has no NaN). `hasNaN` is your choice only without an infinity, where NaN
is the all-ones pattern (OCP-style, as in E4M3). Passing `hasNaN: false` beside an infinity
and a mantissa field is an error rather than a silent override, since honouring it would
change what those patterns mean; `hasNaN: true` on `s1e5m0` is simply unmet and reads back
`false`. `get_format_info` reports the flags the layout actually has. Each flag, when
given, must be a JSON boolean.

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
// precisionLoss: { kind: "rounded", absolute: 0.0009677410125732422, relativePercent: 0.030804152299553876, lossless: false }
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
// precisionLoss: { kind: "exact", absolute: 0, relativePercent: 0, lossless: true }
```
