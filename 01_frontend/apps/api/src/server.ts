import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import {
  abfrageartFuer,
  draftSchema,
  bestaetigteWerte,
  emptySections,
  feldLeer,
  chatStages,
  fieldVisible,
  feldwertAusVorschlag,
  naechsteFrage,
  nextChatStage,
  istBelegSatz,
  istWiederholung,
  pruefungenAnwenden,
  stufeGilt,
  stufenFelder,
  textVeraltet,
  sections,
  validateDraft,
  VORSCHLAGSFELDER,
  type ChatReply,
  type FieldDefinition,
  type SectionId,
  type FieldProposal,
  type RichtlinienAbschnitt,
  type RichtlinieDraft,
} from "@richtlinie/shared";

const app = Fastify({ logger: true, bodyLimit: 200_000 });
await app.register(cors, { origin: true });
const dataPath = resolve(process.cwd(), "data/drafts.json");
const ownerId = "prototype-user";
let drafts: RichtlinieDraft[] = [];
try {
  drafts = draftSchema
    .array()
    .parse(JSON.parse(await readFile(dataPath, "utf8")));
  drafts = drafts.map((draft) => ({
    ...draft,
    validation: validateDraft(draft),
  }));
} catch {
  drafts = [];
}
async function persist() {
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(drafts, null, 2));
}
function get(id: string) {
  const d = drafts.find((x) => x.id === id && x.ownerId === ownerId);
  if (!d)
    throw Object.assign(new Error("Entwurf nicht gefunden"), {
      statusCode: 404,
    });
  return d;
}
function touch(d: RichtlinieDraft) {
  d.updatedAt = new Date().toISOString();
  d.version++;
  d.validation = validateDraft(d);
  // Die fachlichen Prüfungen schreiben mit: Einträge fürs MdFE-Anschreiben und
  // Überarbeitungsanforderungen an andere Bausteine. Mehrfach anwendbar — ein Lauf bei
  // unverändertem Entwurf fügt nichts hinzu und verliert nichts.
  const gepruft = pruefungenAnwenden(d);
  d.sections = gepruft.sections;
  d.vermerk = gepruft.vermerk;
  void persist();
}

/**
 * Ein hochgeladener Entwurf kommt als roher Inhalt, nicht als JSON.
 *
 * Fastify kennt von sich aus nur JSON und Text; ohne diesen Leser bekäme die Route einen
 * Fehler statt der Datei. Weitergereicht wird der Puffer unverändert — diese Seite liest
 * nicht in das Dokument hinein, das tut der Prüfdienst.
 */
