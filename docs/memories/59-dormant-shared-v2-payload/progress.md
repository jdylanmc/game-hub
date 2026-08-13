# Progress

## Bootstrap

- Issue #57 merged as commit `869fe91c5db844b992cee5e7524450bc07191c7a`.
- The merged collector records the exact inert v2 source path as metadata
  without consuming its patch content and fails closed on activation references.
- #59 owns the reviewable text payload and does not activate v2.

## Canonical declaration prerequisite

- The merged #57 collector accepts inert evidence only when the declarations
  have its original multiline shape. The initial #59 text-tree attempt proved
  that the later one-line declaration refactor is itself a prerequisite: old
  protected-main review marks every inert file unsafe before model access.
- This PR is therefore narrowed to the canonical declaration shape and
  reference-scanner hardening. It tracks #59 rather than closing it.
- After this prerequisite merges, the next human-reviewed payload PR can add
  the text tree under the inert path and close #59; then #58 can activate v2.
