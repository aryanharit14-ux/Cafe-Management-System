require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
const {createApp} = require('./app');
const port = process.env.PORT || 5001;
const app = createApp();
app.listen(port,'0.0.0.0',()=>console.log(`Juniper Coffee is ready at http://localhost:${port}`));
