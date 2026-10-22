# NaN behavior

A NaN carries more than "not a number". IEEE 754 formats give it a sign and a payload:
every mantissa bit below the quiet bit. What a conversion does with those bits is a real
choice, and hardware makes it both ways. `fp-conv` exposes both.

## The two modes

| Mode | Also called | Meaning |
|---|---|---|
| `canonical` | Arm "Default NaN" (`FPCR.DN=1`) | Every NaN becomes the target's canonical quiet NaN: sign 0, the quiet bit (mantissa MSB) set, nothing else; the all-ones mantissa in E4M3 and E8M0 |
| `preserve` | IEEE 754-2019 §6.2.3 propagation; x86 `CVTSS2SD` / `CVTSD2SS` / `VCVTPS2PH`; AArch64 `FCVT` with `FPCR.DN=0` | Keep the sign, keep as many high-order payload bits as fit, and quiet the result |

`canonical` is the default, and it is what every conversion produced before the setting
existed, so omitting it changes nothing. Unlike the [overflow mode](overflow-behavior.md),
the default does not depend on the format: it is `canonical` everywhere.

IEEE 754-2019 §6.2.3 is where `preserve` comes from: a conversion that produces a NaN
from a NaN input should carry over as much of its payload as fits. Intel SDM Vol. 1
§4.8.3.5 (Table 4-7) is the x86 statement of the same rule for the SSE and AVX
conversions, and Arm's `FPCR.DN` bit is the switch between the two behaviors on AArch64.

## Where the payload comes from

Only a bit pattern has a payload. The setting applies when an **encoding** is converted:
`convert` from a bit pattern, the web UI after you toggle bits or type a hex pattern, and
the library's `convertEncoded()`.

A typed value has no bits to keep. `nan`, `-nan` and a JavaScript `NaN` are all the
same value, so encoding one gives the format's canonical quiet NaN under **both** modes.
That includes the sign: a typed `-nan` encodes as a positive NaN, because the literal
carries no sign bit to preserve. `encode` therefore does not take the setting at all.

## The rule

Given a NaN in the source format and a target format:

