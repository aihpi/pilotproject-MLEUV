# Pilotprojekt-Vereinbarung


**Zwischen:**

**KI-Servicezentrum @ HPI**

**Hasso-Plattner-Institut für Digital Engineering gGmbH**  
Prof.-Dr.-Helmert-Str. 2-3  
14482 Potsdam [KISZ@hpi.de](KISZ@hpi.de)

und

**Partner:** 

**Ministerium für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz
des Landes Brandenburg, MLEUV, Verwaltungsbehörde ELER, Abteilung 1**  
Henning-von-Tresckow-Str. 2-13, Haus S  
14467 Potsdam  
Volker Haase, Volker.Haase@MLEUV.Brandenburg.de, +49 331 866-7708  
Claudia Horezky, Claudia.Horezky@MLEUV.Brandenburg.de

---

## **Teil I. Struktur & Organisation**

### **1. Zweck der Vereinbarung**

Diese Vereinbarung beschreibt die Bedingungen und den Umfang der Zusammenarbeit zwischen dem **KI-Servicezentrum @ HPI**, nachfolgend das KISZ, und dem MLEUV, Verwaltungsbehörde ELER, Abteilung 1, nachfolgend der Partner, für ein gemeinsam definiertes Pilotprojekt, das über ein offenes Bewerbungsverfahren initiiert und zur Umsetzung ausgewählt wurde.

Ziel ist es, den Partner dabei zu unterstützen, die Umsetzung KI-basierter Lösungen in seinem Kontext zu erkunden und zu erlernen. Durch die praktische Zusammenarbeit erhält der Partner die Möglichkeit, mit unserem Team zu arbeiten und unsere Infrastruktur zu testen, und gewinnt Einblicke in die Rechenressourcen und Fähigkeiten, die für die erfolgreiche Entwicklung und den Einsatz von KI-Technologien erforderlich sind.

---

### **2. Projektüberblick**

**Projekttitel:** Pilotprojekt MLEUV: KI-gestützte Erstellung und Prüfung von Förderrichtlinien

**Kurzbeschreibung:**  
Ein lokal betriebener KI-Assistent, der das MLEUV beim Erstellen und Prüfen von Förderrichtlinien nach § 44 LHO unterstützt.

Im Zentrum steht die geführte Erstellung: Über eine Eingabe im Webbrowser entsteht die Richtlinie entlang eines Templates in der Struktur der Musterrichtlinie. Der Assistent ruft dabei je Abschnitt per RAG die einschlägigen Rechtsstellen ab, gibt Schreibhilfen und prüft auf rechtliche Stimmigkeit, beihilferechtliche Einordnung nach Art. 107 AEUV und Konsistenz. Jede Aussage bleibt mit Fundstelle belegt.

Zweitrangig ist der Prüf-Modus: Ein hochgeladener Entwurf wird zuerst auf Vollständigkeit gegen die Musterstruktur geprüft und danach gegen dieselben inhaltlichen Kriterien.

**Allgemeine Ziele:**

- Machbarkeitsnachweis eines **rein lokal** lauffähigen Assistenten ohne externe APIs oder Cloud für sensible Verwaltungsdokumente.
- Lauffähiger Prototyp, der eine Förderrichtlinie nach § 44 LHO RAG-gestützt und geführt erstellen hilft, mit Schreibhilfen und belegter Prüfung auf rechtliche Stimmigkeit, Beihilfe und Konsistenz, gemessen an einem Gold-Standard-Eval-Set.
- Als zweitrangiges Ziel die Prüfung eines hochgeladenen Entwurfs, einschließlich Vollständigkeit gegen die Mustervorlage.
- Belastbare Handlungsempfehlung für die nächsten Schritte: Qualitätsoptimierung und Framework-Wahl.

**Projektumfang:**

