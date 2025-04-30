"use client"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { motion } from "framer-motion"
import Navbar from "./components/Navbar"
import Footer from "./components/Footer"
import PdfLibrary from "./pages/PdfLiberary"
import "./App.css"

const App = () => {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 to-purple-50">
        <Navbar />
        <motion.main
          className="flex-grow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Routes>
            <Route path="/" element={<PdfLibrary />} />
          </Routes>
        </motion.main>
        <Footer />
      </div>
    </Router>
  )
}

export default App

