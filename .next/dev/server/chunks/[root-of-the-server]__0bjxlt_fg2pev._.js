module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/pages/api/index.js [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Tandem health check — GET /
 * Visit your Vercel URL in a browser to confirm the deployment is alive.
 */ __turbopack_context__.s([
    "default",
    ()=>handler
]);
function handler(req, res) {
    res.status(200).json({
        ok: true,
        service: "Tandem",
        tagline: "Your entire stack. One conversation.",
        status: "alive",
        docs: "Open Telegram and send /start to your bot."
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0bjxlt_fg2pev._.js.map