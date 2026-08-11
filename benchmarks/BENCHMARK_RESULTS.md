# Benchmark Results

- Timestamp: 2026-08-11T14:14:39.675Z
- Git hash: 620b474b4aaaf13b1c530c5e1f3c0b76f810848c (dirty working tree)
- Chromium: 149.0.7827.55
- Node: v24.18.0 on darwin
- Processor: Apple M4 Pro (12 logical cores, arm64)
- Host memory: 24.0 GiB
- Warmups: 5
- CPU samples: 10
- Randomization seed: 1952541040

## create rows

| rank | framework |     time |         95% CI | samples | vs best |
| ---: | --------- | -------: | -------------: | ------: | ------: |
|    1 | vanillajs |  48.2 ms |   46.4-49.9 ms |      10 |    best |
|    2 | taipa     |  49.6 ms |   48.2-51.0 ms |      10 |   +2.9% |
|    3 | ilha      |  53.2 ms |   50.9-55.5 ms |      10 |  +10.4% |
|    4 | vue       |  54.1 ms |   51.5-56.8 ms |      10 |  +12.3% |
|    5 | lit-html  |  54.6 ms |   48.6-60.7 ms |      10 |  +13.4% |
|    6 | react     | 125.8 ms | 123.1-128.4 ms |      10 | +161.0% |

## create 10,000 rows

| rank | framework |     time |         95% CI | samples | vs best |
| ---: | --------- | -------: | -------------: | ------: | ------: |
|    1 | vanillajs | 221.1 ms | 213.2-229.0 ms |      10 |    best |
|    2 | taipa     | 221.8 ms | 216.9-226.6 ms |      10 |   +0.3% |
|    3 | vue       | 262.9 ms | 260.8-265.1 ms |      10 |  +18.9% |
|    4 | ilha      | 274.8 ms | 268.0-281.6 ms |      10 |  +24.3% |
|    5 | lit-html  | 275.2 ms | 263.4-287.1 ms |      10 |  +24.5% |
|    6 | react     | 571.7 ms | 566.1-577.2 ms |      10 | +158.5% |

## replace all rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | vanillajs | 22.3 ms | 21.0-23.6 ms |      10 |    best |
|    2 | taipa     | 23.4 ms | 21.8-25.0 ms |      10 |   +5.1% |
|    3 | vue       | 25.8 ms | 25.0-26.6 ms |      10 |  +15.7% |
|    4 | ilha      | 34.3 ms | 33.6-35.0 ms |      10 |  +53.9% |
|    5 | lit-html  | 37.5 ms | 37.0-38.0 ms |      10 |  +68.4% |
|    6 | react     | 46.1 ms | 45.4-46.7 ms |      10 | +106.7% |

## append 1,000 rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | lit-html  | 27.2 ms | 26.4-28.0 ms |      10 |    best |
|    2 | vue       | 28.3 ms | 27.3-29.4 ms |      10 |   +4.0% |
|    3 | vanillajs | 38.0 ms | 36.2-39.7 ms |      10 |  +39.4% |
|    4 | taipa     | 38.3 ms | 36.7-39.9 ms |      10 |  +40.6% |
|    5 | react     | 44.7 ms | 44.0-45.4 ms |      10 |  +64.2% |
|    6 | ilha      | 51.8 ms | 50.0-53.6 ms |      10 |  +90.3% |

## partial update

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | vue       |  9.9 ms |  6.4-13.5 ms |      10 |    best |
|    2 | lit-html  | 11.2 ms |  8.2-14.2 ms |      10 |  +12.5% |
|    3 | react     | 12.6 ms | 11.8-13.4 ms |      10 |  +26.4% |
|    4 | taipa     | 20.8 ms | 19.2-22.4 ms |      10 | +108.8% |
|    5 | vanillajs | 20.9 ms | 18.9-22.9 ms |      10 | +110.1% |
|    6 | ilha      | 27.9 ms | 26.5-29.4 ms |      10 | +180.5% |

## swap rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | vue       | 10.7 ms |  7.7-13.7 ms |      10 |    best |
|    2 | lit-html  | 12.0 ms |  9.4-14.7 ms |      10 |  +12.4% |
|    3 | vanillajs | 19.3 ms | 17.9-20.7 ms |      10 |  +80.4% |
|    4 | taipa     | 21.4 ms | 19.6-23.1 ms |      10 |  +99.9% |
|    5 | react     | 26.0 ms | 25.2-26.9 ms |      10 | +143.3% |
|    6 | ilha      | 27.0 ms | 25.6-28.3 ms |      10 | +152.4% |

## run memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,306,868 bytes |    best |
|    2 | taipa     |  2,676,528 bytes |  +16.0% |
|    3 | ilha      |  2,926,360 bytes |  +26.9% |
|    4 | lit-html  |  3,234,484 bytes |  +40.2% |
|    5 | vue       |  5,421,076 bytes | +135.0% |
|    6 | react     | 15,058,868 bytes | +552.8% |

## update memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,571,600 bytes |    best |
|    2 | taipa     |  2,993,852 bytes |  +16.4% |
|    3 | ilha      |  3,327,228 bytes |  +29.4% |
|    4 | lit-html  |  3,534,672 bytes |  +37.5% |
|    5 | vue       |  5,900,976 bytes | +129.5% |
|    6 | react     | 16,749,224 bytes | +551.3% |
