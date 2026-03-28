import { Routes, Route } from 'react-router-dom'
import SetupScreen from './pages/SetupScreen.jsx'
import AIPreparationScreen from './pages/AIPreparationScreen.jsx'
import RoastLevelScreen from './pages/RoastLevelScreen.jsx'
import EnhancedDebateScreen from './pages/EnhancedDebateScreen.jsx'
import EnhancedSummaryScreen from './pages/EnhancedSummaryScreen.jsx'
import SpectateScreen from './pages/SpectateScreen.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupScreen />} />
      <Route path="/preparing/:roomId" element={<AIPreparationScreen />} />
      <Route path="/roast-level/:roomId" element={<RoastLevelScreen />} />
      <Route path="/debate/:roomId" element={<EnhancedDebateScreen />} />
      <Route path="/summary/:roomId" element={<EnhancedSummaryScreen />} />
      <Route path="/spectate/:roomId" element={<SpectateScreen />} />
    </Routes>
  )
}
