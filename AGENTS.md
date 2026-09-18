# Project maintenance

- Read README.md and SPEC.md before changing behavior; update affected documentation.
- Keep CCTV5 and CCTV5+ separate. Do not bundle channel snapshots or playback results.
- Keep browser records local; never publish credentials, local diagnostics or deployment identifiers.
- Before committing, inspect the branch, working tree, staged changes and publication scope.
- Use the intended main branch; preserve unrelated changes and avoid temporary-branch publication.
- Validate relevant behavior with focused tests, TypeScript checking and a production build.
- Do not bulk-test real channels without an explicit request.
- Follow user authorization for commits and publication; maintain accurate repository description/topics and verify changed metadata.
- A GitHub push does not itself deploy the public demo.
