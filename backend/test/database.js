const {MongoMemoryReplSet}=require('mongodb-memory-server');
const {MongoDatabase}=require('../db/mongo');
const {randomUUID}=require('node:crypto');
const {after}=require('node:test');
let running;
async function testDatabase(){
  running ||= MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'8.0.17'}});
  const repl=await running;
  return new MongoDatabase({uri:repl.getUri(),dbName:'juniper_test_'+randomUUID().replaceAll('-',''),allowLocal:true});
}
after(async()=>{if(running)await (await running).stop();});
module.exports={testDatabase};
