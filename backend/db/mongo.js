const {MongoClient}=require('mongodb');
const {AsyncLocalStorage}=require('node:async_hooks');
class MongoDatabase {
  constructor({uri=process.env.MONGO_URI,dbName=process.env.MONGO_DB_NAME,allowLocal=false}={}) {
    if(!uri || /[<>]/.test(uri))throw new Error('Set a complete MONGO_URI in backend/.env.');
    const parsed=new URL(uri);
    if(!allowLocal && !parsed.hostname.endsWith('.mongodb.net'))throw new Error('MONGO_URI must point to MongoDB Atlas.');
    this.name=dbName || decodeURIComponent(parsed.pathname.slice(1)) || 'juniper_cafe';
    if(!/^[a-zA-Z0-9_-]+$/.test(this.name)||['admin','local','config'].includes(this.name))throw new Error('Use a dedicated café database name.');
    this.client=new MongoClient(uri,{serverSelectionTimeoutMS:10000,maxPoolSize:10});
    this.context=new AsyncLocalStorage();
  }
  async init(){await this.client.connect();this.database=this.client.db(this.name);}
  collection(name){return this.database.collection(name);}
  options(){const session=this.context.getStore();return session?{session}:{};}
  one(name,filter){return this.collection(name).findOne(filter,this.options());}
  many(name,filter={},sort={}){return this.collection(name).find(filter,this.options()).sort(sort).toArray();}
  async insert(name,doc){const value={...doc,_id:doc.id||doc.token||doc.name};await this.collection(name).insertOne(value,this.options());return value;}
  update(name,filter,change){return this.collection(name).updateOne(filter,change,this.options());}
  delete(name,filter){return this.collection(name).deleteOne(filter,this.options());}
  count(name,filter={}){return this.collection(name).countDocuments(filter,this.options());}
  async userForSession(token){const s=await this.one('sessions',{token,expires:{$gt:Date.now()}});if(!s)return null;const u=await this.one('users',{id:s.user_id});return u?{...u,expires:s.expires}:null;}
  async transaction(fn){
    if(this.context.getStore())return fn();
    return this.client.withSession(session=>session.withTransaction(()=>this.context.run(session,fn),{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}));
  }
  async ping(){await this.database.command({ping:1});}
  async close(){await this.client.close();}
}
module.exports={MongoDatabase};
