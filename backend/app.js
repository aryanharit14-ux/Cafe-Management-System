const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('./catalog');
const {validateCheckout, categories, stores} = require('./checkout');
const {installPayments} = require('./payments');
const statuses = ['Pending','Preparing','Ready','Completed','Cancelled'];
function createApp({ databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'data/juniper.sqlite'), adminEmail = process.env.ADMIN_EMAIL, adminPassword = process.env.ADMIN_PASSWORD, paymentConfig = {keyId:process.env.RAZORPAY_KEY_ID, keySecret:process.env.RAZORPAY_KEY_SECRET, webhookSecret:process.env.RAZORPAY_WEBHOOK_SECRET}, paymentGateway } = {}) {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), {recursive:true});
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer');
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS menu (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, image TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', available INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), items TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL, store TEXT NOT NULL, method TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL, request_key TEXT UNIQUE NOT NULL);`);
  // Add new fields without replacing existing accounts, orders or staff menu edits.
  const columns = db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name);
  for (const [name, type] of [['payment_method',"TEXT NOT NULL DEFAULT 'counter'"],['payment_status',"TEXT NOT NULL DEFAULT 'unpaid'"],['payment_id','TEXT']]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
  if (!db.prepare('SELECT name FROM migrations WHERE name=?').get('catalog-36-v1')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT OR IGNORE INTO menu (id,name,description,category,price,image,tag) VALUES (?,?,?,?,?,?,?)');
      catalog.forEach(p => insert.run(p.id,p.name,p.description,p.category,p.price,p.image,p.tag));
      db.prepare('INSERT INTO migrations VALUES (?)').run('catalog-36-v1');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must contain at least 10 characters');
    const email = adminEmail.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) db.prepare('UPDATE users SET role=?, password=? WHERE id=?').run('admin',bcrypt.hashSync(adminPassword,12),existing.id);
    else db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(randomUUID(),'Café manager',email,bcrypt.hashSync(adminPassword,12),'admin');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'64kb', verify:(req,res,buffer)=>{if(req.originalUrl.split('?')[0]==='/api/payments/razorpay/webhook')req.rawBody=buffer;}}));
  app.use((req,res,next) => { res.set('X-Content-Type-Options','nosniff'); res.set('Referrer-Policy','same-origin'); next(); });
  const fail = (res, code, message) => res.status(code).json({message});
  const publicUser = u => ({_id:u.id,name:u.name,email:u.email,role:u.role});
  const menuItem = p => ({...p,_id:p.id,isAvailable:!!p.available});
  const order = p => ({_id:p.id,orderItems:JSON.parse(p.items),totalAmount:p.total,status:p.status,store:p.store,method:p.method,notes:p.notes,createdAt:p.created_at,paymentMethod:p.payment_method,paymentStatus:p.payment_status,paymentId:p.payment_id,...(p.name ? {customer:p.name,email:p.email}: {})});
  const protect = (req,res,next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /,'');
    const user = db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token,Date.now());
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
  const session = user => {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token,user.id,Date.now()+7*86400000);
    return {...publicUser(user),token};
  };
  app.get('/api/health',(req,res) => res.json({status:'ok',database:'sqlite'}));
  app.get('/api/config',(req,res) => res.json({stores,categories}));
  app.post('/api/auth/register',authLimit,(req,res) => {
    const {name,email,password} = req.body;
    if (typeof name !== 'string' || name.trim().length<2 || name.length>80 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password !== 'string' || password.length<8 || password.length>72) return fail(res,400,'Enter a name, valid email and password of 8–72 characters.');
    const normalized = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email=?').get(normalized)) return fail(res,409,'An account already exists with this email.');
    const user = {id:randomUUID(),name:name.trim(),email:normalized,password:bcrypt.hashSync(password,12),role:'customer'};
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id,user.name,user.email,user.password,user.role);
    res.status(201).json(session(user));
  });
  app.post('/api/auth/login',authLimit,(req,res) => {
    const {email,password} = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length>72) return fail(res,400,'Enter your email and password.');
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password,user.password)) return fail(res,401,'Email or password is incorrect.');
    res.json(session(user));
  });
  app.get('/api/auth/profile',protect,(req,res) => res.json(publicUser(req.user)));
  app.post('/api/auth/logout',protect,(req,res) => { db.prepare('DELETE FROM sessions WHERE token=?').run(req.token); res.json({ok:true}); });
  app.get('/api/menu',(req,res) => res.json(db.prepare('SELECT * FROM menu ORDER BY rowid').all().map(menuItem)));
  const validateMenu = body => typeof body.name==='string' && body.name.trim().length>1 && body.name.length<=80 && typeof body.description==='string' && body.description.length<=500 && categories.includes(body.category) && Number.isInteger(body.price) && body.price>0 && body.price<=10000 && typeof body.image==='string' && /^\/images\/[a-z-]+\.jpg$/.test(body.image) && typeof body.isAvailable==='boolean';
  app.post('/api/menu',protect,admin,(req,res) => {
    if (!validateMenu(req.body)) return fail(res,400,'Check the menu fields. Price must be a whole rupee amount from 1 to 10,000.');
    const p=req.body,id=randomUUID();
    db.prepare('INSERT INTO menu (id,name,description,category,price,image,available) VALUES (?,?,?,?,?,?,?)').run(id,p.name.trim(),p.description,p.category,p.price,p.image,+p.isAvailable);
    res.status(201).json(menuItem(db.prepare('SELECT * FROM menu WHERE id=?').get(id)));
  });
  app.put('/api/menu/:id',protect,admin,(req,res) => {
    if (!validateMenu(req.body)) return fail(res,400,'Check the menu fields. Price must be a whole rupee amount from 1 to 10,000.');
    const p=req.body;
    const result=db.prepare('UPDATE menu SET name=?,description=?,category=?,price=?,image=?,available=? WHERE id=?').run(p.name.trim(),p.description,p.category,p.price,p.image,+p.isAvailable,req.params.id);
    if (!result.changes) return fail(res,404,'Menu item not found.');
    res.json(menuItem(db.prepare('SELECT * FROM menu WHERE id=?').get(req.params.id)));
  });
  app.delete('/api/menu/:id',protect,admin,(req,res) => {
    if (!db.prepare('DELETE FROM menu WHERE id=?').run(req.params.id).changes) return fail(res,404,'Menu item not found.');
    res.json({ok:true});
  });
  app.post('/api/orders',protect,(req,res) => {
    const {requestKey} = req.body;
    if (typeof requestKey !== 'string') return fail(res,400,'Invalid checkout request.');
    const previous=db.prepare('SELECT * FROM orders WHERE request_key=?').get(requestKey);
    if (previous) return previous.user_id===req.user.id ? res.json(order(previous)) : fail(res,409,'Please retry checkout.');
    const basket=validateCheckout(db,req.body);
    const id=randomUUID(),created=new Date().toISOString();
    db.prepare('INSERT INTO orders (id,user_id,items,total,status,store,method,notes,created_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,req.user.id,JSON.stringify(basket.items),basket.total,'Pending',basket.store,basket.method,basket.notes,created,requestKey);
    res.status(201).json(order(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
  });
  app.get('/api/orders/myorders',protect,(req,res) => res.json(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC').all(req.user.id).map(order)));
  app.get('/api/orders',protect,admin,(req,res) => res.json(db.prepare('SELECT orders.*,users.name,users.email FROM orders JOIN users ON users.id=orders.user_id ORDER BY created_at DESC').all().map(order)));
  app.put('/api/orders/:id/status',protect,admin,(req,res) => {
    const p=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!p) return fail(res,404,'Order not found.');
    const transitions={Pending:['Preparing','Cancelled'],Preparing:['Ready','Cancelled'],Ready:['Completed','Cancelled'],Completed:[],Cancelled:[]};
    if (!statuses.includes(req.body.status) || !transitions[p.status].includes(req.body.status)) return fail(res,400,'This status change is not allowed.');
    const paymentStatus=req.body.status==='Cancelled' && p.payment_status==='paid'?'refund_due':p.payment_status;
    db.prepare('UPDATE orders SET status=?,payment_status=? WHERE id=?').run(req.body.status,paymentStatus,p.id);
    res.json(order(db.prepare('SELECT * FROM orders WHERE id=?').get(p.id)));
  });
  installPayments({app,db,protect,serializeOrder:order,config:paymentConfig,gateway:paymentGateway});
  app.use('/api',(req,res)=>fail(res,404,'API route not found.'));
  const dist=path.join(__dirname,'../frontend/dist');
  app.use(express.static(dist));
  app.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));
  app.use((err,req,res,next)=> { if(!err.status || err.status>=500)console.error(err.message); fail(res,err.status || (err.type==='entity.parse.failed'?400:500),err.status ? err.message : err.type==='entity.parse.failed'?'Invalid JSON.':'Something went wrong. Please try again.'); });
  app.locals.db=db;
  return app;
}
module.exports={createApp};
