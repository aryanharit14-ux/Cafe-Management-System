import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',port:5174,strictPort:true,proxy:{'/api':`http://127.0.0.1:${process.env.CAFE_API_PORT||5002}`,'/socket.io':{target:`http://127.0.0.1:${process.env.CAFE_API_PORT||5002}`,ws:true}}}});
