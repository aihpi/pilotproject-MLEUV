# Arbeitsablauf: Rückmeldungen auswerten und umsetzen

Stand 19.11.2026, dritte Fassung nach drei unabhängigen Gutachten. Gilt für Phase 0
(sortieren) und Phase 1 (umsetzen und messen). Aufräumen des Repos und die Antworten auf die
offenen Fragen des Blueprints folgen später.

## Ausgangslage

### Drei Quellen

Alle drei liegen im Repo-Ordner, aber nicht in git (`.gitignore`).

| Quelle | Inhalt | fehlt |
|---|---|---|
| `rueckmeldungen.ndjson` | 70 Rückmeldungen, 14.10. – 12.11.2026, sieben Entwürfe, eine Testerin: Ort, Urteil, Freitext, „besser“ | Programmstand (`commit` nie gesetzt) |
| `drafts_cluster.json` | alle sieben Entwürfe, je auf dem Stand der letzten Rückmeldung oder eine Version weiter: Profil, Feldwerte, Richtlinientext mit Begründungen und Prüfbefunden, Chat-Eingaben der Bearbeiterin in Reihenfolge | Antworten des Assistenten, Zeitpunkte, frühere Feldwerte. `revisionen` sind Überarbeitungsaufträge von Regeln, keine Bearbeitungsgeschichte |
| `protokoll.jsonl` | 94 Vorschlags- und Textläufe, 09.10. – 12.11. (57 vom 12.11.): Zeit (UTC), Abschnitt, Eingabe, vorgeschlagene Werte je Feld, Prüfbefunde, Dauer | Wortlaut der Chat-Antworten, fehlgeschlagene Aufrufe, die gezeigten Fundstellen (nur Zähler), Eingaben über 600 Zeichen gekürzt |

Das Protokoll lag im Container unter `/app/data/protokoll.jsonl`, das Dockerfile setzt aber
`PROTOKOLL=/data/protokoll.jsonl`. Die Abweichung wird beim Aufräumen geklärt.

### Zahlen

- 70 Rückmeldungen, davon 3 Tipptests (R-002 – R-004): **67 verwertbar**.
- 28 verwertbare mit „besser“-Feld.
- 17 Bestätigungen (`passt`/`richtig` ohne gemeldetes Problem; R-018 trägt `passt`, meldet
  aber einen Fehler und zählt als Befund).
- 23 Urteile über Fundstellen (R-045 – R-067), alle aus einem Entwurf, zu 10 Feldern.

### Programmstand je Rückmeldung

| ausgerollt ab | Commit | Rückmeldungen |
|---|---|---|
| 14.10. 07:03 | `9e4b89f` | R-001 – R-013 |
| 27.10. 16:02 | `0752d80` | keine |
| 28.10. 10:37 | `bf3032e` | R-014 – R-070 |

`dev` unterscheidet sich von `bf3032e` nur in den Bildtags. Nur R-001 – R-013 müssen gegen den
heutigen Stand geprüft werden.

### Was das Protokoll schon bestätigt

- R-036 – R-038: Um 13:56 schlägt das Programm `area = „Gebietskulisse kann so bleiben.“`,
  `requirements = „Keine“` und `selectionCriteria = „Keine Auswahl- und Wertungskriterien“`
  vor. Die Antworten der Testerin werden selbst zu Vorschlägen.
- R-044, R-070: Unmittelbar davor liefert der Aufruf für alle Felder „[Unklar]“.
- R-043: `fixedAmount` steht fünfmal auf „[Unklar]“, obwohl die Beträge in der Eingabe stehen.
- R-006: Der Aufruf um 10:29 hatte eine **leere Eingabe**, obwohl die Testerin den Titel
  eingetragen hatte. Kein Ausfall des Dienstes, sondern eine Eingabe, die nicht ankam.

## Begriffe

- **Rückmeldung (R-001 … R-070):** ein Eintrag der Datei, unverändert, Nummer = Zeile.
- **Befund (BF-…):** ein Problem. Mehrere Rückmeldungen können denselben Befund belegen.
- **Bestätigung (BS-…):** eine Rückmeldung ohne Problem. Ein positiver Fall des
  Goldstandards, der bestätigt bleiben muss.
- **Prüffall (PF-…):** ein ausführbarer Fall mit Eingabe, Erwartung und Kriterium.
- **Gegenprobe:** Prüffall, in dem das Verhalten weiter auftreten *muss*. Verhindert, dass
  eine Regel einfach abgeschaltet wird.
