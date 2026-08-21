# Update 21.08.2026

KI-Tool Förderrichtlinien nach § 44 LHO — Anlass: Prüfung des Fragenkatalogs durch die VB ELER
(Vermerk Dok.-Nr. 486946/2026).

---

## 1. Der vorgeschlagene Prompt

Getestet in vier Varianten, um Prompt- und Suchwirkung zu trennen.

**Was er leistet — die Form.** Das Werkzeug erklärt zutreffend, dass der Empfängerkreis je
Fördermaßnahme variiert, gliedert die Antwort und erfindet **keine** Empfängerkreise. Die
`[Unklar]`-Klausel wirkt zuverlässig.

**Was er nicht leistet — die Inhalte.** Die acht Empfängerkreis-Abschnitte des Förderbereichs 1
liegen im Bestand, sind über eine Ähnlichkeitssuche aber nicht adressierbar. Auch mit
vervierfachter Kontextmenge nicht.

**Was wir daraufhin geändert haben.** Die Systematik aus Ihrer Anmerkung ist jetzt in den
Metadaten: Förderbereich, Fördermaßnahme und Abschnittstyp werden zu jedem Textstück mitgeführt.
Damit liefert dieselbe Frage die vollständige, differenzierende Antwort — mit Fundstellen in Ihrer
Zitierweise („Teil II, Förderbereich 1, Fördermaßnahme 3.0, Nr. 3.3 a)").

Alle vier Läufe im Einzelnen: [versuch_gak_prompt_h03.md](versuch_gak_prompt_h03.md).

**Eingearbeitet:** H-03 auf die differenzierende Antwort umgestellt · H-24 wegen desselben
Konstruktionsfehlers mitkorrigiert · H-13 um den Zustimmungsvorbehalt nach Nr. 14.1 VV/VVG
ergänzt.

---

## 2. Stand der Messung

Der Katalog umfasst **138 Fragen** — 102 offen, 36 im Rückhalte-Teil. Alle Fundstellen sind
maschinell gegen den Dokumentenbestand geprüft.

| | Pflicht-Fundstellen vollständig gefunden |
|---|---|
| gut gestellte Frage | **66 %** |
| Abschnittsthema plus Entwurfstext, wie im Betrieb | **34 %** |

**Der wichtigste Befund** ist dieser Abstand: Unter realistischen Bedingungen arbeitet das
Retrieval halb so gut wie im Benchmark. Ohne die zweite Anfrageform im Katalog wäre das nicht
sichtbar geworden.

**Zweiter Befund, Aktualität.** Der GAK-Rahmenplan liegt in zwei Fassungen im Index, 2025–2028 und
2026–2029, über weite Strecken wortgleich. Ohne Kennzeichnung lieferte die Suche teilweise die
veraltete. Seit die Fassungen als gültig beziehungsweise abgelöst markiert sind, steigt die
Trefferquote bei den GAK-Fragen von 59 auf 78 Prozent.

**Noch offen:** Die Antwortqualität ist erst angetestet. Für einen vollständigen Durchgang muss
der LLM-Endpunkt eine Messung ohne Modellwechsel durchhalten; er ist derzeit unbeständig.

---

## 3. Spark-Module

Wird am Montag besprochen, zusammen mit der Frage nach dem Orchestrator.

---

## 4. Nächste Schritte am RAG

1. **Verweise auflösen.** Dem „siehe Artikel 32 der Verordnung …" folgt bisher niemand. Ebenso
   wichtig sind implizite Verweise — wörtlich übernommener Normtext ohne Verweisangabe. Der führt
   heute dazu, dass das Werkzeug eine Vorschrift mit einer Landesrichtlinie belegt, die sie
   abschreibt.
2. **Suchanfrage** aus Abschnittsthema und Entwurfstext bilden. Ursache des Abstands 66 zu 34.
3. **Gliederungs-Metadaten für die VV zu § 44 LHO.** Dort steht „1 Bewilligungsvoraussetzungen"
   zweimal — einmal außergemeindlicher, einmal gemeindlicher Bereich.
4. **Antwortqualität vollständig messen**, sobald der Endpunkt stabil ist.

---

## 5. Fragen an das MLEUV

| | Frage |
|---|---|
| **Geltungsdauer** | Musterrichtlinie, Prüfsystematik und Grundsätze für Förderrichtlinien nennen zwei, drei beziehungsweise „nicht mehr als drei" Jahre. Welcher Wert gilt? |
| **Maßnahmengruppe** | Ihre Grenzen sind im extrahierten Text nicht markiert, eine Ableitung war in vier von neun Förderbereichen falsch. Fundstellen nennen daher Teil, Förderbereich und Fördermaßnahme, aber keinen Gruppenbuchstaben. Reicht das für den Gebrauch? |
| **Prüfsystematik** | Der Vermerk ist als vorläufig bezeichnet — gibt es eine neuere Fassung? |

**Nachrangig:** Für die Bewertung der Schreibhilfe fehlt ein Maßstab. Ein bis zwei Abschnitte, die
im Haus als gut gelten, wären die Grundlage — relevant erst mit dem Frontend.

**Selbst entschieden, nur zur Kenntnis:** Die Musterrichtlinie behandeln wir als Arbeitsvorlage,
nicht als zitierfähige Fundstelle; zwei Katalogfragen, die allein darauf beruhten, entfallen. Da
die Fördermaßnahme 6.0 im Rahmenplan entfällt, führen wir für den Förderbereich 1 acht
Fördermaßnahmen mit Inhalt.
