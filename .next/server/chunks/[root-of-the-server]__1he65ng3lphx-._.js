module.exports=[96562,t=>t.a(async(e,a)=>{try{var s=await t.y("@neondatabase/serverless-e7acaa0c831d5378");t.n(s),a()}catch(t){a(t)}},!0),67619,t=>t.a(async(e,a)=>{try{var s=t.i(96562),i=e([s]);[s]=i.then?(await i)():i;class n{mode="memory";map=new Map;activity=[];async get(t){return this.map.get(t)??null}async set(t,e){this.map.set(t,e)}async del(t){this.map.delete(t)}async incr(t){let e=(Number(this.map.get(t))||0)+1;return this.map.set(t,String(e)),e}async list(t){return[...this.map.keys()].filter(e=>e.startsWith(t)).sort()}async insertActivity(t){this.activity.push(t),this.activity.length>2e3&&this.activity.splice(0,500)}async listActivity(t,e){return this.activity.filter(e=>e.userId===t).sort((t,e)=>t.createdAt<e.createdAt?1:-1).slice(0,e)}}class c{url;token;mode="redis";constructor(t,e){this.url=t,this.token=e}async cmd(...t){let e=await fetch(`${this.url}/${t.map(encodeURIComponent).join("/")}`,{method:"POST",headers:{Authorization:`Bearer ${this.token}`}});if(!e.ok)throw Error(`Upstash error ${e.status}: ${await e.text()}`);return e.json()}async get(t){let{result:e}=await this.cmd("get",t);return e??null}async set(t,e){await this.cmd("set",t,e)}async del(t){await this.cmd("del",t)}async incr(t){let{result:e}=await this.cmd("incr",t);return Number(e)}async list(t){let e=[],a="0";do{let{result:s}=await this.cmd("scan",a,"MATCH",`${t}*`,"COUNT","500"),[i,r]=s;a=i,e.push(...r)}while("0"!==a)return e.sort()}async insertActivity(t){let e=`tandem:activity:${t.userId}:${t.createdAt}:${Math.random().toString(36).slice(2,8)}`;await this.set(e,JSON.stringify(t))}async listActivity(t,e){let a=await this.list(`tandem:activity:${t}:`),s=[];for(let t of a.reverse().slice(0,e)){let e=await this.get(t);e&&s.push(JSON.parse(e))}return s}}class l{mode="postgres";sql;schemaReady=!1;constructor(t){this.sql=(0,s.neon)(t)}async ensureSchema(){this.schemaReady||(await this.sql`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,await this.sql`
      CREATE TABLE IF NOT EXISTS activity (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        provider TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,await this.sql`
      CREATE INDEX IF NOT EXISTS activity_user_idx
        ON activity (user_id, created_at DESC)`,this.schemaReady=!0)}async get(t){await this.ensureSchema();let e=await this.sql`SELECT value FROM kv WHERE key = ${t}`;return e.length?e[0].value??null:null}async set(t,e){await this.ensureSchema(),await this.sql`
      INSERT INTO kv (key, value) VALUES (${t}, ${e})
      ON CONFLICT (key) DO UPDATE SET value = ${e}, updated_at = now()`}async del(t){await this.ensureSchema(),await this.sql`DELETE FROM kv WHERE key = ${t}`}async incr(t){return await this.ensureSchema(),Number((await this.sql`
      INSERT INTO kv (key, value) VALUES (${t}, '1')
      ON CONFLICT (key) DO UPDATE
        SET value = (kv.value::bigint + 1)::text, updated_at = now()
      RETURNING value`)[0].value)}async list(t){return await this.ensureSchema(),(await this.sql`
      SELECT key FROM kv WHERE key LIKE ${`${t}%`} ORDER BY key LIMIT 1000`).map(t=>t.key)}async insertActivity(t){await this.ensureSchema(),await this.sql`
      INSERT INTO activity (user_id, provider, action, detail, created_at)
      VALUES (${t.userId}, ${t.provider}, ${t.action}, ${t.detail}, ${t.createdAt})`}async listActivity(t,e){return await this.ensureSchema(),(await this.sql`
      SELECT user_id, provider, action, detail, created_at
      FROM activity WHERE user_id = ${t}
      ORDER BY created_at DESC LIMIT ${e}`).map(t=>({userId:Number(t.user_id),provider:t.provider,action:t.action,detail:t.detail,createdAt:new Date(t.created_at).toISOString()}))}}let o=null;function r(){if(o)return o;let t=process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_URL_NON_POOLING,e=process.env.UPSTASH_REDIS_REST_URL,a=process.env.UPSTASH_REDIS_REST_TOKEN;return t?o=new l(t):e&&a?o=new c(e.replace(/\/$/,""),a):(console.warn("Tandem: no DATABASE_URL / POSTGRES_URL set — using in-memory storage. Data resets on every cold start. Connect Neon Postgres in Vercel → Storage (free, no card)."),o=new n),o}t.s(["getStorage",0,r,"storageMode",0,function(){return r().mode}]),a()}catch(t){a(t)}},!1)];

//# sourceMappingURL=%5Broot-of-the-server%5D__1he65ng3lphx-._.js.map