- **Zwillingsfall:** Prüffall mit derselben Ursache an einer anderen Richtlinie, möglichst
  einer, die nicht im Index liegt. Prüft, ob die Reparatur allgemein wirkt.
- **Nachstellen:** Eingabe und bestätigte Werte eines Protokolleintrags gehen erneut an den
  Vorschlagsdienst; das damalige Ergebnis ist der Vergleich.

## Zuordnung aller Rückmeldungen

Jede Rückmeldung hat **genau einen Hauptplatz**. Nebenbezüge stehen in Klammern und werden
nicht gezählt.

| Platz | Rückmeldungen | Anzahl |
|---|---|---|
| A Prüfregeln | R-008, R-009, R-010 (Teil c → D), R-011, R-012, R-018, R-022 | 7 |
| B Feldwerte | R-031, R-033, R-034, R-035, R-039, R-045, R-049 | 7 |
| C Fundstellen | R-046, R-047, R-048, R-050, R-051, R-057, R-064, R-066, R-067 | 9 |
| D Richtlinientext | R-019, R-020, R-021, R-026, R-068, R-069 | 6 |
| E Chat-Steuerung | R-006, R-027, R-029, R-030, R-032, R-036, R-037, R-038, R-042, R-043 (wartet auf R-016), R-044, R-070 | 12 |
| Betrieb | R-005 | 1 |
| F Formular und Darstellung | R-014, R-016, R-017, R-024, R-025 (R-020 Teil Stichpunkte) | 5 |
| Frage der Testerin, offen | R-013, R-023 | 2 |
| nur Abnahme | R-028 | 1 |
| Bestätigung | R-001, R-007, R-015, R-040, R-041, R-052 – R-056, R-058 – R-063, R-065 | 17 |
| verworfen | R-002, R-003, R-004 | 3 |
| **Summe** | | **70** |

Diese Zuordnung ist der Ausgangspunkt für Phase 0 und wird dort am Code überprüft.

## Phase 0 – Sortieren

### 0.1 Zuordnen

Jede Rückmeldung wird über die Zeit dem passenden Protokolleintrag und der Chat-Eingabe im
Entwurf zugeordnet. Enthält eine Rückmeldung mehrere Probleme, wird sie geteilt (R-010a
Anzeige der Bagatellgrenze, R-010b unverständlicher Überlappungsbefund, R-010c falsche
Sätze).

### 0.2 Bündeln nach Ursache

Bündeln nach **Ursache**, nicht nach Ort. Die Ursache wird am Code bestätigt; bis dahin
steht sie als „vermutet“. Bereits bestätigt:

| Befund | Ursache | Rückmeldungen |
|---|---|---|
| Satzende nach Tageszahl | Regel `SATZENDE` in `02_backend/src/richtlinie.py`: `(?<![0-9])` prüft den Punkt statt der Ziffer davor | R-018, R-022 (R-008, R-009) |
| Eingabefeld gesperrt | `Chat.tsx`: leere Extraktion zeigt keinen Vorschlagskasten, sperrt aber die Eingabe | R-044, R-070 (R-029) |
| Hinweis „übernommen“ wiederholt | `naechsteFrage`/`gedeckteStufen` in `packages/shared`: eine Stufe, die nicht über den Chat bestätigt wurde, steht nie in `gefragteStufen` | R-030, R-042 |
| Antwort wird Feldwert | „Korrigieren“ verwirft nur in der Oberfläche; die nächste Eingabe läuft als neue Angabe in den Verlauf | R-036 – R-038 |
| LELF falsch aufgelöst | Feld enthält nur „LELF“; das Modell löst beim Schreiben frei auf, es gibt kein Behördenregister | R-068 |

### 0.3 Einordnen

| Achse | Werte |
|---|---|
| **Art** | Fehler · Lücke im Formular · Fachfrage ans MLEUV · kein Handlungsbedarf |
| **Schicht** | Betrieb · Chat-Steuerung · Feldzuordnung · Wertbildung · Suche/Fundstellen · Prüfregeln · Textbildung · Stammdaten |
| **Prüfbarkeit** | fest · modellabhängig · nur durch Menschen beurteilbar |
| **Schwere** | 1 blockiert die Arbeit · 2 falscher Inhalt im Ergebnis · 3 irreführender Hinweis · 4 Darstellung |
| **Belege** | Zahl der Rückmeldungen und Entwürfe, die den Befund stützen |

