# Documentation guide

Reviewed 2026-10-10 against repository source. Start with the document that answers the question:

| Need | Document |
|---|---|
| Install, configure and run | [Project README](../README.md) |
| Find implementation, routes, tables or invalidation rules | [Code map](CODE_MAP.md) |
| See what shipped and what remains | [Plans and work queue](plans/README.md) |
| Understand product scope and visual conventions | [Product](../PRODUCT.md), [design](../DESIGN.md) |
| Configure optional metric track and vehicle data | [Local data packages](PLUGINS.md) |
| Understand cache ownership and performance evidence | [Server cache audit](SERVER_CACHE_AUDIT.md) |
| Work on results ingestion | [XML format](XML_FORMAT.md) |
| Work on replay decoding | [VCR format](VCR_FORMAT.md), [analysis and provenance](VCR_ANALYSIS.md) |
| Work on native telemetry ingestion | [DuckDB telemetry format](TELEMETRY_FORMAT.md) |
| Investigate the game's embedded API | [LMU REST API](LMU_REST_API.md), [captured Swagger schema](swagger-schema.json) |

Current main implementation belongs in CODE_MAP and setup/reference docs. Active plans distinguish
proposals and unmerged branch work; [archived plans](plans/README.md#completed-plans) preserve completed designs and evidence.
Format specifications preserve established findings, and speculative VCR leads stay
in VCR_ANALYSIS rather than VCR_FORMAT.

The REST API description and Swagger schema are captured game evidence, not a new live-game
verification. Binary/channel specifications likewise need new recording evidence before claiming
compatibility with a different LMU build. This review does not certify private geometry, rerun
historical benchmarks or replace browser/real-recording validation.
