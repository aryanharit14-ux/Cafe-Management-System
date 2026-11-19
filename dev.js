require('./backend/node_modules/dotenv').config({path:require('node:path').join(__dirname,'backend/.env'),quiet:true});
process.env.CAFE_API_PORT=process.env.PORT||'5002';
const {spawn}=require('node:child_process');
const path=require('node:path');
const children=[spawn(process.execPath,['backend/server.js'],{cwd:__dirname,stdio:'inherit'}),spawn('npm',['run','dev'],{cwd:path.join(__dirname,'frontend'),stdio:'inherit'})];
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;children.forEach(p=>p.kill());process.exitCode=code;}
children.forEach(p=>p.on('exit',code=>stop(code||0)));process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
