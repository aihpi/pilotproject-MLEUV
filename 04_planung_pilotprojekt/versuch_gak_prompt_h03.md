# Versuch: Hilft die Vorgabe der GAK-Systematik im Prompt? (Frage H-03)

> Stand 20.08.2026. Anlass ist der Vermerk der VB ELER (MLEUV, Abt. 1, Dok.-Nr. 486946/2026)
> zum Fragenkatalog.

## Anlass

Das MLEUV hat den Rückhalte-Teil des Fragenkatalogs geprüft. Zehn von elf Einträgen wurden
als „in Ordnung" bestätigt. Beanstandet wurde **H-03**:

> *Welche Zuwendungsempfänger sieht der GAK-Rahmenplan für die integrierte ländliche
> Entwicklung vor?*

Unsere hinterlegte Antwort nannte **einen** Empfängerkreis. Richtig ist laut MLEUV eine
differenzierende Antwort:

> „Kommt darauf an, welche Fördermaßnahme im Förderbereich 1 angesteuert werden soll, da in
> den einzelnen Fördermaßnahmen der Zuwendungsempfängerkreis sich unterscheidet." — gefolgt
> von einer Auflistung der Fördermaßnahmen mit dem jeweiligen Empfängerkreis.

Dazu die Bitte, einen mitgelieferten Prompt auszuprobieren, der dem Modell die Gliederung des
GAK-Rahmenplans vorgibt: Reicht es, die Systematik zu **erklären**, oder muss sie technisch
mitgeführt werden?

## Vorgehen

Drei Läufe an derselben Frage, damit sich Prompt-Wirkung und Such-Wirkung trennen lassen:

| Lauf | Prompt | Suche | abgerufene Passagen |
|---|---|---|---|
| A | bisheriger Prompt `rag_system` | Ähnlichkeitssuche | 5 |
| B | Prompt des MLEUV, als `rag_gak_struktur` versioniert | Ähnlichkeitssuche | 5 |
| C | Prompt des MLEUV | Ähnlichkeitssuche | 20 |
| D | Prompt des MLEUV | **gefilterte Abfrage über die neuen Hierarchie-Felder** | 16 (alle einschlägigen) |

Lauf B gegen A isoliert die Wirkung des Prompts, C gegen B die Wirkung der Kontextmenge,
D gegen C die Wirkung der Hierarchie. Lauf D wurde nach der Metadaten-Erweiterung ergänzt
(siehe unten).

Randbedingungen: Antwortmodell für alle drei Läufe auf `gemma-4-31b` festgelegt — das
Projektmodell `gpt-oss-120b` war zum Zeitpunkt des Versuchs am Endpunkt nicht erreichbar, und
ein Modellwechsel zwischen den Läufen hätte den Vergleich zerstört. Kein LLM-Reranking, damit
A und B exakt dieselben Passagen sehen. Der neue Prompt wurde als eigene Datei angelegt und
nicht in den bestehenden hineingeschrieben, damit frühere Messungen zuordenbar bleiben.

## Datengrundlage

Vorab geprüft, was im Suchindex tatsächlich vorhanden ist. Der Förderbereich 1 führt neun
Nummern, aber nur **acht** Fördermaßnahmen mit Inhalt — bei 6.0 steht im Rahmenplan „Entfällt":

| Fördermaßnahme | Empfängerkreis im Index | Fundstelle |
|---|---|---|
| 1.0 Planungsinstrumente der ländlichen Entwicklung | vorhanden (Nr. 1.3) | S. 24 |
| 2.0 Regionalmanagement | vorhanden (Nr. 2.3) | S. 26 |
| 3.0 Dorfentwicklung | vorhanden (Nr. 3.3) | S. 28 |
| 4.0 Infrastrukturmaßnahmen | vorhanden (Nr. 4.3) | S. 30 |
| 5.0 Neuordnung ländlichen Grundbesitzes | vorhanden (Nr. 5.3) | S. 31 |
| 6.0 | entfällt laut Rahmenplan | — |
| 7.0 Kleinstunternehmen der Grundversorgung | vorhanden (Nr. 7.3) | S. 34 |
| 8.0 Einrichtungen für lokale Basisdienstleistungen | vorhanden (Nr. 8.3) | S. 36 |
| 9.0 Regionalbudget | vorhanden (Nr. 9.3.1) | S. 38 |

**Alle acht Empfängerkreise liegen also im Bestand.** Was folgt, ist kein Datenproblem.

## Ergebnisse