1. **No NaN in the target, no change.** FP6, FP4, the integer formats, MXINT8,
   fixed-point layouts and the degenerate layouts with nowhere to put a NaN substitute
   exactly as they do today: the positive maximum, or zero for a plain integer. See
   [NaN and Infinity inputs](overflow-behavior.md#nan-and-infinity-inputs). The
   precision-loss row still says `NaN not representable`.
2. **Sign.** The target's sign bit is the source's, if the target has one. A source with
   no sign bit (E8M0) contributes a positive NaN.
3. **Payload.** The source mantissa field is left-aligned into the target's: shifted up
   when the target is wider, shifted down (dropping the low bits) when it is narrower. So
   the source's quiet bit lands on the target's quiet bit, and the payload's high-order
   bits follow it down.
4. **Quiet.** The result is made a quiet NaN unconditionally: an IEEE-style target gets
   its mantissa MSB set; E4M3 and E8M0, whose only NaN is the all-ones mantissa, get that.

Step 4 is not just tidiness. A signalling NaN whose payload sits entirely below the
target's precision shifts down to a zero mantissa, and a zero mantissa at the top
exponent is **Infinity**: FP32 `0x7F800001` naively narrowed to FP16 is `0x7C00`. Forcing
the quiet bit makes it `0x7E00`, a NaN. It also makes a NaN widened and then narrowed
back come out as the same quiet NaN, as §6.2.3 intends.

An OCP-style source's NaN mantissa is all ones, so it arrives in an IEEE-style target as
a payload of ones: FP8 E4M3 `0xFF` becomes FP32 `0xFFF00000`. That is the rule applied
uniformly, not a special case.

## What each format can keep

The most a NaN in each target can carry. A conversion keeps the high-order bits of
whichever payload is narrower, the source's or the target's.

| Target | Sign | Payload bits | Notes |
|---|---|---|---|
| FP64 | ✓ | 51 | |
| FP32 | ✓ | 22 | |
| FP16 / TF32 | ✓ | 9 | |
| BF16 | ✓ | 6 | |
| FP8 E5M2 | ✓ | 1 | IEEE-style: one bit below the quiet bit |
| FP8 E4M3 | ✓ | 0 | two NaNs, `0x7F` and `0xFF` (OCP OFP8 Table 1): the sign is all there is |
| E8M0 | ✗ | 0 | one NaN, `0xFF`, and no sign bit (OCP MX §5.4.1, Table 7) |
| FP6 E3M2 / E2M3, FP4 E2M1 | — | — | no NaN: both modes give +max |
| INT\* / UINT\* / MXINT8 | — | — | no NaN: both modes give 0, or +max for MXINT8 |

A custom layout follows the same rule as the preset it resembles: an IEEE-style mantissa
of *m* bits keeps the sign and *m* − 1 payload bits, an OCP-style one keeps only the sign,
and an unsigned one drops the sign.

## Selecting it

| Surface | How |
|---|---|
| Web UI | the **On NaN Input** dropdown: *Canonical quiet NaN* or *Preserve sign and payload* |
| Shared link | `nm=preserve`; omitted for `canonical` |
| CLI | `fp-conv convert --nan preserve`, with the NaN given as a pattern with `--bits` |
| WebMCP / MCP | the `nanMode` parameter on `convert_format`, with the NaN given as `bits` |
| Library | `convertEncoded(inFormat, inEncoded, outFormat, { nanMode: 'preserve' })` |

`encode_number` and `fp-conv encode` do not take it: they start from a typed value, which
has no payload.

```sh
fp-conv convert --bits 0xFFC00000 --from fp32 --to fp16                  # 0x7E00
fp-conv convert --bits 0xFFC00000 --from fp32 --to fp16 --nan preserve   # 0xFE00
```

## Vectors

Each row is a NaN bit pattern converted under both modes. Where the target names two
formats, the pattern goes through the first and then on to the second, under the same
mode. [`tests/nan-docs.test.js`](../tests/nan-docs.test.js) reads this table and checks
every cell against the library.

| Source | Input | Target | `canonical` | `preserve` | Why |
|---|---|---|---|---|---|
| FP32 | `0xFFC00000` | FP16 | `0x7E00` | `0xFE00` | the sign survives |
| FP32 | `0x7FC12345` | FP16 | `0x7E00` | `0x7E09` | the top 10 of the 23 mantissa bits survive |
| FP32 | `0x7F800001` | FP16 | `0x7E00` | `0x7E00` | a signalling NaN becomes quiet, not `0x7C00` (Infinity) |
| FP32 | `0x7F800001` | FP64 | `0x7FF8000000000000` | `0x7FF8000020000000` | widened: the payload is kept and the result quieted |
| FP16 | `0x7E01` | FP32 | `0x7FC00000` | `0x7FC02000` | left-aligned into the wider field |
| FP16 | `0xFE01` | FP32 → FP16 | `0x7E00` | `0xFE01` | widening then narrowing gives back the quiet NaN |
| FP32 | `0xFFC00000` | FP8 E4M3 | `0x7F` | `0xFF` | E4M3 has two NaNs; the sign picks one |
| FP32 | `0xFFC00000` | E8M0 | `0xFF` | `0xFF` | E8M0 has one NaN and no sign bit |
| FP8 E4M3 | `0xFF` | FP32 | `0x7FC00000` | `0xFFF00000` | the all-ones mantissa arrives as payload |
| E8M0 | `0xFF` | FP32 | `0x7FC00000` | `0x7FC00000` | an empty mantissa field contributes nothing |
| FP32 | `0xFFC00001` | FP4 E2M1 | `0x7` | `0x7` | no NaN in FP4: +max (6) under both modes |
| FP32 | `0xFFC00001` | INT8 | `0x00` | `0x00` | no NaN in INT8: 0 under both modes |
| FP32 | `0xFFC00001` | `s0e8m23` | `0x7FC00000` | `0x7FC00001` | an unsigned target drops the sign, keeps the payload |
| BF16 | `0xFFC1` | `s1e15m112` → BF16 | `0x7FC0` | `0xFFC1` | through a 112-bit field and back, exactly |

## Caveat: payload loss is not reported as precision loss

A NaN converted to a NaN is reported as **exact** under both modes, even when `preserve`
had to drop payload bits (FP32 `0x7FC12345` → FP16 `0x7E09`), quiet a signalling NaN, or
drop a sign the target has no bit for. IEEE 754 raises no exception for any of these,
and a NaN has no value for a difference to be measured on. The precision-loss row, the
`convert_format` result and the CLI's `Reason:` line describe what happened to the
**value**; compare the bit patterns to see what happened to the payload.

Only a NaN the target cannot hold at all is reported, as `NaN not representable`, and
that is the same under both modes.

## See also

- [Overflow behavior](overflow-behavior.md) for what a NaN becomes in a format without one
- [WebMCP API](webmcp.md) for the `convert_format` tool
- [`tests/nan-mode.test.js`](../tests/nan-mode.test.js) for the rule as executable
  assertions
