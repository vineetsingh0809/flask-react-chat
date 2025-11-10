import { BrowserRouter, Routes, Route } from "react-router-dom";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";

export default function App() {
  return (
    <BrowserRouter>
    <Routes>
      <Route path="/" element={<Auth/>}/>
      <Route path="/chat" element={<Chat/>}/>
    </Routes>
    </BrowserRouter>
  )
}
