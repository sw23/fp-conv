# Floating Point Number Converter

Interactive tool for converting and visualizing floating-point numbers across standard and custom formats. Convert between FP32, FP16, BF16, TF32, FP8, etc. while inspecting binary representations and precision loss.

**Live URL:** https://sw23.github.io/fp-conv/

## Features

- **Format presets:** FP64, FP32, FP16, BF16, TF32, FP8 (E4M3, E5M2, E8M0)
- **Custom formats:** Define any bit layout (0-15 exponent bits, 0-112 mantissa bits)
- **Interactive editing:** Toggle individual bits and see decimal/hex updates
- **Precision analysis:** Calculate absolute and relative error between formats
- **Special values:** Explore zero, infinity, NaN, subnormals, and boundary cases
- **Fixed-point mode:** Set exponent bits to 0 for fractional representations

## Supported Formats

- **IEEE 754:** FP64, FP32, FP16
- **ML/AI:** BF16, TF32, FP8 E4M3/E5M2
- **Custom:** Any user-defined bit allocation

## License

Apache-2.0 © 2025 Spencer Williams. See [LICENSE](LICENSE).
