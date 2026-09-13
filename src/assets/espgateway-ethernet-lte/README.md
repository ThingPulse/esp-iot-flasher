# ESPGateway Ethernet LTE web test assets

Select **ESPGateway Ethernet LTE** in the device list and use **Flash & Test**.
The device needs an inserted, powered A7670G in AT mode and Ethernet connected
to a DHCP network. The browser sends `{"ST":true}` at 115200 baud. A SIM is
optional; SIM/network observations do not affect the hardware pass result.

- `app-firmware.bin`: combined bootloader, partition table and test app; flash at **0x0**.
- `espgateway-ethernet-lte.png`: LTE/A7670G-labelled variant of the existing gateway thumbnail.
- `A7670_TESTBED.md`: test criteria, protocol and fixture acceptance checklist.
- `testbed-source.zip`: scoped buildable source snapshot, including build script and host tests.
- `manifest.json`: artifact SHA256 hashes, source base commit and firmware policy.

The default device configuration includes the binary MD5 required by the web
flasher's download-integrity check. Angular copies this whole asset directory
into its build output; no external firmware hosting is needed.

To update, rebuild the testbed environment in the firmware repository, replace
the combined binary, refresh the source snapshot and manifest hashes, and update
the configuration's MD5. The firmware is built and host-tested; physical fixture
acceptance must still be performed before relying on its results.

Image created using the built-in image generation tool, editing
`src/assets/espgateway/espgateway.jpg`. Prompt: preserve the white enclosure and
two antennas on white, create a square thumbnail, and add a prominent dark-blue
LTE badge and a smaller A7670G label without inventing ports or hardware.