for (const art of [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
])
  app.addContentTypeParser(art, { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );

app.get("/api/health", async () => ({ ok: true, mode: "prototype" }));
app.get("/api/session", async () => ({
  user: {
    id: ownerId,
    name: "Dr. Alex Beispiel",
    roles: ["Fachbereich", "Haushalt", "Recht"],
  },
  auth: "prototype-oidc",
}));
app.get("/api/drafts", async () => drafts.filter((d) => d.ownerId === ownerId));
app.post("/api/drafts", async (req, reply) => {
  const body = req.body as Partial<RichtlinieDraft> & {
    profile?: RichtlinieDraft["profile"];
  };
  const now = new Date().toISOString();
  const draft: RichtlinieDraft = {
    id: randomUUID(),
    ownerId,
    title: "Neue Förderrichtlinie",
    profile: body.profile ?? {
      jurisdiction: "land",
      gak: false,
      stateAid: true,
      fundingType: "project",
    },
    sections: emptySections(),
    validation: { valid: false, issues: [] },
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  draft.validation = validateDraft(draft);
  drafts.unshift(draft);
  await persist();
  return reply.code(201).send(draft);
});
app.get("/api/drafts/:id", async (req) =>
  get((req.params as { id: string }).id),
);
app.patch("/api/drafts/:id", async (req) => {
  const d = get((req.params as { id: string }).id);
  const body = req.body as Partial<RichtlinieDraft> & {
    expectedVersion?: number;
  };
  if (body.expectedVersion && body.expectedVersion !== d.version)
    throw Object.assign(
      new Error(
        "Der Entwurf wurde zwischenzeitlich geändert. Bitte laden Sie neu.",
      ),
      { statusCode: 409 },
    );
  if (body.title !== undefined) d.title = body.title;
  if (body.profile) d.profile = body.profile;
  if (body.sections) d.sections = { ...d.sections, ...body.sections };
  if (body.status) d.status = body.status;
  touch(d);
  return d;
});
/**
 * Einen Entwurf löschen.
 *
 * Fehlte bis zum 22.09.2026 ganz: was einmal angelegt war, stand für immer in der Übersicht.
 * Beim Durchtesten entsteht mit jeder Runde ein neuer, und alte tragen Werte aus einem
 * früheren Stand — die Liste wird unbrauchbar, und niemand kann aufräumen.
 *
 * Endgültig, ohne Papierkorb: der Zustand liegt in einer Datei, ein zweiter Stand dafür wäre
 * mehr Maschinerie als der Prototyp trägt. Die Rückfrage steht deshalb in der Oberfläche.
 */
app.delete("/api/drafts/:id", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  drafts = drafts.filter((x) => x.id !== d.id);
  await persist();
  return reply.code(204).send();
});

app.post("/api/drafts/:id/validate", async (req) => {
  const d = get((req.params as { id: string }).id);
  d.validation = validateDraft(d);
  return d.validation;
});

/**
 * Prüfvermerk: Begründung einholen und bestätigen.
 *
 * Die BPMN kennt dafür die Aufgabe „Fachliche Begründung beim Nutzer einholen". Zwei
 * Schritte, bewusst getrennt: das Fachreferat begründet, jemand anderes bestätigt. In einem
 * Anschreiben ans MdFE steht am Ende die Unterschrift einer Person, nicht die einer
 * Maschine — ein Vermerk, den niemand gegengelesen hat, ist keine Freigabe.
 */
function vermerkEintrag(d: RichtlinieDraft, eintragId: string) {
  const eintrag = (d.vermerk ?? []).find((v) => v.id === eintragId);
  if (!eintrag)
    throw Object.assign(new Error("Vermerkseintrag nicht gefunden"), { statusCode: 404 });
  if (eintrag.status === "gegenstandslos")
    throw Object.assign(
      new Error(
        "Dieser Eintrag ist gegenstandslos: die Regel greift nicht mehr, weil der " +
        "auslösende Wert geändert wurde. Eine Begründung wird nicht mehr gebraucht.",
      ),
      { statusCode: 409 },
    );
  return eintrag;
}

app.post("/api/drafts/:id/vermerk/:eintragId/begruendung", async (req) => {
  const d = get((req.params as { id: string }).id);
  const eintrag = vermerkEintrag(d, (req.params as { eintragId: string }).eintragId);
  const { begruendung } = req.body as { begruendung?: string };
  if (!begruendung?.trim())
    throw Object.assign(new Error("Bitte geben Sie eine Begründung ein."), {
      statusCode: 400,
    });
  eintrag.begruendung = begruendung.trim();
  eintrag.status = "beantwortet";
  touch(d);
  return eintrag;
});

app.post("/api/drafts/:id/vermerk/:eintragId/bestaetigen", async (req) => {
  const d = get((req.params as { id: string }).id);
  const eintrag = vermerkEintrag(d, (req.params as { eintragId: string }).eintragId);
  if (!eintrag.begruendung?.trim())
    throw Object.assign(
      new Error("Ohne Begründung gibt es nichts zu bestätigen."),
      { statusCode: 409 },
    );
  eintrag.status = "bestaetigt";
  touch(d);
  return eintrag;
});

/**
 * Die offenen Punkte des Anschreibens ans MdFE.
 *
 * Solange hier etwas offen oder unbestätigt ist, fehlt dem Anschreiben eine Begründung —
 * und ohne die ist die Richtlinie nicht einreichungsreif. Deshalb eine eigene Sicht darauf
 * und nicht nur ein Feld im Entwurf.
 */
app.get("/api/drafts/:id/vermerk", async (req) => {
  const d = get((req.params as { id: string }).id);
  const alle = d.vermerk ?? [];
  const offen = alle.filter((v) => v.status === "offen");
  const unbestaetigt = alle.filter((v) => v.status === "beantwortet");
  return {
    eintraege: alle,
    offen: offen.length,
    unbestaetigt: unbestaetigt.length,
    vollstaendig: offen.length === 0 && unbestaetigt.length === 0,
  };
});

/**
 * Feldvorschläge vom Python-Dienst holen.
 *
 * Arbeitsteilung: diese Seite kennt Entwurf, Chat-Stufe und Felddefinitionen und schickt sie
 * mit; der Dienst kennt Korpus, Musterbausteine und Modell. Die Felddefinitionen werden
 * bewusst mitgeschickt statt dort nachgebaut — sonst gäbe es zwei Quellen, die auseinander
 * driften können, ohne dass es auffällt.
 *
 * Fällt der Dienst aus, gibt es KEINEN Ersatzvorschlag: lieber keine Zuarbeit als eine
 * erfundene. Die Nachricht sagt das der Nutzerin.
 */
const VORSCHLAG_URL = process.env.VORSCHLAG_URL ?? "http://127.0.0.1:8000";

type DienstVorschlag = {
  feld: string; label: string;
  wert: string | number | boolean | string[] | null;
  status: string | null;
  fundstelle: string | null; belegzitat: string | null; deckung: string | null;
  musterbaustein: string | null; begruendung: string | null; konfidenz: number | null;
  belegdatei: string | null; belegseite: number | null;
};

async function holeVorschlaege(
  sectionId: string,
  eingabe: string,
  felder: { id: string; label: string; kind: string; options?: { value: string; label: string }[] }[],
  // Die übrigen Felder desselben Abschnitts, die in der ANDEREN Anfrage gefüllt werden.
  // Ohne sie schrieb ein Freitextfeld hin, was ein Auswahlfeld daneben schon aufnimmt —
  // die beiden Anfragen wussten nichts voneinander.
  nachbarfelder: { id: string; label: string }[] = [],
): Promise<{ vorschlaege: DienstVorschlag[]; vorbild: boolean }> {
  // Zeitlimit: eine Anfrage dauert derzeit rund eine Minute (Suche, Satzfilter, Vorschlag —
  // drei Modellrunden). Ohne Limit hinge die Verbindung im Fehlerfall endlos.
  const abbruch = AbortSignal.timeout(180_000);
  // Die Abfragesorte ergibt sich aus den Zielfeldern, siehe VORSCHLAGSFELDER in shared. Sie
  // wird hier bestimmt und nicht im Dienst: welche Felder gerade gefüllt werden, weiß nur
  // diese Seite.
  const abfrageart = abfrageartFuer(felder.map((f) => f.id));
  const res = await fetch(`${VORSCHLAG_URL}/vorschlag`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      abschnitt_nr: Number(sectionId), eingabe, felder, abfrageart,
      nachbarfelder: nachbarfelder.length ? nachbarfelder : undefined,
    }),
    signal: abbruch,
  });
  if (!res.ok) throw new Error(`Vorschlagsdienst: HTTP ${res.status}`);
  const daten = (await res.json()) as {
    vorschlaege: DienstVorschlag[];
    nachweis?: { abfrageart?: string | null };
  };
  // Die Sorte kommt aus der ANTWORT zurück und wird nicht aus der Anfrage übernommen: was
  // der Dienst tatsächlich gesehen hat, weiß nur er.
  return {
    vorschlaege: daten.vorschlaege ?? [],
    vorbild: daten.nachweis?.abfrageart === "vorschlagen",
  };
}

