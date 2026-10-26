# Contributing

This repo grows through exact-device evidence rather than a promise to support every Samsung TV.
Start with inspect. Submit a profile containing model, firmware and sanitized capability/results only.
Never attach private snapshots, journals, IP/MAC/DUID, signing materials or account content.

For new removable entries, document the package ID, complete App ID/service membership, visible app
role, original reinstall route, and real-device before/after verification. A random-looking package
ID does not prove an app is safe. Never classify Samsung/Tizen services as removable by name alone.

Run Python and Node tests for every change and add coverage for failures, not only success.
Keep live-device operations opt-in, bounded and journalled. A failed restore or incomplete physical
test must be reported as such. Do not expand Home takeover support by removing firmware guards.

Contributions use the MIT license. References to community research do not imply permission to
copy its implementation; review the upstream license before any future code reuse.
