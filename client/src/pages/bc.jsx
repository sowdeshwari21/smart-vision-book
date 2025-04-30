import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Import PDF.js from CDN
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';

const PdfLibrary = () => {
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const canvasRef = useRef(null);
  const speechRef = useRef(null);
  const currentTextRef = useRef('');
  const currentPageRef = useRef(1);
  const [editingPdfId, setEditingPdfId] = useState(null);
  const [newPdfName, setNewPdfName] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizedText, setSummarizedText] = useState('');
  const [responsiveVoices, setResponsiveVoices] = useState([]);
  const [selectedResponsiveVoice, setSelectedResponsiveVoice] = useState("");

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      speechRef.current = window.speechSynthesis;

      // Function to load voices
      const loadVoices = () => {
        const availableVoices = speechRef.current.getVoices();
        setVoices(availableVoices);

        // Set default voice (preferably English)
        const defaultVoice = availableVoices.find(voice => 
          voice.lang.includes('en') && 
          (voice.name.includes('Google') || voice.name.includes('Natural') || voice.name.includes('Premium'))
        ) || availableVoices.find(voice => voice.lang.includes('en')) || availableVoices[0];
        
        setSelectedVoice(defaultVoice);
      };

      // Load voices initially
      loadVoices();

      // Listen for voices changed event
      speechRef.current.onvoiceschanged = loadVoices;
    } else {
      setError('Text-to-speech is not supported in your browser.');
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
      let text = '';
      let textChunk = '';

      // Group text items by their vertical position (y coordinate)
      textContent.items.forEach((item, index) => {
        const y = item.transform[5]; // vertical position

        // If this is a new line
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          // End the previous line with proper punctuation if needed
          if (textChunk.length > 0 && 
              !textChunk.endsWith('.') && 
              !textChunk.endsWith('!') && 
              !textChunk.endsWith('?') && 
              !textChunk.endsWith(':') && 
              !textChunk.endsWith(';')) {
            textChunk += '. ';
          } else if (textChunk.length > 0) {
            textChunk += ' ';
          }

          text += textChunk;
          textChunk = '';
        }

        // Add space between words on the same line if needed
        if (textChunk.length > 0 && !textChunk.endsWith(' ') && !item.str.startsWith(' ')) {
          textChunk += ' ';
        }
        
        textChunk += item.str;
        lastY = y;
      });

      // Add the last text chunk
      text += textChunk;

      // Clean up common PDF extraction issues
      text = text
        .replace(/\s+/g, ' ')           // Replace multiple spaces with a single space
        .replace(/(\w)-\s+(\w)/g, '$1$2') // Remove hyphenation at end of lines
        .trim();
      
      // Store the extracted text in state
      setExtractedText(text);
      console.log('Extracted text:', text);
      return text;
    } catch (err) {
      console.error('Error extracting text:', err);
      setError('Failed to extract text from PDF');
      return '';
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
        if (!text) continue; // Skip empty pages

        currentTextRef.current = text;
        console.log('Reading text:', text); // Debug log

        // If we have a current language, translate the text
        let textToRead = text;
        if (currentLanguage) {
          try {
            const response = await axios.post(`http://localhost:5000/pdf/translate`, {
              from_text: text,
              to_text: languageMap[currentLanguage] || currentLanguage, 
            });

            if (response.data.translated_text) {
              textToRead = response.data.translated_text;
            }
          } catch (err) {
            console.error('Translation error:', err);
            setError('Translation failed. Please try again.');
          }
        }
        console.log('Translated text:', textToRead);

        // Use ResponsiveVoice for speech synthesis
        if (window.responsiveVoice) {
          let voiceName = selectedResponsiveVoice;
          if (!voiceName) {
            // Try to auto-select a matching language voice
            let voice = null;
            if (currentLanguage) {
              const langCode = languageMap[currentLanguage] || currentLanguage;
              voice = responsiveVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(langCode));
            }
            // Fallback to first available voice
            if (!voice && responsiveVoices.length > 0) {
              voice = responsiveVoices[0];
            }
            voiceName = voice ? voice.name : undefined;
          }
          if (voiceName) {
          await new Promise((resolve, reject) => {
              window.responsiveVoice.speak(textToRead, voiceName, {
              rate: 0.9,
              pitch: 1.0,
              volume: 1.0,
                onend: resolve
              });
            });
          } else {
            setError("No supported voice found for this language.");
          }
        } else {
          // Fallback to browser's speech synthesis
          const utterance = new SpeechSynthesisUtterance(textToRead);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          await new Promise((resolve, reject) => {
            utterance.onend = resolve;
            utterance.onerror = reject;
            speechRef.current.speak(utterance);
          });
        }

        // Only continue to next page if not paused
        if (!isPaused && pageNum < pdf.numPages) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between pages
        }
      }
    } catch (err) {
      console.error('Error reading PDF:', err);
      setError('Failed to read PDF');
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
    currentTextRef.current = '';
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
    'english': 'en',
    'tamil': 'ta',
    'hindi': 'hi',
    'telugu': 'te',
    'malayalam': 'ml',
    'kannada': 'kn',
    'bengali': 'bn',
    'gujarati': 'gu',
    'marathi': 'mr',
    'punjabi': 'pa',
    'urdu': 'ur',
    'arabic': 'ar',
    'french': 'fr',
    'german': 'de',
    'spanish': 'es',
    'italian': 'it',
    'portuguese': 'pt',
    'russian': 'ru',
    'japanese': 'ja',
    'korean': 'ko',
    'chinese': 'zh'
  };

  // Add voice map for ResponsiveVoice
  const voiceMap = {
    'en': 'UK English Female',
    'ta': 'Tamil Female', // ResponsiveVoice Tamil voice
    'hi': 'Hindi Female',
    'te': 'Telugu Female',
    'ml': 'Malayalam Female',
    'kn': 'Kannada Female',
    'bn': 'Bengali Female',
    'gu': 'Gujarati Female',
    'mr': 'Marathi Female',
    'pa': 'Punjabi Female',
    'ur': 'Urdu Female',
    'ar': 'Arabic Female',
    'fr': 'French Female',
    'de': 'German Female',
    'es': 'Spanish Female',
    'it': 'Italian Female',
    'pt': 'Portuguese Female',
    'ru': 'Russian Female',
    'ja': 'Japanese Female',
    'ko': 'Korean Female',
    'zh': 'Chinese Female'
  };

  // Add language name map for display
  const languageNameMap = {
    'en': 'English',
    'ta': 'Tamil',
    'hi': 'Hindi',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'bn': 'Bengali',
    'gu': 'Gujarati',
    'mr': 'Marathi',
    'pa': 'Punjabi',
    'ur': 'Urdu',
    'ar': 'Arabic',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese'
  };

  // Function to get language name from code
  const getLanguageName = (code) => {
    return languageNameMap[code] || code;
  };

  // Function to handle translation
  const handleTranslation = async (targetLang) => {
    if (!extractedText) {
      setError('No text available for translation');
      return;
    }

    try {
      setError(null);
      // Convert language name to language code if needed
      const langCode = languageMap[targetLang.toLowerCase()] || targetLang;
      console.log('Translating to:', langCode);

      const response = await axios.post('http://localhost:5000/pdf/translate', {
        from_text: extractedText,
        to_text: langCode
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
        const voiceName = voiceMap[langCode] || 'UK English Female';
        console.log('Using voice:', voiceName, 'for language:', getLanguageName(langCode));
        
        window.responsiveVoice.speak(translated_text, voiceName, {
          rate: 0.9,
          pitch: 1.0,
          volume: 1.0,
          onstart: () => console.log('Started speaking with voice:', voiceName),
          onend: () => console.log('Finished speaking'),
          onerror: (error) => {
            console.error('Speech error:', error);
            setError('Error reading the text. Please try again.');
          }
        });
      }
    } catch (err) {
      console.error('Translation error:', err);
      setError('Translation failed. Please try again.');
    }
  };

  // Update handleVoiceCommand function
  const handleVoiceCommand = async (command) => {
    const lowerCommand = command.toLowerCase();
    console.log('Voice command received:', lowerCommand);

    if (lowerCommand.startsWith('read in')) {
      const targetLang = lowerCommand.split(' ').pop().trim();
      console.log('Target language:', targetLang);
      await handleTranslation(targetLang);
    } else if (lowerCommand === 'start reading') {
      if (!selectedPdf) {
        setError('Please select a PDF first');
        return;
      }
      stopReading();
      setIsReading(true);
      setIsPaused(false);
      readPDFText(currentPage);
    } else if (lowerCommand === 'pause' || lowerCommand === 'resume') {
      togglePause();
    } else if (lowerCommand === 'stop reading') {
      stopReading();
    } else if (lowerCommand.startsWith('read page')) {
      const pageNum = parseInt(lowerCommand.replace('read page', '').trim());
      if (!isNaN(pageNum) && pageNum > 0 && pageNum <= numPages) {
        readSpecificPage(pageNum);
      } else {
        setError(`Invalid page number. Please specify a number between 1 and ${numPages}`);
      }
    }
  };

  // Add function to fetch all PDFs
  const fetchAllPDFs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5000/pdf/all');
      setPdfs(response.data);
    } catch (err) {
      setError('Failed to fetch PDFs');
      console.error('Fetch error:', err);
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
      const context = canvas.getContext('2d');
      
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext);
    } catch (err) {
      console.error('Error rendering PDF:', err);
      setError('Failed to render PDF');
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
    if (file && file.type === 'application/pdf') {
      try {
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('pdf', file);

        const response = await axios.post('http://localhost:5000/pdf/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // After successful upload, fetch all PDFs again
        await fetchAllPDFs();
      } catch (err) {
        setError('Failed to upload PDF. Please try again.');
        console.error('Upload error:', err);
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
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceCommand('');
      };

      recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();
        setVoiceCommand(command);
        handleVoiceCommand(command);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      setError('Speech recognition is not supported in your browser.');
    }
  };

  // Function to handle PDF deletion
  const handleDeletePDF = async (pdfId) => {
    if (window.confirm('Are you sure you want to delete this PDF?')) {
      try {
        await axios.delete(`http://localhost:5000/pdf/delete/${pdfId}`);
        // Refresh the PDF list
        await fetchAllPDFs();
        // If the deleted PDF was selected, clear the selection
        if (selectedPdf && selectedPdf._id === pdfId) {
          setSelectedPdf(null);
        }
      } catch (err) {
        setError('Failed to delete PDF');
        console.error('Delete error:', err);
      }
    }
  };

  // Function to handle PDF name update
  const handleUpdatePDFName = async (pdfId) => {
    if (!newPdfName.trim()) {
      setError('Please enter a valid name');
      return;
    }

    try {
      const response = await axios.put(`http://localhost:5000/pdf/update/${pdfId}`, {
        originalName: newPdfName
      });

      // Update the PDF in the list
      setPdfs(pdfs.map(pdf => 
        pdf._id === pdfId ? { ...pdf, originalName: newPdfName } : pdf
      ));

      // If the updated PDF was selected, update the selection
      if (selectedPdf && selectedPdf._id === pdfId) {
        setSelectedPdf({ ...selectedPdf, originalName: newPdfName });
      }

      setEditingPdfId(null);
      setNewPdfName('');
    } catch (err) {
      setError('Failed to update PDF name');
      console.error('Update error:', err);
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
    setNewPdfName('');
  };

  const handleSummarize = async () => {
    if (!selectedPdf) {
      setError('Please select a PDF first');
      return;
    }

    try {
      setIsSummarizing(true);
      setError(null);

      // Get the text to summarize (either translated text or current page text)
      const textToSummarize = translatedText || currentTextRef.current;

      if (!textToSummarize) {
        setError('No text available to summarize');
        return;
      }

      // Call the summarization endpoint
      const response = await axios.post('http://localhost:5000/pdf/summarize', {
        text: textToSummarize
      });

      if (response.data.error) {
        setError(response.data.error);
       
        return;
      }

      const summary = response.data.summary;
      setSummarizedText(summary);
      setIsSummarizing(false);

      // Stop any ongoing speech
      speechRef.current.cancel();
      if (window.responsiveVoice) {
        window.responsiveVoice.cancel();
      }

      // Use the current language for speech synthesis
      if (window.responsiveVoice) {
        let voiceName = selectedResponsiveVoice;
        if (!voiceName) {
          // Try to auto-select a matching language voice
          let voice = null;
          if (currentLanguage) {
            const langCode = languageMap[currentLanguage] || currentLanguage;
            voice = responsiveVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(langCode));
          }
          // Fallback to first available voice
          if (!voice && responsiveVoices.length > 0) {
            voice = responsiveVoices[0];
          }
          voiceName = voice ? voice.name : undefined;
        }
        if (voiceName) {
          await new Promise((resolve, reject) => {
            window.responsiveVoice.speak(summary, voiceName, {
              rate: 0.9,
              pitch: 1.0,
              volume: 1.0,
              onend: resolve
            });
          });
        } else {
          setError("No supported voice found for this language.");
        }
      } else {
        // Fallback to browser's speech synthesis
        const utterance = new SpeechSynthesisUtterance(summary);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        await new Promise((resolve, reject) => {
          utterance.onend = resolve;
          utterance.onerror = reject;
          speechRef.current.speak(utterance);
        });
      }

    } catch (err) {
      console.error('Summarization error:', err);
      setError(err.response?.data?.error || 'Failed to summarize text. Please try again.');
    } finally {
      setIsSummarizing(false); // Always reset the state when done
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">PDF Library</h2>
          <div className="flex gap-4">
            {/* Voice Selection */}
            <select
              value={selectedVoice ? selectedVoice.name : ''}
              onChange={(e) => {
                const voice = voices.find(v => v.name === e.target.value);
                setSelectedVoice(voice);
              }}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>

            {/* Reading Controls */}
            {selectedPdf && (
              <div className="flex gap-2">
                <button
                  onClick={() => isReading ? stopReading() : readPDFText(currentPage)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {isReading ? 'Stop Reading' : 'Start Reading'}
                </button>
                <button
                  onClick={togglePause}
                  disabled={!isReading}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isSummarizing ? 'Summarizing...' : 'Summarize'}
                </button>
                </div>
              )}
            {/* Voice Command Button */}
            <button
                onClick={startVoiceRecognition}
                disabled={isListening}
              className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                  isListening
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white transition-colors duration-200`}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path 
                  fillRule="evenodd" 
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" 
                  clipRule="evenodd" 
                />
              </svg>
              {isListening ? 'Listening...' : 'Voice Command'}
            </button>

            {/* Development Voice Command Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter voice command (dev)"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVoiceCommand(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Enter voice command (dev)"]');
                  if (input && input.value) {
                    handleVoiceCommand(input.value);
                    input.value = '';
                  }
                }}
                className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Test
              </button>
            </div>
          </div>
        </div>

        {/* Voice Command Status */}
              {voiceCommand && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <p className="text-gray-700">
              <span className="font-semibold">Voice Command:</span> {voiceCommand}
            </p>
          </div>
        )}

        {/* Reading Status */}
                {isReading && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <p className="text-gray-700">
              <span className="font-semibold">Reading:</span> Page {currentPage} of {numPages}
              {isPaused && <span className="text-yellow-600 ml-2">(Paused)</span>}
            </p>
                  </div>
                )}

        {/* Upload Section */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Upload New PDF</h3>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {loading && <p className="mt-2 text-blue-600">Loading...</p>}
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>

        {/* Add translation status */}
                {isTranslating && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <p className="text-gray-700">
              <span className="font-semibold">Translating...</span>
            </p>
                  </div>
                )}

        {/* Add translated text display */}
        {translatedText && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">
                Translation ({getLanguageName(detectedLanguage)} to {getLanguageName(voiceCommand.split(' ').pop())})
              </h3>
              <button
                onClick={() => {
                  setTranslatedText('');
                  setDetectedLanguage('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{translatedText}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  if (window.responsiveVoice) {
                    const targetLang = voiceCommand.split(' ').pop();
                    const langCode = languageMap[targetLang.toLowerCase()] || targetLang;
                    const voiceName = voiceMap[langCode] || 'UK English Female';
                    
                    console.log('Using voice:', voiceName, 'for language:', getLanguageName(langCode));
                    window.responsiveVoice.speak(translatedText, voiceName, {
                      rate: 0.9,
                      pitch: 1.0,
                      volume: 1.0
                    });
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Read Translation
              </button>
            </div>
          </div>
        )}

        {/* Add summarization status */}
        {isSummarizing && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <p className="text-gray-700">
              <span className="font-semibold">Summarizing...</span>
            </p>
          </div>
        )}

        {/* Add summarized text display */}
        {summarizedText && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">Summary</h3>
              <button
                onClick={() => setSummarizedText('')}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{summarizedText}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  if (window.responsiveVoice) {
                    let voiceName = selectedResponsiveVoice;
                    if (!voiceName) {
                      let voice = null;
                      if (currentLanguage) {
                        const langCode = languageMap[currentLanguage] || currentLanguage;
                        voice = responsiveVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(langCode));
                      }
                      if (!voice && responsiveVoices.length > 0) {
                        voice = responsiveVoices[0];
                      }
                      voiceName = voice ? voice.name : undefined;
                    }
                    if (voiceName) {
                      window.responsiveVoice.speak(summarizedText, voiceName, {
                        rate: 0.9,
                        pitch: 1.0,
                        volume: 1.0
                      });
                    }
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Read Summary
              </button>
            </div>
          </div>
        )}

        {/* Add extracted text display */}
        {extractedText && (
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">Extracted Text</h3>
              <button
                onClick={() => setExtractedText('')}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{extractedText}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  if (window.responsiveVoice) {
                    let voiceName = selectedResponsiveVoice;
                    if (!voiceName) {
                      let voice = null;
                      if (currentLanguage) {
                        const langCode = languageMap[currentLanguage] || currentLanguage;
                        voice = responsiveVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(langCode));
                      }
                      if (!voice && responsiveVoices.length > 0) {
                        voice = responsiveVoices[0];
                      }
                      voiceName = voice ? voice.name : undefined;
                    }
                    if (voiceName) {
                      window.responsiveVoice.speak(extractedText, voiceName, {
                        rate: 0.9,
                        pitch: 1.0,
                        volume: 1.0
                      });
                    }
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Read Text
              </button>
            </div>
          </div>
        )}

                  {/* PDF Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {pdfs.map((pdf) => (
            <div 
                            key={pdf._id}
              className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex flex-col h-full">
                              <div className="flex-grow">
                                {editingPdfId === pdf._id ? (
                                  <div className="mb-4">
                                    <input
                                      type="text"
                                      value={newPdfName}
                                      onChange={(e) => setNewPdfName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="Enter new name"
                                    />
                                    <div className="flex gap-2 mt-2">
                        <button
                                        onClick={() => handleUpdatePDFName(pdf._id)}
                          className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                                        onClick={cancelEditing}
                          className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                      >
                          Cancel
                        </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-lg font-semibold text-gray-800 truncate flex-grow">
                                      {pdf.originalName}
                                    </h3>
                      <button
                                      onClick={() => startEditingPDF(pdf)}
                        className="ml-2 p-1 text-gray-600 hover:text-blue-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                                  </div>
                                )}
                  <p className="text-sm text-gray-500 mb-4">
                                  Uploaded: {new Date(pdf.uploadDate).toLocaleDateString()}
                                </p>
                  <p className="text-sm text-gray-500">
                                  Size: {(pdf.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                <div className="mt-4 flex gap-2">
                  <button
                                  onClick={() => handleOpenPDF(pdf)}
                    className="flex-grow bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    Open PDF
                  </button>
                  <button
                    onClick={() => window.open(pdf.path, '_blank')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200"
                                  title="Open in Browser"
                                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </button>
                  <button
                                  onClick={() => handleDeletePDF(pdf._id)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                              </div>
                            </div>
            </div>
                        ))}
                      </div>

        {/* PDF Viewer Section */}
        {selectedPdf && (
          <div className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">{selectedPdf.originalName}</h3>
                    <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                        Page {currentPage} of {numPages}
                      </div>
                      <div className="flex gap-2">
                  <button
                          onClick={handlePrevPage}
                          disabled={currentPage <= 1}
                    className="px-3 py-1 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                          onClick={handleNextPage}
                          disabled={currentPage >= numPages}
                    className="px-3 py-1 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    Next
                  </button>
                      </div>
                    </div>
                  </div>
            <div className="border rounded-lg overflow-auto max-h-[800px]">
              <canvas
                ref={canvasRef}
                className="mx-auto"
              />
                  </div>
                </div>
              )}
                    </div>
                  </div>
  );
};

export default PdfLibrary;