import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import AdminSessionPage from './pages/AdminSessionPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/sessions/:sessionId" element={<AdminSessionPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
