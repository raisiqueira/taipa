# Benchmark Results

- Timestamp: 2026-07-28T21:08:04.799Z
- Git hash: 8a96d131f218d22ab65139a46c771eae6d7627b5
- Chromium: 149.0.7827.55
- Node: v24.18.0 on darwin
- Warmups: 5

## create rows

| rank | framework |     time | vs best |
| ---: | --------- | -------: | ------: |
|    1 | ilha      |  60.2 ms |    best |
|    2 | taipa     |  60.7 ms |   +0.8% |
|    3 | vanillajs |  63.9 ms |   +6.1% |
|    4 | vue       |  69.2 ms |  +15.0% |
|    5 | react     | 143.9 ms | +139.0% |
|    6 | lit-html  | 379.2 ms | +529.9% |

## replace all rows

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | taipa     |   92.2 ms |     best |
|    2 | vue       |   92.6 ms |    +0.4% |
|    3 | vanillajs |   96.0 ms |    +4.1% |
|    4 | ilha      |  116.6 ms |   +26.5% |
|    5 | react     |  130.5 ms |   +41.5% |
|    6 | lit-html  | 2367.1 ms | +2467.4% |

## partial update

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | vue       |   77.7 ms |     best |
|    2 | vanillajs |   96.9 ms |   +24.7% |
|    3 | taipa     |   97.0 ms |   +24.8% |
|    4 | ilha      |  100.6 ms |   +29.5% |
|    5 | react     |  168.0 ms |  +116.2% |
|    6 | lit-html  | 2050.8 ms | +2539.4% |

## run memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,467,492 bytes |    best |
|    2 | taipa     |  2,858,536 bytes |  +15.8% |
|    3 | ilha      |  3,266,388 bytes |  +32.4% |
|    4 | lit-html  |  3,816,268 bytes |  +54.7% |
|    5 | vue       |  5,811,416 bytes | +135.5% |
|    6 | react     | 11,324,848 bytes | +359.0% |

## update memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,398,048 bytes |    best |
|    2 | taipa     |  2,772,972 bytes |  +15.6% |
|    3 | lit-html  |  4,042,556 bytes |  +68.6% |
|    4 | ilha      |  4,172,868 bytes |  +74.0% |
|    5 | vue       |  5,959,696 bytes | +148.5% |
|    6 | react     | 10,728,072 bytes | +347.4% |
