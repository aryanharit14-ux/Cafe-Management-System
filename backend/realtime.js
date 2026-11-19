const {Server}=require('socket.io');
const {createHash}=require('node:crypto');
const sessionRoom=token=>'session:'+createHash('sha256').update(token).digest('hex');
function attachRealtime(httpServer,app){
  const db=app.locals.db;
  const io=new Server(httpServer,{serveClient:false,maxHttpBufferSize:16000});
  io.use(async(socket,next)=>{
    try{
      const token=socket.handshake.auth?.token;
      if(!token){socket.data.guest=true;return next();}
      if(typeof token!=='string'||token.length>128)return next(new Error('Sign in to receive order updates.'));
      const session=await db.userForSession(token);
      if(!session)return next(new Error('Session expired. Please sign in again.'));
      socket.data.user=session;socket.data.sessionRoom=sessionRoom(token);
      next();
    }catch{next(new Error('Live updates are temporarily unavailable.'));}
  });
  io.on('connection',socket=>{
    const user=socket.data.user;
    if(!user)return;
    socket.join('user:'+user.id);
    socket.join(socket.data.sessionRoom);
    if(user.role==='admin')socket.join('staff');
    const timer=setTimeout(()=>socket.disconnect(true),Math.max(1,user.expires-Date.now()));
    timer.unref();socket.on('disconnect',()=>clearTimeout(timer));
    // Rooms are selected only on the server. Clients cannot subscribe to another user.
  });
  app.locals.io=io;
  app.locals.notifyOrder=order=>io.to('user:'+order.user_id).to('staff').emit('orders:changed',{orderId:order.id,status:order.status,paymentStatus:order.payment_status});
  app.locals.notifyMenu=()=>io.emit('menu:changed');
  app.locals.disconnectSession=token=>io.in(sessionRoom(token)).disconnectSockets(true);
  return io;
}
module.exports={attachRealtime};
