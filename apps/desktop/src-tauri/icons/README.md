# RowFlow Icons

This directory should contain the application icons in the following sizes:

- `32x32.png` - 32x32 pixels
- `128x128.png` - 128x128 pixels
- `128x128@2x.png` - 256x256 pixels (Retina)
- `icon.icns` - macOS icon bundle
- `icon.ico` - Windows icon

You can use tools like:
- [tauri-icon](https://github.com/tauri-apps/tauri-icon) to generate all required sizes
- Run: `cargo install tauri-icon && tauri-icon path/to/source.png`

The source image should be at least 512x512 pixels with transparency support (PNG).
