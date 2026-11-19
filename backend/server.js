require('dotenv').config({path:require('node:path').join(__dirname,'.env'),quiet:true});
const {createServer}=require('node:http');
const {createApp}=require('./app');
const {attachRealtime}=require('./realtime');
async function start(){
  const app=await createApp();
  const server=createServer(app);
  const io=attachRealtime(server,app);
  server.on('error',async error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Stop the existing café server first.':'Could not start the café server.');await app.locals.db.close();process.exitCode=1;});
  server.listen(process.env.PORT||5002,'0.0.0.0',()=>console.log(`Juniper Coffee: http://localhost:${process.env.PORT||5002} • MongoDB Atlas • live updates`));
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;io.close(async()=>{await app.locals.db.close();process.exitCode=0;});};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
start().catch(error=>{console.error('Startup failed. Check MONGO_URI, database-user credentials, and Atlas Network Access. '+(error.code||''));process.exitCode=1;});
