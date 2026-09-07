# KERN foundations and implementation

## Contents

- Version discipline
- Foundations
- Component selection
- Forms and processes
- Technical integration
- Extension rules

## Version discipline

Check the current KERN documentation before installing packages or copying markup. Documentation and packages evolve; keep all used KERN resources on compatible versions.

- Documentation: https://www.kern-ux.de/
- Components: https://www.kern-ux.de/develop/komponenten/
- Repositories: https://gitlab.opencode.de/kern-ux

## Foundations

- Use KERN semantic tokens for foreground, background, border, interactive, focus, and feedback roles.
- Do not directly use generic palette values in product UI when a semantic token exists.
- KERN colors are contrast-oriented and use perceptual color modelling. Still test the actual foreground/background pair.
- Target at least WCAG/BITV AA requirements; do not rely on color alone.
- Use Fira Sans when applying the standard KERN typography and the project permits font delivery.
- Use the documented type, spacing, grid, icon, border, and focus tokens rather than local approximations.
- KERN uses Material Symbols for its documented icon set. Give interactive icons accessible names; hide decorative icons from assistive technology.

Official color foundation: https://www.kern-ux.de/design-system/foundations/farbe/

## Component selection

Prefer documented KERN components. The current catalogue includes, among others:

- Structure/navigation: header, government header, grid, divider, tabs, links.
- Content: headings, body/title/label text, cards, badges, description lists, tables, icons.
- Disclosure/status: accordion, alert, dialog, loader, progress, summary, task list.
- Forms: fieldset, text, textarea, number, date, email, telephone, URL, password, file, select, checkbox, radio, button.

Selection rules:

- Checkbox: zero, one, or multiple independent choices.
- Radio: exactly one mutually exclusive choice; expose all relevant choices.
- Select: one choice from a long or space-constrained list; avoid for very few options.
- Accordion: optional secondary content, never the only access to critical instructions.
- Alert: important contextual feedback; do not use as decoration.
- Dialog: only for a focused interruption requiring attention or response; preserve focus correctly.
- Progress: overall position in a known multi-step sequence.
- Task list: multiple sections that may be completed non-linearly.
- Summary: review entered information and provide direct edit paths.
- Table: genuinely tabular relationships, not page layout.

## Forms and processes

- Associate every control with a persistent visible label.
- Group related controls with `fieldset` and `legend`.
- Connect help and error text programmatically, for example with `aria-describedby` where appropriate.
- Mark required fields consistently in text and semantics.
- Validate at useful moments without blocking normal typing.
- On submit, focus or announce an error summary and link errors to fields.
- Preserve data after validation failure and when navigating back.
- Use suitable input types, autocomplete tokens, input modes, and native constraints.
- Avoid placeholder-only instructions.
- Provide save/resume for lengthy administrative processes when feasible.
- For final submission, show a structured summary and explain legal consequences.

## Technical integration

The reference implementation favors native HTML and CSS with minimal JavaScript. The official native package is commonly integrated through npm:

```sh
npm install @kern-ux/native --save
```

Typical CSS imports are documented as:

```css
@import "@kern-ux/native/dist/kern.min.css";
@import "@kern-ux/native/dist/fonts/fira-sans.css";
```

Verify these paths against the installed version. Prefer npm and pinned dependencies for production over an unpinned CDN URL. Copy documented component markup rather than recreating class names from memory.

## Extension rules

When no component fits:

1. Confirm the need through task analysis or research.
2. Look for a documented KERN pattern or composable primitive.
3. Preserve KERN tokens, states, semantics, keyboard behavior, and content conventions.
4. Document the deviation and why existing components were insufficient.
5. Test the extension at the same level as a design-system component.
6. Consider contributing a reusable result to the KERN community.
