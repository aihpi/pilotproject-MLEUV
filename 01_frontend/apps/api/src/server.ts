import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import {
  abfrageartFuer,
  draftSchema,
  emptySections,
  chatStages,
  nextChatStage,
  pruefungenAnwenden,
  sections,
  validateDraft,
  type ChatReply,
  type FieldProposal,
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
  feld: string; label: string; wert: string | null; status: string | null;
  fundstelle: string | null; belegzitat: string | null; deckung: string | null;
  musterbaustein: string | null; begruendung: string | null; konfidenz: number | null;
};

async function holeVorschlaege(
  sectionId: string,
  eingabe: string,
  felder: { id: string; label: string; kind: string; options?: { value: string; label: string }[] }[],
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
    body: JSON.stringify({ abschnitt_nr: Number(sectionId), eingabe, felder, abfrageart }),
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

app.post("/api/drafts/:id/chat/messages", async (req): Promise<ChatReply> => {
  const d = get((req.params as { id: string }).id);
  const { message } = req.body as { message: string };
  if (!message?.trim())
    throw Object.assign(new Error("Bitte geben Sie eine Nachricht ein."), {
      statusCode: 400,
    });
  const stage = nextChatStage(d) ?? chatStages[0]!;
  const def = sections.find((s) => s.id === stage.sectionId)!;
  const targets = stage.fieldIds
    .map((id) => def.fields.find((f) => f.id === id)!)
    .filter(Boolean);

  let proposals: FieldProposal[] = [];
  let hinweis = "";
  try {
    const { vorschlaege: geliefert, vorbild } = await holeVorschlaege(
      stage.sectionId,
      message.trim(),
      targets.map((f) => ({
        id: f.id, label: f.label, kind: f.kind,
        options: f.options?.map((o) => ({ value: o.value, label: o.label })),
      })),
    );
    // „[Unklar]" ist eine Auskunft, kein Vorschlag: der Dienst sagt damit, dass die Angabe
    // das Feld nicht deckt. Ein solcher Wert gehört nicht in den Bestätigen-Dialog.
    proposals = geliefert
      .filter((v) => v.wert && v.status !== "unklar" && v.status !== "invalid")
      .map((v) => ({
        sectionId: stage.sectionId,
        fieldId: v.feld,
        label: v.label,
        value: String(v.wert),
        confidence: v.konfidenz ?? 0,
        evidence: v.begruendung ?? "",
        // Die Herkunft einzeln durchreichen statt in `evidence` zusammenzupressen: die
        // Oberfläche muss Deckung (aus der Eingabe) und Beleg (aus dem Regelwerk)
        // auseinanderhalten können, sonst sieht beides gleich aus.
        ...(v.deckung ? { deckung: v.deckung } : {}),
        ...(v.belegzitat ? { belegzitat: v.belegzitat } : {}),
        ...(v.fundstelle ? { fundstelle: v.fundstelle } : {}),
        ...(v.musterbaustein ? { musterbaustein: v.musterbaustein } : {}),
        // Nur wenn es auch eine Fundstelle gibt: ohne sie gibt es nichts zu kennzeichnen.
        ...(vorbild && v.fundstelle ? { vorbild: true } : {}),
      }));
    const offen = geliefert.filter((v) => v.status === "unklar").map((v) => v.label);
    if (offen.length)
      hinweis = ` Zu ${offen.join(" und ")} konnte aus Ihrer Angabe nichts abgeleitet werden.`;
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

  const nextIndex = Math.min(
    chatStages.indexOf(stage) + 1,
    chatStages.length - 1,
  );
  const next = chatStages[nextIndex];
  return {
    message:
      (proposals.length
        ? `Ich habe Ihre Angabe dem Abschnitt „${def.title}“ zugeordnet. Bitte prüfen Sie den Vorschlag, bevor er übernommen wird.`
        : `Aus Ihrer Angabe lässt sich für „${def.title}“ noch kein Vorschlag ableiten.`) +
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
      d.title = p.value;
    }
  }
  touch(d);
  return {
    draft: d,
    nextQuestion:
      nextChatStage(d)?.question ??
      "Die geführte Erhebung ist abgeschlossen. Prüfen Sie nun den strukturierten Entwurf.",
  };
});
app.post("/api/drafts/:id/extractions/:extractionId/reject", async () => ({
  ok: true,
}));
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
app.post("/api/drafts/:id/export", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  const children = [
    new Paragraph({ text: d.title, heading: HeadingLevel.TITLE }),
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

app.setErrorHandler((error, _req, reply) => {
  const safe = error as { statusCode?: number; message?: string };
  return reply
    .code(safe.statusCode ?? 500)
    .send({ message: safe.message ?? "Interner Serverfehler" });
});
await app.listen({ port: Number(process.env.PORT ?? 4317), host: "0.0.0.0" });
