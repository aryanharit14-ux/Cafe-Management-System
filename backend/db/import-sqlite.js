const {DatabaseSync}=require('node:sqlite');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {MongoDatabase}=require('./mongo');
const {initializeDatabase}=require('./schema');
async function importSqlite(db,file){
  if(!existsSync(file))return {skipped:true,reason:'No legacy SQLite database found.'};
  await initializeDatabase(db,{seed:false});
  if(await db.one('migrations',{name:'sqlite-import-v1'}))return {skipped:true,reason:'Legacy import already completed.'};
  const source=new DatabaseSync(file,{readOnly:true});
  let rows={};
  try{
    for(const name of ['users','sessions','menu','orders','payment_attempts','migrations']) {
      rows[name]=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)?source.prepare(`SELECT * FROM ${name}`).all():[];
    }
  }finally{source.close();}
  return db.transaction(async()=>{
    for(const name of Object.keys(rows))if(await db.count(name))throw new Error('Atlas database is not empty. Import stopped without overwriting data.');
    for(const [name,docs] of Object.entries(rows)) {
      for(const [index,row] of docs.entries()) {
        const doc={...row};
        if(name==='menu')doc.sort_order??=index;
        if(name==='sessions')doc.expiresAt=new Date(doc.expires);
        if(name==='orders'){doc.items=JSON.parse(doc.items);doc.payment_method??='counter';doc.payment_status??='unpaid';}
        if(name==='payment_attempts')doc.checkout=JSON.parse(doc.checkout);
        await db.insert(name,doc);
      }
    }
    // Preserve intentionally deleted menu entries in an already-seeded legacy DB.
    await db.insert('migrations',{name:'sqlite-import-v1'});
    return Object.fromEntries(Object.entries(rows).map(([name,docs])=>[name,docs.length]));
  });
}
if(require.main===module){
  require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
  const db=new MongoDatabase();
  importSqlite(db,process.argv[2]||path.join(__dirname,'../data/juniper.sqlite'))
    .then(result=>console.log('Legacy import:',result))
    .catch(e=>{console.error(e.message.startsWith('Atlas database is not empty')?e.message:'Import failed. Check Atlas connection and legacy database; source file was not changed.');process.exitCode=1;})
    .finally(()=>db.close());
}
module.exports={importSqlite};