/**
 * Die Richtlinie ausformulieren — der letzte Schritt des Prozessmodells.
 *
 * Die Felddefinitionen gehen mit, wie beim Vorschlag: der Dienst kann ohne sie nicht
 * erkennen, dass ein Text eine Auswahl behauptet, die abgewählt wurde, und er hätte für
 * „minimum" nur eine Feldkennung statt der Beschriftung „Bagatellgrenze in Euro".
 *
 * Das Ergebnis wird am Entwurf abgelegt, nicht nur zurückgegeben: ein Aufruf dauert
 * anderthalb Minuten, und niemand soll ihn wiederholen müssen, um nachzulesen. Mit der
 * Entwurfsversion zusammen — daran erkennt die Oberfläche, dass der Text zu geänderten
 * Angaben nicht mehr passt.
 */
app.post("/api/drafts/:id/richtlinie", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  const abschnitte = sections
    .map((s) => Number(s.id))
    .filter((n) => n >= 1 && n <= 8);

  let res: Response;
  try {
    res = await fetch(`${VORSCHLAG_URL}/richtlinie`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Grosszügiger als beim Chat: ein Modellaufruf je Abschnitt, acht Abschnitte.
      signal: AbortSignal.timeout(900_000),
      body: JSON.stringify({
        entwurf: d,
        abschnitte,
        titel: Object.fromEntries(sections.map((s) => [s.id, s.title])),
        felder: Object.fromEntries(
          sections.map((s) => [
            s.id,
            s.fields.map((f) => ({
              id: f.id, label: f.label, kind: f.kind,
              options: f.options?.map((o) => ({ value: o.value, label: o.label })),
            })),
          ]),
        ),
      }),
    });
  } catch (e) {
    // Kein Ersatztext, wie beim Vorschlag: lieber keine Richtlinie als eine erfundene.
    return reply.code(502).send({
      message: `Der Vorschlagsdienst ist nicht erreichbar (${String(e)}). Es wurde kein Text erzeugt.`,
    });
  }
  if (!res.ok)
    return reply.code(502).send({
      message: `Vorschlagsdienst: HTTP ${res.status}. Es wurde kein Text erzeugt.`,
    });

  const daten = (await res.json()) as {
    abschnitte: RichtlinienAbschnitt[];
    befunde: string[];
  };
  d.richtlinientext = {
    abschnitte: daten.abschnitte ?? [],
    befunde: daten.befunde ?? [],
    erzeugtAm: new Date().toISOString(),
    ausVersion: d.version,
  };
  await persist();
  return d;
});

/**
 * Prüf-Modus: einen fertigen Entwurf hochladen und gegen die Musterstruktur halten.
 *
 * Phase 2 der Vereinbarung. Anders als alles andere hier hängt das an keinem Entwurf — man
 * lädt ein fremdes Dokument hoch und bekommt eine Auskunft, ohne dass etwas gespeichert
 * wird. Deshalb kein `:id` in der Adresse.
 *
 * `bodyLimit` eigens gesetzt: der Dienst läuft sonst mit 200 KB, und darunter liegt keine
 * einzige Richtlinie des Korpus.
 */
