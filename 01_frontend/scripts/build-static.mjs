import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const command=process.platform==="win32"?(process.env.ComSpec??"cmd.exe"):"npm";
const args=process.platform==="win32"?["/d","/s","/c","npm run build -w @richtlinie/web"]:["run","build","-w","@richtlinie/web"];
execFileSync(command,args,{cwd:root,stdio:"inherit",env:{...process.env,VITE_STATIC:"true"}});
const dist=join(root,"apps","web","dist");
const assets=join(dist,"assets");
const cssFile=readdirSync(assets).find(name=>name.endsWith(".css"));
const jsFile=readdirSync(assets).find(name=>name.endsWith(".js"));
if(!cssFile||!jsFile)throw new Error("Build-Artefakte fehlen");
let css=readFileSync(join(assets,cssFile),"utf8");
css=css.replace(/url\(([^)]+\.woff2)\)/g,(_match,raw)=>{
  const name=raw.replace(/["']/g,"").split("/").pop();
  const data=readFileSync(join(assets,name)).toString("base64");
  return `url(data:font/woff2;base64,${data})`;
});
const js=readFileSync(join(assets,jsFile),"utf8").replaceAll("</script","<\\/script");
const html=`<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Offline-Richtliniengenerator"><title>Richtliniengenerator – Offline</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`;
const output=join(root,"offline");
mkdirSync(output,{recursive:true});
writeFileSync(join(output,"richtliniengenerator-offline.html"),html);
console.log(`\nOffline-Datei erstellt: ${join(output,"richtliniengenerator-offline.html")}`);
