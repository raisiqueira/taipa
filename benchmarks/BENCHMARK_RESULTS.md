# Benchmark Results

- Timestamp: 2026-07-24T13:36:15.926Z
- Git hash: c64cbe1ef75340aa8f8dd92f29be9b6d7f893a1f

## create rows

| rank | framework |     time | vs best |
| ---: | --------- | -------: | ------: |
|    1 | vanillajs |  62.1 ms |    best |
|    2 | taipa     |  62.3 ms |   +0.3% |
|    3 | vue       |  68.1 ms |   +9.7% |
|    4 | ilha      |  69.5 ms |  +11.9% |
|    5 | react     | 101.3 ms |  +63.1% |
|    6 | lit-html  | 365.3 ms | +488.2% |

## replace all rows

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | vanillajs |   94.7 ms |     best |
|    2 | taipa     |   95.0 ms |    +0.3% |
|    3 | vue       |   98.1 ms |    +3.6% |
|    4 | ilha      |  129.9 ms |   +37.2% |
|    5 | react     |  216.8 ms |  +128.9% |
|    6 | lit-html  | 2442.4 ms | +2479.1% |

## partial update

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | vue       |   85.0 ms |     best |
|    2 | vanillajs |   97.2 ms |   +14.4% |
|    3 | taipa     |   97.7 ms |   +14.9% |
|    4 | ilha      |  100.6 ms |   +18.4% |
|    5 | react     |  107.8 ms |   +26.8% |
|    6 | lit-html  | 1808.1 ms | +2027.2% |

## run memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,466,048 bytes |    best |
|    2 | taipa     |  2,856,876 bytes |  +15.8% |
|    3 | ilha      |  3,266,472 bytes |  +32.5% |
|    4 | lit-html  |  3,724,616 bytes |  +51.0% |
|    5 | vue       |  5,810,080 bytes | +135.6% |
|    6 | react     | 10,681,340 bytes | +333.1% |

## update memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,397,936 bytes |    best |
|    2 | taipa     |  2,771,872 bytes |  +15.6% |
|    3 | ilha      |  3,256,064 bytes |  +35.8% |
|    4 | lit-html  |  3,832,164 bytes |  +59.8% |
|    5 | vue       |  5,958,092 bytes | +148.5% |
|    6 | react     | 10,772,984 bytes | +349.3% |
