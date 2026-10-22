/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){
    return[
      {source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'SAMEORIGIN'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]},
      {source:'/sw.js',headers:[{key:'Cache-Control',value:'public, max-age=0, must-revalidate'},{key:'Service-Worker-Allowed',value:'/'}]}
    ];
  },
  async rewrites(){
    return[
      {source:'/api/:path*',destination:'http://127.0.0.1:3000/api/:path*'},
      {source:'/ws',destination:'http://127.0.0.1:3000/ws'}
    ];
  },
  env:{
    NEXT_PUBLIC_API_URL:process.env.NEXT_PUBLIC_API_URL||'',
    NEXT_PUBLIC_WS_URL:process.env.NEXT_PUBLIC_WS_URL||'',
    NEXT_PUBLIC_BOT_USERNAME:process.env.NEXT_PUBLIC_BOT_USERNAME||'commandor_dev_pack_bot'
  }
};
module.exports=nextConfig;
