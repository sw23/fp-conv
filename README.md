# Floating Point Conversion Calculator

Interactive tool for converting and visualizing floating-point numbers across
standard and custom formats. Convert between FP32, FP16, BF16, TF32, FP8, etc.
while inspecting binary representations and precision loss.

**Live URL:** https://sw23.github.io/fp-conv/

## Features

- **Format presets:** FP64, FP32, FP16, BF16, TF32, OCP FP4/FP6/FP8
- **Integer formats:** INT32, UINT32, INT16, UINT16, INT8, UINT8, INT4, UINT4
- **OCP format support:** Full support for Open Compute Project microscaling formats
- **Custom formats:** Define any bit layout (0–15 exponent bits, 0–112 mantissa bits)
- **Interactive editing:** Toggle individual bits and see decimal/hex updates
- **Precision analysis:** Calculate absolute and relative error between formats
- **Special values:** Explore zero, infinity, NaN, subnormals, and boundary cases
- **Rounding modes:** Implements IEEE 754 rounding modes (ties to even, ties away
  from zero, toward zero, toward +inf, and toward −inf)
- **Fixed-point mode:** Set exponent bits to 0 for fractional representations
- **Shareable links:** Bookmark or share a conversion via URL parameters (input/output
  format, value, and rounding mode)
- **Mobile-friendly:** Works on screens of all sizes
- **WebMCP API:** AI agents can perform conversions via [WebMCP](docs/webmcp.md)

## Supported Formats

The following standard formats are supported, in addition to any custom format you
define (up to 15 exponent bits and 112 mantissa bits). Interactive pages have been
created to help explain and visualize each standard format:

- **IEEE 754:**
  [FP64](https://sw23.github.io/fp-conv/formats/fp64.html),
  [FP32](https://sw23.github.io/fp-conv/formats/fp32.html),
  [FP16](https://sw23.github.io/fp-conv/formats/fp16.html)
- **ML/AI:**
  [TF32](https://sw23.github.io/fp-conv/formats/tf32.html),
  [BF16](https://sw23.github.io/fp-conv/formats/bf16.html)
- **Integer:**
  [INT32](https://sw23.github.io/fp-conv/formats/int32.html),
  [UINT32](https://sw23.github.io/fp-conv/formats/uint32.html),
  [INT16](https://sw23.github.io/fp-conv/formats/int16.html),
  [UINT16](https://sw23.github.io/fp-conv/formats/uint16.html),
  [INT8](https://sw23.github.io/fp-conv/formats/int8.html),
  [UINT8](https://sw23.github.io/fp-conv/formats/uint8.html),
  [INT4](https://sw23.github.io/fp-conv/formats/int4.html),
  [UINT4](https://sw23.github.io/fp-conv/formats/uint4.html)
- **OCP Microscaling:**
  [FP8 E4M3](https://sw23.github.io/fp-conv/formats/fp8-e4m3.html),
  [FP8 E5M2](https://sw23.github.io/fp-conv/formats/fp8-e5m2.html),
  [FP6 E2M3](https://sw23.github.io/fp-conv/formats/fp6-e2m3.html),
  [FP6 E3M2](https://sw23.github.io/fp-conv/formats/fp6-e3m2.html),
  [FP4 E2M1](https://sw23.github.io/fp-conv/formats/fp4-e2m1.html)
- **Custom:** Supports a wide range of user-defined formats

## MCP Server

The [`fp-conv-mcp`](https://www.npmjs.com/package/fp-conv-mcp) npm package provides
a local [Model Context Protocol](https://modelcontextprotocol.io) server, giving
agents direct local access to floating point format conversions.

Example client configuration (VS Code, `.vscode/mcp.json`):

```json
{
  "servers": {
    "fp-conv": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "fp-conv-mcp"]
    }
  }
}
```

See the [package README](packages/fp-conv-mcp/README.md) for full usage,
per-client setup, and debugging instructions.

## Command-Line Tool

The [`fp-conv-cli`](https://www.npmjs.com/package/fp-conv-cli) npm package provides a
cross-platform command-line version of the converter (Windows, macOS, and Linux),
reusing the same conversion engine as the web app and MCP server. The installed
command is `fp-conv`.

```bash
npx fp-conv-cli convert 3.14 --from fp32 --to fp16
```

It supports `encode`, `decode`, `convert`, `info`, and `list` commands with
human-readable or `--json` output. See the
[package README](packages/fp-conv-cli/README.md) for full usage and examples.

## License

MIT © 2026 Spencer Williams. See [LICENSE](LICENSE).