- **Enthalten:**
  - Fundament: durchsuchbarer Rechtskorpus für die RAG-Suche, maschinenlesbare Mustervorlage, Eval-Set.
  - **Erstellen** als Kern: geführte Eingabe im Webbrowser entlang der Musterstruktur und Logik, RAG-gestützte Schreibhilfen je Abschnitt und Prüfung auf rechtliche Stimmigkeit, Beihilfe und Konsistenz.
  - **Prüfen** als zweitrangiges Feature: Upload eines Entwurfs, zuerst Vollständigkeit gegen die Mustervorlage, dann dieselben inhaltlichen Prüfungen.
  - Lokale Pipeline aus Ingestion, RAG und LLM-Assistenz mit Human-in-the-Loop und Export von Prüfvermerk oder erstellter Richtlinie.
  - Evaluation an 1–2 realen Testfällen: Katzenkastration als Landesrecht, Schweinehaltung als Land und Bund über GAK.
- **Ausgeschlossen:**
  - Externe API- oder Cloud-Nutzung, Mehrbenutzerbetrieb, Authentifizierung, Rechte- und Rollenverwaltung.

---

### **3. Zeitplan**

Das Pilotprojekt wird gemäß den unten dargestellten Phasen und zentralen Meilensteinen durchgeführt. Dieser Zeitplan gibt einen groben Überblick über die erwartete Abfolge der Aktivitäten und erlaubt es allen Parteien, sich auf Fristen, Liefergegenstände und Prüfpunkte auszurichten. Konkrete Termine und Dauern können im Projektverlauf aktualisiert werden, die Gesamtstruktur soll jedoch die Planung leiten und einen fristgerechten Abschluss des Piloten sicherstellen.

| Phase                  | Beschreibung                      | Datum / Zeitraum |
|------------------------|-----------------------------------|------------------|
| Vor-Kickoff-Meeting    | Erste Abstimmung und Briefing     | 12.06.2026 |
| Kickoff-Meeting        | Fertigstellung der Vereinbarung   | 03.07.2026, in Person am HPI |
| Projektlaufzeit        | Aktive Projektarbeit              | 03.07.2026 bis 30.09.2026 · Fokus geführte Erstellung, Prüfen zweitrangig, Doku und Auswertung im September |
| Check-in / Meilensteine| Zwischenreview oder Updates       | Am Ende jeder Phase 0, 1, 2 |
| Abschlussevaluation    | Gemeinsame Bewertung der Ergebnisse | Monat 3, nach Phase 2, gegen das Eval-Set |
| Projektabschluss & Bericht | Dokumentation und abschließende Zusammenfassung | bis 30.09.2026 |

**Phasenplan**

| Phase | Inhalt | Zeitraum | Status |
|---|---|---|---|
| 0 Fundament | Rechtskorpus für die RAG-Suche aufbereiten, RAG-Grundstruktur erstellen, Mustervorlage maschinenlesbar machen, Eval-Set erstellen, lokales Setup; Partner liefert Web-Interface, Template und Eingabe-Logik | 03.–07.08.2026 | Pflicht |
| 1 Assistenz für die Erstellung | pro Abschnitt einschlägige Rechtsstellen per RAG abrufen, Schreibhilfen geben, auf rechtliche Stimmigkeit, Beihilfe und Konsistenz prüfen | 10.08.–28.08.2026 | Pflicht |
| 2 Prüf-Modus, zweitrangig | hochgeladenen Entwurf zuerst auf Vollständigkeit gegen die Mustervorlage prüfen, dann auf Stimmigkeit und Beihilfe | 31.08.–11.09.2026 | Pflicht |
| Doku / Auswertung | Evaluation gegen das Eval-Set, Abschlussbericht | 14.–30.09.2026 | Pflicht |

*Details je Phase, Bausteine und Fertig-Kriterien, siehe [Meilensteinplan](../02_meilensteinplan/meilensteinplan.md).*

---

### **4. Erwartete Ergebnisse**

Das Pilotprojekt zielt darauf ab, Machbarkeit zu testen, Annahmen zu validieren und umsetzbare Erkenntnisse zu gewinnen. Die Ergebnisse sollen Fortschritt und Lernen belegen, nicht erschöpfende technische Artefakte liefern.

Bis zum Ende des Pilotprojekts erwarten wir:

- **Validierte Konzepte:** Nachweis, dass der vorgeschlagene Ansatz oder die Technologie tragfähig ist und die angestrebten Ziele erreichen kann.
  - *Beispiel / Anmerkungen:* Nachweis, dass ein lokales LLM mit RAG eine Richtlinie entlang der Musterstruktur erstellen hilft und einen hochgeladenen Entwurf verlässlich prüft und beihilferechtlich einordnet.
- **Nachgewiesene Ergebnisse:** Zentrale Erkenntnisse, Modelle oder Analysen, die zeigen, ob die Projektziele erreichbar sind.
  - *Beispiel / Anmerkungen:* Lauffähiger Prototyp, der entlang des Templates bei der Richtlinienerstellung unterstützt, Schreibhilfen gibt und auf Unregelmäßigkeiten hinweist, sowie einen hochgeladenen Entwurf prüft und einen Prüfvermerk erzeugt. Auswertung gegen das Eval-Set.
- **Umsetzbare Erkenntnisse:** Empfehlungen für nächste Schritte, Verbesserungen oder Skalierungsmöglichkeiten auf Basis der Pilotergebnisse.
  - *Beispiel / Anmerkungen:* Empfehlung zu Modellgröße und Hardware, zur Richtlinien-Erstellung und zur Framework-Wahl, eigener Stack oder Spark-Workflow.
- **Dokumentation der Erkenntnisse:** Ausreichende Aufzeichnungen zu Methodik, Entscheidungen und Beobachtungen, um künftige Projekte oder die Weiterentwicklung zu unterstützen.
  - *Beispiel / Anmerkungen:* Planungsordner `04_planung_pilotprojekt` mit Architektur, Bausteinen, Meilensteinplan und ADRs, Code-Repo und Abschlussbericht.
- **Bewertung anhand der Erfolgskriterien:** Bewertung der Pilotleistung anhand vordefinierter Metriken, mit Hervorhebung von Stärken, Grenzen und Risiken.
  - *Beispiel / Anmerkungen:* Metriken siehe Abschnitt 8, etwa Trefferquote Vollständigkeit, Korrektheit Beihilfe-Einordnung, Quellenabdeckung und Latenz.

> ***Hinweis****: Detaillierte Liefergegenstände in Abschnitt 7.3.*

#### **Veröffentlichung und Weitergabe der Ergebnisse**

Das KISZ ist der Förderung von Transparenz und Wissensaustausch verpflichtet und wahrt dabei Vertraulichkeit und Rechte am geistigen Eigentum.

Die folgenden Ergebnisse sollen, vorbehaltlich gegenseitiger Zustimmung, öffentlich zugänglich gemacht oder extern geteilt werden:

- Methodik- und Architekturüberblick, aggregierte Evaluationsergebnisse und Abschlussbericht ohne vertrauliche Dokumentinhalte.
- Die entwickelte **Codebasis** als Open Source unter geeigneter Lizenz.
- Bedingung: nur nach Projektabschluss und ohne Inhalte aus den als vertraulich markierten Ordnern 05, 06 und 07; Rechtsdokumente selbst werden nicht veröffentlicht.


Jede Veröffentlichung oder externe Kommunikation der Pilotergebnisse wird zwischen KISZ und dem Partner abgestimmt, um gegenseitiges Einvernehmen, angemessene Nennung und den Schutz vertraulicher oder geschützter Informationen sicherzustellen.

---

### **5. Rollen und Verantwortlichkeiten**

Dieser Abschnitt beschreibt die wesentlichen Beiträge, Verantwortlichkeiten und Erwartungen an das KISZ und den Partner. Dieses gemeinsame Verständnis erleichtert die Zusammenarbeit, hält die Ausrichtung an den Projektzielen aufrecht und unterstützt eine wirksame Kommunikation über den gesamten Projektverlauf.

**Das KISZ wird:**