Nur für R-001 – R-013 zusätzlich **Stand**: besteht noch · inzwischen behoben. Ein inzwischen
behobener Befund wird geschlossen; sein Prüffall bleibt als Schutz gegen Rückfall im
Goldstandard.

Die Fragen der Testerin (R-013, R-023) gehen an sie zurück.

### 0.4 Erwartung festhalten

Jeder Befund bekommt eine Erwartung „so wäre es richtig“ mit ihrer Herkunft:

1. **Aussage der Testerin** („besser“-Feld oder Freitext). Die Rückmeldungen kommen von
   Fachpersonen und **gelten als Vorgabe**, auch wenn sie vorsichtig formuliert sind („meiner
   Ansicht nach sollte hier kein Befund erfolgen“, R-012, ist die Erwartung).
2. Prozessmodell (BPMN), Musterrichtlinie, VV zu § 44 LHO — wo die Testerin nichts sagt.
3. von uns abgeleitet — nur wo beides fehlt; diese Erwartungen legt Jill fest.

Widerspricht eine Aussage der Testerin dem Prozessmodell, wird das vermerkt und Jill
vorgelegt, nicht von uns entschieden.

Offene Fragen bleiben nur dort, wo die Testerin selbst fragt („muss intern geklärt werden“
R-013, „ggf. habe ich die Angabe falsch verstanden“ R-023). Formularwünsche (Stichpunkte,
mehrere Festbeträge, Betrag je Einheit) werden vollständig gebaut, so wie die Rückmeldung sie
beschreibt.

### Ergebnis Phase 0

`02_backend/eval/rueckmeldungen/befunde.yaml` und `bestaetigungen.yaml`, je Eintrag:

```yaml
- id: BF-07
  titel: Punkt nach Tageszahl gilt als Satzende
  rueckmeldungen: [R-018, R-022]        # Hauptplatz
  nebenbezug: [R-008, R-009]
  programmstand: bf3032e
  protokoll: 2026-11-12T14:37            # zugehöriger Eintrag, falls vorhanden
  art: Fehler
  schicht: Prüfregeln
  pruefbarkeit: fest
  schwere: 3
  belege: {rueckmeldungen: 4, entwuerfe: 2}
  ursache: bestätigt — richtlinie.py, Regel SATZENDE
  erwartung: Kein Befund für „bis zum 31. Dezember 2028“.
  erwartung_herkunft: Testerin           # Testerin | Norm | abgeleitet
```

Dazu eine Übersicht nach Schicht und Schwere und etwaige Widersprüche zwischen Testerin und
Prozessmodell.
**Halt:** Durchsicht durch Jill, bevor etwas gebaut wird.

## Phase 1 – Umsetzen und messen

### Grundsätze

1. **Fälle vor der Reparatur festschreiben.** Prüffälle, Gegenproben und Zwillingsfälle
   schreiben wir selbst und committen sie, bevor am Code etwas geändert wird. Eine spätere Änderung an einem Fall
   ist erlaubt, wenn der Fall selbst fehlerhaft war, aber nur mit Begründung im Commit und mit
   erneutem Lauf gegen den alten Stand.
2. **Erst messen.** Jeder Prüffall läuft gegen den unveränderten Stand. Ein Fall belegt den
   Befund nur, wenn er dort durchfällt. Besteht er, wird der Befund „nicht nachstellbar“ und
   geht in die Abnahme.
3. **Gegenprobe für jeden Befund.**
4. **Ein Zwillingsfall je modellabhängigem Befund**, an einer Richtlinie, die nicht im Index
   liegt (oder mit ausgeblendetem Vorbild). Bei festen Regeln genügen Original und Gegenprobe.
5. **Bestätigungen bleiben bestätigt.** Alle Prüffälle aus `bestaetigungen.yaml` laufen bei
   jeder Messung mit.
6. **Eigenschaften statt Wortlaut** bei Freitext, wie in `feldfaelle.yaml` begründet.
7. **Messen wie im Betrieb.** Ohne Konsensmodus (die Oberfläche ruft ohne ihn auf), gleiches
   Antwortmodell, gleiche Einstellungen.
8. **Vorhandene Werkzeuge zuerst.** Neu ist nur, was fehlt: ein Modus für feste Stellenlisten
   in `eval_fundstellen.py`, das Nachstellen aus dem Protokoll, eine Behördenliste, ein
   Rauchtest.

### Kriterien je Platz

#### A – Prüfregeln (7 Rückmeldungen)