**Lauf A — bisheriger Prompt.** Die vollständige Antwort lautet `[Unklar]`. Die
Governance-Regel greift korrekt, das Ergebnis ist für die Praxis unbrauchbar.

**Lauf B — Prompt des MLEUV, gleiche Suche.** Die Form ist auf Anhieb richtig: Das Modell
erklärt zuerst, dass der Empfängerkreis je Fördermaßnahme variiert, listet dann alle Maßnahmen
des Förderbereichs 1 namentlich auf und überspringt dabei zutreffend die 6.0. Für jeden
Empfängerkreis setzt es `[Unklar]` und nennt zwei Wege zur Klärung.

Entscheidend: **Es hat keinen einzigen Empfängerkreis erfunden.** Die Anweisung „liste alle
auf" bei unvollständigem Kontext verführt erfahrungsgemäß zum Erfinden; die `[Unklar]`-Klausel
im Prompt hat das verhindert.

**Lauf C — Prompt des MLEUV, vierfache Kontextmenge.** Gleiche Struktur. Zusätzlich zieht das
Modell Empfängerkreise aus einer Landesrichtlinie heran und kennzeichnet sie ausdrücklich als
Hinweis aus der ILE-Richtlinie, nicht als Regelung des Rahmenplans — die Ebenen werden also
korrekt getrennt. Die Empfängerkreise des Rahmenplans selbst bleiben `[Unklar]`.

**Der Grund.** Von den 20 abgerufenen Passagen stammen nur 7 aus dem Rahmenplan, und keine
davon ist einer der acht Empfängerkreis-Abschnitte. Die Suche liefert das Inhaltsverzeichnis,
weil dort alle Maßnahmen vorkommen. Die eigentlichen Listen lauten „a) Gemeinden und
Gemeindeverbände, b) Zusammenschlüsse der regionalen Akteure" und haben kaum Wortüberlappung
mit der Frage. Das Modell diagnostiziert das selbst zutreffend.

## Was daraufhin an den Metadaten geändert wurde

Bisher stand zu jedem Textstück nur: Datei, Seite, nächstgelegene Überschrift, Rechtsebene,
Gültigkeitsstatus. Ergänzt wurden drei Felder, abgeleitet aus dem Text des Rahmenplans selbst
(`src/gak_hierarchie.py`, nachträglich auf den bestehenden Index geschrieben — ein Neu-Einlesen
war nicht nötig):

| Feld | Inhalt | Wie abgeleitet |
|---|---|---|
| `foerderbereich` | 1 bis 9 | Überschrift „Förderbereich N“. Für die Bereiche 6, 8 und 9 fehlt sie in der Extraktion — dort greift ein Stichwort aus dem Zuwendungszweck. |
| `foerdermassnahme` | „1.0“ … „9.0“ | führende Zahl einer Überschrift „N.M“, für folgende Textstücke fortgeschrieben |
| `abschnitt_typ` | zweck, gegenstand, empfaenger, art_hoehe, voraussetzungen, sonstige | Stichwort in der Überschrift, **nicht** die Ziffer hinter dem Punkt — die Reihenfolge schwankt zwischen den Förderbereichen (in Förderbereich 1 ist X.4 „Art und Höhe“, in Förderbereich 4 ist X.4 „Zuwendungsvoraussetzungen“) |

577 von 626 Textstücken des Rahmenplans tragen jetzt einen Förderbereich. Der Rest sind
Inhaltsverzeichnis, Gesetzestext und allgemeiner Teil, die zu keinem Förderbereich gehören.

**Nicht umgesetzt: die Maßnahmengruppe.** Die Gruppengrenzen stehen im extrahierten Text
nirgends; nur die Liste der Gruppen je Förderbereich ist vorhanden. Ableiten ließe sie sich über
die Rücksprünge der Maßnahmennummern, das ergab aber in vier von neun Förderbereichen eine
andere Zahl als der Rahmenplan selbst angibt (Förderbereich 5: 3 statt 6, Förderbereich 4: 11
statt 12). Ein Buchstabe, der in der Hälfte der Fälle falsch wäre, ist schlechter als keiner —
die Fundstelle nennt deshalb Teil, Förderbereich, Fördermaßnahme und Nummer, aber keine Gruppe.
Vollständig wird sie erst, wenn die Gruppengrenzen aus dem PDF mitextrahiert werden.

## Ergebnis von Lauf D

Die gefilterte Abfrage — Rahmenplan, Förderbereich 1, Abschnittstyp „empfaenger“ — liefert
**genau acht** Textstücke, deterministisch und ohne Ähnlichkeitssuche; dazu die acht
Zuwendungszwecke, damit die Maßnahmen benannt werden können.