- Beratung sowie KI- und ML-Expertise bereitstellen.
- Die RAG-Suche über den Rechtskorpus und die Assistenz entwickeln, also Schreibhilfen und die Prüfung auf rechtliche Stimmigkeit, Beihilfe und Konsistenz.
- Ein dediziertes Team zur Begleitung des Projekts bereitstellen.
- Dokumentation und Prozessreflexion unterstützen.
- Die Einhaltung rechtlicher und ethischer Standards sicherstellen.

**Der Partner wird:**

- Das Web-Interface, das Template und die Eingabe-Logik bereitstellen, also welche Nutzereingabe welche Abschnitte bedingt.
- Den Zugang zu relevantem Wissen und Daten bereitstellen: Rechtskorpus, Musterrichtlinie und Prüfschema sowie fachliche Rückfragen zur Beihilfe- und Zuwendungspraxis.
- Ressourcen wie Zeit und Personal bereitstellen, um aktiv am Pilotprojekt mitzuwirken.
- Eine offene Kommunikation mit dem Team des KISZ pflegen.
- Die gemeinsame Auswertung und das Lernen unterstützen, insbesondere die fachliche Validierung der Prüf-Befunde durch eine Sachbearbeiterin oder einen Sachbearbeiter, sowie die IT-Kooperation.

Das Team in diesem Projekt setzt sich zusammen aus:

| Name              | Organisation    | Rolle        | Kontakt          |
|-------------------|-----------------|--------------|------------------|
| Lisa Kreyßing | MLEUV | Projektansprechperson | [E-Mail @MLEUV.Brandenburg.de] |
| Jill Barvencik | KISZ | KI-Entwicklung | jill.barvencik@hpi.de |
| Volker Haase | MLEUV, VB ELER | Leitung Partner | Volker.Haase@MLEUV.Brandenburg.de |
| Arvid Selle | MLEUV | Entwicklung | Arvid.Selle@MLEUV.Brandenburg.de |

---

### **6. Kommunikation und Berichtswesen**

Klare und regelmäßige Kommunikation ist entscheidend für den Erfolg des Pilotprojekts. Beide Parteien verpflichten sich zu offener Zusammenarbeit, zeitnahen Updates und gemeinsamer Verantwortung für die Dokumentation.

#### **6.1 Kommunikationsstruktur**

| Meeting-Typ           | Zweck                                                                                 | Häufigkeit / Zeitpunkt                    | Format                  | Teilnehmende                                   |
|-----------------------|---------------------------------------------------------------------------------------|-------------------------------------------|-------------------------|------------------------------------------------|
| **Technische Meetings**   | Laufende Arbeit besprechen, technische Herausforderungen klären und Updates teilen    | wöchentlich, Freitag 12–13 Uhr | Online | Projektteam |
| **Check-in-Meetings**     | Fortschritt gegen Meilensteine prüfen, Liefergegenstände bewerten und Pläne bei Bedarf anpassen | am Ende jeder Phase 0, 1, 2 | in Person | Projektteam |
| **Abschluss-Meeting**     | Projektergebnisse, Lessons Learned und nächste Schritte reflektieren                  | Ende Monat 3 | Videocall oder in Person | Projektleitungen, Stakeholder und Expert:innen |

Weitere Meetings können bei Bedarf im gegenseitigen Einvernehmen angesetzt werden.

#### **6.2 Berichtspflichten**

| Berichtstyp          | Verantwortlich    | Zeitpunkt                                           | Inhaltsüberblick                                                                                                                                   |
|----------------------|-------------------|-----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| **Fortschrittsberichte/ Protokolle der Meetings** | KISZ          | Nach technischen Meetings oder Meilenstein-Check-ins | Zusammenfassung von Aktivitäten, Fortschritt, Blockern und geplanten nächsten Schritten                                                            |
| **Abschlussbericht** | Gemeinsam         | Bei Projektabschluss                                | \- Zusammenfassung von Aktivitäten und Ergebnissen  <br />- Bewertung der Metriken  <br />- Zentrale Erkenntnisse und Grenzen  <br />- Empfehlungen für die weitere Arbeit |

Alle Berichte werden in gemeinsam vereinbarten Formaten geteilt und an zugänglichen Orten gespeichert. Gemeinsamer Ablageort ist ein geteilter Nextcloud-Ordner.