- Fest. Werkzeug: pytest gegen die Regelfunktion mit dem Originaltext. Für
  `pruefe_fragmente` gibt es noch keinen Test.
- **Kriterium:** kein Fehlalarm auf dem Originaltext **und** Treffer auf der Gegenprobe.
- Bestätigung R-007: Die Regel muss dort weiter anschlagen.

#### B – Feldwerte (7 Rückmeldungen)

- Modellabhängig. Werkzeug: `eval_feld.py` mit neuen Fällen in `feldfaelle.yaml`. Eingabe und
  bestätigte Werte kommen aus dem passenden Protokolleintrag.
- **Kriterien** (vorhandene Eigenschaften): `wert`, `enthaelt`, `nicht`, `unklar`,
  `gedeckt`. Beispiel R-034: `requirements` *nicht* „Tierschutzverein mit Sitz“,
  `recipientDetails` *enthaelt* „Tierschutzverein“.
- Inhaltliche Vorgaben der Testerin werden zu Eigenschaften: R-045 → `ancillary` *nicht*
  ANBest-G bei rein privaten Empfängern; R-049 → `purposeBindingYears` `unklar` oder leer,
  wenn nichts angeschafft wird; R-039 → `requirements` übernimmt die Regelung des genannten
  Vorbilds.
- R-031 zusätzlich mit `eval_deckung.py`: Ein Wert ohne Beleg darf nicht als gedeckt
  erscheinen.

#### C – Fundstellen (9 Befunde, 12 Bestätigungen)

Urteile auf zwei Stufen: **trägt** (`passt`) und **trägt nicht** (`nichtssagend`,
`anderes Thema`, `falsches Feld`).

- Modellabhängig. Werkzeug: `eval_fundstellen.py`, **erweitert um einen Modus mit fester
  Stellenliste** (Datei, Seite, Zitat aus der Rückmeldung) und mit einem Urteil **je Feld**
  statt über alle Felder zusammen. Ohne Urteil je Feld lässt sich „falsches Feld“ nicht
  erkennen.
- **Kriterien:**
  - *Positive bleiben:* Stellen mit `passt` stehen weiter unter den gezeigten fünf.
  - *Negative verschwinden:* Stellen mit `trägt nicht` stehen nicht mehr unter den fünf für
    das gemeldete Feld. Wo die Testerin ein Zielfeld nennt (R-057, R-064, R-066), muss die
    Stelle dort erscheinen.
  - *Neue Stellen:* beurteilt vom Modellurteil `fundstelle_tauglich` (`traegt` → trägt;
    `teilweise`, `traegt_nicht` → trägt nicht).
- **Kalibrierung des Modellurteils** an den 21 Urteilen (ohne R-045 und R-049, die den Feldinhalt betreffen, nicht die Stelle),
  berichtet als Vierfeldertafel. **Schwelle vorab:** mindestens 17 von 21 übereinstimmend
  **und** mindestens 6 der 9 „trägt nicht“ erkannt (ein Urteil, das immer „trägt“ sagt,
  käme auf 12 von 21). Sonst werden neue Stellen von Hand beurteilt.

#### D – Richtlinientext (6 Rückmeldungen, dazu R-010c)

1. **Fakten aus Stammdaten** (fest): Jede Behörde und jede aufgelöste Abkürzung im Text stimmt
   mit einer neu angelegten **Behördenliste** überein (R-068). Ressort im Titel und
   Unterzeichnende in der Schlussformel kommen aus dem Profil (R-019, R-026).
2. **Sprache** (R-020, R-069, R-010c): **zurückgestellt.** Ein kalibriertes Sprachurteil
   kostet mehr, als drei Rückmeldungen rechtfertigen. Die Sätze gehen als Prüffälle in die
   Abnahme.
3. **Pflichtbestandteile** (R-021): Das Verfahren enthält die Angaben, die die Testerin aus
   der Musterrichtlinie nennt (Bewilligungsbehörde, Form und Frist des Antrags, Folge
   unvollständiger Unterlagen). Fest prüfbar über `enthaelt`.
4. **Form** (Stichpunkte): siehe F.

#### F – Formular und Darstellung (5 Rückmeldungen)

