import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Marquee } from "@/components/Marquee";
import { Features } from "@/components/Features";
import { Steps } from "@/components/Steps";
import { CtaPanel } from "@/components/CtaPanel";
import { Footer } from "@/components/Footer";
import { ScrollReveal } from "@/components/ScrollReveal";
import { CursorGlow } from "@/components/CursorGlow";

export default function Page() {
  return (
    <>
      <div className="aurora" aria-hidden="true">
        <i className="a1" />
        <i className="a2" />
        <i className="a3" />
      </div>
      <CursorGlow />
      <Nav />
      <Hero />
      <Marquee />
      <Features />
      <Steps />
      <CtaPanel />
      <Footer />
      <ScrollReveal />
    </>
  );
}
