# Overflow behavior

What happens to a value too large for the target format is a real choice, not a fixed
rule. `fp-conv` exposes both options on every format it supports, from FP64 down to FP4,
and on the integer formats too.

## The two modes

| Mode | Also called | Meaning |
|---|---|---|
| `overflow` | OFP8 `NONSAT`, MX `OVF` | Produce ±Infinity, or NaN if the format has NaN but no Infinity, or clamp if it has neither |
| `saturate` | OFP8 / MX `SAT`, CUDA `__NV_SATFINITE`, OpenCL `convert_*_sat()` | Always clamp to the largest finite magnitude |

Saturating conversion is a standard hardware and framework concept, not an OCP quirk.
NVIDIA CUDA (`__NV_SATFINITE`), OpenCL/SPIR-V (`convert_<type>_sat()`), LLVM
(`llvm.fptosi.sat`), Arm A64 saturating `FCVT*`, x86 `CVTTPS2DQ`, and the saturating
FP8/FP16 casts in PyTorch, JAX and TensorRT all expose the same choice.

The setting applies when you *encode*, so it affects `encode` and the output side of
`convert`. A conversion first constructs the source operand using the input format's
standard defaults, then applies the selected overflow mode only while encoding that
operand into the output format. Decoding a bit pattern is unaffected, because every
pattern already names a value. Underflow is a separate path and is unaffected too: a
value too small for the format still rounds toward the smallest magnitude the format can
hold, under both modes.

## Per-format defaults

The default is per format, and reproduces each format's standard behavior, so omitting
the setting always gives the conventional answer:

| Format | Has Inf | Has NaN | Default | `overflow` gives | `saturate` gives |
|---|:---:|:---:|---|---|---|
| FP64 / FP32 / FP16 / BF16 / TF32 | ✓ | ✓ | `overflow` | ±∞ | ±max normal |
| FP8 E5M2 | ✓ | ✓ | `overflow` | ±∞ | ±57344 |
| FP8 E4M3 | ✗ | ✓ | `saturate` | NaN | ±448 |
| FP6 E3M2 / E2M3, FP4 E2M1 | ✗ | ✗ | `saturate` | ±max normal | ±max normal |
| INT\* / UINT\* / MXINT8 | n/a | n/a | `saturate` | ±max value | ±max value |
| E8M0 | ✗ | ✓ | `saturate` | NaN | 2^127 |

A custom format follows the same rule as the preset it resembles: it defaults to
`overflow` when it has an exponent field and infinities, and to `saturate` otherwise.
Fixed-point layouts (zero exponent bits) always saturate.

Two of those rows are **inert**: the FP6/FP4 row and the integer row. Those formats have
nowhere to put an Infinity or a NaN, so both modes give the same answer. The control is
still accepted there for API symmetry.

## Selecting it

| Surface | How |
|---|---|
| Web UI | the **On Overflow** dropdown |
| Shared link | `om=saturate` / `om=overflow` |
| CLI | `--overflow saturate` |
| WebMCP / MCP | the `overflowMode` parameter on `encode_number` and `convert_format` |

The `get_format_info` tool and `fp-conv info` both report a format's
`defaultOverflowMode` and what each mode resolves to, so an agent can find out what a
format will do before asking it to do anything.

### The web UI's third option

The dropdown has three entries, but only two behaviors. **Output's default** is a
deferral that follows whichever output format is selected, and choosing it writes no `om`
parameter into the shared link.

That matters because the formats disagree about what "normal" is. Pick **Overflow to
Infinity / NaN** explicitly and then switch the output to FP8 E4M3, and you get `NaN`
where the OCP-conformant default would have given `448`. The option's label names the
behavior it currently resolves to, so the deferral is legible:

| Output format | "Output format's default" names |
|---|---|
| FP64 / FP32 / FP16 / BF16 / TF32 / E5M2 | Infinity (IEEE 754) |
| FP8 E4M3, E8M0 | Saturate (OCP OFP8 "SAT") |
| FP6 / FP4 | Saturate (no Inf/NaN) |
| INT\* / UINT\* / MXINT8 | Saturate (Ints always clamp) |

## Caveat: rounding mode outranks this setting

IEEE 754 §7.4 makes overflow **rounding-mode dependent**. A directed rounding mode
pointing *toward* zero, meaning toward zero or the one facing away from the value's sign,
clamps a finite overflow to the largest finite value regardless of the selected mode:

```
fp-conv encode 1e40 -f fp32 --overflow overflow                      → Infinity
fp-conv encode 1e40 -f fp32 --overflow overflow -r towardZero        → 3.4028234663852886e+38
```

This is conformance, not a preference: a rounding mode that never increases magnitude
may not invent an infinity. An actual ±Infinity *input*, by contrast, is infinite under
every rounding mode, so there the overflow mode alone decides:

```
fp-conv encode inf -f fp16 --overflow overflow -r towardZero         → Infinity
fp-conv encode inf -f fp16 --overflow saturate                       → 65504
```

## Examples

```sh
# Non-IEEE output from an IEEE format, on explicit request
fp-conv encode 1e40 -f fp32 --overflow saturate    # 3.4028234663852886e+38
fp-conv encode 1e40 -f fp32                        # Infinity

# The two OFP8 Table 3 cells that need the non-default mode
fp-conv encode inf  -f fp8_e5m2 --overflow saturate  # 57344
fp-conv encode 1000 -f fp8_e4m3 --overflow overflow  # NaN

# Integers clamp either way
fp-conv encode 5000 -f int8                        # 127
fp-conv encode 5000 -f int8 --overflow overflow    # 127
```

A value that *rounds up* past the maximum counts as an overflow too, since OFP8 §5.2.1
checks the range after rounding. So E4M3 `encode(470)` is `NaN` under `overflow` (470
rounds to the reserved 480 slot) and `448` under `saturate`.

## See also

- [OCP conformance](ocp-conformance.md) for where the SAT / NONSAT requirement comes from
- [WebMCP API](webmcp.md) for the `overflowMode` parameter and its defaults
- [`tests/overflow-mode.test.js`](../tests/overflow-mode.test.js) for the behavior matrix
  as executable assertions
