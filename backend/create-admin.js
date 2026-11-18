const {createInterface}=require('node:readline/promises');
const {stdin,stdout}=require('node:process');
const {createApp}=require('./app');
(async()=>{const prompt=createInterface({input:stdin,output:stdout});try{const email=(await prompt.question('Staff email: ')).trim();const password=await prompt.question('Staff password (10+ characters; visible while typing): ');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email.');const app=createApp({adminEmail:email,adminPassword:password});app.locals.db.close();console.log('Staff account ready. Sign in through the website.');}catch(e){console.error(e.message);process.exitCode=1;}finally{prompt.close();}})();
