# fp-conv-cli

[![npm](https://img.shields.io/npm/v/fp-conv-cli.svg)](https://www.npmjs.com/package/fp-conv-cli)

Cross-platform command-line tool for floating-point conversions. Encode, decode,
and convert numbers across FP32, FP16, BF16, TF32, FP8, FP6, FP4, and integer
formats, with binary/hex breakdowns and precision-loss analysis.

The installed command is **`fp-conv`**. It reuses the same JavaScript conversion
engine that powers the [fp-conv web app](https://sw23.github.io/fp-conv/) and the
[fp-conv MCP server](https://www.npmjs.com/package/fp-conv-mcp), so results are
identical across all three.

Runs anywhere Node.js 20+ runs: Windows, macOS, and Linux.

## Installation

```sh
npm install -g fp-conv-cli
```

Or run without installing:

```sh
npx fp-conv-cli encode 3.14 --format fp32
```

## Usage

```
fp-conv <command> [options]
```

### Commands

| Command           | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `encode <value>`  | Encode a decimal/keyword value into a format.          |
| `decode <bits>`   | Decode a binary or hex bit-pattern in a format.        |
| `convert <value>` | Convert a value (or a `--bits` pattern) from one format to another. |
| `info <format>`   | Show range, bias, and special-value details.           |
| `list`            | List all available preset formats.                     |

### Options

| Option                 | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `-f, --format <fmt>`   | Format preset key (e.g. `fp32`, `int8`) or a JSON object for a custom format. |
| `--from <fmt>`         | Source format for `convert`.                                                |
| `--to <fmt>`           | Target format for `convert`.                                                |
| `-r, --rounding <m>`   | Rounding for the encoded format, or the destination of `convert`: `tiesToEven` (default), `tiesToAway`, `towardZero`, `towardPositive`, `towardNegative`. |
| `--overflow <m>`       | Overflow behavior for the encoded format, or the destination of `convert`: `overflow` (Infinity or NaN) or `saturate` (max normal). |
| `--bits <pattern>`     | Source of `convert` as a bit pattern in the `--from` format, binary or hex, in place of `<value>`. |
| `--nan <m>`            | What a NaN source of `convert` becomes: `canonical` (default, the target's canonical quiet NaN) or `preserve` (keep the sign and as many high-order payload bits as fit, quieted). |
| `--json`               | Emit machine-readable JSON instead of formatted text.                       |
| `-h, --help`           | Show help.                                                                  |
| `-v, --version`        | Show version.                                                               |

Values accept a number, hex (e.g. `0xFF`, which is 255), or keyword (`infinity`,
`-infinity`, `nan`). Bit-patterns accept a binary string (e.g. `0100000`) or hex
(e.g. `0x40`). For `convert`, give either `<value>` or `--bits`, not both. A `<value>`
is constructed using the source format's standard defaults; a `--bits` pattern is the
source encoding, used exactly as given. `--rounding`, `--overflow` and `--nan` apply
only when encoding the destination.

A NaN's sign and payload exist only in its bit pattern, so `--nan preserve` needs the
NaN given with `--bits`: a typed `nan` or `-nan` is the canonical quiet NaN under both
modes. See [NaN behavior](https://github.com/sw23/fp-conv/blob/main/docs/nan-behavior.md).

## Examples

```sh
# Encode a decimal into FP32
fp-conv encode 3.14 --format fp32

# Negative values work directly; use `--` if a value is mistaken for an option
fp-conv encode -1.5 --format fp16
fp-conv encode --format fp16 -- -1.5

# Decode a hex bit-pattern as FP16
fp-conv decode 0x4048 --format fp16

# Convert between formats and see precision loss
fp-conv convert 3.14 --from fp32 --to fp16

# Inspect a format's range and special-value support
fp-conv info bf16

# Convert an exact bit pattern; keep a NaN's sign and payload
fp-conv convert --bits 0x3C00 --from fp16 --to fp32                     # 1
fp-conv convert --bits 0xFFC00000 --from fp32 --to fp16                 # 0x7E00
fp-conv convert --bits 0xFFC00000 --from fp32 --to fp16 --nan preserve  # 0xFE00

# Saturate instead of overflowing to Infinity
fp-conv encode 1e40 --format fp32 --overflow saturate   # 3.4028234663852886e+38
fp-conv encode inf --format fp8_e5m2 --overflow saturate # 57344
fp-conv encode 1000 --format fp8_e4m3 --overflow overflow # NaN

# OCP MX scalar types
fp-conv encode 4 --format e8m0        # exponent field 129
fp-conv encode 1.5 --format mxint8    # 0x60

# List every supported format
fp-conv list

# Use a custom floating-point format
fp-conv encode 1.5 --format '{"signBits":1,"exponentBits":8,"mantissaBits":7}'

# Machine-readable output for scripting
fp-conv convert 3.14 --from fp32 --to fp16 --json
```

## Development

This package lives in the [fp-conv](https://github.com/sw23/fp-conv) repository as an
npm workspace. The published bundle (`dist/index.js`) inlines the shared conversion
engine (`lib/floating-point.js`) and tool definitions (`src/webmcp.js`) from the repo
root via esbuild, keeping a single source of truth and no runtime dependencies.

```bash
npm install                         # from the repo root
npm run build --workspace fp-conv-cli
npm test  --workspace fp-conv-cli
```

## License

MIT © Spencer Williams