---

## **Teil II. Technische Details**

### **7. Ansatz & Methodik**

Dieses Pilotprojekt folgt einem strukturierten, aber flexiblen Ansatz, um den Partner bei der Erkundung der Umsetzung KI-basierter Lösungen zu unterstützen. Die Methodik besteht aus den folgenden Phasen und Aktivitäten:

#### **7.1 Phasen des Piloten**

| Phase              | Beschreibung                                                          | Aktivitäten                                                       |
|--------------------|-----------------------------------------------------------------------|-------------------------------------------------------------------|
| **1. Exploration**     | Kontext, Daten und Bedarfe des Partners verstehen                 | Use-Case-Definition, Stakeholder-Interviews, Dateninventur        |
| **2. Experimentierphase** | Eine minimal funktionsfähige Lösung oder einen Prototyp bauen und testen, sofern zutreffend | Datenvorverarbeitung, Modellauswahl, Infrastruktur-Test |
| **3. Evaluation**      | Ergebnisse analysieren, Machbarkeit bewerten und Erkenntnisse dokumentieren | Metrik-Review, qualitatives Feedback, Infrastruktur-Benchmarking |
| **4. Reflexion**       | Erkenntnisse zusammenfassen und Empfehlungen für nächste Schritte geben | Abschlussbericht, Lessons Learned, Roadmap-Vorschläge |

> *Zuordnung zu unserem Meilensteinplan: Exploration = Phase 0 Fundament · Experimentation = Phasen 1 und 2, also zuerst Erstellung, dann Prüfen · Evaluation = Auswertung gegen das Eval-Set · Reflexion = Abschlussbericht in Monat 3.*

#### **7.2 Methoden und Werkzeuge**

Um die Ziele des Pilotprojekts effizient und wirksam zu erreichen, kommen geeignete Methoden, Werkzeuge und Prozesse zum Einsatz. Die konkreten Ansätze und Werkzeuge können im Projektverlauf angepasst werden, um die Ausrichtung an den Zielen und die zeitnahe Lieferung von Erkenntnissen sicherzustellen. Hier einige Beispiele:

- **Datenanalyse-Techniken:**  
  Dokument-Extraktion, Retrieval-Augmented Generation, kurz RAG, LLM-basierte Klassifikation und Prüfung, regelbasierte Eingabe-Logik, welche Nutzereingabe welche Abschnitte bedingt.
- **Entwicklungswerkzeuge & Umgebung:**  
  Python, ein lokal betriebenes deutschfähiges LLM, lokale Embeddings und eine lokale Vektor-Datenbank; die konkreten Modelle und Werkzeuge werden im Projektverlauf festgelegt.
- **Kollaborationswerkzeuge:**  
  Git-Repository `pilotproject-MLEUV`, geteilter Nextcloud-Ordner für Ablage und Austausch, Markdown-Planungsordner, wöchentlicher Online-Call freitags 12–13 Uhr.
- **Iterationsmodell:**  
  Der Pilot wird in meilenstein-basierten Phasen 0 bis 2 mit Review am Ende jeder Phase durchgeführt, mit regelmäßigen Reviews und Anpassung auf Basis der Erkenntnisse.

#### **7.3 Liefergegenstände je Phase**

Am Ende jeder Phase erzeugt das Pilotprojekt greifbare Ergebnisse, die Fortschritt belegen, Annahmen validieren und Erkenntnisse für die nächsten Schritte liefern. Zu den erwarteten Liefergegenständen gehören:

