# Benchmark Results

- Timestamp: 2026-07-23T20:32:23.708Z
- Git hash: 6596861812112c4e1d767a8f2517d4fe0792b98b

## create rows

| rank | framework |     time |
| ---: | --------- | -------: |
|    1 | vanillajs |  65.3 ms |
|    2 | lit-html  |  73.1 ms |
|    3 | ilha      |  85.8 ms |
|    4 | taipa     |  89.7 ms |
|    5 | vue       |  96.9 ms |
|    6 | react     | 177.6 ms |

## replace all rows

| rank | framework |     time |
| ---: | --------- | -------: |
|    1 | vue       |  43.0 ms |
|    2 | taipa     |  46.0 ms |
|    3 | vanillajs |  46.1 ms |
|    4 | ilha      |  66.9 ms |
|    5 | react     |  77.4 ms |
|    6 | lit-html  | 126.0 ms |

## partial update

| rank | framework |    time |
| ---: | --------- | ------: |
|    1 | lit-html  | 25.7 ms |
|    2 | vue       | 27.9 ms |
|    3 | react     | 42.6 ms |
|    4 | vanillajs | 47.1 ms |
|    5 | taipa     | 47.3 ms |
|    6 | ilha      | 56.9 ms |

## run memory

| rank | framework |           memory |
| ---: | --------- | ---------------: |
|    1 | vanillajs |  2,435,444 bytes |
|    2 | taipa     |  2,828,916 bytes |
|    3 | ilha      |  3,173,904 bytes |
|    4 | lit-html  |  3,439,920 bytes |
|    5 | vue       |  5,734,868 bytes |
|    6 | react     | 15,196,740 bytes |

## update memory

| rank | framework |           memory |
| ---: | --------- | ---------------: |
|    1 | vanillajs |  2,433,916 bytes |
|    2 | taipa     |  2,827,568 bytes |
|    3 | ilha      |  3,282,156 bytes |
|    4 | lit-html  |  3,556,424 bytes |
|    5 | vue       |  5,859,236 bytes |
|    6 | react     | 15,887,132 bytes |
