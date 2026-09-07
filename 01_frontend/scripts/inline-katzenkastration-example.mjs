import {readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=join(root,"docs","beispiele","katzenkastration-qualitaetsstufen.html");
let html=readFileSync(target,"utf8");
const shared=await import(pathToFileURL(join(root,"packages","shared","dist","index.js")));
const schema=shared.sections.map(section=>({...section,fields:section.fields.map(({visible,...field})=>field)}));
const configs=[
  {level:1,name:"Frühe Förderidee",file:"katzenkastration-qualitaet-1-fruehe-idee.json",description:"Grobe Problembeschreibung, viele Annahmen und offene Grundsatzentscheidungen."},
  {level:2,name:"Fachliches Förderkonzept",file:"katzenkastration-qualitaet-2-fachkonzept.json",description:"Förderlogik und Verfahren sind erkennbar; Beträge, Fristen und Detailregeln werden abgestimmt."},
  {level:3,name:"Nahezu richtlinienreif",file:"katzenkastration-qualitaet-3-richtlinienreif.json",description:"Vollständige und präzise Angaben mit konkreten Beträgen, Fristen und Nachweispflichten."}
];
function migrateDataset(input){
  const data=structuredClone(input);
  const oldSections=data.sections??{};
  data.profile={...data.profile,stateAid:true};
  data.sections=Object.fromEntries(schema.map(section=>{
    const fields={};
    for(const field of section.fields){
      let previous=oldSections[section.id]?.fields?.[field.id];
      if(field.id==="earlyStart")previous??=oldSections["4"]?.fields?.earlyStart;
      if(!previous)continue;
      const migrated={...previous};
      if(field.id==="ancillary"&&Array.isArray(migrated.value))migrated.value=migrated.value[0]??"";
      if(field.id==="eligibleBasis"&&["expenses","costs","both"].includes(migrated.value))migrated.value=oldSections["5"]?.fields?.financingType?.value==="fixed"?"fixed":"actual";
      fields[field.id]=migrated;
    }
    return[section.id,{fields}];
  }));
  data.validation=shared.validateDraft(data);
  return data;
}
const datasets=configs.map(config=>({config,data:migrateDataset(JSON.parse(readFileSync(join(dirname(target),config.file),"utf8")))}));
const sectionTitles=Object.fromEntries(schema.map(section=>[section.id,section.title]));
const labels=Object.fromEntries(schema.flatMap(section=>section.fields.map(field=>[field.id,field.label])));
html=html.replace(/    const sectionTitles=.*?;\n/,`    const sectionTitles=${JSON.stringify(sectionTitles)};\n`);
html=html.replace(/    const labels=.*?;\n/,`    const labels=${JSON.stringify(labels)};\n`);
const embedded=`/*DATA_START*/\n    const embeddedDatasets=${JSON.stringify(datasets).replaceAll("</script","<\\/script")};\n    /*DATA_END*/`;
if(!/\/\*DATA_START\*\/[\s\S]*?\/\*DATA_END\*\//.test(html))throw new Error("Exportmarkierungen fehlen in der Beispieldatei.");
html=html.replace(/\/\*DATA_START\*\/[\s\S]*?\/\*DATA_END\*\//,embedded);
writeFileSync(target,html,"utf8");
console.log(`Katzenkastrations-Beispiel mit aktuellem Datenmodell erstellt: ${target}`);
