# Documentation

| Need | Read |
|---|---|
| Install and run | [Project README](../README.md) |
| Product and UI requirements | [Product](../PRODUCT.md), [design](../DESIGN.md) |
| Find modules, routes, stores and ownership | [Code map](CODE_MAP.md) |
| Unfinished work and acceptance | [Work queue](plans/README.md) |
| Results XML | [XML format](XML_FORMAT.md) |
| Game replay bytes | [VCR format](VCR_FORMAT.md), [discovery notes](analysis/VCR_ANALYSIS.md) |
| App replay storage | [Replay cache format](REPLAY_CACHE_FORMAT.md) |
| Native telemetry | [Telemetry format](TELEMETRY_FORMAT.md) |
| App-owned recording, clocks and learning | [Live capture format](LIVE_CAPTURE_FORMAT.md) |
| Game HTTP API | [REST reference](LMU_REST_API.md), [captured Swagger schema](swagger-schema.json) |
| Optional data and peripheral plugins | [Plugin setup](PLUGINS.md) |
| Measure performance | [Benchmark guidance](performance/ENDPOINT_BENCHMARKS.md) |
| Review recurring race observations | [Race review log](evidence/RACE_REVIEW_LOG.md) |
| Maintain this documentation | [Retention rules](DOCUMENTATION.md), [doc-keeping skill](../.agents/skills/doc-keeping/SKILL.md) |

Format references are the written data contracts. Code comments own local implementation rationale;
plans hold unfinished requirements, not delivery diaries. VCR discovery notes remain because they
contain unresolved byte meanings and evidence that is not derivable from the parser alone.

The work queue links the remaining corner design and the unstarted proposals. Completed plans and
one-off reports live in Git history. Historical observations retain their dates and do not establish
compatibility with a new game build or completion of real-game acceptance.
