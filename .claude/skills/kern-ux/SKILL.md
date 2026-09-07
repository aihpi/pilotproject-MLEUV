---
name: kern-ux
description: Design, implement, review, or migrate digital German public-sector services using the KERN UX standard and its accessible design system. Use for KERN UX, administrative portals, online services, application flows, government forms, KERN components or tokens, accessibility reviews, and adapting an existing interface to the German public-sector design language.
---

# KERN UX

Apply KERN as a UX standard, not merely as a visual theme. Start from user needs, use proven KERN patterns and native components, and verify accessibility in the complete service context.

## Workflow

1. Inspect the repository, framework, existing design system, and requested scope.
2. Identify the service context, user groups, core task, process stage, and legal or organizational constraints.
3. Check the current official KERN documentation when versions, package names, component APIs, tokens, or supported adapters matter. Prefer `kern-ux.de` and `gitlab.opencode.de/kern-ux`.
4. Read only the supporting references relevant to the task:
   - Principles, content, and user-centred process: [principles.md](references/principles.md)
   - Components, foundations, and implementation: [implementation.md](references/implementation.md)
   - Review and acceptance checklist: [review-checklist.md](references/review-checklist.md)
5. Map each need to an existing KERN component or pattern. Extend only when the standard does not cover the need.
6. Implement with semantic native HTML first. Preserve the host framework and established project conventions.
7. Test keyboard use, focus, semantics, labels, errors, responsive layout, zoom, contrast, and screen-reader-relevant states.
8. Report the KERN rules applied, intentional deviations, unresolved accessibility risks, and verification performed.

## Decision rules

- Reuse and compose before inventing.
- Prefer `@kern-ux/native` and documented markup for web implementations unless the project already uses an official or compatible adapter.
- Use semantic tokens instead of raw palette values or ad hoc colors.
- Do not communicate state through color alone.
- Prefer native HTML controls over custom widgets and minimize JavaScript.
- Keep labels visible. Provide specific help, validation, and recovery guidance near the affected field.
- Make multi-step processes transparent: show progress, status, next action, save/resume behavior, and a review step when appropriate.
- Treat plain language, transparent status communication, and user control as part of accessibility.
- Never claim BITV or WCAG conformance solely because KERN components are used. Validate the assembled product.
- Do not reproduce the KERN look approximately when official assets, tokens, or components are available.

## Deliverables

For implementation tasks, produce working code and proportionate tests. For design or review tasks, provide a prioritized list of findings with concrete KERN-aligned remedies. Separate:

- confirmed KERN requirements,
- project-specific recommendations,
- assumptions requiring research or user validation.

## Source discipline

KERN evolves. Treat the included references as operating guidance, not a frozen API specification. Verify unstable details against the current official documentation and cite the source when reporting externally.
