# Benchmark Results

- Timestamp: 2026-08-11T14:43:31.860Z
- Git hash: 8ec395cda1f9d40ea95554f36df164dd63e1cb97
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
|    1 | taipa     |  46.0 ms |   43.9-48.0 ms |      10 |    best |
|    2 | vanillajs |  46.2 ms |   43.9-48.5 ms |      10 |   +0.4% |
|    3 | lit-html  |  51.4 ms |   49.9-52.9 ms |      10 |  +11.8% |
|    4 | ilha      |  52.0 ms |   50.6-53.4 ms |      10 |  +13.1% |
|    5 | vue       |  52.5 ms |   48.4-56.6 ms |      10 |  +14.2% |
|    6 | react     | 121.3 ms | 118.7-123.9 ms |      10 | +163.9% |

## create 10,000 rows

| rank | framework |     time |         95% CI | samples | vs best |
| ---: | --------- | -------: | -------------: | ------: | ------: |
|    1 | vanillajs | 210.0 ms | 205.5-214.5 ms |      10 |    best |
|    2 | taipa     | 212.2 ms | 208.7-215.6 ms |      10 |   +1.0% |
|    3 | vue       | 254.2 ms | 249.5-259.0 ms |      10 |  +21.0% |
|    4 | lit-html  | 260.9 ms | 255.0-266.9 ms |      10 |  +24.2% |
|    5 | ilha      | 274.8 ms | 253.4-296.3 ms |      10 |  +30.8% |
|    6 | react     | 548.6 ms | 543.9-553.4 ms |      10 | +161.2% |

## replace all rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | taipa     | 20.6 ms | 19.3-21.9 ms |      10 |    best |
|    2 | vanillajs | 21.2 ms | 19.7-22.7 ms |      10 |   +2.8% |
|    3 | vue       | 24.4 ms | 23.9-24.9 ms |      10 |  +18.6% |
|    4 | ilha      | 33.6 ms | 32.9-34.4 ms |      10 |  +63.3% |
|    5 | lit-html  | 37.0 ms | 36.7-37.4 ms |      10 |  +79.8% |
|    6 | react     | 45.1 ms | 44.1-46.0 ms |      10 | +118.8% |

## append 1,000 rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | lit-html  | 27.2 ms | 26.1-28.2 ms |      10 |    best |
|    2 | vue       | 27.6 ms | 26.9-28.3 ms |      10 |   +1.7% |
|    3 | vanillajs | 37.3 ms | 35.7-38.9 ms |      10 |  +37.3% |
|    4 | taipa     | 37.8 ms | 36.5-39.1 ms |      10 |  +39.0% |
|    5 | react     | 43.5 ms | 42.7-44.2 ms |      10 |  +60.0% |
|    6 | ilha      | 50.2 ms | 47.7-52.8 ms |      10 |  +84.8% |

## partial update

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | lit-html  | 10.5 ms |  6.6-14.3 ms |      10 |    best |
|    2 | vue       | 10.8 ms |  7.4-14.3 ms |      10 |   +3.7% |
|    3 | react     | 12.9 ms | 11.6-14.2 ms |      10 |  +23.3% |
|    4 | vanillajs | 20.1 ms | 18.5-21.7 ms |      10 |  +92.0% |
|    5 | taipa     | 20.7 ms | 18.9-22.5 ms |      10 |  +97.8% |
|    6 | ilha      | 26.4 ms | 25.9-26.9 ms |      10 | +152.6% |

## swap rows

| rank | framework |    time |       95% CI | samples | vs best |
| ---: | --------- | ------: | -----------: | ------: | ------: |
|    1 | vue       | 12.3 ms |  9.1-15.4 ms |      10 |    best |
|    2 | lit-html  | 13.0 ms |  9.9-16.2 ms |      10 |   +6.1% |
|    3 | vanillajs | 19.1 ms | 17.7-20.5 ms |      10 |  +55.8% |
|    4 | taipa     | 19.6 ms | 18.8-20.4 ms |      10 |  +60.0% |
|    5 | react     | 25.4 ms | 24.7-26.1 ms |      10 | +106.9% |
|    6 | ilha      | 25.7 ms | 25.4-26.0 ms |      10 | +109.7% |

## run memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,307,492 bytes |    best |
|    2 | taipa     |  2,676,832 bytes |  +16.0% |
|    3 | ilha      |  2,926,284 bytes |  +26.8% |
|    4 | lit-html  |  3,233,840 bytes |  +40.1% |
|    5 | vue       |  5,420,968 bytes | +134.9% |
|    6 | react     | 15,058,652 bytes | +552.6% |

## update memory

| rank | framework |           memory | vs best |
| ---: | --------- | ---------------: | ------: |
|    1 | vanillajs |  2,571,412 bytes |    best |
|    2 | taipa     |  2,994,360 bytes |  +16.4% |
|    3 | ilha      |  3,327,880 bytes |  +29.4% |
|    4 | lit-html  |  3,533,856 bytes |  +37.4% |
|    5 | vue       |  5,729,032 bytes | +122.8% |
|    6 | react     | 16,749,460 bytes | +551.4% |
