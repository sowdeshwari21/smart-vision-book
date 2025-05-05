"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import customFetch from "../utils/customfetch";

// Import PDF.js from CDN
const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js";

const PdfLibrary = () => {
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const canvasRef = useRef(null);
  const speechRef = useRef(null);
  const currentTextRef = useRef("");
  const currentPageRef = useRef(1);
  const [editingPdfId, setEditingPdfId] = useState(null);
  const [newPdfName, setNewPdfName] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizedText, setSummarizedText] = useState("");
  const [responsiveVoices, setResponsiveVoices] = useState([]);
  const [selectedResponsiveVoice, setSelectedResponsiveVoice] = useState("");

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if ("speechSynthesis" in window) {
      speechRef.current = window.speechSynthesis;

      // Function to load voices
      const loadVoices = () => {
        const availableVoices = speechRef.current.getVoices();
        setVoices(availableVoices);

        // Set default voice (preferably English)
        const defaultVoice =
          availableVoices.find(
            (voice) =>
              voice.lang.includes("en") &&
              (voice.name.includes("Google") ||
                voice.name.includes("Natural") ||
                voice.name.includes("Premium"))
          ) ||
          availableVoices.find((voice) => voice.lang.includes("en")) ||
          availableVoices[0];

        setSelectedVoice(defaultVoice);
      };

      // Load voices initially
      loadVoices();

      // Listen for voices changed event
      speechRef.current.onvoiceschanged = loadVoices;
    } else {
      setError("Text-to-speech is not supported in your browser.");
    }

    return () => {
      if (speechRef.current) {
        speechRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (window.responsiveVoice) {
      setResponsiveVoices(window.responsiveVoice.getVoices());
    }
  }, []);

  // Function to extract text from PDF page
  const extractTextFromPage = async (pdf, pageNum) => {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Process text items to create more natural sentences
      let lastY = null;
      let text = "";
      let textChunk = "";

      // Group text items by their vertical position (y coordinate)
      textContent.items.forEach((item, index) => {
        const y = item.transform[5]; // vertical position

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
            textChunk += "";
          } else if (textChunk.length > 0) {
            textChunk += "";
          }

          text += textChunk;
          textChunk = "";
        }

        // Add space between words on the same line if needed
        if (
          textChunk.length > 0 &&
          !textChunk.endsWith(" ") &&
          !item.str.startsWith(" ")
        ) {
          textChunk += " ";
        }

        textChunk += item.str;
        lastY = y;
      });

      // Add the last text chunk
      text += textChunk;

      // Clean up common PDF extraction issues
      text = text
        .replace(/\s+/g, " ") // Replace multiple spaces with a single space
        .replace(/(\w)-\s+(\w)/g, "$1$2") // Remove hyphenation at end of lines
        .trim();

      // Store the extracted text in state
      setExtractedText(text);
      console.log("Extracted text:", text);
      return text;
    } catch (err) {
      console.error("Error extracting text:", err);
      setError("Failed to extract text from PDF");
      return "";
    }
  };

  // Function to read PDF text
  const readPDFText = async (startPage = 1) => {
    if (!selectedPdf || isPaused) return;

    try {
      setIsReading(true);
      const loadingTask = pdfjsLib.getDocument(selectedPdf.path);
      const pdf = await loadingTask.promise;

      for (let pageNum = startPage; pageNum <= pdf.numPages; pageNum++) {
        if (isPaused) break;

        currentPageRef.current = pageNum;
        setCurrentPage(pageNum);

        const text = await extractTextFromPage(pdf, pageNum);
        if (!text) continue;

        currentTextRef.current = text;

        // If we have a current language, translate the text
        let textToRead = text;
        if (currentLanguage) {
          try {
            const response = await customFetch.post(
              `/pdf/translate`,
              {
                from_text: text,
                to_text:
                  languageMap[currentLanguage.toLowerCase()] || currentLanguage,
              }
            );

            if (response.data.translated_text) {
              textToRead = response.data.translated_text;
            }
          } catch (err) {
            console.error("Translation error:", err);
            setError("Translation failed. Please try again.");
          }
        }

        // Use ResponsiveVoice for speech synthesis
        if (window.responsiveVoice) {
          const voiceName = selectedResponsiveVoice || "UK English Female";
          await new Promise((resolve, reject) => {
            window.responsiveVoice.speak(textToRead, voiceName, {
              rate: 0.9,
              pitch: 1.0,
              volume: 1.0,
              onend: resolve,
              onerror: reject,
            });
          });
        }

        if (!isPaused && pageNum < pdf.numPages) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (err) {
      console.error("Error reading PDF:", err);
      setError("Failed to read PDF");
    } finally {
      setIsReading(false);
      setIsPaused(false);
    }
  };

  // Function to stop reading
  const stopReading = () => {
    // Stop browser's speech synthesis
    if (speechRef.current) {
      speechRef.current.cancel();
      speechRef.current.pause();
    }

    // Stop ResponsiveVoice
    if (window.responsiveVoice) {
      window.responsiveVoice.cancel();
    }

    // Reset all reading states
    setIsReading(false);
    setIsPaused(false);
    currentPageRef.current = 1;
    currentTextRef.current = "";
  };

  // Function to pause/resume reading
  const togglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      readPDFText(currentPageRef.current);
    } else {
      setIsPaused(true);
      speechRef.current.pause();
    }
  };

  // Function to read specific page
  const readSpecificPage = async (pageNum) => {
    if (!selectedPdf) return;

    stopReading();
    setIsReading(true);
    setIsPaused(false);
    await readPDFText(pageNum);
  };

  // Update the language map to use correct language codes
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
  };

  // Add voice map for ResponsiveVoice
  const voiceMap = {
    en: "UK English Female",
    ta: "Tamil Female", // ResponsiveVoice Tamil voice
    hi: "Hindi Female",
    te: "Telugu Female",
    ml: "Malayalam Female",
    kn: "Kannada Female",
    bn: "Bengali Female",
    gu: "Gujarati Female",
    mr: "Marathi Female",
    pa: "Punjabi Female",
    ur: "Urdu Female",
    ar: "Arabic Female",
    fr: "French Female",
    de: "German Female",
    es: "Spanish Female",
    it: "Italian Female",
    pt: "Portuguese Female",
    ru: "Russian Female",
    ja: "Japanese Female",
    ko: "Korean Female",
    zh: "Chinese Female",
  };

  // Add language name map for display
  const languageNameMap = {
    en: "English",
    ta: "Tamil",
    hi: "Hindi",
    te: "Telugu",
    ml: "Malayalam",
    kn: "Kannada",
    bn: "Bengali",
    gu: "Gujarati",
    mr: "Marathi",
    pa: "Punjabi",
    ur: "Urdu",
    ar: "Arabic",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };

  // Function to get language name from code
  const getLanguageName = (code) => {
    return languageNameMap[code] || code;
  };

  // Function to handle translation
  const handleTranslation = async (targetLang) => {
    if (!extractedText) {
      setError("No text available for translation");
      return;
    }

    try {
      setError(null);
      // Convert language name to language code if needed
      const langCode = languageMap[targetLang.toLowerCase()] || targetLang;
      console.log("Translating to:", langCode);

      const response = await customFetch.post("/pdf/translate", {
        from_text: extractedText,
        to_text: langCode,
      });

      if (response.data.error) {
        setError(response.data.error);
        return;
      }

      const { translated_text, detected_source_language } = response.data;
      setTranslatedText(translated_text);
      setDetectedLanguage(detected_source_language);

      // Read the translated text using ResponsiveVoice
      if (window.responsiveVoice) {
        const voiceName = voiceMap[langCode] || "UK English Female";
        console.log(
          "Using voice:",
          voiceName,
          "for language:",
          getLanguageName(langCode)
        );

        window.responsiveVoice.speak(translated_text, voiceName, {
          rate: 0.9,
          pitch: 1.0,
          volume: 1.0,
          onstart: () => console.log("Started speaking with voice:", voiceName),
          onend: () => console.log("Finished speaking"),
          onerror: (error) => {
            console.error("Speech error:", error);
            setError("Error reading the text. Please try again.");
          },
        });
      }
    } catch (err) {
      console.error("Translation error:", err);
      setError("Translation failed. Please try again.");
    }
  };

  // Update handleVoiceCommand function
  const handleVoiceCommand = async (command) => {
    const lowerCommand = command.endsWith('.') 
    ? command.slice(0, -1).toLowerCase() 
    : command.toLowerCase();
  
    console.log("Voice command received:", lowerCommand);

    // Handle "open [pdfname]" command
    if (lowerCommand.startsWith("open ")) {
      const pdfName = lowerCommand.substring(5).trim(); // Get everything after "open "
      console.log("Searching for PDF:", pdfName);

      try {
        const response = await customFetch.get(
          `/pdf/search/${pdfName}`
        );
        if (response.data && response.data.length > 0) {
          // Open the first matching PDF
          const pdf = response.data[0];
          handleOpenPDF(pdf);
          console.log("Opened PDF:", pdf.originalName);
        } else {
          setError(`No PDF found with name containing "${pdfName}"`);
        }
      } catch (err) {
        console.error("Error searching PDF:", err);
        setError("Failed to search for PDF");
      }
      return;
    }

    // Handle read in language command
    if (lowerCommand.startsWith("read in")) {
      const targetLang = lowerCommand.split(" ").pop().trim();
      console.log("Target language:", targetLang);

      // Set the current language for all operations
      setCurrentLanguage(targetLang);

      let textToTranslate = extractedText;
      // Extract text from current page if no text is available
      if (!textToTranslate) {
        try {
          const loadingTask = pdfjsLib.getDocument(selectedPdf.path);
          const pdf = await loadingTask.promise;
          textToTranslate = await extractTextFromPage(pdf, currentPage);
          if (!textToTranslate) {
            setError("No text available for translation");
            return;
          }
          // Update the extracted text state
          setExtractedText(textToTranslate);
        } catch (err) {
          console.error("Error extracting text:", err);
          setError("Failed to extract text from PDF");
          return;
        }
      }

      // Call translation with the extracted text
      try {
        const response = await customFetch.post(
          "/pdf/translate",
          {
            from_text: textToTranslate,
            to_text: languageMap[targetLang.toLowerCase()] || targetLang,
          }
        );

        if (response.data.error) {
          setError(response.data.error);
          return;
        }

        const { translated_text, detected_source_language } = response.data;
        setTranslatedText(translated_text);
        setDetectedLanguage(detected_source_language);

        // Read the translated text using ResponsiveVoice
        if (window.responsiveVoice) {
          const langCode = languageMap[targetLang.toLowerCase()] || targetLang;
          const voiceName = voiceMap[langCode] || "UK English Female";
          console.log("Using voice:", voiceName, "for language:", targetLang);

          window.responsiveVoice.speak(translated_text, voiceName, {
            rate: 0.9,
            pitch: 1.0,
            volume: 1.0,
            onstart: () =>
              console.log("Started speaking with voice:", voiceName),
            onend: () => console.log("Finished speaking"),
            onerror: (error) => {
              console.error("Speech error:", error);
              setError("Error reading the text. Please try again.");
            },
          });
        }
      } catch (err) {
        console.error("Translation error:", err);
        setError("Translation failed. Please try again.");
      }
    } else if (lowerCommand === "start reading") {
      if (!selectedPdf) {
        setError("Please select a PDF first");
        return;
      }
      stopReading();
      setIsReading(true);
      setIsPaused(false);
      readPDFText(currentPage);
    } else if (lowerCommand === "pause" || lowerCommand === "resume") {
      togglePause();
    } else if (lowerCommand === "stop reading") {
      stopReading();
    } else if (lowerCommand.startsWith("read page")) {
      const pageNum = Number.parseInt(
        lowerCommand.replace("read page", "").trim()
      );
      if (!isNaN(pageNum) && pageNum > 0 && pageNum <= numPages) {
        readSpecificPage(pageNum);
      } else {
        setError(
          `Invalid page number. Please specify a number between 1 and ${numPages}`
        );
      }
    } else if (
      lowerCommand === "summarize" ||
      lowerCommand === "summarize this" ||
      lowerCommand === "summarize page" ||
      lowerCommand === "summa" ||
      lowerCommand === "summarise"
    ) {
      if (!selectedPdf) {
        setError("Please select a PDF first");
        return;
      }
      await handleSummarize();
    } else if (lowerCommand === "next page") {
      if (currentPage < numPages) {
        setCurrentPage(currentPage + 1);
      } else {
        setError("This is the last page");
      }
    } else if (
      lowerCommand === "previous page" ||
      lowerCommand === "back page"
    ) {
      if (currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        setError("This is the first page");
      }
    } else if (lowerCommand === "go to page") {
      const pageNum = Number.parseInt(
        lowerCommand.replace("go to page", "").trim()
      );
      if (!isNaN(pageNum) && pageNum > 0 && pageNum <= numPages) {
        setCurrentPage(pageNum);
      } else {
        setError(
          `Invalid page number. Please specify a number between 1 and ${numPages}`
        );
      }
    }
  };

  // Add function to fetch all PDFs
  const fetchAllPDFs = async () => {
    try {
      setLoading(true);
      const response = await customFetch.get("/pdf/all");
      setPdfs(response.data);
    } catch (err) {
      setError("Failed to fetch PDFs");
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch PDFs when component mounts
  useEffect(() => {
    fetchAllPDFs();
  }, []);

  // Function to render PDF in canvas
  const renderPDF = async (pdfUrl) => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);

      const page = await pdf.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext);
    } catch (err) {
      console.error("Error rendering PDF:", err);
      setError("Failed to render PDF");
    }
  };

  // Effect to render PDF when selected
  useEffect(() => {
    if (selectedPdf) {
      renderPDF(selectedPdf.path);
    }
  }, [selectedPdf, currentPage]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      try {
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append("pdf", file);

        const response = await customFetch.post(
          "/pdf/upload",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        // After successful upload, fetch all PDFs again
        await fetchAllPDFs();
      } catch (err) {
        setError("Failed to upload PDF. Please try again.");
        console.error("Upload error:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOpenPDF = (pdf) => {
    setSelectedPdf(pdf);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Voice Command Functions
  const startVoiceRecognition = () => {
    if ("webkitSpeechRecognition" in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceCommand("");
      };

      recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();
        setVoiceCommand(command);
        handleVoiceCommand(command);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      setError("Speech recognition is not supported in your browser.");
    }
  };

  // Function to handle PDF deletion
  const handleDeletePDF = async (pdfId) => {
    if (window.confirm("Are you sure you want to delete this PDF?")) {
      try {
        await customFetch.delete(`/pdf/delete/${pdfId}`);
        // Refresh the PDF list
        await fetchAllPDFs();
        // If the deleted PDF was selected, clear the selection
        if (selectedPdf && selectedPdf._id === pdfId) {
          setSelectedPdf(null);
        }
      } catch (err) {
        setError("Failed to delete PDF");
        console.error("Delete error:", err);
      }
    }
  };

  // Function to handle PDF name update
  const handleUpdatePDFName = async (pdfId) => {
    if (!newPdfName.trim()) {
      setError("Please enter a valid name");
      return;
    }

    try {
      const response = await customFetch.put(
        `/pdf/update/${pdfId}`,
        {
          originalName: newPdfName,
        }
      );

      // Update the PDF in the list
      setPdfs(
        pdfs.map((pdf) =>
          pdf._id === pdfId ? { ...pdf, originalName: newPdfName } : pdf
        )
      );

      // If the updated PDF was selected, update the selection
      if (selectedPdf && selectedPdf._id === pdfId) {
        setSelectedPdf({ ...selectedPdf, originalName: newPdfName });
      }

      setEditingPdfId(null);
      setNewPdfName("");
    } catch (err) {
      setError("Failed to update PDF name");
      console.error("Update error:", err);
    }
  };

  // Function to start editing PDF name
  const startEditingPDF = (pdf) => {
    setEditingPdfId(pdf._id);
    setNewPdfName(pdf.originalName);
  };

  // Function to cancel editing
  const cancelEditing = () => {
    setEditingPdfId(null);
    setNewPdfName("");
  };

  const handleSummarize = async () => {
    if (!selectedPdf) {
      setError("Please select a PDF first");
      return;
    }

    try {
      setIsSummarizing(true);
      setError(null);

      // Get the text to summarize (either translated text or current page text)
      const textToSummarize = translatedText || currentTextRef.current;

      if (!textToSummarize) {
        setError("No text available to summarize");
        setIsSummarizing(false);
        return;
      }

      // Call the summarization endpoint
      const response = await customFetch.post("/pdf/summarize", {
        text: textToSummarize,
      });

      if (response.data.error) {
        setError(response.data.error);
        setIsSummarizing(false);
        return;
      }

      let summary = response.data.summary;
      setSummarizedText(summary);

      // Stop any ongoing speech
      if (window.responsiveVoice) {
        window.responsiveVoice.cancel();
      }

      // If we have a current language, translate the summary
      let detectedSourceLanguage = null;
      if (currentLanguage) {
        try {
          const translationResponse = await customFetch.post(
            "/pdf/translate",
            {
              from_text: summary,
              to_text:
                languageMap[currentLanguage.toLowerCase()] || currentLanguage,
            }
          );

          if (translationResponse.data.translated_text) {
            setSummarizedText(translationResponse.data.translated_text);
            summary = translationResponse.data.translated_text;
            detectedSourceLanguage =
              translationResponse.data.detected_source_language;
            console.log("Detected source language:", detectedSourceLanguage);
          }
        } catch (err) {
          console.error("Translation error:", err);
          setError("Translation failed. Please try again.");
        }
      }

      // Use ResponsiveVoice for speech synthesis
      if (window.responsiveVoice) {
        // Get the detected source language from the translation response
        let voiceName = selectedResponsiveVoice;
        if (!voiceName && detectedSourceLanguage) {
          // Use voiceMap to get the appropriate voice for the detected language
          const langCode =
            languageMap[detectedSourceLanguage.toLowerCase()] ||
            detectedSourceLanguage;
          voiceName = voiceMap[langCode] || "UK English Female";
          console.log(
            "Using voice:",
            voiceName,
            "for detected language:",
            detectedSourceLanguage
          );
        }
        // Fallback to default voice if no matching voice found
        if (!voiceName) {
          voiceName = "UK English Female";
          console.log("Using default voice:", voiceName);
        }

        await new Promise((resolve, reject) => {
          window.responsiveVoice.speak(summary, voiceName, {
            rate: 0.9,
            pitch: 1.0,
            volume: 1.0,
            onend: resolve,
            onerror: reject,
          });
        });
      }
    } catch (err) {
      console.error("Summarization error:", err);
      setError(
        err.response?.data?.error ||
          "Failed to summarize text. Please try again."
      );
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header with accessibility controls */}
      <header className="sticky top-0 z-50 bg-blue-600 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <path d="M9 15v-4"></path>
                <path d="M12 15v-6"></path>
                <path d="M15 15v-2"></path>
              </svg>
              Accessible PDF Reader
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              {/* Voice Command Button */}
              <button
                onClick={startVoiceRecognition}
                disabled={isListening}
                aria-label={
                  isListening
                    ? "Listening for voice command"
                    : "Activate voice command"
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-orange-500 text-white hover:bg-orange-600"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="22"></line>
                </svg>
                {isListening ? "Listening..." : "Voice Command"}
              </button>

              {/* Voice Selection */}
              <select
                value={selectedVoice ? selectedVoice.name : ""}
                onChange={(e) => {
                  const voice = voices.find((v) => v.name === e.target.value);
                  setSelectedVoice(voice);
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Select voice"
              >
                <option value="">Select Voice</option>
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>

              {/* Reading Controls - Only show when PDF is selected */}
              {/* {selectedPdf && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      isReading ? stopReading() : readPDFText(currentPage)
                    }
                    className={`px-4 py-2 rounded-md font-medium ${
                      isReading
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                    aria-label={isReading ? "Stop reading" : "Start reading"}
                  >
                    {isReading ? "Stop" : "Read"}
                  </button>

                  {isReading && (
                    <button
                      onClick={togglePause}
                      className={`px-4 py-2 rounded-md font-medium ${
                        isPaused
                          ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                          : "bg-yellow-500 hover:bg-yellow-600 text-white"
                      }`}
                      aria-label={isPaused ? "Resume reading" : "Pause reading"}
                    >
                      {isPaused ? "Resume" : "Pause"}
                    </button>
                  )}
                </div>
              )} */}
            </div>
          </div>

          {/* Voice Command Status */}
          {voiceCommand && (
            <div className="mt-3 p-2 bg-blue-100 border border-blue-200 rounded-lg text-sm">
              <p className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="22"></line>
                </svg>
                <span className="font-medium text-blue-800">
                  Voice Command:
                </span>
                <span className="text-slate-700">{voiceCommand}</span>
              </p>
            </div>
          )}

          {/* Error Messages */}
          {error && (
            <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded-lg text-sm">
              <p className="flex items-center gap-2 text-red-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </p>
            </div>
          )}

          {/* Reading Status */}
          {isReading && (
            <div className="mt-3 p-2 bg-green-100 border border-green-200 rounded-lg text-sm">
              <p className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-green-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
                <span className="font-medium text-green-800">Reading:</span>
                <span className="text-slate-700">
                  Page {currentPage} of {numPages}
                </span>
                {isPaused && (
                  <span className="text-yellow-600 font-medium">(Paused)</span>
                )}
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - PDF Library */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <section className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-200 bg-blue-50">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-blue-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-blue-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Upload PDF
                </h2>
              </div>
              <div className="p-5">
                <label
                  htmlFor="pdf-upload"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-8 h-8 mb-3 text-gray-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-gray-500">PDF files only</p>
                  </div>
                  <input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={loading}
                    aria-label="Upload PDF file"
                  />
                </label>
                {loading && (
                  <div className="mt-4 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                    <span className="ml-2 text-sm text-gray-600">
                      Uploading...
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* PDF Library */}
            <section className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-200 bg-purple-50">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-purple-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-purple-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                  </svg>
                  Your PDF Library
                </h2>
              </div>
              <div className="p-5">
                {pdfs.length === 0 ? (
                  <div className="text-center py-8">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 mx-auto text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    <p className="mt-4 text-gray-600">No PDFs uploaded yet</p>
                    <p className="text-sm text-gray-500">
                      Upload a PDF to get started
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {pdfs.map((pdf) => (
                      <li
                        key={pdf._id}
                        className={`relative rounded-lg border ${
                          selectedPdf && selectedPdf._id === pdf._id
                            ? "border-purple-500 bg-purple-50"
                            : "border-gray-200 hover:border-purple-300 bg-white"
                        } transition-all duration-200`}
                      >
                        {editingPdfId === pdf._id ? (
                          <div className="p-3">
                            <input
                              type="text"
                              value={newPdfName}
                              onChange={(e) => setNewPdfName(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Enter new name"
                              aria-label="New PDF name"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleUpdatePDFName(pdf._id)}
                                className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                                aria-label="Save new PDF name"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                                aria-label="Cancel editing"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="p-3 cursor-pointer"
                            onClick={() => handleOpenPDF(pdf)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-1">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-red-500"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <path d="M9 15v-4"></path>
                                    <path d="M12 15v-6"></path>
                                    <path d="M15 15v-2"></path>
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-medium text-gray-900 truncate">
                                    {pdf.originalName}
                                  </h3>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(
                                      pdf.uploadDate
                                    ).toLocaleDateString()}{" "}
                                    • {(pdf.size / (1024 * 1024)).toFixed(2)} MB
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingPDF(pdf);
                                  }}
                                  className="p-1 text-gray-500 hover:text-purple-600"
                                  aria-label="Edit PDF name"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(pdf.path, "_blank");
                                  }}
                                  className="p-1 text-gray-500 hover:text-green-600"
                                  aria-label="Open PDF in new tab"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePDF(pdf._id);
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-600"
                                  aria-label="Delete PDF"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line
                                      x1="10"
                                      y1="11"
                                      x2="10"
                                      y2="17"
                                    ></line>
                                    <line
                                      x1="14"
                                      y1="11"
                                      x2="14"
                                      y2="17"
                                    ></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Voice Command Help */}
            <section className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-200 bg-yellow-50">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-yellow-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-yellow-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Voice Commands
                </h2>
              </div>
              <div className="p-5">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      start reading
                    </span>
                    <span className="text-gray-700">
                      Begin reading the current PDF
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      pause / resume
                    </span>
                    <span className="text-gray-700">
                      Pause or resume reading
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      stop reading
                    </span>
                    <span className="text-gray-700">
                      Stop reading completely
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      next page / previous page
                    </span>
                    <span className="text-gray-700">
                      Navigate between pages
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      read page [number]
                    </span>
                    <span className="text-gray-700">Read a specific page</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      read in [language]
                    </span>
                    <span className="text-gray-700">
                      Translate and read in another language
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      summarize
                    </span>
                    <span className="text-gray-700">
                      Create and read a summary of the current page
                    </span>
                  </li>
                </ul>

                {/* Dev Voice Command Input */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-2">
                    Developer Mode: Test voice commands
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter voice command"
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleVoiceCommand(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      aria-label="Test voice command input"
                    />
                    <button
                      onClick={() => {
                        const input = document.querySelector(
                          'input[placeholder="Enter voice command"]'
                        );
                        if (input && input.value) {
                          handleVoiceCommand(input.value);
                          input.value = "";
                        }
                      }}
                      className="px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 text-sm"
                      aria-label="Test voice command"
                    >
                      Test
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Middle and Right Columns - PDF Viewer and Text Panels */}
          <div className="lg:col-span-2 space-y-6">
            {/* PDF Viewer */}
            {selectedPdf ? (
              <section className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-200 bg-green-50 flex justify-between items-center">
                  <h2
                    className="text-xl font-semibold truncate max-w-[70%] text-green-800"
                    title={selectedPdf.originalName}
                  >
                    {selectedPdf.originalName}
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {numPages}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={handlePrevPage}
                        disabled={currentPage <= 1}
                        className="p-2 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Previous page"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                      </button>
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage >= numPages}
                        className="p-2 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Next page"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={handleSummarize}
                      disabled={isSummarizing}
                      className="flex items-center gap-1 px-3 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      aria-label="Summarize current page"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="21" y1="10" x2="3" y2="10"></line>
                        <line x1="21" y1="6" x2="3" y2="6"></line>
                        <line x1="21" y1="14" x2="3" y2="14"></line>
                        <line x1="21" y1="18" x2="7" y2="18"></line>
                      </svg>
                      {isSummarizing ? "Summarizing..." : "Summarize"}
                    </button>
                  </div>
                </div>
                <div className="p-5 flex justify-center bg-gray-50 border-b border-gray-200">
                  <div className="border rounded-lg overflow-auto max-h-[600px] bg-white shadow-sm">
                    <canvas
                      ref={canvasRef}
                      className="mx-auto"
                      aria-label={`PDF page ${currentPage} of ${numPages}`}
                    />
                  </div>
                </div>
                <div className="p-5 flex justify-center gap-4">
                  <button
                    onClick={() => readPDFText(currentPage)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    aria-label="Read current page"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M23 12a11 11 0 0 1-22 0 11 11 0 0 1 22 0z"></path>
                      <path d="M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0"></path>
                      <path d="M19 12a7 7 0 1 0-14 0 7 7 0 1 0 14 0"></path>
                    </svg>
                    Read Current Page
                  </button>
                  <button
                    onClick={() => window.open(selectedPdf.path, "_blank")}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    aria-label="Open PDF in new tab"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open in Browser
                  </button>
                </div>
              </section>
            ) : (
              <section className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="p-10 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 mx-auto text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                  <h3 className="mt-4 text-xl font-semibold text-gray-700">
                    No PDF Selected
                  </h3>
                  <p className="mt-2 text-gray-600">
                    Select a PDF from your library to view it here
                  </p>
                </div>
              </section>
            )}

            {/* Bento Grid for Text Outputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Extracted Text Panel */}
              <section
                className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden ${
                  extractedText ? "" : "opacity-70"
                }`}
              >
                <div className="p-4 border-b border-gray-200 bg-cyan-50 flex justify-between items-center">
                  <h2 className="font-semibold flex items-center gap-2 text-cyan-800">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-cyan-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    Extracted Text
                  </h2>
                  {extractedText && (
                    <button
                      onClick={() => setExtractedText("")}
                      className="text-gray-500 hover:text-gray-700"
                      aria-label="Clear extracted text"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {extractedText ? (
                    <>
                      <div className="max-h-[200px] overflow-y-auto mb-4 text-gray-700 text-sm whitespace-pre-wrap">
                        {extractedText}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (window.responsiveVoice) {
                              const voiceName =
                                selectedResponsiveVoice || "UK English Female";
                              window.responsiveVoice.speak(
                                extractedText,
                                voiceName,
                                {
                                  rate: 0.9,
                                  pitch: 1.0,
                                  volume: 1.0,
                                }
                              );
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 text-sm"
                          aria-label="Read extracted text"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                          </svg>
                          Read Text
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 mx-auto mb-2 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      <p>Text will appear here when you read a page</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Translated Text Panel */}
              <section
                className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden ${
                  translatedText ? "" : "opacity-70"
                }`}
              >
                <div className="p-4 border-b border-gray-200 bg-teal-50 flex justify-between items-center">
                  <h2 className="font-semibold flex items-center gap-2 text-teal-800">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-teal-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m5 8 6 6"></path>
                      <path d="m4 14 6-6 2-3"></path>
                      <path d="M2 5h12"></path>
                      <path d="M7 2h1"></path>
                      <path d="m22 22-5-10-5 10"></path>
                      <path d="M14 18h6"></path>
                    </svg>
                    {translatedText ? (
                      <span>
                        Translation ({getLanguageName(detectedLanguage)} to{" "}
                        {getLanguageName(currentLanguage)})
                      </span>
                    ) : (
                      <span>Translation</span>
                    )}
                  </h2>
                  {translatedText && (
                    <button
                      onClick={() => {
                        setTranslatedText("");
                        setDetectedLanguage("");
                      }}
                      className="text-gray-500 hover:text-gray-700"
                      aria-label="Clear translation"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {translatedText ? (
                    <>
                      <div className="max-h-[200px] overflow-y-auto mb-4 text-gray-700 text-sm whitespace-pre-wrap">
                        {translatedText}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (window.responsiveVoice) {
                              const targetLang = currentLanguage;
                              const langCode =
                                languageMap[targetLang.toLowerCase()] ||
                                targetLang;
                              const voiceName =
                                voiceMap[langCode] || "UK English Female";

                              window.responsiveVoice.speak(
                                translatedText,
                                voiceName,
                                {
                                  rate: 0.9,
                                  pitch: 1.0,
                                  volume: 1.0,
                                }
                              );
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm"
                          aria-label="Read translation"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                          </svg>
                          Read Translation
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 mx-auto mb-2 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 8 6 6"></path>
                        <path d="m4 14 6-6 2-3"></path>
                        <path d="M2 5h12"></path>
                        <path d="M7 2h1"></path>
                        <path d="m22 22-5-10-5 10"></path>
                        <path d="M14 18h6"></path>
                      </svg>
                      <p>Use "read in [language]" voice command to translate</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Summary Panel */}
              <section
                className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden md:col-span-2 ${
                  summarizedText ? "" : "opacity-70"
                }`}
              >
                <div className="p-4 border-b border-gray-200 bg-orange-50 flex justify-between items-center">
                  <h2 className="font-semibold flex items-center gap-2 text-orange-800">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-orange-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="21" y1="10" x2="3" y2="10"></line>
                      <line x1="21" y1="6" x2="3" y2="6"></line>
                      <line x1="21" y1="14" x2="3" y2="14"></line>
                      <line x1="21" y1="18" x2="7" y2="18"></line>
                    </svg>
                    Summary
                  </h2>
                  {summarizedText && (
                    <button
                      onClick={() => setSummarizedText("")}
                      className="text-gray-500 hover:text-gray-700"
                      aria-label="Clear summary"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {summarizedText ? (
                    <>
                      <div className="max-h-[200px] overflow-y-auto mb-4 text-gray-700 text-sm whitespace-pre-wrap">
                        {summarizedText}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (window.responsiveVoice) {
                              let voiceName = selectedResponsiveVoice;
                              if (!voiceName) {
                                let voice = null;
                                if (currentLanguage) {
                                  const langCode =
                                    languageMap[currentLanguage] ||
                                    currentLanguage;
                                  voice = responsiveVoices.find(
                                    (v) =>
                                      v.lang &&
                                      v.lang.toLowerCase().startsWith(langCode)
                                  );
                                }
                                if (!voice && responsiveVoices.length > 0) {
                                  voice = responsiveVoices[0];
                                }
                                voiceName = voice
                                  ? voice.name
                                  : "UK English Female";
                              }
                              window.responsiveVoice.speak(
                                summarizedText,
                                voiceName,
                                {
                                  rate: 0.9,
                                  pitch: 1.0,
                                  volume: 1.0,
                                }
                              );
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
                          aria-label="Read summary"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                          </svg>
                          Read Summary
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 mx-auto mb-2 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="21" y1="10" x2="3" y2="10"></line>
                        <line x1="21" y1="6" x2="3" y2="6"></line>
                        <line x1="21" y1="14" x2="3" y2="14"></line>
                        <line x1="21" y1="18" x2="7" y2="18"></line>
                      </svg>
                      <p>
                        Click "Summarize" or use the "summarize" voice command
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Accessibility Footer */}
      <footer className="bg-blue-600 py-6 mt-8 text-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">
              Accessible PDF Reader - Designed for users with visual impairments
            </p>
            <div className="flex items-center gap-4">
              <button
                className="text-sm text-white font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 rounded-md"
                onClick={startVoiceRecognition}
                aria-label="Activate voice commands"
              >
                Voice Commands
              </button>
              <button
                className="text-sm text-white font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 rounded-md"
                onClick={() => {
                  if (window.responsiveVoice) {
                    window.responsiveVoice.speak(
                      "Welcome to the Accessible PDF Reader. Use voice commands to navigate and control the application. Say 'start reading' to begin reading a PDF, 'pause' to pause, 'resume' to continue, or 'stop reading' to stop. You can also say 'next page', 'previous page', or 'read page' followed by a number to navigate. Say 'summarize' to get a summary of the current page, or 'read in' followed by a language name to translate and read in that language.",
                      "UK English Female"
                    );
                  }
                }}
                aria-label="Get help with using the application"
              >
                Help
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PdfLibrary;
