# NMA Preference Defaults

This file documents the new preference `noraneko.nma.enabled` used to toggle the NMA system at runtime.

- Preference: `noraneko.nma.enabled`
- Type: boolean
- Default: true
- Description: When true, the NMA system (Noraneko Module Archive) will be initialized at startup. When false, built-in modules will be used and NMA will be skipped.

Note: Preference read is guarded; if the preferences API is not available, NMA initialization falls back to enabled.
