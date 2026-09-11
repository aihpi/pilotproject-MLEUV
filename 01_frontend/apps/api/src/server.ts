import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import {
  draftSchema,
  emptySections,
  chatStages,
  nextChatStage,
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
  begruendung: string | null; konfidenz: number | null;
};

async function holeVorschlaege(
  sectionId: string,
  eingabe: string,
  felder: { id: string; label: string; kind: string; options?: { value: string; label: string }[] }[],
): Promise<DienstVorschlag[]> {
  // Zeitlimit: eine Anfrage dauert derzeit rund eine Minute (Suche, Satzfilter, Vorschlag —
  // drei Modellrunden). Ohne Limit hinge die Verbindung im Fehlerfall endlos.
  const abbruch = AbortSignal.timeout(180_000);
  const res = await fetch(`${VORSCHLAG_URL}/vorschlag`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ abschnitt_nr: Number(sectionId), eingabe, felder }),
    signal: abbruch,
  });
  if (!res.ok) throw new Error(`Vorschlagsdienst: HTTP ${res.status}`);
  const daten = (await res.json()) as { vorschlaege: DienstVorschlag[] };
  return daten.vorschlaege ?? [];
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
    const geliefert = await holeVorschlaege(
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
        evidence: v.belegzitat ?? v.deckung ?? v.begruendung ?? "",
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
