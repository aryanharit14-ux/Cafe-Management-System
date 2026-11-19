const express = require('express');
const {randomUUID, randomBytes} = require('node:crypto');
const bcrypt = require('bcryptjs');
const path = require('node:path');
const {MongoDatabase} = require('./db/mongo');
const {initializeDatabase} = require('./db/schema');
const {validateCheckout, categories, stores} = require('./checkout');
const {installPayments} = require('./payments');
const statuses = ['Pending','Preparing','Ready','Completed','Cancelled'];
async function createApp({database, mongoUri=process.env.MONGO_URI, dbName=process.env.MONGO_DB_NAME, adminEmail=process.env.ADMIN_EMAIL, adminPassword=process.env.ADMIN_PASSWORD, paymentConfig={keyId:process.env.RAZORPAY_KEY_ID,keySecret:process.env.RAZORPAY_KEY_SECRET,webhookSecret:process.env.RAZORPAY_WEBHOOK_SECRET}, paymentGateway}={}) {
  const db=database || new MongoDatabase({uri:mongoUri,dbName});
  try {
  await initializeDatabase(db);
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must contain at least 10 characters');
    const email = adminEmail.trim().toLowerCase();
    const existing = (await db.one('users',{email}));
    if (existing) (await db.update('users',{id:existing.id},{$set:{role:'admin',password:bcrypt.hashSync(adminPassword,12)}}));
    else (await db.insert('users',{id:randomUUID(),name:'Café manager',email,password:bcrypt.hashSync(adminPassword,12),role:'admin'}));
  }
  } catch(error) {
    await db.close();
    throw error;
  }
  const app = express();
  app.locals.notifyOrder=()=>{};app.locals.notifyMenu=()=>{};app.locals.disconnectSession=()=>{};
  app.disable('x-powered-by');
  app.use(express.json({limit:'64kb', verify:(req,res,buffer)=>{if(req.originalUrl.split('?')[0]==='/api/payments/razorpay/webhook')req.rawBody=buffer;}}));
  app.use((req,res,next) => { res.set('X-Content-Type-Options','nosniff'); res.set('Referrer-Policy','same-origin'); next(); });
  const fail = (res, code, message) => res.status(code).json({message});
  const publicUser = u => ({_id:u.id,name:u.name,email:u.email,role:u.role});
  const menuItem = p => ({...p,_id:p.id,isAvailable:!!p.available});
  const order = p => ({_id:p.id,orderItems:p.items,totalAmount:p.total,status:p.status,store:p.store,method:p.method,notes:p.notes,createdAt:p.created_at,paymentMethod:p.payment_method,paymentStatus:p.payment_status,paymentId:p.payment_id,...(p.name ? {customer:p.name,email:p.email}: {})});
  const protect = async (req,res,next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /,'');
    const user = (await db.userForSession(token));
    if (!user) return fail(res,401,'Please sign in to continue.');
    req.user = user; req.token = token; next();
  };
  const admin = (req,res,next) => req.user.role === 'admin' ? next() : fail(res,403,'Staff access required.');
  const attempts = new Map();
  const authLimit = (req,res,next) => {
    const key = req.ip; const now = Date.now();
    if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
    let record = attempts.get(key);
    if (!record || record.until < now) { record = {count:0,until:now+600000}; attempts.set(key,record); }
    if (++record.count > 30) return fail(res,429,'Too many attempts. Please try again in 10 minutes.');
    next();
  };
  const session = async user => {
    const token = randomBytes(32).toString('hex');
    
    (await db.insert('sessions',{token,user_id:user.id,expires:Date.now()+7*86400000,expiresAt:new Date(Date.now()+7*86400000)}));
    return {...publicUser(user),token};
  };
  app.get('/api/health',async (req,res) => {await db.ping();res.json({status:'ok',database:'mongodb',realtime:!!app.locals.io});});
  app.get('/api/config',async (req,res) => res.json({stores,categories}));
  app.post('/api/auth/register',authLimit,async (req,res) => {
    const {name,email,password} = req.body;
    if (typeof name !== 'string' || name.trim().length<2 || name.length>80 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password !== 'string' || password.length<8 || password.length>72) return fail(res,400,'Enter a name, valid email and password of 8–72 characters.');
    const normalized = email.trim().toLowerCase();
    if ((await db.one('users',{email:normalized}))) return fail(res,409,'An account already exists with this email.');
    const user = {id:randomUUID(),name:name.trim(),email:normalized,password:bcrypt.hashSync(password,12),role:'customer'};
    try{await db.insert('users',user);}catch(e){if(e.code===11000)return fail(res,409,'An account already exists with this email.');throw e;}
    res.status(201).json(await session(user));
  });
  app.post('/api/auth/login',authLimit,async (req,res) => {
    const {email,password} = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length>72) return fail(res,400,'Enter your email and password.');
    const user = (await db.one('users',{email:email.trim().toLowerCase()}));
    if (!user || !bcrypt.compareSync(password,user.password)) return fail(res,401,'Email or password is incorrect.');
    res.json(await session(user));
  });
  app.get('/api/auth/profile',protect,async (req,res) => res.json(publicUser(req.user)));
  app.post('/api/auth/logout',protect,async (req,res) => { (await db.delete('sessions',{token:req.token})); app.locals.disconnectSession(req.token); res.json({ok:true}); });
  app.get('/api/menu',async (req,res) => res.json((await db.many('menu',{}, {sort_order:1,id:1})).map(menuItem)));
  const validateMenu = body => typeof body.name==='string' && body.name.trim().length>1 && body.name.length<=80 && typeof body.description==='string' && body.description.length<=500 && categories.includes(body.category) && Number.isInteger(body.price) && body.price>0 && body.price<=10000 && typeof body.image==='string' && /^\/images\/[a-z-]+\.jpg$/.test(body.image) && typeof body.isAvailable==='boolean';
  app.post('/api/menu',protect,admin,async (req,res) => {
    if (!validateMenu(req.body)) return fail(res,400,'Check the menu fields. Price must be a whole rupee amount from 1 to 10,000.');
    const p=req.body,id=randomUUID();
    (await db.insert('menu',{id,name:p.name.trim(),description:p.description,category:p.category,price:p.price,image:p.image,available:+p.isAvailable,tag:'',sort_order:Date.now()}));
    app.locals.notifyMenu();
    res.status(201).json(menuItem((await db.one('menu',{id}))));
  });
  app.put('/api/menu/:id',protect,admin,async (req,res) => {
    if (!validateMenu(req.body)) return fail(res,400,'Check the menu fields. Price must be a whole rupee amount from 1 to 10,000.');
    const p=req.body;
    const result=(await db.update('menu',{id:req.params.id},{$set:{name:p.name.trim(),description:p.description,category:p.category,price:p.price,image:p.image,available:+p.isAvailable}}));
    if (!result.matchedCount) return fail(res,404,'Menu item not found.');
    app.locals.notifyMenu();
    res.json(menuItem((await db.one('menu',{id:req.params.id}))));
  });
  app.delete('/api/menu/:id',protect,admin,async (req,res) => {
    if (!(await db.delete('menu',{id:req.params.id})).deletedCount) return fail(res,404,'Menu item not found.');
    app.locals.notifyMenu();
    res.json({ok:true});
  });
  app.post('/api/orders',protect,async (req,res) => {
    const {requestKey} = req.body;
    if (typeof requestKey !== 'string') return fail(res,400,'Invalid checkout request.');
    let saved=await db.one('orders',{request_key:requestKey}),created=false;
    if(!saved){
      const basket=await validateCheckout(db,req.body);
      const doc={id:randomUUID(),user_id:req.user.id,items:basket.items,total:basket.total,status:'Pending',store:basket.store,method:basket.method,notes:basket.notes,created_at:new Date().toISOString(),request_key:requestKey,payment_method:'counter',payment_status:'unpaid'};
      try{saved=await db.insert('orders',doc);created=true;}catch(e){if(e.code!==11000)throw e;saved=await db.one('orders',{request_key:requestKey});}
    }
    if(!saved||saved.user_id!==req.user.id)return fail(res,409,'Please retry checkout.');
    if(created)app.locals.notifyOrder(saved);
    res.status(created?201:200).json(order(saved));
  });
  app.get('/api/orders/myorders',protect,async (req,res) => res.json((await db.many('orders',{user_id:req.user.id},{created_at:-1})).map(order)));
  app.get('/api/orders',protect,admin,async (req,res) => {const rows=await db.many('orders',{}, {created_at:-1});const users=new Map((await db.many('users',{id:{$in:[...new Set(rows.map(o=>o.user_id))]}})).map(u=>[u.id,u]));res.json(rows.map(o=>order({...o,name:users.get(o.user_id)?.name,email:users.get(o.user_id)?.email})));});
  app.put('/api/orders/:id/status',protect,admin,async (req,res) => {
    const saved=await db.transaction(async()=>{
      const p=await db.one('orders',{id:req.params.id});
      if(!p)throw Object.assign(new Error('Order not found.'),{status:404});
      const transitions={Pending:['Preparing','Cancelled'],Preparing:['Ready','Cancelled'],Ready:['Completed','Cancelled'],Completed:[],Cancelled:[]};
      if(!statuses.includes(req.body.status)||!transitions[p.status].includes(req.body.status))throw Object.assign(new Error('This status change is not allowed.'),{status:400});
      const paymentStatus=req.body.status==='Cancelled'&&p.payment_status==='paid'?'refund_due':p.payment_status;
      await db.update('orders',{id:p.id},{$set:{status:req.body.status,payment_status:paymentStatus}});
      return db.one('orders',{id:p.id});
    });
    app.locals.notifyOrder(saved);
    res.json(order(saved));
  });
  installPayments({app,db,protect,serializeOrder:order,config:paymentConfig,gateway:paymentGateway});
  app.use('/api',async (req,res)=>fail(res,404,'API route not found.'));
  const dist=path.join(__dirname,'../frontend/dist');
  app.use(express.static(dist));
  app.get('/{*path}',async (req,res)=>res.sendFile(path.join(dist,'index.html')));
  app.use((err,req,res,next)=> { if(!err.status || err.status>=500)console.error('Request failed:',err.code||err.name); fail(res,err.status || (err.type==='entity.parse.failed'?400:500),err.status ? err.message : err.type==='entity.parse.failed'?'Invalid JSON.':'Something went wrong. Please try again.'); });
  app.locals.db=db;
  return app;
}
module.exports={createApp};