app.post(
  "/api/pruefen",
  { bodyLimit: 20 * 1024 * 1024 },
  async (req, reply) => {
    const { datei } = req.query as { datei?: string };
    const inhalt = req.body as Buffer;
    if (!inhalt?.length)
      return reply.code(400).send({ message: "Keine Datei empfangen." });

    let res: Response;
    try {
      res = await fetch(
        `${VORSCHLAG_URL}/pruefen?datei=${encodeURIComponent(datei ?? "entwurf.pdf")}`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: new Uint8Array(inhalt),
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (e) {
      return reply.code(502).send({
        message: `Der Prüfdienst ist nicht erreichbar (${String(e)}).`,
      });
    }
    const daten = await res.json();
    if (!res.ok)
      return reply.code(res.status).send({
        message:
          (daten as { detail?: string }).detail ?? `Prüfdienst: HTTP ${res.status}`,
      });
    return daten;
  },
);

/**
 * Feldvorschläge für einen Abschnitt holen — die gemeinsame Naht von Chat und Formular.
 *
 * Herausgelöst, weil es zwei Eingänge in dieselbe Sache gibt: das Gespräch und der Knopf
 * „Vorschlag holen" im Formular. Zweimal gepflegt liefen die beiden auseinander, und die
 * Bearbeiterin bekäme je nach Weg verschiedene Werte für dieselbe Frage.
 */
async function vorschlaegeFuer(
  sectionId: SectionId,
  eingabe: string,
  targets: FieldDefinition[],
): Promise<{ proposals: FieldProposal[]; geliefert: DienstVorschlag[] }> {
  let proposals: FieldProposal[] = [];
    // Zwei Anfragen statt einer, weil die Abfragesorte am Feld hängt und nicht am Abschnitt:
    // beim ÜBERNEHMEN ist eine Fundstelle ein Nachweis, beim VORSCHLAGEN ein Vorbild aus
    // einem früheren Verfahren. In einer gemeinsamen Anfrage bekäme die ganze Antwort die
    // Sorte des ersten passenden Feldes, und ein aus der Eingabe übernommener Fördersatz
    // sähe aus wie eine Empfehlung. Sie laufen nebeneinander, die Wartezeit bleibt gleich.
    const [uebernahme, vorschlag] = await Promise.all(
      (
        [
          targets.filter((f) => !VORSCHLAGSFELDER.includes(f.id)),
          targets.filter((f) => VORSCHLAGSFELDER.includes(f.id)),
        ] as FieldDefinition[][]
      ).map((gruppe, i, alle) =>
        gruppe.length
          ? holeVorschlaege(
              sectionId,
              eingabe,
              gruppe.map((f) => ({
                id: f.id, label: f.label, kind: f.kind,
                options: f.options?.map((o) => ({ value: o.value, label: o.label })),
              })),
              // Die jeweils andere Gruppe als Nachbarschaft.
              (alle[1 - i] ?? []).map((f) => ({ id: f.id, label: f.label })),
            )
          : Promise.resolve({ vorschlaege: [], vorbild: false }),
      ),
    );
    const geliefert = [...uebernahme!.vorschlaege, ...vorschlag!.vorschlaege];
    const istVorbild = new Set(vorschlag!.vorschlaege.map((v) => v.feld));

    // „[Unklar]" ist eine Auskunft, kein Vorschlag: der Dienst sagt damit, dass die Angabe
    // das Feld nicht deckt. Ein solcher Wert gehört nicht in den Bestätigen-Dialog.
    proposals = geliefert
      .filter((v) => v.wert && v.status !== "unklar" && v.status !== "invalid")
      .map((v) => {
        // Eine Fundstelle nur dort, wo sie etwas bedeutet. Beim ÜBERNEHMEN kommt der Wert
        // aus der Eingabe der Bearbeiterin — der Korpus hat dazu nichts beizutragen, und was
        // die Suche trotzdem findet, ist bestenfalls themenverwandt. Im Probelauf waren das
        // ein Satzfragment, ein für zwei Felder wortgleicher Rechtsgrundlagensatz und eine
        // Gliederungsüberschrift. Alle drei standen unter „kein Nachweis" und verwirrten
        // trotzdem, weil dort überhaupt etwas stand.
        const beleg = istVorbild.has(v.feld) && istBelegSatz(v.belegzitat);
        const kind = targets.find((f) => f.id === v.feld)?.kind ?? "text";
        return {
          sectionId: sectionId,
          fieldId: v.feld,
          label: v.label,
          value: feldwertAusVorschlag(v.wert, kind),
          confidence: v.konfidenz ?? 0,
          evidence: v.begruendung ?? "",
          // Die Herkunft einzeln durchreichen statt in `evidence` zusammenzupressen: die
          // Oberfläche muss Deckung (aus der Eingabe) und Beleg (aus dem Regelwerk)
          // auseinanderhalten können, sonst sieht beides gleich aus.
          ...(v.deckung ? { deckung: v.deckung } : {}),
          ...(beleg && v.belegzitat ? { belegzitat: v.belegzitat } : {}),
          ...(beleg && v.fundstelle ? { fundstelle: v.fundstelle } : {}),
          // Datei und Seite machen die Fundstelle anklickbar; ohne sie bleibt sie Text.
          ...(beleg && v.belegdatei ? { belegdatei: v.belegdatei } : {}),
          ...(beleg && v.belegseite ? { belegseite: v.belegseite } : {}),
          ...(v.musterbaustein ? { musterbaustein: v.musterbaustein } : {}),
          // Nur wenn es auch eine Fundstelle gibt: ohne sie gibt es nichts zu kennzeichnen.
          ...(beleg && v.fundstelle ? { vorbild: true } : {}),
        };
      });
  return { proposals, geliefert };
}

/**
 * Vorschläge für einen Abschnitt, aus dem Formular heraus.
 *
 * Das Formular deckt alle elf Bausteine ab, das Gespräch nur die ersten sechs — und ab
 * Baustein 6 stand die Bearbeiterin bis hierher ohne jede Unterstützung da: keine
 * Vorschläge, keine Fundstellen, keine Herkunft. Ein gewöhnliches Verwaltungsformular.
 *
 * Ein Knopf statt einer Frage, weil er nicht wartet, wenn ihn niemand drückt. Für zwei
 * Datumsangaben eine Minute auf ein Modell zu warten wäre Unfug; sie sich vorschlagen zu
 * LASSEN, wenn man unsicher ist, ist es nicht.
 *
 * Als Eingabe dient, was im Chat schon gesagt wurde. Ist dort nichts, bleibt der Regelfall
 * aus den Musterbausteinen — und der wird als solcher ausgewiesen, nicht als Deckung.
 */
app.post("/api/drafts/:id/abschnitt/:nr/vorschlag", async (req) => {
  const { id, nr } = req.params as { id: string; nr: string };
  const d = get(id);
  const def = sections.find((s) => s.id === nr);
  if (!def)
    throw Object.assign(new Error("Abschnitt nicht gefunden"), { statusCode: 404 });

  // Dieselbe Auswahl wie im Gespräch: sichtbar im gegenwärtigen Pfad, noch nicht bestätigt.
  // Was ein Mensch entschieden hat, schlägt das Werkzeug nicht erneut vor.
  const werte = bestaetigteWerte(d);
  const targets = def.fields.filter(
    (f) =>
      fieldVisible(f, d.profile, werte) &&
      // Bestätigt UND gefüllt. Ein Feld, das jemand geleert und gespeichert hat, trägt die
      // Bestätigung von vorher — angeboten werden muss es trotzdem wieder.
      !(
        d.sections[nr]?.fields[f.id]?.confirmedByUser &&
        !feldLeer(d.sections[nr]?.fields[f.id]?.value ?? null)
      ),
  );
  if (!targets.length) return { proposals: [], hinweis: "In diesem Abschnitt ist alles bestätigt." };

  try {
    const { proposals, geliefert } = await vorschlaegeFuer(
      def.id,
      (d.chatVerlauf ?? []).join("\n\n"),
      targets,
    );
    const offen = geliefert
      .filter((v) => v.status === "unklar")
      .map((v) => v.label);
    // Dieselbe Sperre wie im Gespräch: nichts vorschlagen, was ein anderer Abschnitt schon
    // regelt. Sie fehlte hier, und prompt holte sich „Weitere Nebenbestimmungen" wieder den
    // Empfängerkreis und die Voraussetzungen aus den Bausteinen 3 und 4.
    const wiederholt = proposals.filter((p) => istWiederholung(p.value, d, p.sectionId));
    return {
      proposals: proposals.filter((p) => !wiederholt.includes(p)),
      hinweis:
        (offen.length ? `Ohne Vorschlag geblieben: ${offen.join(", ")}. ` : "") +
        (wiederholt.length
          ? `Weggelassen, weil schon in einem anderen Abschnitt geregelt: ${wiederholt
              .map((p) => p.label)
              .join(", ")}.`
          : ""),
    };
  } catch (e) {
    throw Object.assign(
      new Error(
        "Die fachliche Zuarbeit ist derzeit nicht erreichbar. Sie können die Angaben " +
          `selbst eintragen. (${e instanceof Error ? e.message : String(e)})`,
      ),
      { statusCode: 502 },
    );
  }
});

app.post("/api/drafts/:id/chat/messages", async (req): Promise<ChatReply> => {
  const d = get((req.params as { id: string }).id);
  const { message } = req.body as { message?: string };
  // Ohne Nachricht heißt: aus dem VERLAUF füllen.
  //
  // Die Bearbeiterin hat ihre Förderidee am Stück erzählt und wurde danach Stufe für Stufe
  // nach Dingen gefragt, die längst dastanden — sie musste jedes Mal „wie oben" tippen,
  // damit das Werkzeug nachsieht. Der Aufruf kostet nicht mehr als dieses „wie oben": er
  // findet nur früher statt und ohne Aufforderung.
  const neu = message?.trim() ?? "";
  if (!neu && !(d.chatVerlauf ?? []).length)
    throw Object.assign(new Error("Bitte geben Sie eine Nachricht ein."), {
      statusCode: 400,
    });
  const stage = nextChatStage(d) ?? chatStages[0]!;
  const def = sections.find((s) => s.id === stage.sectionId)!;
  // Der Verlauf wächst VOR der Anfrage, damit die aktuelle Nachricht mitgeht. Er wird auch
  // dann behalten, wenn der Dienst ausfällt — die Bearbeiterin soll nach einer Störung nicht
  // von vorn erzählen müssen.
  if (neu) d.chatVerlauf = [...(d.chatVerlauf ?? []), neu];
  // Diese Stufe ist damit gefragt worden — auch wenn die Antwort nichts hergibt. Die
  // Rückschau „habe ich schon übernommen" soll nur nennen, wonach NIE gefragt wurde.
  d.gefragteStufen = [...new Set([...(d.gefragteStufen ?? []), stage.sectionId])];
  await persist();
  const eingabe = (d.chatVerlauf ?? []).join("\n\n");
  const targets = stufenFelder(stage, d);

  let proposals: FieldProposal[] = [];
  let hinweis = "";
  let ausRegelfall = false;
  try {
    const ergebnis = await vorschlaegeFuer(stage.sectionId, eingabe, targets);
    proposals = ergebnis.proposals;
    const geliefert = ergebnis.geliefert;
    // Beim Blick in den Verlauf zählt nur, was dort auch steht.
    //
    // Ein Wert ohne Deckung ist aus dem Regelfall abgeleitet — eine Vermutung, die ihre
    // Berechtigung hat, wenn jemand gerade nach dem Abschnitt gefragt wurde und nichts dazu
    // sagen konnte. Unaufgefordert vorgelegt ist sie etwas anderes: dann behauptet das
    // Werkzeug, in den bisherigen Angaben stehe etwas, das dort nicht steht. Nach dem
    // Bestätigen des Titels kamen so Vorschläge für Rechtsgrundlage und Zuwendungszweck,
    // obwohl im Verlauf nur der Titel stand.
    // Beim Blick in den Verlauf wird auch der REGELFALL vorgelegt — aber nur, wenn die
    // Stufe ohnehin an der Reihe ist und die Bearbeiterin nichts Eigenes dazu gesagt hat.
    //
    // Die Unterscheidung ist wichtig, weil beides schon schiefging: anfangs kamen nach dem
    // Bestätigen des Titels Vorschläge für Rechtsgrundlage und Zuwendungszweck, obwohl im
    // Verlauf nur der Titel stand — das Werkzeug behauptete, dort stehe etwas. Filterte man
    // dagegen alles Ungedeckte weg, konnte es für die Bausteine 6 bis 8 nie etwas anbieten,
    // obwohl die Musterrichtlinie dort meist eine Antwort hat.
    //
    // Maßstab ist deshalb nicht die Deckung, sondern die WORTWAHL: ein abgeleiteter Wert
    // wird als „aus dem Regelfall abgeleitet" ausgewiesen und die Nachricht sagt es auch.
    ausRegelfall = !neu && proposals.every((p) => !p.deckung);
    // Und nichts vorschlagen, was ein anderer Abschnitt schon regelt — siehe
    // `istWiederholung`. Der Befund gehört in die Antwort, nicht ins Schweigen: die
    // Bearbeiterin soll sehen, dass hier etwas weggelassen wurde und warum.
    const wiederholt = proposals.filter((p) => istWiederholung(p.value, d, p.sectionId));
    if (wiederholt.length) {
      proposals = proposals.filter((p) => !wiederholt.includes(p));
      hinweis +=
        ` Weggelassen, weil schon in einem anderen Abschnitt geregelt: ` +
        `${wiederholt.map((p) => p.label).join(", ")}.`;
    }
    // Offen bleibt, was die Stufe ausdrücklich erfragt. Für die übrigen Felder des
    // Abschnitts wird mitgesammelt, aber nicht gemahnt — sonst listet jede Antwort ein
    // Dutzend Felder auf, nach denen niemand gefragt hat.
    const offen = geliefert
      .filter((v) => v.status === "unklar" && stage.fieldIds.includes(v.feld))
      .map((v) => v.label);
    if (offen.length)
      hinweis =
        ` Bitte nennen Sie noch: ${offen.join(", ")}. ` +
        "Sie können es auch später im Formular eintragen.";
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    return {
      message:
        "Die fachliche Zuarbeit ist derzeit nicht erreichbar, deshalb gibt es keinen " +
        `Vorschlag. Sie können die Angaben im Formular selbst eintragen. (${grund})`,
      extraction: {
        id: randomUUID(), messageId: randomUUID(),
        proposals: [], followUpQuestions: [], conflicts: [],
      },
      progress: Math.round(
        ((chatStages.indexOf(stage) + 1) / chatStages.length) * 100,
      ),
    };
  }

  // Die nächste Frage ist die nächste GÜLTIGE Stufe, nicht der nächste Eintrag im Feld.
  // Nach Position gewählt kann sie eine Stufe nennen, die der gegenwärtige Pfad gar nicht
  // vorsieht — die Bearbeiterin liest dann eine Frage, die das Werkzeug beim nächsten Zug
  // überspringt, und der Sprung sieht aus wie ein Fehler.
  const next = chatStages
    .slice(chatStages.indexOf(stage) + 1)
    .find((s) => stufeGilt(s, d));
  return {
    message:
      // Der Wortlaut hängt daran, ob gerade etwas gesagt wurde. „Ich habe Ihre Angabe
      // zugeordnet" nach einem Blick in den Verlauf liest sich, als hätte die Bearbeiterin
      // etwas geschrieben — sie hat aber nur bestätigt und wartet.
      (proposals.length
        ? neu
          ? `Ich habe Ihre Angabe dem Abschnitt „${def.title}“ zugeordnet. Bitte prüfen Sie den Vorschlag, bevor er übernommen wird.`
          : ausRegelfall
            ? `Zu „${def.title}“ schlage ich den Regelfall der Musterrichtlinie vor. Er ist nicht durch Ihre Angaben gedeckt — bitte besonders prüfen.`
            : `Zu „${def.title}“ steht in Ihren bisherigen Angaben schon etwas. Bitte prüfen Sie den Vorschlag, bevor er übernommen wird.`
        : // Ohne Vorschlag sagt der Hinweis bereits, was fehlt. Beides zusammen wäre
          // dieselbe Auskunft zweimal, einmal auf Abschnitts- und einmal auf Feldebene.
          hinweis
          ? `Für „${def.title}“ fehlt noch etwas.`
          : neu
            ? `Aus Ihrer Angabe lässt sich für „${def.title}“ noch kein Vorschlag ableiten.`
            : `Zu „${def.title}“ finde ich in Ihren bisherigen Angaben nichts.`) +
      hinweis,
    extraction: {
      id: randomUUID(),
      messageId: randomUUID(),
      proposals,
      followUpQuestions: next ? [next.question] : [],
      conflicts: [],
    },
    progress: Math.round(
      ((chatStages.indexOf(stage) + 1) / chatStages.length) * 100,
    ),
  };
});
app.post("/api/drafts/:id/extractions/:extractionId/confirm", async (req) => {
  const d = get((req.params as { id: string }).id);
  const { proposals } = req.body as { proposals: FieldProposal[] };
  for (const p of proposals) {
    d.sections[p.sectionId] ??= { fields: {} };
    d.sections[p.sectionId]!.fields[p.fieldId] = {
      value: p.value,
      status: "confirmed",
      source: "ai-extracted",
      confidence: p.confidence,
      evidence: p.evidence,
      confirmedByUser: true,
    };
    if (p.fieldId === "title") {
      d.title = String(p.value ?? "");
    }
  }
  touch(d);
  return {
    draft: d,
    // Die eben bestätigte Stufe wird nicht noch einmal als „schon übernommen" aufgezählt.
    nextQuestion: naechsteFrage(d, proposals[0]?.sectionId),
  };
});
/**
 * „Überspringen" — und diesmal wird wirklich übersprungen.
 *
 * Vorher gab diese Route nur `ok` zurück. Der Kasten schloss sich, `nextChatStage` fand
 * dieselbe Stufe wieder unerledigt, und die Frage kam erneut. Konnte das Gespräch ein
 * Pflichtfeld nicht füllen, gab es keinen Ausweg mehr — die Bearbeiterin saß fest.
 *
 * Bestätigt wird dabei nichts: die Felder bleiben offen und werden in der Gesamtprüfung
 * weiter angemahnt. Übersprungen ist nur die FRAGE, nicht die Angabe.
 */
app.post("/api/drafts/:id/extractions/:extractionId/reject", async (req) => {
  const d = get((req.params as { id: string }).id);
  const stage = nextChatStage(d);
  if (stage)
    d.uebersprungeneStufen = [
      ...new Set([...(d.uebersprungeneStufen ?? []), stage.sectionId]),
    ];
  await persist();
  return {
    ok: true,
    nextQuestion: naechsteFrage(d, stage?.sectionId),
  };
});
app.get("/api/drafts/:id/preview", async (req) => {
  const d = get((req.params as { id: string }).id);
  return {
    title: d.title,
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      paragraphs: s.fields
        .map((f) => ({
          label: f.label,
          value: d.sections[s.id]?.fields[f.id]?.value,
        }))
        .filter((x) => x.value != null && x.value !== ""),
    })),
  };
});
/**
 * Die Richtlinie als Word-Datei — das Dokument, das am Ende weitergegeben wird.
 *
 * Hier stand bis zuletzt eine Formularliste: „Bagatellgrenze in Euro: 1000", Feld für Feld.
 * Das ist eine Zusammenstellung der Angaben, keine Richtlinie. Sobald ein Text erzeugt
 * wurde, wird er ausgegeben — nummerierte Abschnitte, Fließtext, sonst nichts.
 *
 * Ohne Anmerkungen, ohne Befunde, ohne Herkunftsangaben. Die gehören in die Arbeitsansicht
 * und in den Prüfvermerk, nicht in das Dokument, das an das MdFE geht. Das Konzeptpapier
 * verlangt zwei Arbeitsergebnisse, nicht eines mit Randnotizen.
 *
 * Ist der Text älter als der Entwurf, wird NICHT ausgegeben. Eine Word-Datei, die still
 * einen überholten Stand trägt, ist genau der Fehler, den dieses Werkzeug verhindern soll —
 * sie sieht fertig aus und niemand sieht ihr das Alter an.
 */
