import { GameMachine } from '../../components/game/GameMachine';

export default function GamePage() {
    return (
        <div className="relative min-h-screen bg-abyss text-smoke selection:bg-brass/30 selection:text-chalk">
            <GameMachine />
        </div>
    );
}
