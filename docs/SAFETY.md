# Scope and recovery

1. Never equate SDB Developer Mode with a general shell, root or permission to uninstall every app.
2. No automatic discovery scan, root exploit, unsigned install, Home/startup mutation or firmware manipulation.
3. No default deletion set. Known catalog entries are candidates, not globally recommended removals.
4. Keep all Samsung/Tizen platform apps, stock Home, Art Mode/Ambient, account infrastructure,
   networking, remote/input, DRM and tuner/HDMI functionality. Also keep every service belonging
   to a package selected for retention. Unknown members of a removable package stop planning.
5. The snapshot has a hashed device identity; raw DUID and MAC are not retained. LAN IP and inventory
   are still personal device data and belong in ignored storage.
6. A journal is an audit record, not an application image. Uninstall removes data. `recovery` only
   displays manual reinstall instructions. Stop before uninstall if a required reinstall route is absent.
7. A command timeout or missing app-list response is not success. Stop; inspect again. Do not
   continue applying the old plan after unexpected changes. Preserve its snapshot and journal.
8. Physical Home takeover is unsupported in v0.1. A third-party method working on a Q70B does not
   establish compatibility with a Frame. Restoring native Home would require the TV's exact original
   typed settings and a tested native restoration path, neither of which this release pretends to have.
9. Never delete the launcher while it owns native Home. This release does not assign it that role.
10. When work is complete, disable Developer Mode from the TV menus if you no longer need it.
    Keep the ports on the trusted LAN; do not expose developer services via router forwarding.

## Failure handling

If package A is removed but B fails, A stays removed and the journal says stopped. There is no
pretend rollback. Reinstall A manually if required, or make a fresh snapshot and separately review
the remaining work. If inventory changes beyond the approved package, stop immediately and do
not reset Smart Hub as an automated repair.

## Reversibility levels

| Change | Recovery |
|---|---|
| Inspection/plan | No TV writes to undo |
| Launcher install | Uninstall that launcher while stock Home remains owner |
| Shortcut order | Reorder in-app; saved only in that app's storage |
| Streaming app uninstall | Manual regional store reinstall; prior data/credentials not recoverable |
| Native Home/firmware | Unsupported; no operation shipped |
