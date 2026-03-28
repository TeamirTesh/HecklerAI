import { Routes, Route } from 'react-router-dom'
import SetupScreen from './pages/SetupScreen.jsx'
import DebateScreen from './pages/DebateScreen.jsx'
import SummaryScreen from './pages/SummaryScreen.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupScreen />} />
      <Route path="/debate/:roomId" element={<DebateScreen />} />
      <Route path="/summary/:roomId" element={<SummaryScreen />} />
    </Routes>
  )
}
