// Generate an isolated, reproducible static review. NEVER imports real SEED,
// authentication, API endpoint, service worker or version-update network code.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const out = path.join(root,'review-dist');
fs.mkdirSync(out,{recursive:true});
for(const folder of ['css','fonts','js']) fs.cpSync(path.join(root,folder),path.join(out,folder),{recursive:true});
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<head>','<head>\n<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; worker-src \'none\'; form-action \'none\'; object-src \'none\'">');
html=html.replace('<link rel="manifest" href="manifest.json">','');
html=html.replace('<script src="js/auth.js"></script>','<script src="demo.js"></script>');
for(const file of ['api','versionGuard']) html=html.replace(`<script src="js/${file}.js"></script>`,'');
html=html.replace('</head>','<link rel="stylesheet" href="demo.css">\n</head>');
let app = fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace(/const SEED = \[[\s\S]*?\n\];/,'const SEED = [];');
if(!app.includes('const SEED = [];')) throw new Error('SEED removal failed — aborting review build');
app=app.replace(/  if \('serviceWorker' in navigator\) \{[\s\S]*?\n  \}/,'');
fs.writeFileSync(path.join(out,'js/app.js'),app);
fs.writeFileSync(path.join(out,'js/home.js'),fs.readFileSync(path.join(root,'js/home.js'),'utf8').replace('פוזיציות live','מחירים פיקטיביים').replace('מתעדכן כל 15 שניות','מחירי הדגמה קבועים, לא נתוני שוק'));
// Do not leave unreferenced live API/auth files accessible in deployed assets.
for(const file of ['api','auth','versionGuard']) fs.unlinkSync(path.join(out,`js/${file}.js`));
fs.copyFileSync(path.join(root,'tools/demo-bridge.js'),path.join(out,'demo.js'));
fs.copyFileSync(path.join(root,'tools/demo.css'),path.join(out,'demo.css'));
fs.writeFileSync(path.join(out,'index.html'),html);
fs.copyFileSync(path.join(root,'tools/mobile-preview.html'),path.join(out,'mobile-preview.html'));
fs.copyFileSync(path.join(root,'tools/mobile-preview.css'),path.join(out,'mobile-preview.css'));
console.log('Isolated review generated; real API, auth, SEED, SW and version checks excluded.');
