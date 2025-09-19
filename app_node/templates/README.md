RoutingKit Template Schema
==========================

This folder contains the JSON Schema and example templates for the "restriction/template" system.

Files:
- `schema.json`: JSON Schema for validating templates.
- `examples.json`: Example templates (for testing and UI examples).

Canonicalization and Signing
----------------------------
- When generating a signature for a template, serialize the template as a canonical JSON:
  - Sort object keys lexicographically
  - Use a deterministic float formatting (e.g., 6 decimal places for coords)
  - No extra whitespace
- Use HMAC-SHA256 with a server-side secret to produce a signature.

Usage
-----
- Node should validate incoming templates against `schema.json` before accepting.
- For polygon-based templates, Node should call the C++ `RESOLVE_POLY` API (to be implemented) to map polygon -> arc ids for faster metric building.