- **Phase 1**: Übergeordnete Projektdefinition mit Zielen, Umfang, zentralen Annahmen und einem Plan für Datenzugang oder -verfügbarkeit. → Durchsuchbarer Rechtskorpus für die RAG-Suche samt Gültigkeit, maschinenlesbare Mustervorlage, Eval-Set.
- **Phase 2**: Prototyp, technischer Machbarkeitsnachweis oder erster Prozessdurchlauf, der Machbarkeit und Kernfunktionalität zeigt. → Lauffähiger Assistent: zuerst geführte Erstellung mit RAG-Schreibhilfen und Prüfung auf Stimmigkeit, Beihilfe und Konsistenz, dann Prüf-Modus mit Vollständigkeit gegen die Mustervorlage und Export des Prüfvermerks.
- **Phase 3**: Zusammenfassung der Erkenntnisse, einschließlich Leistungseinblicke, Bewertung anhand der Erfolgskriterien und Identifikation von Grenzen oder Herausforderungen. → Auswertung gegen das Eval-Set einschließlich der Qualitätsgrenzen.
- **Phase 4**: Umfassender Abschlussbericht, der Ergebnisse, Lessons Learned, Empfehlungen für nächste Schritte und begleitende Dokumentation zusammenführt. → Abschlussbericht und Roadmap zu Erstellung und Framework-Wahl.


Die Parteien erkennen an, dass Pilotprojekte naturgemäß mit Experimenten und Unsicherheit verbunden sind. Beide Parteien verpflichten sich, sich nach bestem Wissen um die oben genannten Liefergegenstände zu bemühen; Format, Tiefe und Inhalt der Liefergegenstände können jedoch angepasst werden auf Basis von:

- Erkenntnissen zur technischen Machbarkeit während der Umsetzung
- Einschränkungen bei Datenverfügbarkeit oder -qualität
- Ressourcenbeschränkungen oder unvorhergesehenen Hindernissen
- gegenseitigem Einvernehmen, dass alternative Ergebnisse den Projektzielen besser dienen

---

### **8. Metriken**

Die folgenden Metriken dienen der Bewertung von Fortschritt und Ergebnissen des Pilotprojekts. Sie sollen sowohl die technische Leistung als auch die übergeordneten Lernziele der Zusammenarbeit abbilden.

| Kategorie             | Metrik / Indikator                            | Definition                                     |
|-----------------------|-----------------------------------------------|------------------------------------------------|
| **Technisch**             | Trefferquote Vollständigkeitsprüfung; Korrektheit Beihilfe-Einordnung; Quellenabdeckung | Fehlende Pflichtabschnitte auf dem Eval-Set korrekt erkannt; Beihilfe-Instrument korrekt oder unklar; Anteil Aussagen mit gültiger Fundstelle |
| **RAG-Qualität mit RAGAS** | Faithfulness, Context Precision und Recall | Sind Aussagen durch die abgerufenen Passagen gedeckt, also keine Halluzination? Holt das Retrieval die richtigen Rechtsstellen? Relevant ab Phase 1 |
| **Infrastruktur-Nutzung** | Ressourcenauslastung; Antwortzeit pro LLM-Aufruf | Läuft auf der verfügbaren Maschine; Latenz dokumentiert |
| **Prozess / Fortschritt** | Phasenabschluss; Prototyp funktionsfähig | Phasen 0 bis 2 abgeschlossen; Prototyp erstellt und prüft die Testfälle |
| **Engagement / Feedback** | Fachliche Nützlichkeit aus Sicht der Sachbearbeitung | Positives Feedback von mindestens einer Sachbearbeiterin oder einem Sachbearbeiter der VB ELER |

**Evaluationsmethodik:** Die Auswertung nutzt drei Datenquellen und trennt Trainings- von Evaluationsdaten strikt, es gibt kein Finetuning, Training meint hier RAG-Korpus und Few-Shot:

- **Positiv-GT**: fertige, korrekte und bereits vorhandene Richtlinien, das Tool darf nichts fälschlich bemängeln, also False-Positive-Kontrolle.
- **Negativ-GT real**: von MLEUV bereitzustellende frühere Entwurfsfassungen sowie Prüfvermerke und Korrekturen.
- **Negativ-GT synthetisch**: korrekte Richtlinien mit gezielt eingebauten Fehlern.

**Train/Eval-Split:** Kein Evaluationsdokument darf im RAG-Index oder als Few-Shot-Beispiel auftauchen, zur Leakage-Vermeidung. **Geltungsbereich-Stufen** werden abgedeckt: A = nur Land, B = Bund und Land über GAK, C = Land, Bund und EU mit Beihilfe, so wird sichtbar, wo die Qualität mit steigender Komplexität abfällt.

