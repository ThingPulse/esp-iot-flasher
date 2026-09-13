# ESPGateway Ethernet + A7670G production test

Build with `pio run -e testbed-a7670`. Flash locally with
`pio run -e testbed-a7670 -t upload`, or give the web tester
`.pio/build/testbed-a7670/app-firmware.bin` at **offset 0x0**. The latter includes
the bootloader and partition table; `firmware.bin` alone belongs at 0x10000.
The dedicated merge hook uses this environment's binaries, unlike the legacy
aggregation script which hardcodes `esp-wrover-kit`.

Use an ESPGateway Ethernet with a powered, inserted A7670G in AT command mode,
modem TX connected to ESP32 IO13 and modem RX to IO14 (UART1, 8N1).
Connect Ethernet to a DHCP network. No SIM is required for the default hardware
pass criteria. The app does not control a modem power-key pin. A modem left in
PPP/data mode must first be returned to AT mode or power-cycled.

## Web protocol

USB serial is 115200 baud. Send `{"ST":true}` followed by LF (CRLF also works).
Boot only initializes interfaces; it does not run tests or emit a result array.
Malformed commands, false or non-boolean ST values and lines over 127 bytes
are ignored. One accepted command runs one test and returns one single-line
JSON array of `{name,value,result}` objects. Send another command after the
report to rerun without rebooting. Commands arriving during a run are discarded.
No `READY_FOR_SELFTEST` banner is emitted, since the inspected web tester responds
to that banner with the older `SELFTEST` command.

`Mac Address` is retained exactly because esp-iot-flasher uses it as the board
identifier. `NOK` fails the overall run. Informational rows use `OK` to avoid confusing operators with warning badges.
Their values remain observations, including unavailable or failed optional
queries; `OK` on these rows does not certify cellular connectivity. Diagnostic UART
responses are escaped inside the final JSON, never printed as separate lines
that the web tester could mistake for a result.

## Checks and audit evidence

- Required board checks: two ESP32 cores, heap over 100000 bytes, at least
  4000000 bytes of physical PSRAM and flash, successful boot PSRAM memory test, Ethernet initialization,
  nonzero Ethernet MAC, link, DHCP address, full duplex and nonzero link speed.
  PSRAM is tested before Ethernet takes GPIO16 for its clock. The linker wraps
  `esp_spiram_add_to_heapalloc` so external RAM is never registered as heap;
  subsequent allocations use internal RAM. Arduino 2.0.5 performs its PSRAM
  initialization and memory test before this registration step. A startup guard
  refuses to start Ethernet if any PSRAM heap was registered. Memory sizes are
  bytes; free PSRAM is not reported because it is not an application heap.
  LEDs indicate running (yellow) and overall
  pass/failure (green/red); they are not an automated optical test.
- Required modem checks: two successful AT probes; nonempty manufacturer,
  exact model `A7670G`, `SIMCOM_A7670G` or `A7670G-LLSE`; nonempty firmware revision;
  15-digit IMEI with valid checksum. UART detection tries 115200, 230400,
  460800, 921600, 9600 and 57600 for about 30 seconds without changing the
  modem's baud setting.
- Optional firmware policy: by default CGMR is recorded, not compared to a
  certified/latest revision. Add the following to the environment to enforce
  the exact approved revision (replace the example):

  ```ini
  build_flags = ${env:esp-wrover-kit.build_flags}
                -Wl,--wrap=esp_spiram_add_to_heapalloc
                -DTESTBED_EXPECTED_MODEM_FW=\"A123_A7670G\"
  ```

- Informational snapshots: ATI identification, radio functionality, SIM/PIN
  state, SIM ICCID, LTE registration, operator, signal quality and serving-cell
  information. Missing SIM, no service, unknown signal and unsupported queries
  are recorded without claiming a cellular connectivity pass. Queries do not
  enter a PIN, modify APNs, reset the modem, save settings, or initiate traffic.
- Audit correlation: board MAC, chip revision, flash size, build date/time,
  test suite version, test firmware **ELF** SHA256, run number (since boot),
  duration, module IMEI, firmware and raw bounded command responses. Store the
  binary, source revision, approved firmware policy, operator/station identity
  and server timestamp alongside the report. The device has no trusted wall
  clock. These are diagnostic records, not signed/tamper-proof certification.
  Reports contain IMEI, ICCID and potentially cell location identifiers.

Each query has a three-second timeout. An error is recorded; a timeout or
overflow disables remaining queries so a late result cannot pass the next
check. Ethernet gets up to ten additional seconds for DHCP. Expect a missing
modem run to finish in roughly 40 seconds and an upper bound around 85 seconds
with slow queries. Ethernet initialization happens once at boot.

Command reference: SIMCom's [A76XX AT Command Manual V1.09](https://files.waveshare.com/wiki/A7670E-Cat-1-GNSS-HAT/A76XX_Series_AT_Command_Manual_V1.09.pdf),
in particular CGMI, CGMM, CGMR, CGSN and the read-only status commands.

## Validation

Run host parser/IMEI checks:

```sh
c++ -std=c++11 -Wall -Wextra -Werror test/test_testbed_at_response.cpp -o /tmp/testbed-at-test
/tmp/testbed-at-test
c++ -std=c++11 -Wall -Wextra -Werror -I.pio/libdeps/testbed-a7670/ArduinoJson/src test/test_testbed_start_command.cpp -o /tmp/testbed-start-test
/tmp/testbed-start-test
```

Hardware acceptance checklist:

1. Boot and wait: no JSON result until ST; malformed input and ST false do nothing.
2. With Ethernet and A7670G, send ST and verify exactly one report, correct board
   MAC, module model/firmware/IMEI and matching ELF hash. Check report storage in
   esp-iot-flasher. Rerun ST and confirm run number increments.
3. Remove modem: bounded completion with modem NOK rows. Remove Ethernet: ETH
   NOK rows. Remove SIM: informational SIM errors, required modem tests still pass.
4. Configure an incorrect approved firmware revision: firmware policy must fail.
5. Exercise split serial commands, CRLF, oversized input followed by a valid
   command, duplicate ST during execution, and modem timeout/error responses.

Compilation and host tests do not replace these physical fixture checks.

## Crash fix in suite version 2

Version 1 could panic in `tlsf_malloc` while allocating the 24 KB JSON report:
Arduino had registered PSRAM as heap, but Ethernet had subsequently taken its
GPIO16 pin. Version 2 keeps the boot memory test and excludes PSRAM from heap
registration for the entire runtime. Check the reported suite version after
reflashing and exercise repeated ST runs with Ethernet active. The firmware
ELF saved with each build is needed to decode that build's backtraces.

## Operator display in suite version 3

Informational rows now use `OK`; required failures still use `NOK`.
The observed `A7670G-LLSE` model is accepted as an exact additional identity.
Other unrecognized model strings still fail identity validation.