app.post("/api/drafts/:id/export", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  const text = d.richtlinientext;

  if (text && textVeraltet(d))
    return reply.code(409).send({
      message:
        "Der erzeugte Text ist älter als der Entwurf. Erzeugen Sie ihn neu, bevor Sie " +
        "ihn ausgeben — sonst enthält die Datei einen überholten Stand.",
    });

  const children = text
    ? [
        new Paragraph({ text: d.title, heading: HeadingLevel.TITLE }),
        ...text.abschnitte
          .filter((a) => a.text.trim())
          .flatMap((a) => [
            new Paragraph({
              text: `${a.nr}. ${sections.find((s) => s.id === String(a.nr))?.title ?? ""}`,
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: a.text }),
          ]),
      ]
    : [
        // Ohne erzeugten Text bleibt nur die Zusammenstellung der Angaben. Sie wird als
        // solche überschrieben, damit niemand sie für eine Richtlinie hält.
        new Paragraph({ text: d.title, heading: HeadingLevel.TITLE }),
        new Paragraph({
          text:
            "Zusammenstellung der erfassten Angaben. Dies ist noch kein Richtlinientext — " +
            "erzeugen Sie ihn über „Richtlinientext“.",
        }),
        ...sections.flatMap((s) => {
          const vals = s.fields
            .map((f) => ({ f, v: d.sections[s.id]?.fields[f.id]?.value }))
            .filter((x) => x.v != null && x.v !== "");
          return vals.length
            ? [
                new Paragraph({
                  text: `${s.id}. ${s.title}`,
                  heading: HeadingLevel.HEADING_1,
                }),
                ...vals.map(
                  ({ f, v }) =>
                    new Paragraph({
                      text: `${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`,
                    }),
                ),
              ]
            : [];
        }),
      ];
  const buffer = await Packer.toBuffer(
    new Document({ sections: [{ children }] }),
  );
  return reply
    .header(
      "content-type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    .header(
      "content-disposition",
      `attachment; filename="richtlinie-${d.id}.docx"`,
    )
    .send(buffer);
});

