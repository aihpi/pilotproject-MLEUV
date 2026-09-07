# KERN review checklist

## Product and user needs

- [ ] Primary users, tasks, context, and success criteria are known.
- [ ] Decisions are supported by research or clearly marked assumptions.
- [ ] Infrequent, mobile, stressed, multilingual, and disabled users are considered.
- [ ] The service exposes responsibility, status, next steps, and expected processing time.

## Information and content

- [ ] Page title and main heading describe the task.
- [ ] Content order follows the user journey, not the authority's org chart.
- [ ] Administrative terms are avoided or explained.
- [ ] Instructions appear before the action they govern.
- [ ] Buttons name their action; links describe their destination.
- [ ] Confirmations and errors explain consequences and recovery.

## KERN consistency

- [ ] Existing KERN components and patterns are reused.
- [ ] Semantic tokens are used; no unjustified one-off styling exists.
- [ ] Typography, spacing, grid, icons, states, and focus follow KERN.
- [ ] Deviations are documented and evidence-based.
- [ ] Component/package versions are compatible.

## Forms and workflows

- [ ] Every input has a visible programmatic label.
- [ ] Related choices use fieldset/legend.
- [ ] Checkbox, radio, and select semantics match the choice model.
- [ ] Required/optional status and expected formats are clear.
- [ ] Help and errors are associated with their controls.
- [ ] Validation preserves data and offers actionable recovery.
- [ ] Long processes show progress and support back navigation.
- [ ] Review/edit and final confirmation are available where consequential.
- [ ] Save/resume and timeout behavior are addressed where needed.

## Accessibility and robustness

- [ ] Complete functionality works by keyboard without traps.
- [ ] Focus order is logical and focus remains visible.
- [ ] Dynamic status and errors are announced appropriately.
- [ ] Semantic landmarks and heading hierarchy are correct.
- [ ] Text and non-text contrast are tested in actual states.
- [ ] Meaning is not conveyed by color, position, shape, or icon alone.
- [ ] Layout works at 200% zoom and narrow/mobile widths without loss.
- [ ] Touch targets and spacing support motor accessibility.
- [ ] Images have appropriate alternatives; decorative media is ignored.
- [ ] Motion can be reduced and does not block use.
- [ ] At least automated checks plus keyboard and manual screen-reader-oriented inspection were performed.

## Evidence to report

- KERN version/package and components used.
- Browsers, viewport sizes, zoom, keyboard path, and tools tested.
- Known gaps and project-specific deviations.
- Items requiring usability testing or legal/accessibility review.

Official accessibility guidance: https://www.kern-ux.de/design-system/barrierefreiheit/