Die Metriken werden bei Bedarf angepasst, um den in Abschnitt 2 definierten Zielen zu entsprechen.

---

### **9. Risiken & Annahmen**

Das Pilotprojekt umfasst das Experimentieren mit neuen KI-Technologien, was naturgemäß Unsicherheit einschließt. Dieser Abschnitt beschreibt zentrale Annahmen im Projektdesign sowie Risiken, die die Ergebnisse beeinträchtigen könnten oder eine Gegenmaßnahme erfordern.

#### **9.1 Annahmen**

Die folgenden Annahmen liegen der experimentellen Arbeit in diesem Piloten zugrunde: [Beispiele]

| Bereich             | Beschreibung der Annahme                                                                            |
|---------------------|-----------------------------------------------------------------------------------------------------|
| **Daten**               | Die verwendeten Daten sind hinreichend repräsentativ, verlässlich und für KI-Experimente geeignet. Gültigkeit und Stand der Rechtsquellen werden als Metadatum gepflegt. |
| **Nutzungskontext**     | Der vorgesehene Anwendungsfall der KI-Lösung ist klar definiert und für frühes Prototyping geeignet. Erstellung im Fokus, Prüfen zweitrangig; Assistenz, keine automatisierte Entscheidung. |
| **Machbarkeit**         | Die gewählten Methoden und Modelle sind mit den verfügbaren Ressourcen technisch umsetzbar. |
| **Rechtliche & ethische Passung** | Die Nutzung von Daten und KI-Methoden entspricht den einschlägigen Gesetzen und ethischen Leitlinien. Lokale Verarbeitung; interne Dokumente 05, 06 und 07 verlassen das Haus nicht. |
| **Interpretierbarkeit** | Die Ergebnisse lassen sich sinnvoll genug interpretieren, um erste Schlüsse zu ziehen. Jeder Befund ist mit Fundstelle belegt und menschlich nachprüfbar. |

Diese Annahmen leiten den Arbeitsumfang und werden im Verlauf des Piloten bei Bedarf überprüft.

#### **9.2 Risiken**

Die folgenden Risiken werden als potenziell erfolgs- oder integritätsrelevant für das Projekt erkannt:

[Beispiele]

| Risikotyp            | Beschreibung                                                           | Mögliche Auswirkung                    | Gegenmaßnahme                                   |
|----------------------|------------------------------------------------------------------------|----------------------------------------|-------------------------------------------------|
| **Daten-Bias / Qualität** | Trainingsdaten können verdeckte Verzerrungen enthalten oder unzureichende Qualität haben | Verzerrte Ergebnisse, eingeschränkte Aussagekraft | Frühe Datenbewertung, Transparenz in der Analyse |
| **Modellgrenzen**    | Gewählte Modelle können zu schwach sein oder instabile Ausgaben liefern | Geringeres Vertrauen in die Schlussfolgerungen | Mit einfachen Baselines beginnen; vorsichtig iterieren |
| **Overfitting / Fehlnutzung** | Experimentelle Ergebnisse können überinterpretiert oder zu breit angewandt werden | Irreführende Befunde oder False Positives | Grenzen in der Berichterstattung betonen |
| **Ethische Bedenken**    | KI-Lösungen können unbeabsichtigte ethische Fragen aufwerfen, zum Beispiel Diskriminierung | Reputations- oder Compliance-Probleme | Ethikbewusstes Design; Dokumentation der Risiken |
| **Rechtliche Unsicherheit** | Der KI-Einsatz kann unklare oder sich entwickelnde Rechtsrahmen berühren | Compliance-Risiko | Bei Bedarf rechtliche oder ethische Prüfung einbeziehen |
| **Infrastruktur-Passung** | Die Rechenumgebung bildet den realen Einsatz möglicherweise nicht ab | Falsch eingeschätzte Anforderungen | Grenzen in der Auswertung klar benennen |
| **Modellqualität** | Kleine lokale Modelle sind bei juristischem Deutsch schwächer | Fehleranfälliger, langsamer | Citation-Grounding und Human-in-the-Loop; einfache Fälle zuerst; GPU als Option benennen |
| **Fehlender Ground Truth** | Keine gelabelten Fehlerbeispiele im Datenbestand | Prüfqualität nicht messbar | Eval-Set aus Testfällen konstruieren in Phase 0 |
| **Veraltetes Recht / RAG-Leakage** | Mehrere Fassungen, zum Beispiel GAK-Rahmenplan; Testcases auch im Korpus | Falsche Zitate oder geschönte Ergebnisse | Gültigkeits-Metadatum und RAG-Filter; Testcases aus dem Index ausschließen |

