import { GrainOverlay } from '../components/effects/GrainOverlay';
import { ScanlineOverlay } from '../components/effects/ScanlineOverlay';
import { NavBar } from '../components/layout/NavBar';
import { Footer } from '../components/layout/Footer';
import { HeroSection } from '../components/sections/HeroSection';
import { StatsBar } from '../components/sections/StatsBar';
import { MechanicsSection } from '../components/sections/MechanicsSection';
import { ProximitySection } from '../components/sections/ProximitySection';
import { Protocol25Section } from '../components/sections/Protocol25Section';
import { ArchitectureSection } from '../components/sections/ArchitectureSection';
import { DeploySection } from '../components/sections/DeploySection';

export default function Home() {
    return (
        <div className="relative min-h-screen bg-abyss text-smoke selection:bg-brass/30 selection:text-chalk">
            <GrainOverlay />
            <ScanlineOverlay />
            <NavBar />

            <main>
                <HeroSection />
                <StatsBar />
                <MechanicsSection />
                <ProximitySection />
                <Protocol25Section />
                <ArchitectureSection />
                <DeploySection />
            </main>

            <Footer />
        </div>
    );
}
