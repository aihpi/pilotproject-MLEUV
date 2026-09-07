# Richtliniengenerator

KERN-UX-orientierter React-Prototyp für die chatgestützte und strukturierte Erstellung von Förderrichtlinien.

## Start

```sh
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4317

Der Entwicklungsmodus verwendet einen prototypischen Benutzer, einen deterministischen Chat-Adapter und dateibasierte Persistenz in `apps/api/data`. Die API-Grenzen sind für OIDC/Keycloak, PostgreSQL und einen produktiven LLM-Adapter vorbereitet; diese externen Systeme sind nicht erforderlich, um den UX-Prototyp zu testen.

## Qualität

```sh
npm run typecheck
npm test
npm run build
```

KI-Vorschläge werden nur nach ausdrücklicher Bestätigung übernommen. Der Export ist eine Entwurfsfassung und ersetzt keine fachliche oder rechtliche Prüfung.
