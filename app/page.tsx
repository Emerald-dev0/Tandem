import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Strip } from "@/components/Strip";
import { Features } from "@/components/Features";
import { Steps } from "@/components/Steps";
import { CtaPanel } from "@/components/CtaPanel";
import { Footer } from "@/components/Footer";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function Page() {
  return (
    <>
      <Nav />
      <Hero />
      <Strip />
      <Features />
      <Steps />
      <CtaPanel />
      <Footer />
      <ScrollReveal />
    </>
  );
}