Alle identifizierten Risiken werden gemeinsam beobachtet, und neu auftretende Risiken werden protokolliert und im Rahmen des Möglichen adressiert.

---

## **Teil III. Recht & Compliance**

### **10. Vertraulichkeit & geistiges Eigentum**

Alle Parteien vereinbaren, über sämtliche im Rahmen des Piloten ausgetauschten sensiblen Informationen Vertraulichkeit zu wahren, sofern nicht ausdrücklich schriftlich anders vereinbart.

Eigentum und Rechte an sämtlichen Ergebnissen, einschließlich Daten, Code und Dokumenten, werden gemeinsam vereinbart. Sofern nicht anders angegeben:

- Bereits bestehendes geistiges Eigentum bleibt Eigentum der Partei, die es eingebracht hat. Der Rechtskorpus und die Musterrichtlinie bleiben beim MLEUV.
- Gemeinsam entwickelte Ergebnisse dürfen von beiden Parteien nicht-kommerziell mit angemessener Nennung genutzt werden.

Die Parteien beabsichtigen, Projektergebnisse öffentlich zugänglich zu machen, um zu offenem Wissen und Transparenz beizutragen. Sofern nicht anders vereinbart, werden Code, Daten, Modelle, Dokumentation und weitere im Piloten entwickelte Artefakte unter einer geeigneten offenen Lizenz veröffentlicht. Die Parteien legen gemeinsam fest:

- den Zeitpunkt der Veröffentlichung
- die geeignete offene Lizenz oder Nutzungsbedingungen
- notwendige Anonymisierung oder Schwärzung zum Schutz vertraulicher Informationen

Jede Partei kann verlangen, dass bestimmte Artefakte vertraulich bleiben, sofern berechtigte geschäftliche oder Datenschutzgründe bestehen. Die als „NICHT VERÖFFENTLICHEN" markierten Dokumente in den Ordnern 05, 06 und 07 sowie personenbezogene Daten werden nicht veröffentlicht; der entwickelte Code kann open source gestellt werden.

---

### **11. Beendigung**

Diese Vereinbarung bleibt bis zum erfolgreichen Abschluss des Pilotprojekts oder bis zu einer anderweitigen gegenseitigen Vereinbarung in Kraft.

Sollte der Partner sich entscheiden, vor Abschluss aus dem Pilotprojekt auszusteigen, lädt das KISZ den Partner ein, eine freiwillige Goodwill-Spende von [100€] an eine vom KISZ ausgewählte gemeinnützige Organisation in Erwägung zu ziehen. Diese Geste ist vollkommen freiwillig und würdigt die Ressourcen und den Aufwand, die das KISZ in die Vorbereitung der Zusammenarbeit investiert hat.

Ein solcher Beitrag unterstützt unsere fortlaufende Mission und spiegelt den Geist der Partnerschaft und des gegenseitigen Respekts wider, der diesem Piloten zugrunde liegt.

---

### **12. Unterschriften**

Mit ihrer Unterschrift bestätigen beide Parteien ihr Bekenntnis zum oben beschriebenen Pilotprojekt.

**Für das KI-Servicezentrum @ HPI**  
Name: Jill Barvencik  
Position: AI Engineer
Datum:  
Unterschrift:

**Für [Partner]**  
Name: Claudia Horezky  
Position: Referatsleitung/RIO  
Datum:  
Unterschrift:

---
