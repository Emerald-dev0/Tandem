(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/ScrollReveal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ScrollReveal",
    ()=>ScrollReveal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
function ScrollReveal() {
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScrollReveal.useEffect": ()=>{
            const io = new IntersectionObserver({
                "ScrollReveal.useEffect": (entries)=>{
                    let i = 0;
                    for (const e of entries){
                        if (e.isIntersecting) {
                            e.target.style.transitionDelay = i++ * 90 + "ms";
                            e.target.classList.add("on");
                            io.unobserve(e.target);
                        }
                    }
                }
            }["ScrollReveal.useEffect"], {
                threshold: 0.12
            });
            document.querySelectorAll(".reveal").forEach({
                "ScrollReveal.useEffect": (el)=>io.observe(el)
            }["ScrollReveal.useEffect"]);
            return ({
                "ScrollReveal.useEffect": ()=>io.disconnect()
            })["ScrollReveal.useEffect"];
        }
    }["ScrollReveal.useEffect"], []);
    return null;
}
_s(ScrollReveal, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = ScrollReveal;
var _c;
__turbopack_context__.k.register(_c, "ScrollReveal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=components_ScrollReveal_tsx_1dgjr_l2k3ma6._.js.map