| Wunsch | Prüfung | Rückmeldungen |
|---|---|---|
| F1 Aufzählungen als Stichpunkte | Abschnitte mit Aufzählung (Fördergegenstände, Empfänger, Beträge) werden als Liste gesetzt; Fließtext bleibt Fließtext (Gegenprobe) | R-014, R-024, R-025, R-020 Teil |
| F2 Mehrere Festbeträge | ein Betrag je Fördergegenstand eingebbar, im Text je Gegenstand genannt, Prüfregeln (z. B. Bagatellgrenze) rechnen mit allen Beträgen; alte Entwürfe mit einem Betrag laden weiter | R-016, R-024 |
| F3 Betrag je Einheit | „450 Euro je Hektar“ eingebbar, im Text mit Einheit, Höchstbetrag-Regeln kennen die Einheit | R-017 |

Fest prüfbar (Schema-, Regel- und Oberflächentests). Danach wird R-043 (E3, Festbetrag je
Geschlecht schon genannt) prüfbar.

#### E – Chat-Steuerung (12 Rückmeldungen)

| Kriterium | Prüfung | Art | Rückmeldungen |
|---|---|---|---|
| E1 Nie ohne Eingabemöglichkeit | leere Extraktion → Eingabe frei oder Weiter-Knopf da | fest, vitest | R-044, R-070 |
| E2 Antworten sind keine Werte | Antwort auf eine Rückfrage deckt keinen Feldwert | fest, `server.test.ts` mit Attrappe für den Vorschlagsdienst | R-036 – R-038 |
| E4 Keine Wiederholung | Hinweis „übernommen“ höchstens einmal je Stufe | fest, `chat.test.ts` | R-030, R-042 |
| E6 Eingabe kommt an | „Vorschlag holen“ übergibt den eingetragenen Wert | fest, vitest/`server.test.ts` | R-006 |
| E3 Gesagtes wird genutzt | Angabe aus früherer Eingabe füllt das spätere Feld ohne Nachfrage | modellabhängig, nachgestellt | R-027, R-032, R-043 (nach R-016) |
| E5 Letzte Angabe gilt | nach Änderung arbeitet der Vorschlag mit dem neuen Wert | modellabhängig, nachgestellt | R-029 |

E3 und E5 werden aus dem Protokoll nachgestellt. Ganze Gespräche gegen die API abzuspielen
entfällt: Ohne die damaligen Antworten des Assistenten wäre es keine Wiederholung. Was sich
nicht nachstellen lässt, geht in die Abnahme. R-006 stammt vom Stand `9e4b89f` und wird
zuerst gegen `dev` geprüft.

#### Betrieb (R-005)

**Rauchtest** gegen die ausgerollte Instanz nach jedem Deploy: `GET /gesundheit`, je Abschnitt
ein Vorschlagsaufruf mit fester Eingabe. **Abbruch**, wenn ein Aufruf mit einem Fehlerstatus
endet oder länger als 120 Sekunden braucht. Dazu ein fester Test, dass die Oberfläche bei
einem Fehler des Dienstes eine Meldung zeigt und bedienbar bleibt (überschneidet sich mit E1).

### Kennzahlen gegen Rückschritte

Vor der ersten und nach jeder Welle laufen die vorhandenen Messungen:

| Messung | Werkzeug | Kennzahl | Grenze für Rückschritt |
|---|---|---|---|
| Suche gegen den Goldstandard (102 Fragen) | `eval.py` | Recall@k, MRR, Anteil vollständig gefundener Pflichtanker | mehr als `GOLD_STREUUNG` (3 Punkte) schlechter |
| Belegtreue | `eval_deckung.py` | Anteil Vorschläge, deren Fundstelle sie deckt | mehr als `URTEIL_STREUUNG` (4 Punkte) schlechter |
| Feldwerte (bestehende Fälle) | `eval_feld.py` | bestandene Eigenschaften je Fall | ein vorher bestandener Fall fällt durch |
| Bestätigungen | Prüffälle aus `bestaetigungen.yaml` | Anzahl weiter bestätigt | eine fällt weg |

Die Grenzen stammen aus `messung.py`. **Ein Rückschritt stoppt den Merge nach `dev`.** Der
Rückhaltesatz (`holdout.jsonl`) bleibt unberührt.

### Bestehen

- **Feste Prüffälle:** einmal; bestanden oder nicht.
- **Modellabhängige Prüffälle:** Der Vorschlagsdienst arbeitet mit Temperatur 0 und ohne Seed.
  Wiederholte Läufe sind deshalb keine Stichprobe, sondern eine Kontrolle: Jeder Fall läuft
  dreimal (`eval_feld.py --laeufe 3`), und alle drei müssen gleich ausgehen. Weichen sie ab,
  heißt der Fall „unsicher“. Läufe, in denen ein Ersatzmodell geantwortet hat, sind ungültig.