Damit liefert das Modell die vollständige, differenzierende Antwort: Einleitungssatz, dass der
Empfängerkreis je Fördermaßnahme variiert, dann alle Fördermaßnahmen mit ihrem jeweiligen
Empfängerkreis — und die Fundstellen in der Zitierweise des MLEUV, zum Beispiel
„GAK-Rahmenplan, Teil II, Förderbereich 1, Fördermaßnahme 3.0, Nr. 3.3 a)“.

Die Fördermaßnahme 6.0 wird mit `[Unklar]` gekennzeichnet, weil sie im gefilterten Kontext
fehlt. Das ist korrekt, aber unnötig: dass sie entfällt, steht im Inhaltsverzeichnis, das nicht
mitgegeben wurde. Bei der Umsetzung sollte die Maßnahmenliste des Förderbereichs zum Kontext
gehören, dann kann das Modell „entfällt“ sagen statt „unklar“.

## Schlussfolgerung

Der Prompt behebt **die Form** und verhindert **Halluzination**. Er kann die fehlenden Inhalte
aber nicht herbeischaffen — das leistet erst die Hierarchie in den Metadaten.

Der Grund ist strukturell: Diese Frage verlangt die **Aufzählung eines Dokumentabschnitts**,
keine Ähnlichkeitssuche. Eine Suche, die die fünf oder zwanzig ähnlichsten Passagen liefert,
kann „alle Empfängerkreise des Förderbereichs 1" grundsätzlich nicht vollständig treffen — auch
mit noch mehr Passagen nicht, weil die gesuchten Abschnitte der Frage sprachlich nicht ähneln.

Nötig ist deshalb die Hierarchie in den Metadaten. Heute steht zu jedem Textstück nur Datei,
Seite und die nächstgelegene Überschrift. Die Überschrift „1.3 Zuwendungsempfänger" kommt im
Rahmenplan **27-mal** vor, ohne dass etwas sagt, zu welchem Förderbereich sie gehört. Mit den
Feldern Teil / Förderbereich / Maßnahmengruppe / Fördermaßnahme wird aus der Frage eine
gefilterte Abfrage — „alle Textstücke mit Förderbereich 1 und Abschnittstyp
Zuwendungsempfänger" —, die deterministisch genau acht Treffer liefert, ohne Ähnlichkeitssuche.

Der Versuch belegt damit den Bedarf an der Metadaten-Erweiterung, statt sie zu ersetzen. Beides
greift zusammen: die Struktur sorgt dafür, dass die richtigen Passagen vorliegen, der Prompt
dafür, dass daraus eine differenzierende Antwort mit Fundstellen wird.

## Übernommen und offen

Aus dem Versuch übernommen: Der Prompt bleibt als `prompts/de/rag_gak_struktur.yaml` erhalten.
Rolle, `[Unklar]`-Klausel und Systematik-Vorgabe sollten in den Regelprompt einfließen.

Der Katalogeintrag H-03 wird auf die ursprüngliche, breite Frage zurückgesetzt; die erwartete
Antwort wird durch die differenzierende Fassung des MLEUV ersetzt. Der Eintrag H-24 hatte
denselben Konstruktionsfehler und wird mitkorrigiert.

Die Hierarchie-Erweiterung ist umgesetzt und als Lauf D belegt. Offen bleiben daraus zwei
Punkte: die Maßnahmengruppe (Gruppengrenzen aus dem PDF mitextrahieren) und dieselbe Behandlung
für die VV zu § 44 LHO, die mit ihren zwei hintereinanderliegenden Regelwerken dasselbe Problem
hat — dort kommt „1 Bewilligungsvoraussetzungen“ zweimal vor, einmal für den außergemeindlichen
und einmal für den gemeindlichen Bereich.

**Rückfrage an das MLEUV:** Die vorgeschlagene Antwort nennt „die 9 Fördermaßnahmen (1.0 bis
9.0)". Da 6.0 im Rahmenplan entfällt, wären es acht mit Inhalt. Soll die erwartete Antwort das
ausdrücklich festhalten — also acht Empfängerkreise nennen und die 6.0 als entfallen ausweisen?

## Grenzen dieses Versuchs

Ein Fall, ein Modell, ein Durchlauf, ohne Reranking. Er zeigt einen Mechanismus, er liefert
keine Quote. Belastbar sind die Aussagen zur Ursache — dass die acht Passagen im Bestand liegen
und nicht abgerufen werden, ist nachgezählt, nicht geschätzt.
