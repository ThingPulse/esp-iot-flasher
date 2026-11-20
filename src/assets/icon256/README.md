# Icon256 factory firmware

The active device configuration uses `app-firmware-17.0.1.bin`, a combined
ESP32-S3 image flashed at address `0x0000`. Both bundled asset catalogs contain
the same image. `manifest.json` records its exact source commit, component
offsets, sizes, MD5 and SHA-256 checksums.

This factory build includes the simplified UI, update discovery, and the self-test
label-lifetime correction in the WLED usermod. It is versioned `17.0.1` to keep it
distinct from the previously tagged `17.0.0` firmware. This flasher update does not
publish a new OTA release. The source checkout is clean except for the release
version preparation performed by `tools/icon256_release.py`.

## Rebuild

Use a disposable checkout of the manifest's `sourceCommit` in WLED-Icon256.
Run `python3 tools/icon256_release.py prepare --tag v17.0.1`, `npm ci`,
`npm run build`, and `pio run -e icon256`. Use the tracked Icon256 configuration,
not an untracked hardware override. Merge the build's matching components with
esptool for ESP32-S3:

- `0x0000`: `bootloader.bin`
- `0x8000`: `partitions.bin`
- `0xe000`: the build framework's `tools/partitions/boot_app0.bin`
- `0x10000`: `firmware.bin`

Keep the compiled image's flash parameters. Do not pad to 4 MB or include a
filesystem image. Do not substitute the OTA-only `firmware.bin` at offset zero.
Copy the combined image into both `src/assets/icon256` and
`esp-iot-flasher-assets/assets/icon256`, refresh their manifests and device
configuration MD5 values, then run `npm run verify:icon256`. The production build
also runs that check. Retained older images are not selected by either catalog.

## Self-test acceptance

The legacy command is `{"ST":true}`. The report is one JSON array emitted only
after the red/green/blue/white LED sequence and three speaker tones. The flasher's
capability probe can time out normally: this firmware uses the existing legacy
hardware test fallback, not the LTE cellular protocol.

`Speaker Playback` checks I2S setup, writes and cleanup; an operator must still
confirm the visible colors and audible tones. A disconnected speaker cannot be
detected from I2S write success alone. Wi-Fi association is not a pass/fail
prerequisite for an unprovisioned device.

Verify `WLED Version` is `17.0.1`, `Bus 0` has its intact name, no report rows
are `NOK`, and Run test again produces another complete report. The older
firmware's temporary Bus label could corrupt JSON after the visual/audio delay;
this build copies labels into the report's owned storage.

A factory flash can reset provisioning/boot metadata. Use a production fixture
or back up a configured device first. For development verification, the exact
application component can be installed by validated OTA while retaining settings;
that does not substitute for a factory Flash & Test acceptance run.