- **Behoben** heißt: Original und Zwillingsfall bestehen, die Gegenprobe besteht, die
  Kennzahlen zeigen keinen Rückschritt.
- **Aussagekraft:** je Befund „behoben / unsicher / nicht behoben“, als Anzahl. Keine
  Prozentvergleiche zwischen Wellen, keine Signifikanz.

### Ergebnisse festhalten

Jeder Messlauf wird über `messung.protokollieren` geschrieben: Commit, Modelle,
Einstellungen, **Stand des Suchindex** (Sammlung, Zahl der Punkte, Ingest-Commit), Ergebnis.
`eval_feld.py` gibt bisher nur auf dem Bildschirm aus und wird dort angebunden. Der Lauf vor
der ersten Änderung ist der Ausgangswert.

### Reihenfolge

Jede Welle ein Branch von `dev`, ein Merge zurück nach `dev`. Nach jeder Welle laufen alle
Prüffälle und die Kennzahlen gegen Rückschritte.

1. **Fest prüfbar:** E1, E2, E4, E6 und Prüfregeln A — #6
2. **Betrieb:** Rauchtest — #7
3. **Stammdaten im Text:** Behördenliste, Ressort, Unterzeichnende, Pflichtangaben Verfahren — #8
4. **Feldwerte und Gesprächsführung:** B, E3, E5 — #9
5. **Fundstellen:** C — #10
6. **Formular und Darstellung:** F1, dann F3, dann F2 (der größte Umbau zuletzt), danach E3
   für R-043 — #11

Die Sprachfälle (BF-24) und R-028 gehen in die Abnahme unter #2.

### Automatische Tests auf GitHub

Der Workflow `Tests` (`.github/workflows/tests.yml`, #3) läuft bei jedem Push nach
`dev`/`main` und bei jedem Pull Request: pytest (ohne Modellaufrufe), vitest und damit auch
die festen Prüffälle aus `befunde.yaml` und `bestaetigungen.yaml`. Ein roter Lauf blockiert
den Merge. Modellabhängige Prüffälle und die Kennzahlen gegen Rückschritte laufen weiter
lokal, weil sie das Modell-Gateway brauchen.

### Mitschreiben verbessern (Vorschlag, nur nach Zustimmung)

Damit künftige Rückmeldungen nachstellbar sind: Commit in jede Rückmeldung, Zeitpunkt je
Chat-Eingabe, Antworten des Assistenten im Entwurf speichern, fehlgeschlagene Aufrufe und die
gezeigten Fundstellen ins Protokoll schreiben.

### Grenzen

- **Zirkularität:** Die Katzenkastration-Richtlinie liegt im Index. Gute Werte am Hunde- oder
  Katzenfall zeigen vor allem, dass das Werkzeug abschreiben kann; deshalb die Zwillingsfälle
  außerhalb des Index.
- **Index-Stand:** Der lokale Index kann vom Cluster abweichen, und das Protokoll speichert
  die gezeigten Fundstellen nicht. Die Ausgangsmessung für B und C ist deshalb nicht genau der
  Stand, den die Testerin gesehen hat.
- **Eine Testerin, wenige Entwürfe:** Die Achse „Belege“ macht sichtbar, was
  Einzelbeobachtung ist.
- **Kein echter Rückhalt im Goldstandard:** Der Rückhalt ist der nächste Testdurchlauf mit
  einem neuen Fall. Dessen Rückmeldungen kommen erst nach der Auswertung in den Goldstandard.

### Abnahme

Die Testerin spielt einen neuen Fall durch und nutzt die Rückmeldefunktion. In der
Befundliste steht je Befund „behoben in Commit …, bitte erneut prüfen“. Dazu kommen die
zurückgestellten Sprachfälle und R-028. Geschlossen ist ein Befund erst, wenn die Messung
besteht **und** die Abnahme keinen Rückfall zeigt.

## Vor dem Start zu klären

1. ~~Entwürfe und Protokoll vom Cluster~~: liegen vor (19.11.2026).
2. ~~Wer fachlich entscheidet~~: Die Rückmeldungen der Fachpersonen gelten als Vorgabe, auch
   Formularwünsche werden vollständig gebaut. Offen bleiben nur die Fragen, die die Testerin selbst stellt
   (R-013, R-023).
3. ~~Wer die Zwillingsfälle schreibt~~: wir selbst, vor der Reparatur.
