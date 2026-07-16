# Plugin template

1. Copy `_template` to `backend/plugins/<plugin_name>`.
2. Rename `TemplatePlugin` and its `name` value.
3. Keep only the hooks and UI components you need.
4. Add `<plugin_name>` to `plugins.enabled` in `backend/config.yaml`.
5. Add regression tests before enabling it.

See `document/plugin_development.md` for the complete contract and security rules.

The template is intentionally absent from `backend/config.default.yaml` and is not loaded during normal startup.
