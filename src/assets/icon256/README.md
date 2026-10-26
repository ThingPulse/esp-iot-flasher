# Icon256 factory firmware

The active device configuration uses `app-firmware-20261026.bin`, a merged
ESP32-S3 image flashed at address `0x0000`. See `manifest.json` for checksums
and source provenance. The unversioned January 12 image is retained but is
not selected by the default configuration.

Build in WLED-Icon256 with `pio run -e icon256`, then run `bash aggregate_bin.sh`
with PlatformIO's Python environment on PATH. Copy `.pio/build/icon256/app-firmware.bin`
to a versioned filename here and update the default configuration and manifest.
Do not substitute the application-only `firmware.bin` at offset zero.

This build accepts `{"ST":true}` through the legacy hardware-test protocol.
It emits the JSON report only after the red/green/blue/white LED sequence and
three speaker tones. `Speaker Playback` checks I2S setup, writes and cleanup;
operators must still confirm the visible colors and audible sound. Wi-Fi
association is not a pass/fail prerequisite for an unprovisioned device.

Hardware acceptance: Flash & Test, verify the build date, observe all four colors
and three tones before the report appears, and confirm Speaker Playback is OK.
Repeat with Run test again. A disconnected speaker cannot be detected from I2S
write success alone.