/**
 * Der Prüfvermerk als eigenes Dokument — das Anschreiben an das MdFE.
 *
 * Das zweite Arbeitsergebnis, das Doc 12 neben der Richtlinie verlangt. Getrennt und nicht
 * als Anhang: die Richtlinie wird veröffentlicht, das Anschreiben geht ans Finanzministerium.
 * Wer beides in einer Datei hat, gibt irgendwann das Falsche weiter.
 *
 * Offene Punkte werden mit ausgegeben und als offen bezeichnet. Sie wegzulassen hiesse, ein
 * unvollständiges Anschreiben vollständig aussehen zu lassen.
 */
app.post("/api/drafts/:id/export/vermerk", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  const eintraege = (d.vermerk ?? []).filter((v) => v.status !== "gegenstandslos");

  const stand: Record<string, string> = {
    offen: "OFFEN — Begründung fehlt",
    beantwortet: "begründet, noch nicht bestätigt",
    bestaetigt: "begründet und bestätigt",
    gegenstandslos: "gegenstandslos",
  };

  const children = [
    new Paragraph({ text: `Prüfvermerk zu: ${d.title}`, heading: HeadingLevel.TITLE }),
    new Paragraph({
      text:
        eintraege.length === 0
          ? "Es sind keine begründungspflichtigen Abweichungen festgestellt worden."
          : "Begründungspflichtige Abweichungen von den Vorgaben nach § 44 LHO:",
    }),
    ...eintraege.flatMap((v) => [
      new Paragraph({
        text: `Baustein ${v.sectionId} — ${v.regel}`,
        heading: HeadingLevel.HEADING_1,
      }),
      ...(v.rechtsstelle ? [new Paragraph({ text: `Rechtsstelle: ${v.rechtsstelle}` })] : []),
      new Paragraph({ text: `Feststellung: ${v.beurteilung}` }),
      new Paragraph({
        text: `Begründung: ${v.begruendung ?? "— fehlt —"}`,
      }),
      new Paragraph({ text: `Stand: ${stand[v.status] ?? v.status}` }),
    ]),
  ];
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  return reply
    .header(
      "content-type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    .header("content-disposition", `attachment; filename="pruefvermerk-${d.id}.docx"`)
    .send(buffer);
});

app.setErrorHandler((error, _req, reply) => {
  const safe = error as { statusCode?: number; message?: string };
  return reply
    .code(safe.statusCode ?? 500)
    .send({ message: safe.message ?? "Interner Serverfehler" });
});
await app.listen({ port: Number(process.env.PORT ?? 4317), host: "0.0.0.0" });
