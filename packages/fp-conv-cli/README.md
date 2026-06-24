# fp-conv-cli

[![npm](https://img.shields.io/npm/v/fp-conv-cli.svg)](https://www.npmjs.com/package/fp-conv-cli)

Cross-platform command-line tool for floating-point conversions. Encode, decode,
and convert numbers across FP32, FP16, BF16, TF32, FP8, FP6, FP4, and integer
formats, with binary/hex breakdowns and precision-loss analysis.

The installed command is **`fp-conv`**. It reuses the same JavaScript conversion
engine that powers the [fp-conv web app](https://sw23.github.io/fp-conv/) and the
[fp-conv MCP server](https://www.npmjs.com/package/fp-conv-mcp), so results are
identical across all three.

Runs anywhere Node.js 18+ runs: Windows, macOS, and Linux.

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
| `convert <value>` | Convert a value from one format to another.            |
| `info <format>`   | Show range, bias, and special-value details.           |
| `list`            | List all available preset formats.                     |

### Options

| Option                 | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `-f, --format <fmt>`   | Format preset key (e.g. `fp32`, `int8`) or a JSON object for a custom format. |
| `--from <fmt>`         | Source format for `convert`.                                                |
| `--to <fmt>`           | Target format for `convert`.                                                |
| `-r, --rounding <m>`   | `tiesToEven` (default), `tiesToAway`, `towardZero`, `towardPositive`, `towardNegative`. |
| `--json`               | Emit machine-readable JSON instead of formatted text.                       |
| `-h, --help`           | Show help.                                                                  |
| `-v, --version`        | Show version.                                                               |

Values accept a number, hex (e.g. `0xFF`), or keyword (`infinity`, `-infinity`,
`nan`). Bit-patterns accept a binary string (e.g. `0100000`) or hex (e.g. `0x40`).

## Examples

```sh
# Encode a decimal into FP32
fp-conv encode 3.14 --format fp32

# Decode a hex bit-pattern as FP16
fp-conv decode 0x4048 --format fp16

# Convert between formats and see precision loss
fp-conv convert 3.14 --from fp32 --to fp16

# Inspect a format's range and special-value support
fp-conv info bf16

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
