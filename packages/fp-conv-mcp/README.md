# fp-conv-mcp

[![npm](https://img.shields.io/npm/v/fp-conv-mcp.svg)](https://www.npmjs.com/package/fp-conv-mcp)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
AI agents direct, local tools for **floating-point conversions**. It is the
server-side companion to the [fp-conv](https://sw23.github.io/fp-conv/) web app and
reuses the same conversion library.

Encode, decode, and convert numbers across FP32, FP64, FP16, BF16, TF32, FP8, FP6, FP4,
signed/unsigned ints, and custom formats. Supports rounding modes and calculates precision loss.

## Tools

| Tool | Description |
| --- | --- |
| `list_formats` | List all available format presets (keys, names, categories, parameters). |
| `get_format_info` | Get detailed information about a format (bias, range, special-value support). |
| `encode_number` | Encode a decimal value (or `Infinity`/`NaN`) into a format. Returns binary, hex, and components. |
| `decode_bits` | Decode a binary or hex bit-pattern into a format. Returns the decimal value and components. |
| `convert_format` | Convert a value from one format to another. |

## Formats

All tools accept either a **preset key** (string) or a **custom format object**.

### Preset keys

| Category | Keys |
| --- | --- |
| IEEE 754 | `"fp64"`, `"fp32"`, `"fp16"` |
| ML | `"bf16"`, `"tf32"` |
| OCP | `"fp8_e5m2"`, `"fp8_e4m3"`, `"fp6_e3m2"`, `"fp6_e2m3"`, `"fp4_e2m1"` |
| Integer | `"int32"`, `"uint32"`, `"int16"`, `"uint16"`, `"int8"`, `"uint8"`, `"int4"`, `"uint4"` |

### Custom formats

For floating-point:

```json
{ "signBits": 1, "exponentBits": 5, "mantissaBits": 10, "bias": 15, "hasInfinity": true, "hasNaN": true }
```

| Field | Required | Description |
| --- | --- | --- |
| `signBits` | yes | Number of sign bits (typically 1) |
| `exponentBits` | yes | Number of exponent bits |
| `mantissaBits` | yes | Number of mantissa (fraction) bits |
| `bias` | no | Exponent bias; defaults to `2^(exponentBits-1) - 1` |
| `hasInfinity` | no | Whether the format can represent ±Infinity (default `true`) |
| `hasNaN` | no | Whether the format can represent NaN (default `true`) |

For integers:

```json
{ "bits": 16, "signed": true }
```

| Field | Required | Description |
| --- | --- | --- |
| `bits` | yes | Total bit width |
| `signed` | yes | `true` for signed two's-complement, `false` for unsigned |

## Client configuration

Refer to the following examples with details on how to configure the MCP server:

### VS Code (`.vscode/mcp.json`)

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

### Claude Code

```bash
claude mcp add fp-conv -- npx -y fp-conv-mcp
```

### GitHub Copilot CLI

```bash
copilot mcp add fp-conv -- npx -y fp-conv-mcp
```

### Cursor (`.cursor/mcp.json`) / Windsurf / Claude Desktop

```json
{
  "mcpServers": {
    "fp-conv": {
      "command": "npx",
      "args": ["-y", "fp-conv-mcp"]
    }
  }
}
```

### Antigravity (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "fp-conv": {
      "command": "npx",
      "args": ["-y", "fp-conv-mcp"]
    }
  }
}
```

### Streamable HTTP (local only)

Alternatively, the server can run a local Streamable HTTP endpoint:

```bash
npm install -g fp-conv-mcp
fp-conv-mcp --http --host 127.0.0.1 --port 3001
# endpoint: http://127.0.0.1:3001/mcp
```

> **Security:** The HTTP transport has no authentication and binds to `127.0.0.1`
> by default. Do not bind it to a non-loopback interface unless you add your own
> authentication and understand the implications.

## Usage

Once connected, you can ask an agent things like:

- "Encode 3.14159 as bf16 and show the binary."
- "What does the fp16 bit-pattern `0x3E00` decode to?"
- "Convert 0.1 from fp32 to fp8 e4m3 and tell me the precision loss."
- "List all supported formats."

## Debugging

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector npx fp-conv-mcp
```

Then open the **Tools** tab, click **List Tools**, and try any tool.

## Development

This package lives in the [fp-conv](https://github.com/sw23/fp-conv) repository as an
npm workspace. The published bundle (`dist/index.js`) inlines the shared conversion
engine (`lib/floating-point.js`) and tool definitions (`src/webmcp.js`) from the repo
root via esbuild, keeping a single source of truth.

```bash
npm install                         # from the repo root
npm run build --workspace fp-conv-mcp
npm test  --workspace fp-conv-mcp
```

## License

MIT © Spencer Williams
