"use client"
import { motion } from "framer-motion"
import { Heart, Github, Twitter } from "lucide-react"

const Footer = () => {
  return (
    <motion.footer
      className="bg-gradient-to-r from-purple-800 to-indigo-800 text-white py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <motion.div className="mb-4 md:mb-0" whileHover={{ scale: 1.05 }}>
            <p className="text-lg font-semibold">PDF Voice Commander</p>
            <p className="text-sm text-purple-200">Transform your PDFs into voice with ease</p>
          </motion.div>

          <div className="flex items-center space-x-4">
            <motion.a
              href="#"
              className="text-purple-200 hover:text-white transition-colors duration-200"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <Github size={20} />
            </motion.a>
            <motion.a
              href="#"
              className="text-purple-200 hover:text-white transition-colors duration-200"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <Twitter size={20} />
            </motion.a>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-purple-700 text-center">
          <p className="flex items-center justify-center text-sm">
            Made with
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "loop",
              }}
              className="mx-1 text-red-400"
            >
              <Heart size={16} fill="currentColor" />
            </motion.div>
            &copy; {new Date().getFullYear()} PDF Voice Commander
          </p>
        </div>
      </div>
    </motion.footer>
  )
}

export default Footer

