# Optional data plugins

Status: proposed design. Plugin loading is not available in the current app.
The configuration and package format below describe the planned interface.

LMULapTime is planned to support optional local data plugins. A plugin supplies
additional layout metadata through a versioned contract. The app discovers its
capabilities and enables compatible features when the data is available.

Session-log, VCR replay and DuckDB telemetry parsing remain part of the app and
do not require a plugin. Basic track outlines provide orientation; they are
illustrations and are not used as calibrated geometry for analysis.

## Configuration

The proposed `LMU_PLUGIN_ROOT` setting identifies a local package directory for
the backend. Configuration is local to your installation and is not embedded in
the frontend build. No plugin is selected when the setting is absent.

The initial design accepts data packages, not executable extensions. It does
not run plugin scripts or download packages automatically. Install only packages
you trust and have permission to use. Plugins are distributed separately from
the application and are not included in application releases.

## Package compatibility

A package includes a JSON manifest declaring its contract version, identity,
version, available capabilities and layout resources. Resource paths are
relative to the package; absolute paths and paths outside it are rejected.
Examples and automated tests use synthetic data.

The app validates the manifest and resources before activating a package.
Layouts must match their canonical identities. Related resources must agree on
their revisions, so incompatible versions cannot be combined. Updates activate
as a complete generation; a failed update retains the previous valid generation.

## Optional features and fallback

Features request capabilities from the local backend rather than importing
package files into the frontend build. The backend returns only the validated
resources needed by the app, without exposing local filesystem paths.

If no compatible plugin is configured, session browsing, recording ingestion
and analytics that use recorded channels remain available. Features that need
additional metadata show an unavailable state. Missing values are not guessed,
and the app never substitutes a different layout from the same venue.

## Local access

Plugin resources are served to the local application for use in your browser.
They are excluded from the static application build and release archives.
This does not make resources invisible to the local browser that displays them.
Cloud features must state what they send outside the machine; plugin loading
does not itself grant permission for uploads or redistribution.

## Troubleshooting

For an unavailable plugin, check that the configured directory exists and is
readable, the manifest version is supported, and the package contains matching
layout resources. Validation errors should identify the affected capability
without revealing machine paths. Restart or explicitly reload after selecting
a new package. Removing the setting returns the app to its standard fallback.

Final installation commands and the manifest schema will be documented when
the implementation is available.
