# ESP-IoT-Flasher

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Building docker image

### Building docker for local machine architecture

`docker build -t thingpulse/esp-iot-flasher:1.0.2 . `

### building docker on ARM for x86

`docker buildx build --platform linux/amd64 -t thingpulse/esp-iot-flasher:1.0.2 .`

### Running with docker-compose

The repository contains a sample docker-compose.yaml file. By executing
`docker-compose up -d`
in the root of this repository you can start the service. The example docker-compose configuration
will start the service at http://localhost:8081

## Changing device configuration

Default configurations loads the browser from the server. The angular application looks for a configuration
file at `/assets/defaultDeviceConfiguration.json`: 

https://github.com/ThingPulse/esp-iot-flasher/blob/1c669c1fe53238a759b6027cf89888fffa4055e9/src/assets/defaultDeviceConfiguration.json#L1-L24

### Explanation

- id: unique id within this file
- name: displayed name of the device
- imageSource: relative url to the displayed device image
- partitions: one or several partitions. We recommend to use just one partition if possible
    - name: of the partition, will be displayed during flashing
    - data: leave empty
    - offset: address in the flash at which this partition should be written
    - url: relative url where the binary file is. Adapt CORS headers if loading from a different domain

## Changing device configuration when running with docker-compose

Adapt and uncomment the following lines to use your own configuration files in `docker-compose.yaml` 
```
        volumes:
          - ./src/assets:/usr/share/nginx/html/assets:ro
```

## Creating firmware to run the test

The following repository shows how to build a firmware which can be used together with the
esp-iot-flasher: https://github.com/ThingPulse/esp32-epulse-feather-testbed
