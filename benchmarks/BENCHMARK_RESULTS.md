# Benchmark Results

- Timestamp: 2026-08-04T19:31:47.765Z
- Git hash: 764d86ba1e4fe0164f7faa169a46a0821d025338
- Chromium: 149.0.7827.55
- Node: v24.18.0 on darwin
- Processor: Apple M4 Pro (12 logical cores, arm64)
- Host memory: 24.0 GiB
- Warmups: 5

## create rows

| rank | framework |     time | vs best |
| ---: | --------- | -------: | ------: |
|    1 | ilha      |  60.0 ms |    best |
|    2 | taipa     |  62.2 ms |   +3.7% |
|    3 | vanillajs |  63.1 ms |   +5.2% |
|    4 | vue       |  68.6 ms |  +14.3% |
|    5 | react     |  96.7 ms |  +61.2% |
|    6 | lit-html  | 380.6 ms | +534.3% |

## replace all rows

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | vue       |   91.2 ms |     best |
|    2 | taipa     |   94.0 ms |    +3.1% |
|    3 | vanillajs |   96.5 ms |    +5.8% |
|    4 | ilha      |  114.4 ms |   +25.4% |
|    5 | react     |  228.8 ms |  +150.9% |
|    6 | lit-html  | 2594.6 ms | +2745.0% |

## partial update

| rank | framework |      time |  vs best |
| ---: | --------- | --------: | -------: |
|    1 | vue       |   81.0 ms |     best |
|    2 | vanillajs |   95.2 ms |   +17.5% |
|    3 | taipa     |   96.3 ms |   +18.9% |
|    4 | ilha      |   99.7 ms |   +23.1% |
|    5 | react     |  134.2 ms |   +65.7% |
|    6 | lit-html  | 1907.8 ms | +2255.3% |

## run memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,379,796 bytes |    best |
|    2 | taipa     |  2,855,240 bytes |  +20.0% |
|    3 | ilha      |  3,298,812 bytes |  +38.6% |
|    4 | lit-html  |  3,724,288 bytes |  +56.5% |
|    5 | vue       |  5,810,188 bytes | +144.1% |
|    6 | react     | 10,019,480 bytes | +321.0% |

## update memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,517,540 bytes |    best |
|    2 | taipa     |  2,771,440 bytes |  +10.1% |
|    3 | lit-html  |  3,873,492 bytes |  +53.9% |
|    4 | ilha      |  4,171,192 bytes |  +65.7% |
|    5 | vue       |  5,960,636 bytes | +136.8% |
|    6 | react     | 17,162,512 bytes | +581.7% |
