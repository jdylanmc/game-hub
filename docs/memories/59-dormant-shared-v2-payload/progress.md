# Progress

## Bootstrap

- Issue #57 merged as commit `869fe91c5db844b992cee5e7524450bc07191c7a`.
- The merged collector records the exact inert v2 source path as metadata
  without consuming its patch content and fails closed on activation references.
- #59 owns the reviewable text payload and does not activate v2.

## Durable activation handoff

- The committed text tree has one safe intended destination and SHA-256 per
  file. Its manifest validates relative imports/config reads and SHA-pinned
  external dependency closure.
- The #56 handoff document and #58 issue both require activation only from
  these committed main-branch files after #59 merges.
