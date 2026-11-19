const catalog=require('../catalog');
async function initializeDatabase(db,{seed=true}={}) {
  await db.init();
  for(const name of ['users','sessions','menu','orders','payment_attempts','migrations']) {
    if(!await db.database.listCollections({name}).hasNext()) {
      try{await db.database.createCollection(name);}catch(e){if(e.code!==48)throw e;}
    }
  }
  await db.collection('users').createIndex({email:1},{unique:true});
  await db.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
  await db.collection('orders').createIndex({request_key:1},{unique:true});
  await db.collection('orders').createIndex({payment_id:1},{unique:true,partialFilterExpression:{payment_id:{$type:'string'}}});
  await db.collection('orders').createIndex({user_id:1,created_at:-1});
  await db.collection('payment_attempts').createIndex({request_key:1},{unique:true});
  await db.collection('payment_attempts').createIndex({gateway_order_id:1},{unique:true,partialFilterExpression:{gateway_order_id:{$type:'string'}}});
  await db.collection('payment_attempts').createIndex({user_id:1,created_at:-1});
  if(seed) {
    try{await db.transaction(async()=>{
      if(await db.one('migrations',{name:'catalog-36-v1'}))return;
      for(const [index,p] of catalog.entries()) await db.collection('menu').updateOne({_id:p.id},{$setOnInsert:{...p,available:1,sort_order:index}}, {...db.options(),upsert:true});
      await db.insert('migrations',{name:'catalog-36-v1'});
    });}catch(e){if(e.code!==11000 || !await db.one('migrations',{name:'catalog-36-v1'}))throw e;}
  }
}
module.exports={initializeDatabase};
