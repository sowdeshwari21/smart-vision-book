"use client"

import { useState, useEffect, useRef } from "react"
import axios from "axios"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText,
  Upload,
  Play,
  Pause,
  StopCircle,
  ChevronLeft,
  ChevronRight,
  Mic,
  Volume2,
  Edit2,
  Trash2,
  ExternalLink,
  Headphones,
  Languages,
  FileSearch,
  Save,
  X,
  Maximize,
  Minimize,
  BookOpen,
  FileUp,
  AlertCircle,
  Loader,
  Sparkles,
} from "lucide-react"

// Import PDF.js from CDN
const pdfjsLib = window["pdfjs-dist/build/pdf"]
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js"

const PdfLibrary = () => {
  const [pdfs, setPdfs] = useState([])
  const [selectedPdf, setSelectedPdf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [voiceCommand, setVoiceCommand] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const canvasRef = useRef(null)
  const speechRef = useRef(null)
  const currentTextRef = useRef("")
  const currentPageRef = useRef(1)
  const [editingPdfId, setEditingPdfId] = useState(null)
  const [newPdfName, setNewPdfName] = useState("")
  const [translatedText, setTranslatedText] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summarizedText, setSummarizedText] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [uploadHover, setUploadHover] = useState(false)
  const [activeTab, setActiveTab] = useState("pdf")
  const fileInputRef = useRef(null)

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if ("speechSynthesis" in window) {
      speechRef.current = window.speechSynthesis

      // Function to load voices
      const loadVoices = () => {
        const availableVoices = speechRef.current.getVoices()
        setVoices(availableVoices)

        // Set default voice (preferably English)
        const defaultVoice =
          availableVoices.find(
            (voice) =>
              voice.lang.includes("en") &&
              (voice.name.includes("Google") || voice.name.includes("Natural") || voice.name.includes("Premium")),
          ) ||
          availableVoices.find((voice) => voice.lang.includes("en")) ||
          availableVoices[0]

        setSelectedVoice(defaultVoice)
      }

      // Load voices initially
      loadVoices()

      // Listen for voices changed event
      speechRef.current.onvoiceschanged = loadVoices
    } else {
      setError("Text-to-speech is not supported in your browser.")
    }

    return () => {
      if (speechRef.current) {
        speechRef.current.cancel()
      }
    }
  }, [])

  // Function to extract text from PDF page
  const extractTextFromPage = async (pdf, pageNum) => {
    try {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()

      // Process text items to create more natural sentences
      let lastY = null
      let text = ""
      let textChunk = ""

      // Group text items by their vertical position (y coordinate)
      textContent.items.forEach((item, index) => {
        const y = item.transform[5] // vertical position

        // If this is a new line
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          // End the previous line with proper punctuation if needed
          if (
            textChunk.length > 0 &&
            !textChunk.endsWith(".") &&
            !textChunk.endsWith("!") &&
            !textChunk.endsWith("?") &&
            !textChunk.endsWith(":") &&
            !textChunk.endsWith(";")
          ) {
            textChunk += ". "
          } else if (textChunk.length > 0) {
            textChunk += " "
          }

          text += textChunk
          textChunk = ""
        }

        // Add space between words on the same line if needed
        if (textChunk.length > 0 && !textChunk.endsWith(" ") && !item.str.startsWith(" ")) {
          textChunk += " "
        }

        textChunk += item.str
        lastY = y
      })

      // Add the last text chunk
      text += textChunk

      // Clean up common PDF extraction issues
      text = text
        .replace(/\s+/g, " ") // Replace multiple spaces with a single space
        .replace(/(\w)-\s+(\w)/g, "$1$2") // Remove hyphenation at end of lines
        .trim()

      return text
    } catch (err) {
      console.error("Error extracting text:", err)
      return ""
    }
  }

  // Function to read PDF text
  const readPDFText = async (startPage = 1) => {
    if (!selectedPdf || isPaused) return

    try {
      setIsReading(true)
      const loadingTask = pdfjsLib.getDocument(selectedPdf.path)
      const pdf = await loadingTask.promise

      for (let pageNum = startPage; pageNum <= pdf.numPages; pageNum++) {
        if (isPaused) break

        currentPageRef.current = pageNum
        setCurrentPage(pageNum)

        const text = await extractTextFromPage(pdf, pageNum)
        if (!text) continue // Skip empty pages

        currentTextRef.current = text
        console.log("Reading text:", text) // Debug log

        // If we have a current language, translate the text
        let textToRead = text
        if (currentLanguage) {
          try {
            const response = await axios.post(`http://localhost:5000/pdf/translate/${selectedPdf._id}`, {
              targetLang: languageMap[currentLanguage] || currentLanguage,
              text: text, // Send the specific page text for translation
            })

            if (response.data.translatedText) {
              textToRead = response.data.translatedText
            }
          } catch (err) {
            console.error("Translation error:", err)
          }
        }

        // Use ResponsiveVoice for speech synthesis
        if (window.responsiveVoice) {
          const voiceMap = {
            ta: "Tamil Female", // Tamil
            hi: "Hindi Female", // Hindi
            te: "Telugu Female", // Telugu
            ml: "Malayalam Female", // Malayalam
            kn: "Kannada Female", // Kannada
            bn: "Bengali Female", // Bengali
            gu: "Gujarati Female", // Gujarati
            mr: "Marathi Female", // Marathi
            pa: "Punjabi Female", // Punjabi
            ur: "Urdu Female", // Urdu
            ar: "Arabic Female", // Arabic
            fr: "French Female", // French
            de: "German Female", // German
            es: "Spanish Female", // Spanish
            it: "Italian Female", // Italian
            pt: "Portuguese Female", // Portuguese
            ru: "Russian Female", // Russian
            ja: "Japanese Female", // Japanese
            ko: "Korean Female", // Korean
            zh: "Chinese Female", // Chinese
          }

          const voice = currentLanguage
            ? voiceMap[languageMap[currentLanguage] || currentLanguage] || "Tamil Female"
            : "English Female"

          // Create a promise to handle the speech completion
          await new Promise((resolve, reject) => {
            window.responsiveVoice.speak(textToRead, voice, {
              rate: 0.9,
              pitch: 1.0,
              volume: 1.0,
              onend: resolve,
            })
          })
        } else {
          // Fallback to browser's speech synthesis
          const utterance = new SpeechSynthesisUtterance(textToRead)
          if (selectedVoice) {
            utterance.voice = selectedVoice
          }
          utterance.rate = 0.9
          utterance.pitch = 1.0
          utterance.volume = 1.0

          await new Promise((resolve, reject) => {
            utterance.onend = resolve
            utterance.onerror = reject
            speechRef.current.speak(utterance)
          })
        }

        // Only continue to next page if not paused
        if (!isPaused && pageNum < pdf.numPages) {
          await new Promise((resolve) => setTimeout(resolve, 500)) // Small delay between pages
        }
      }
    } catch (err) {
      console.error("Error reading PDF:", err)
      setError("Failed to read PDF")
    } finally {
      setIsReading(false)
      setIsPaused(false)
    }
  }

  // Function to stop reading
  const stopReading = () => {
    // Stop browser's speech synthesis
    if (speechRef.current) {
      speechRef.current.cancel()
      speechRef.current.pause()
    }

    // Stop ResponsiveVoice
    if (window.responsiveVoice) {
      window.responsiveVoice.cancel()
    }

    // Reset all reading states
    setIsReading(false)
    setIsPaused(false)
    currentPageRef.current = 1
    currentTextRef.current = ""
  }

  // Function to pause/resume reading
  const togglePause = () => {
    if (isPaused) {
      setIsPaused(false)
      readPDFText(currentPageRef.current)
    } else {
      setIsPaused(true)
      speechRef.current.pause()
    }
  }

  // Function to read specific page
  const readSpecificPage = async (pageNum) => {
    if (!selectedPdf) return

    stopReading()
    setIsReading(true)
    setIsPaused(false)
    await readPDFText(pageNum)
  }

  // Add language mapping
  const languageMap = {
    english: "en",
    tamil: "ta",
    hindi: "hi",
    telugu: "te",
    malayalam: "ml",
    kannada: "kn",
    bengali: "bn",
    gujarati: "gu",
    marathi: "mr",
    punjabi: "pa",
    urdu: "ur",
    arabic: "ar",
    french: "fr",
    german: "de",
    spanish: "es",
    italian: "it",
    portuguese: "pt",
    russian: "ru",
    japanese: "ja",
    korean: "ko",
    chinese: "zh",
  }

  // Function to handle translation
  const handleTranslation = async (targetLang) => {
    if (!selectedPdf) {
      setError("Please select a PDF first")
      return
    }

    try {
      setIsTranslating(true)
      setError(null)

      const response = await axios.post(`http://localhost:5000/pdf/translate/${selectedPdf._id}`, {
        targetLang: languageMap[targetLang] || targetLang,
      })

      if (response.data.error) {
        setError(response.data.error)
        return
      }

      const translatedText = response.data.translatedText
      if (!translatedText) {
        setError("No text was translated")
        return
      }

      console.log("Translated text:", translatedText) // Debug log
      setTranslatedText(translatedText)

      // Set the current language
      setCurrentLanguage(targetLang)

      // Stop any ongoing speech
      speechRef.current.cancel()
      if (window.responsiveVoice) {
        window.responsiveVoice.cancel()
      }

      // Get the target language code
      const targetLangCode = languageMap[targetLang] || targetLang

      // Use ResponsiveVoice for speech synthesis
      if (window.responsiveVoice) {
        const voiceMap = {
          ta: "Tamil Female", // Tamil
          hi: "Hindi Female", // Hindi
          te: "Telugu Female", // Telugu
          ml: "Malayalam Female", // Malayalam
          kn: "Kannada Female", // Kannada
          bn: "Bengali Female", // Bengali
          gu: "Gujarati Female", // Gujarati
          mr: "Marathi Female", // Marathi
          pa: "Punjabi Female", // Punjabi
          ur: "Urdu Female", // Urdu
          ar: "Arabic Female", // Arabic
          fr: "French Female", // French
          de: "German Female", // German
          es: "Spanish Female", // Spanish
          it: "Italian Female", // Italian
          pt: "Portuguese Female", // Portuguese
          ru: "Russian Female", // Russian
          ja: "Japanese Female", // Japanese
          ko: "Korean Female", // Korean
          zh: "Chinese Female", // Chinese
        }

        const voice = voiceMap[targetLangCode] || "Tamil Female"
        console.log("Using ResponsiveVoice:", voice)

        window.responsiveVoice.speak(translatedText, voice, {
          rate: 0.9,
          pitch: 1.0,
          volume: 1.0,
          onend: () => {
            console.log("Finished speaking")
          },
        })
      } else {
        console.error("ResponsiveVoice not loaded")
        setError("Speech synthesis not available")
      }
    } catch (err) {
      console.error("Translation error:", err)
      setError(err.response?.data?.error || "Failed to translate text. Please try again.")
    } finally {
      setIsTranslating(false)
    }
  }

  // Update handleVoiceCommand function
  const handleVoiceCommand = async (command) => {
    // Remove trailing period from the command and convert to lowercase
    const lowerCommand = command.toLowerCase().replace(/\.$/, "")
    console.log("Voice command received:", lowerCommand) // Debug log

    if (lowerCommand.startsWith("open")) {
      const pdfName = lowerCommand.replace("open", "").trim()
      try {
        const response = await axios.get(`http://localhost:5000/pdf/search/${encodeURIComponent(pdfName)}`)
        if (response.data && response.data.length > 0) {
          const pdf = response.data[0]
          handleOpenPDF(pdf)
        } else {
          setError(`No PDF found with name: ${pdfName}`)
        }
      } catch (err) {
        setError("Failed to search for PDF")
        console.error("Search error:", err)
      }
    } else if (lowerCommand === "start reading") {
      if (!selectedPdf) {
        setError("Please select a PDF first")
        return
      }
      stopReading() // Stop any ongoing speech
      setIsReading(true)
      setIsPaused(false)
      readPDFText(currentPage)
    } else if (lowerCommand === "pause" || lowerCommand === "resume") {
      togglePause()
    } else if (lowerCommand === "stop reading") {
      stopReading()
    } else if (lowerCommand.startsWith("read page")) {
      const pageNum = Number.parseInt(lowerCommand.replace("read page", "").trim())
      if (!isNaN(pageNum) && pageNum > 0 && pageNum <= numPages) {
        readSpecificPage(pageNum)
      } else {
        setError(`Invalid page number. Please specify a number between 1 and ${numPages}`)
      }
    } else if (lowerCommand.startsWith("read in")) {
      const language = lowerCommand.replace("read in", "").trim()
      if (languageMap[language] || language.length === 2) {
        stopReading() // Stop any ongoing speech
        await handleTranslation(language)
      } else {
        setError(`Unsupported language: ${language}`)
      }
    } else if (lowerCommand === "summarize" || "summarise" || "summa") {
      if (!selectedPdf) {
        setError("Please select a PDF first")
        return
      }

      try {
        setIsSummarizing(true)
        setError(null)

        // Get the text to summarize (either translated text or current page text)
        const textToSummarize = translatedText || currentTextRef.current

        if (!textToSummarize) {
          setError("No text available to summarize")
          return
        }

        // Call the summarization endpoint
        const response = await axios.post("http://localhost:5000/pdf/summarize", {
          text: textToSummarize,
        })

        if (response.data.error) {
          setError(response.data.error)
          return
        }

        const summary = response.data.summary
        setSummarizedText(summary)

        // Stop any ongoing speech
        speechRef.current.cancel()
        if (window.responsiveVoice) {
          window.responsiveVoice.cancel()
        }

        // Use the current language for speech synthesis
        if (window.responsiveVoice) {
          const voiceMap = {
            ta: "Tamil Female", // Tamil
            hi: "Hindi Female", // Hindi
            te: "Telugu Female", // Telugu
            ml: "Malayalam Female", // Malayalam
            kn: "Kannada Female", // Kannada
            bn: "Bengali Female", // Bengali
            gu: "Gujarati Female", // Gujarati
            mr: "Marathi Female", // Marathi
            pa: "Punjabi Female", // Punjabi
            ur: "Urdu Female", // Urdu
            ar: "Arabic Female", // Arabic
            fr: "French Female", // French
            de: "German Female", // German
            es: "Spanish Female", // Spanish
            it: "Italian Female", // Italian
            pt: "Portuguese Female", // Portuguese
            ru: "Russian Female", // Russian
            ja: "Japanese Female", // Japanese
            ko: "Korean Female", // Korean
            zh: "Chinese Female", // Chinese
          }

          const voice = currentLanguage
            ? voiceMap[languageMap[currentLanguage] || currentLanguage] || "Tamil Female"
            : "English Female"

          // Create a promise to handle the speech completion
          await new Promise((resolve, reject) => {
            window.responsiveVoice.speak(summary, voice, {
              rate: 0.9,
              pitch: 1.0,
              volume: 1.0,
              onend: resolve,
            })
          })
        } else {
          // Fallback to browser's speech synthesis
          const utterance = new SpeechSynthesisUtterance(summary)
          if (selectedVoice) {
            utterance.voice = selectedVoice
          }
          utterance.rate = 0.9
          utterance.pitch = 1.0
          utterance.volume = 1.0

          await new Promise((resolve, reject) => {
            utterance.onend = resolve
            utterance.onerror = reject
            speechRef.current.speak(utterance)
          })
        }
      } catch (err) {
        console.error("Summarization error:", err)
        setError(err.response?.data?.error || "Failed to summarize text. Please try again.")
      } finally {
        setIsSummarizing(false)
      }
    }
  }

  // Add function to fetch all PDFs
  const fetchAllPDFs = async () => {
    try {
      setLoading(true)
      const response = await axios.get("http://localhost:5000/pdf/all")
      setPdfs(response.data)
    } catch (err) {
      setError("Failed to fetch PDFs")
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch PDFs when component mounts
  useEffect(() => {
    fetchAllPDFs()
  }, [])

  // Function to render PDF in canvas
  const renderPDF = async (pdfUrl) => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl)
      const pdf = await loadingTask.promise
      setNumPages(pdf.numPages)

      const page = await pdf.getPage(currentPage)
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      const viewport = page.getViewport({ scale: 1.5 })
      canvas.height = viewport.height
      canvas.width = viewport.width

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }

      await page.render(renderContext)
    } catch (err) {
      console.error("Error rendering PDF:", err)
      setError("Failed to render PDF")
    }
  }

  // Add useEffect to handle PDF rendering when selectedPdf changes
  useEffect(() => {
    if (selectedPdf) {
      renderPDF(selectedPdf.path)
    }
  }, [selectedPdf])

  // Add a separate useEffect for page changes
  useEffect(() => {
    if (selectedPdf && currentPage) {
      renderPDF(selectedPdf.path)
    }
  }, [currentPage])

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (file && file.type === "application/pdf") {
      try {
        setLoading(true)
        setError(null)

        const formData = new FormData()
        formData.append("pdf", file)

        const response = await axios.post("http://localhost:5000/pdf/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })

        // After successful upload, fetch all PDFs again
        await fetchAllPDFs()
      } catch (err) {
        setError("Failed to upload PDF. Please try again.")
        console.error("Upload error:", err)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleOpenPDF = (pdf) => {
    setSelectedPdf(pdf)
    setCurrentPage(1)
    // Render PDF immediately when opened
    renderPDF(pdf.path)
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  // Voice Command Functions
  const startVoiceRecognition = () => {
    if ("webkitSpeechRecognition" in window) {
      const recognition = new window.webkitSpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setVoiceCommand("")
      }

      recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase().replace(/\.$/, "")
        setVoiceCommand(command)
        handleVoiceCommand(command)
      }

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error)
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } else {
      setError("Speech recognition is not supported in your browser.")
    }
  }

  // Function to handle PDF deletion
  const handleDeletePDF = async (pdfId) => {
    if (window.confirm("Are you sure you want to delete this PDF?")) {
      try {
        await axios.delete(`http://localhost:5000/pdf/delete/${pdfId}`)
        // Refresh the PDF list
        await fetchAllPDFs()
        // If the deleted PDF was selected, clear the selection
        if (selectedPdf && selectedPdf._id === pdfId) {
          setSelectedPdf(null)
        }
      } catch (err) {
        setError("Failed to delete PDF")
        console.error("Delete error:", err)
      }
    }
  }

  // Function to handle PDF name update
  const handleUpdatePDFName = async (pdfId) => {
    if (!newPdfName.trim()) {
      setError("Please enter a valid name")
      return
    }

    try {
      const response = await axios.put(`http://localhost:5000/pdf/update/${pdfId}`, {
        originalName: newPdfName,
      })

      // Update the PDF in the list
      setPdfs(pdfs.map((pdf) => (pdf._id === pdfId ? { ...pdf, originalName: newPdfName } : pdf)))

      // If the updated PDF was selected, update the selection
      if (selectedPdf && selectedPdf._id === pdfId) {
        setSelectedPdf({ ...selectedPdf, originalName: newPdfName })
      }

      setEditingPdfId(null)
      setNewPdfName("")
    } catch (err) {
      setError("Failed to update PDF name")
      console.error("Update error:", err)
    }
  }

  // Function to start editing PDF name
  const startEditingPDF = (pdf) => {
    setEditingPdfId(pdf._id)
    setNewPdfName(pdf.originalName)
  }

  // Function to cancel editing
  const cancelEditing = () => {
    setEditingPdfId(null)
    setNewPdfName("")
  }

  // Function to handle summarization
  const handleSummarize = async () => {
    if (!selectedPdf) {
      setError("Please select a PDF first")
      return
    }

    try {
      setIsSummarizing(true)
      setError(null)

      // Get the text to summarize (either translated text or current page text)
      const textToSummarize = translatedText || currentTextRef.current

      if (!textToSummarize) {
        setError("No text available to summarize")
        return
      }

      // Call the summarization endpoint
      const response = await axios.post("http://localhost:5000/pdf/summarize", {
        text: textToSummarize,
      })

      if (response.data.error) {
        setError(response.data.error)
        return
      }

      const summary = response.data.summary
      setSummarizedText(summary)

      // Stop any ongoing speech
      speechRef.current.cancel()
      if (window.responsiveVoice) {
        window.responsiveVoice.cancel()
      }

      // Use the current language for speech synthesis
      if (window.responsiveVoice) {
        const voiceMap = {
          ta: "Tamil Female", // Tamil
          hi: "Hindi Female", // Hindi
          te: "Telugu Female", // Telugu
          ml: "Malayalam Female", // Malayalam
          kn: "Kannada Female", // Kannada
          bn: "Bengali Female", // Bengali
          gu: "Gujarati Female", // Gujarati
          mr: "Marathi Female", // Marathi
          pa: "Punjabi Female", // Punjabi
          ur: "Urdu Female", // Urdu
          ar: "Arabic Female", // Arabic
          fr: "French Female", // French
          de: "German Female", // German
          es: "Spanish Female", // Spanish
          it: "Italian Female", // Italian
          pt: "Portuguese Female", // Portuguese
          ru: "Russian Female", // Russian
          ja: "Japanese Female", // Japanese
          ko: "Korean Female", // Korean
          zh: "Chinese Female", // Chinese
        }

        const voice = currentLanguage
          ? voiceMap[languageMap[currentLanguage] || currentLanguage] || "Tamil Female"
          : "English Female"

        // Create a promise to handle the speech completion
        await new Promise((resolve, reject) => {
          window.responsiveVoice.speak(summary, voice, {
            rate: 0.9,
            pitch: 1.0,
            volume: 1.0,
            onend: resolve,
          })
        })
      } else {
        // Fallback to browser's speech synthesis
        const utterance = new SpeechSynthesisUtterance(summary)
        if (selectedVoice) {
          utterance.voice = selectedVoice
        }
        utterance.rate = 0.9
        utterance.pitch = 1.0
        utterance.volume = 1.0

        await new Promise((resolve, reject) => {
          utterance.onend = resolve
          utterance.onerror = reject
          speechRef.current.speak(utterance)
        })
      }
    } catch (err) {
      console.error("Summarization error:", err)
      setError(err.response?.data?.error || "Failed to summarize text. Please try again.")
    } finally {
      setIsSummarizing(false)
    }
  }

  // Toggle fullscreen for PDF viewer
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current.click()
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="max-w-7xl mx-auto">
        {/* Header with animated title */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            PDF Voice Commander
          </h1>
          <p className="mt-2 text-gray-600">Transform your PDFs into voice with advanced AI capabilities</p>
        </motion.div>

        {/* Main Content Area */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Sidebar - Controls and Status */}
          <motion.div
            className="lg:w-1/4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Upload Section */}
            <motion.div
              className="mb-6 bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300"
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Upload PDF</h3>
                <FileUp size={20} className="text-purple-600" />
              </div>

              <motion.div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-300 ${
                  uploadHover ? "border-purple-500 bg-purple-50" : "border-gray-300"
                }`}
                onHoverStart={() => setUploadHover(true)}
                onHoverEnd={() => setUploadHover(false)}
                onClick={triggerFileUpload}
                whileTap={{ scale: 0.98 }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="hidden"
                />
                <Upload size={32} className={`mx-auto mb-2 ${uploadHover ? "text-purple-600" : "text-gray-400"}`} />
                <p className="text-sm text-gray-600">
                  {uploadHover ? "Click to select a PDF file" : "Drag & drop or click to upload"}
                </p>
              </motion.div>

              {loading && (
                <div className="mt-4 flex items-center justify-center text-purple-600">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  >
                    <Loader size={20} />
                  </motion.div>
                  <span className="ml-2">Uploading...</span>
                </div>
              )}
            </motion.div>

            {/* Voice Command Section */}
            <motion.div
              className="mb-6 bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300"
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Voice Commands</h3>
                <Headphones size={20} className="text-purple-600" />
              </div>

              <motion.button
                onClick={startVoiceRecognition}
                disabled={isListening}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white transition-colors duration-300 ${
                  isListening
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  animate={
                    isListening
                      ? {
                          scale: [1, 1.2, 1],
                        }
                      : {}
                  }
                  transition={{
                    duration: 1,
                    repeat: isListening ? Number.POSITIVE_INFINITY : 0,
                    repeatType: "loop",
                  }}
                >
                  <Mic size={20} />
                </motion.div>
                <span>{isListening ? "Listening..." : "Start Voice Command"}</span>
              </motion.button>

              {voiceCommand && (
                <motion.div
                  className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-purple-700">Command:</span> {voiceCommand}
                  </p>
                </motion.div>
              )}

              <div className="mt-4">
                <p className="text-xs text-gray-500 font-medium">Available Commands:</p>
                <ul className="mt-2 text-xs text-gray-600 space-y-1">
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Open [PDF name]"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Start reading"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Pause" / "Resume"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Stop reading"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Read page [number]"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Read in [language]"
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="text-purple-600">•</span> "Summarize"
                  </li>
                </ul>
              </div>
            </motion.div>

            {/* Status Section */}
            {(isReading || isTranslating || isSummarizing || error) && (
              <motion.div
                className="mb-6 bg-white p-6 rounded-xl shadow-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Status</h3>

                {isReading && (
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg flex items-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Number.POSITIVE_INFINITY,
                        repeatType: "loop",
                      }}
                      className="mr-2 text-blue-600"
                    >
                      <Volume2 size={18} />
                    </motion.div>
                    <div>
                      <p className="text-sm text-blue-700 font-medium">
                        Reading Page {currentPage} of {numPages}
                      </p>
                      {isPaused && <p className="text-xs text-yellow-600">Paused</p>}
                    </div>
                  </div>
                )}

                {isTranslating && (
                  <div className="mb-3 p-3 bg-indigo-50 rounded-lg flex items-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      className="mr-2 text-indigo-600"
                    >
                      <Languages size={18} />
                    </motion.div>
                    <p className="text-sm text-indigo-700 font-medium">Translating content...</p>
                  </div>
                )}

                {isSummarizing && (
                  <div className="mb-3 p-3 bg-green-50 rounded-lg flex items-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      className="mr-2 text-green-600"
                    >
                      <FileSearch size={18} />
                    </motion.div>
                    <p className="text-sm text-green-700 font-medium">Summarizing content...</p>
                  </div>
                )}

                {error && (
                  <motion.div
                    className="p-3 bg-red-50 rounded-lg flex items-start"
                    initial={{ x: -10 }}
                    animate={{ x: 0 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <AlertCircle size={18} className="mr-2 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-700 font-medium">Error</p>
                      <p className="text-xs text-red-600">{error}</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Main Content Area */}
          <motion.div
            className="lg:w-3/4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {/* Tabs for PDF Library and Viewer */}
            <div className="bg-white rounded-t-xl shadow-sm p-2">
              <div className="flex border-b">
                <motion.button
                  className={`flex items-center px-4 py-2 text-sm font-medium rounded-t-lg ${
                    activeTab === "pdf"
                      ? "text-purple-600 border-b-2 border-purple-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setActiveTab("pdf")}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <FileText size={16} className="mr-2" />
                  PDF Library
                </motion.button>

                {selectedPdf && (
                  <motion.button
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-t-lg ${
                      activeTab === "viewer"
                        ? "text-purple-600 border-b-2 border-purple-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setActiveTab("viewer")}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <BookOpen size={16} className="mr-2" />
                    PDF Viewer
                  </motion.button>
                )}

                {translatedText && (
                  <motion.button
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-t-lg ${
                      activeTab === "translation"
                        ? "text-purple-600 border-b-2 border-purple-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setActiveTab("translation")}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <Languages size={16} className="mr-2" />
                    Translation
                  </motion.button>
                )}

                {summarizedText && (
                  <motion.button
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-t-lg ${
                      activeTab === "summary"
                        ? "text-purple-600 border-b-2 border-purple-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setActiveTab("summary")}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <FileSearch size={16} className="mr-2" />
                    Summary
                  </motion.button>
                )}
              </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-xl shadow-sm p-6">
              {/* PDF Library Tab */}
              {activeTab === "pdf" && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Your PDF Collection</h2>
                    {selectedPdf && (
                      <div className="flex gap-2">
                        <motion.button
                          onClick={() => (isReading ? stopReading() : readPDFText(currentPage))}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                            isReading ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                          }`}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {isReading ? (
                            <>
                              <StopCircle size={18} />
                              <span>Stop Reading</span>
                            </>
                          ) : (
                            <>
                              <Play size={18} />
                              <span>Start Reading</span>
                            </>
                          )}
                        </motion.button>

                        {isReading && (
                          <motion.button
                            onClick={togglePause}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                              isPaused ? "bg-green-500 hover:bg-green-600" : "bg-yellow-500 hover:bg-yellow-600"
                            }`}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {isPaused ? (
                              <>
                                <Play size={18} />
                                <span>Resume</span>
                              </>
                            ) : (
                              <>
                                <Pause size={18} />
                                <span>Pause</span>
                              </>
                            )}
                          </motion.button>
                        )}

                        <motion.button
                          onClick={handleSummarize}
                          disabled={isSummarizing}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg disabled:opacity-50"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Sparkles size={18} />
                          <span>{isSummarizing ? "Summarizing..." : "Summarize"}</span>
                        </motion.button>
                      </div>
                    )}
                  </div>

                  {/* PDF Grid */}
                  <AnimatePresence>
                    {pdfs.length === 0 ? (
                      <motion.div
                        className="text-center py-12"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {loading ? (
                          <div className="flex flex-col items-center">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                              className="mb-4 text-purple-600"
                            >
                              <Loader size={40} />
                            </motion.div>
                            <p className="text-gray-600">Loading your PDFs...</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <FileText size={64} className="mb-4 text-gray-300" />
                            <h3 className="text-xl font-semibold text-gray-700 mb-2">No PDFs Found</h3>
                            <p className="text-gray-500 mb-6">Upload your first PDF to get started</p>
                            <motion.button
                              onClick={triggerFileUpload}
                              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Upload size={18} />
                              <span>Upload PDF</span>
                            </motion.button>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pdfs.map((pdf) => (
                          <motion.div
                            key={pdf._id}
                            className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-shadow duration-300"
                            whileHover={{ y: -5 }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div className="h-32 bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center">
                              <FileText size={48} className="text-white" />
                            </div>

                            <div className="p-5">
                              <div className="flex-grow">
                                {editingPdfId === pdf._id ? (
                                  <div className="mb-4">
                                    <input
                                      type="text"
                                      value={newPdfName}
                                      onChange={(e) => setNewPdfName(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      placeholder="Enter new name"
                                    />
                                    <div className="flex gap-2 mt-2">
                                      <motion.button
                                        onClick={() => handleUpdatePDFName(pdf._id)}
                                        className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                                        whileTap={{ scale: 0.95 }}
                                      >
                                        <Save size={14} />
                                        <span>Save</span>
                                      </motion.button>
                                      <motion.button
                                        onClick={cancelEditing}
                                        className="flex items-center gap-1 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                        whileTap={{ scale: 0.95 }}
                                      >
                                        <X size={14} />
                                        <span>Cancel</span>
                                      </motion.button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-lg font-semibold text-gray-800 truncate flex-grow">
                                      {pdf.originalName}
                                    </h3>
                                    <motion.button
                                      onClick={() => startEditingPDF(pdf)}
                                      className="ml-2 p-1 text-gray-400 hover:text-purple-600 transition-colors duration-200"
                                      whileHover={{ rotate: 15 }}
                                      whileTap={{ scale: 0.9 }}
                                    >
                                      <Edit2 size={16} />
                                    </motion.button>
                                  </div>
                                )}
                                <p className="text-sm text-gray-500 mb-2">
                                  Uploaded: {new Date(pdf.uploadDate).toLocaleDateString()}
                                </p>
                                <p className="text-sm text-gray-500 mb-4">
                                  Size: {(pdf.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <motion.button
                                  onClick={() => handleOpenPDF(pdf)}
                                  className="flex-grow flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg transition-colors duration-200"
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <BookOpen size={16} />
                                  <span>Open</span>
                                </motion.button>

                                <motion.button
                                  onClick={() => window.open(pdf.path, "_blank")}
                                  className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200"
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.95 }}
                                  title="Open in Browser"
                                >
                                  <ExternalLink size={16} />
                                </motion.button>

                                <motion.button
                                  onClick={() => handleDeletePDF(pdf._id)}
                                  className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <Trash2 size={16} />
                                </motion.button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* PDF Viewer Tab */}
              {activeTab === "viewer" && selectedPdf && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">{selectedPdf.originalName}</h3>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        Page {currentPage} of {numPages}
                      </div>
                      <div className="flex gap-2">
                        <motion.button
                          onClick={handlePrevPage}
                          disabled={currentPage <= 1}
                          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-gray-700"
                          whileHover={currentPage > 1 ? { y: -2 } : {}}
                          whileTap={currentPage > 1 ? { scale: 0.95 } : {}}
                        >
                          <ChevronLeft size={20} />
                        </motion.button>
                        <motion.button
                          onClick={handleNextPage}
                          disabled={currentPage >= numPages}
                          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-gray-700"
                          whileHover={currentPage < numPages ? { y: -2 } : {}}
                          whileTap={currentPage < numPages ? { scale: 0.95 } : {}}
                        >
                          <ChevronRight size={20} />
                        </motion.button>
                        <motion.button
                          onClick={toggleFullscreen}
                          className="p-2 bg-purple-100 rounded-lg hover:bg-purple-200 text-purple-700"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  <motion.div
                    className={`border rounded-lg overflow-auto ${isFullscreen ? "fixed inset-0 z-50 bg-white p-4" : "max-h-[600px]"}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className={`flex justify-center ${isFullscreen ? "h-full items-center" : ""}`}>
                      <canvas ref={canvasRef} className="mx-auto" />
                    </div>
                  </motion.div>

                  {/* Reading Controls */}
                  <div className="mt-6 flex flex-wrap gap-3 justify-center">
                    <motion.button
                      onClick={() => (isReading ? stopReading() : readPDFText(currentPage))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                        isReading ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                      }`}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isReading ? (
                        <>
                          <StopCircle size={18} />
                          <span>Stop Reading</span>
                        </>
                      ) : (
                        <>
                          <Play size={18} />
                          <span>Start Reading</span>
                        </>
                      )}
                    </motion.button>

                    {isReading && (
                      <motion.button
                        onClick={togglePause}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                          isPaused ? "bg-green-500 hover:bg-green-600" : "bg-yellow-500 hover:bg-yellow-600"
                        }`}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {isPaused ? (
                          <>
                            <Play size={18} />
                            <span>Resume</span>
                          </>
                        ) : (
                          <>
                            <Pause size={18} />
                            <span>Pause</span>
                          </>
                        )}
                      </motion.button>
                    )}

                    <motion.button
                      onClick={handleSummarize}
                      disabled={isSummarizing}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg disabled:opacity-50"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Sparkles size={18} />
                      <span>{isSummarizing ? "Summarizing..." : "Summarize"}</span>
                    </motion.button>

                    {/* Voice Selection */}
                    <div className="relative">
                      <select
                        value={selectedVoice ? selectedVoice.name : ""}
                        onChange={(e) => {
                          const voice = voices.find((v) => v.name === e.target.value)
                          setSelectedVoice(voice)
                        }}
                        className="appearance-none px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-700"
                      >
                        {voices.map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                        <Volume2 size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Translation Tab */}
              {activeTab === "translation" && translatedText && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Translated Text {currentLanguage && `(${currentLanguage})`}
                    </h3>
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => {
                          if (window.responsiveVoice) {
                            window.responsiveVoice.cancel()
                            window.responsiveVoice.speak(translatedText)
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Volume2 size={18} />
                        <span>Read Aloud</span>
                      </motion.button>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 max-h-[500px] overflow-auto">
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{translatedText}</p>
                  </div>
                </motion.div>
              )}

              {/* Summary Tab */}
              {activeTab === "summary" && summarizedText && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Summary</h3>
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => {
                          if (window.responsiveVoice) {
                            window.responsiveVoice.cancel()
                            window.responsiveVoice.speak(summarizedText)
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Volume2 size={18} />
                        <span>Read Aloud</span>
                      </motion.button>
                    </div>
                  </div>

                  <div className="bg-purple-50 p-6 rounded-lg border border-purple-100 max-h-[500px] overflow-auto">
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{summarizedText}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default PdfLibrary