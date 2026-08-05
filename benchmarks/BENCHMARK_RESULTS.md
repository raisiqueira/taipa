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

## `repeat()` helper vs Lit `repeat`

- Timestamp: 2026-08-05T00:56:50.768Z
- Git hash: 58b71e2cf29276967656638e394bd0fa4ae5a25e
- Chromium: 149.0.7827.55
- Node: v24.18.0 on darwin arm64
- Bundle: minified Vite production build using Taipa's built package entry and Lit's production export
- Workload: 500 rows, 600 ms per task after a 200 ms warmup, minimum 20 iterations
- Output validation: PASS (8 output/DOM-identity checks across both row orders; equivalent
  15,293-character markup after removing Lit marker comments)

Taipa and Lit perform different native work here: Taipa produces a server-safe HTML string, while
Lit commits or updates DOM. Absolute times across the two libraries are therefore not an
end-to-end rendering comparison. The meaningful comparison is each `repeat` implementation
against its own `Array.map` baseline for the same workload. Negative percentages mean lower
latency than that baseline.

| task                                                  |  ops/s | mean (ms) |   RME | samples | vs `Array.map` |
| ----------------------------------------------------- | -----: | --------: | ----: | ------: | -------------: |
| Taipa `repeat`: first render                          |  4,424 |    0.2435 | 1.02% |   2,464 |          -3.9% |
| Taipa `Array.map`: first render                       |  4,225 |    0.2534 | 0.98% |   2,368 |       baseline |
| Taipa `repeat`: reversed re-render, no reconciliation |  4,481 |    0.2406 | 0.98% |   2,494 |          -4.1% |
| Taipa `Array.map`: reversed re-render                 |  4,235 |    0.2508 | 0.93% |   2,393 |       baseline |
| Lit `repeat`: first render, keyed                     |  2,510 |    0.4719 | 6.99% |   1,272 |          -1.2% |
| Lit `Array.map`: first render                         |  2,517 |    0.4776 | 7.51% |   1,257 |       baseline |
| Lit `repeat`: reversed keyed update                   |  8,571 |    0.1157 | 2.14% |   5,186 |         +51.2% |
| Lit `Array.map`: reversed positional update           | 10,561 |    0.0765 | 1.70% |   7,839 |       baseline |

The Taipa helper was 3.9-4.1% lower-latency than Taipa's `Array.map` composition across the two
row orders in this run. Lit's first-render result was effectively even with its baseline because
the 1.2% delta is much smaller than the measurement error. On reversal, Lit's keyed directive was
51.2% higher-latency than positional `Array.map`; the validation confirms that `repeat` preserved
row identity and moved keyed DOM ranges, while `Array.map` reused positions and changed their
values. This supports Taipa's `repeat()` as a low-overhead, output-equivalent helper for static
server markup; it does not imply client-side keyed reconciliation equivalent to Lit's directive.
